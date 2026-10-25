// S18: posibles datos personales en las columnas de la tabla cargada. Puro, determinista y honesto: AVISA y nunca bloquea,
// y el aviso nombra la columna y el tipo, JAMÁS el valor (regla dura 2: los datos del usuario no se reparten). Es una
// heurística, no una garantía: busca formatos con estructura (correo, teléfono con separadores, documentos con dígito de
// control) y nombres de columna conocidos, en español y en inglés; no encuentra todo ni todo lo que encuentra lo es.
import {
  columnValues,
  isNullToken,
  parseNumber,
  type CsvTable,
} from "@/lib/ds/csv";

export type TipoPersonal = "correo" | "telefono" | "documento" | "nombre";
export type ViaPersonal = "valor" | "nombre" | "ambos";

export type AvisoPersonal = {
  column: string;
  tipo: TipoPersonal;
  via: ViaPersonal;
  /** Fracción de las celdas no vacías con la forma del dato, o `null` si solo lo dijo el nombre de la columna. */
  cuota: number | null;
};

/** Cuántas de las celdas no vacías deben tener la forma para dar el aviso por el contenido. */
export const CUOTA_MINIMA = 0.6;
/** Con menos celdas no vacías no se juzga por el contenido. */
export const VALORES_MINIMOS = 3;
/** Nombres propios por patrón: más celdas y casi todas distintas (una categoría con nombre propio se repite). */
export const NOMBRES_VALORES_MINIMOS = 10;
export const NOMBRES_DISTINTOS_MINIMO = 0.5;
/** Por el nombre de la columna: no es un dato personal si casi no hay valores distintos. */
export const NOMBRE_COLUMNA_DISTINTOS_MINIMO = 0.2;

const quitarTildes = (texto: string) =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "");

function palabrasDe(encabezado: string): string[] {
  return quitarTildes(encabezado)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

const PALABRAS_CORREO = new Set([
  "correo",
  "correos",
  "email",
  "emails",
  "mail",
  "mails",
]);
const PALABRAS_TELEFONO = new Set([
  "telefono",
  "telefonos",
  "tel",
  "celular",
  "celulares",
  "movil",
  "moviles",
  "phone",
  "phones",
  "mobile",
  "whatsapp",
  "fono",
  "cel",
]);
const PALABRAS_DOCUMENTO = new Set([
  "cedula",
  "dni",
  "nit",
  "pasaporte",
  "passport",
  "ssn",
  "curp",
  "rut",
  "rfc",
  "nif",
  "nie",
  "documento",
  "identificacion",
  "identification",
]);
const PALABRAS_NOMBRE = new Set([
  "nombre",
  "nombres",
  "apellido",
  "apellidos",
  "surname",
  "lastname",
  "firstname",
  "fullname",
]);
/** «name» solo cuenta junto a una de estas (si no, es el nombre de un producto, una ciudad…). */
const CALIFICADORES_NOMBRE = new Set([
  "first",
  "last",
  "full",
  "customer",
  "client",
  "user",
  "employee",
  "person",
  "holder",
  "given",
  "family",
  "cliente",
  "usuario",
  "empleado",
  "persona",
  "titular",
  "completo",
]);
/** Si acompañan a «nombre»/«name», la columna nombra otra cosa. */
const NO_ES_PERSONA = new Set([
  "producto",
  "product",
  "ciudad",
  "city",
  "plan",
  "pais",
  "country",
  "empresa",
  "company",
  "marca",
  "brand",
  "archivo",
  "file",
  "tienda",
  "store",
  "region",
  "departamento",
  "categoria",
  "category",
  "equipo",
  "team",
  "proyecto",
  "project",
  "sucursal",
  "branch",
  "calle",
  "street",
  "campana",
  "campaign",
  "tipo",
  "type",
  "item",
  "articulo",
]);

/** Una columna que CUENTA cosas («correos_abiertos», «llamadas_telefono») no guarda el dato: guarda cuántas veces. */
const PALABRAS_DE_CONTEO = new Set([
  "abiertos", "abierto", "enviados", "enviado", "recibidos", "recibido", "cantidad", "total", "totales",
  "numero", "num", "count", "opens", "opened", "sent", "clicks", "llamadas", "calls", "cuenta", "conteo",
  "veces", "tasa", "rate", "tipo", "type",
]);

function tipoPorNombre(encabezado: string, numerica: boolean): TipoPersonal | null {
  const palabras = palabrasDe(encabezado);
  if (palabras.some((p) => PALABRAS_DE_CONTEO.has(p))) return null;
  const tiene = (conjunto: Set<string>) =>
    palabras.some((p) => conjunto.has(p));
  // un teléfono o un documento SÍ pueden estar escritos solo con dígitos; un correo o un nombre, no
  if (tiene(PALABRAS_TELEFONO)) return "telefono";
  if (tiene(PALABRAS_DOCUMENTO)) return "documento";
  if (numerica) return null;
  if (tiene(PALABRAS_CORREO)) return "correo";
  if (palabras.some((p) => NO_ES_PERSONA.has(p))) return null;
  if (tiene(PALABRAS_NOMBRE)) return "nombre";
  if (
    palabras.includes("name") &&
    palabras.some((p) => CALIFICADORES_NOMBRE.has(p))
  )
    return "nombre";
  return null;
}

// ---------- por el contenido ----------

const CORREO = /^[^\s@,;]+@[^\s@,;]+\.[A-Za-z]{2,}$/;

function esTelefono(valor: string): boolean {
  const digitos = valor.replace(/\D/g, "").length;
  if (digitos < 7 || digitos > 15) return false;
  if (/^\+\d[\d\s().-]{5,18}\d$/.test(valor)) return true;
  // sin «+»: solo con la forma de un teléfono escrito (grupos con separadores), nunca un número corrido
  return (
    /^\(?\d{2,4}\)?[\s.-]\d{3,4}[\s.-]\d{3,4}$/.test(valor) ||
    /^\d{3}[\s.-]\d{3}[\s.-]\d{4}$/.test(valor) ||
    /^\(\d{2,4}\)\s?\d{3,4}[\s.-]?\d{3,4}$/.test(valor)
  );
}

const LETRAS_DNI = "TRWAGMYFPDXBNJZSQVHLCKE";

function esDocumento(valor: string): boolean {
  const v = valor.trim();
  const dni = /^(\d{8})([A-Za-z])$/.exec(v);
  if (dni) return LETRAS_DNI[Number(dni[1]) % 23] === dni[2]!.toUpperCase();
  const nie = /^([XYZxyz])(\d{7})([A-Za-z])$/.exec(v);
  if (nie) {
    const prefijo = "XYZ".indexOf(nie[1]!.toUpperCase());
    return (
      LETRAS_DNI[Number(`${prefijo}${nie[2]}`) % 23] === nie[3]!.toUpperCase()
    );
  }
  if (
    /^[A-Za-z]{4}\d{6}[HMXhmx][A-Za-z]{2}[B-DF-HJ-NP-TV-Zb-df-hj-np-tv-z]{3}[A-Za-z\d]\d$/.test(
      v,
    )
  )
    return true; // CURP
  const ssn = /^(\d{3})-(\d{2})-(\d{4})$/.exec(v);
  if (ssn)
    return (
      ssn[1] !== "000" &&
      ssn[1] !== "666" &&
      !ssn[1]!.startsWith("9") &&
      ssn[2] !== "00" &&
      ssn[3] !== "0000"
    );
  const rut = /^(\d{1,2})\.?(\d{3})\.?(\d{3})-([\dkK])$/.exec(v);
  if (rut) {
    const cuerpo = `${rut[1]}${rut[2]}${rut[3]}`;
    let suma = 0;
    let factor = 2;
    for (let i = cuerpo.length - 1; i >= 0; i--) {
      suma += Number(cuerpo[i]) * factor;
      factor = factor === 7 ? 2 : factor + 1;
    }
    const resto = 11 - (suma % 11);
    const digito = resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
    return digito === rut[4]!.toUpperCase();
  }
  return false;
}

const PARTICULAS = new Set([
  "de",
  "del",
  "la",
  "las",
  "los",
  "y",
  "van",
  "von",
  "da",
  "di",
  "dos",
  "das",
  "bin",
  "al",
  "el",
]);

function esNombrePropio(valor: string): boolean {
  if (/\d/.test(valor)) return false;
  const palabras = valor.trim().split(/\s+/);
  if (palabras.length < 2 || palabras.length > 5) return false;
  let mayusculas = 0;
  for (const palabra of palabras) {
    if (PARTICULAS.has(palabra.toLowerCase())) continue;
    if (!/^\p{Lu}[\p{L}'’.-]*$/u.test(palabra)) return false;
    mayusculas += 1;
  }
  return mayusculas >= 2;
}

const ORDEN: TipoPersonal[] = ["correo", "telefono", "documento", "nombre"];

export function detectarPersonales(table: CsvTable): AvisoPersonal[] {
  const avisos: AvisoPersonal[] = [];
  table.headers.forEach((column, index) => {
    const valores = columnValues(table, index)
      .filter((v) => !isNullToken(v))
      .map((v) => v.trim());
    const distintos = new Set(valores).size;
    const numerica = valores.length > 0 && valores.every((v) => parseNumber(v) !== null);
    const porNombre = tipoPorNombre(column, numerica);
    const porNombreVale =
      porNombre !== null &&
      distintos >= 3 &&
      distintos / Math.max(valores.length, 1) >=
        NOMBRE_COLUMNA_DISTINTOS_MINIMO;

    const cuotas = new Map<TipoPersonal, number>();
    if (valores.length >= VALORES_MINIMOS) {
      const cuota = (acepta: (v: string) => boolean) =>
        valores.filter(acepta).length / valores.length;
      cuotas.set(
        "correo",
        cuota((v) => CORREO.test(v)),
      );
      cuotas.set("telefono", cuota(esTelefono));
      cuotas.set("documento", cuota(esDocumento));
      if (
        valores.length >= NOMBRES_VALORES_MINIMOS &&
        distintos / valores.length >= NOMBRES_DISTINTOS_MINIMO
      )
        cuotas.set("nombre", cuota(esNombrePropio));
    }
    const porValor =
      ORDEN.find((t) => (cuotas.get(t) ?? 0) >= CUOTA_MINIMA) ?? null;

    if (porValor !== null) {
      const igualQueElNombre = porNombreVale && porNombre === porValor;
      avisos.push({
        column,
        tipo: porValor,
        via: igualQueElNombre ? "ambos" : "valor",
        cuota: cuotas.get(porValor)!,
      });
    } else if (porNombreVale) {
      avisos.push({ column, tipo: porNombre!, via: "nombre", cuota: null });
    }
  });
  return avisos;
}
