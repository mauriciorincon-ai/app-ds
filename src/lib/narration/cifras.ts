// S18: el verificador de CIFRAS de un texto. Dado un texto y lo que el resultado dice, comprueba (1) que cada cifra que el texto
// DEBE decir está, (2) que ninguna cifra del texto sale de otro sitio que del resultado y (3) que las columnas que importan
// aparecen en el orden en que el resultado las puso. Determinista, puro y sin red: es la misma regla para la exploración y
// para la explicación de las cuatro tareas, y es lo que una narración (la plantilla de hoy, o cualquiera que mañana se escriba
// para otra tarea) tiene que pasar antes de mostrarse. No juzga si el texto es bueno; juzga si cuadra con los números.
import { formatQuantity } from "@/lib/quantity";

/** Cifras en la app: punto decimal y miles con coma, en los dos idiomas (design-system R9). Un «-» o «−» es el signo de la cifra
 *  solo cuando no está pegado a una palabra o a otro número: «2026-05», «0-1» o «p-valor 3» no llevan signo. */
const CIFRA =
  /(?:(?<![\w.])[-−])?(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/g;

/** Cómo se escribe `valor` con `decimales` decimales: lo mismo que escribe la pantalla. */
export const escribir = (valor: number, decimales: number): string =>
  formatQuantity(valor, decimales);

export type Esperado = {
  /** Cifras que el texto TIENE que decir (con su clave, para nombrarlas cuando faltan). */
  requeridas: readonly { clave: string; valor: number; decimales: number }[];
  /** Otras cifras que puede decir (ya escritas). Todo lo demás es ajeno. */
  permitidas?: readonly string[];
  /** Cifras fijas del propio texto (rangos, «de 0 a 1»), ya escritas. */
  fijas?: readonly string[];
  /** Nombres que deben aparecer, en este orden. */
  orden?: readonly string[];
  /** Frases que deben aparecer TAL CUAL (para una afirmación que el orden de unos nombres no alcanza a fijar). */
  frases?: readonly { clave: string; texto: string }[];
  /** Nombres de columnas y de clases: se quitan antes de buscar cifras (un nombre puede llevar un número). */
  nombres?: readonly string[];
};

export type Fallo =
  | { tipo: "cifra-falta"; clave: string }
  | { tipo: "cifra-ajena"; cifra: string }
  | { tipo: "orden"; esperado: readonly string[] }
  | { tipo: "frase-falta"; clave: string };

/** Las cifras de un texto, sin las que forman parte de un nombre de columna o de clase. */
export function cifrasDe(
  texto: string,
  nombres: readonly string[] = [],
): string[] {
  let limpio = texto;
  for (const nombre of [...nombres].sort((a, b) => b.length - a.length)) {
    if (nombre.length > 0) limpio = limpio.split(nombre).join(" ");
  }
  // el signo se compara como lo escribe la pantalla: «-» ASCII
  return (limpio.match(CIFRA) ?? []).map((c) => c.replace("−", "-"));
}

export function verificarTexto(texto: string, esperado: Esperado): Fallo[] {
  const fallos: Fallo[] = [];
  const nombres = [...(esperado.nombres ?? []), ...(esperado.orden ?? [])];
  const presentes = cifrasDe(texto, nombres);
  const escritas = new Set(presentes);

  const permitidas = new Set<string>([
    ...(esperado.permitidas ?? []),
    ...(esperado.fijas ?? []),
    ...esperado.requeridas.map((r) => escribir(r.valor, r.decimales)),
  ]);
  for (const requerida of esperado.requeridas) {
    if (!escritas.has(escribir(requerida.valor, requerida.decimales)))
      fallos.push({ tipo: "cifra-falta", clave: requerida.clave });
  }
  for (const cifra of new Set(presentes)) {
    if (!permitidas.has(cifra)) fallos.push({ tipo: "cifra-ajena", cifra });
  }

  for (const frase of esperado.frases ?? []) {
    if (!texto.includes(frase.texto)) fallos.push({ tipo: "frase-falta", clave: frase.clave });
  }

  if (esperado.orden && esperado.orden.length > 0) {
    let desde = 0;
    for (const nombre of esperado.orden) {
      const en = texto.indexOf(nombre, desde);
      if (en < 0) {
        fallos.push({ tipo: "orden", esperado: esperado.orden });
        break;
      }
      desde = en + nombre.length;
    }
  }
  return fallos;
}
