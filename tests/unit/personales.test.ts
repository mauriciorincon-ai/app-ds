// @vitest-environment node
/**
 * S18 — el aviso de posibles datos personales. Lo que tiene que valer: (1) el archivo con datos personales plantados dispara el
 * aviso en sus cuatro columnas y los archivos limpios del kit no disparan ninguno, (2) los formatos con dígito de control se
 * validan (un número cualquiera no es un documento), y (3) el aviso nombra la columna y el tipo, JAMÁS un valor: ni en el
 * resultado ni en lo que la pantalla pinta.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectarPersonales } from "@/engine/personales";
import { parseCsvWithLimits, type CsvTable } from "@/lib/ds/csv";

const KIT = "docs/kit-de-prueba";
const tabla = (nombre: string): CsvTable => {
  const lectura = parseCsvWithLimits(readFileSync(join(KIT, nombre), "utf8"));
  if (!lectura.ok) throw new Error(`${nombre}: ${lectura.error.kind}`);
  return lectura.table;
};
const de = (headers: string[], columnas: string[][]): CsvTable => ({
  headers,
  rows: columnas[0]!.map((_, i) => columnas.map((c) => c[i]!)),
});

/** Los valores de las columnas avisadas que aparecen en el texto del resultado (debe ser ninguno). */
function valoresFiltrados(t: CsvTable, avisos: readonly object[]): string[] {
  const salida = JSON.stringify(avisos);
  const encontrados: string[] = [];
  for (const columna of ["nombre_completo", "correo", "telefono", "documento"]) {
    const i = t.headers.indexOf(columna);
    for (const fila of t.rows) {
      if (salida.includes(fila[i]!)) encontrados.push(`${columna}: ${fila[i]}`);
    }
  }
  return [...new Set(encontrados)];
}

describe("el archivo con datos personales plantados", () => {
  const avisos = detectarPersonales(tabla("clientes-con-datos-personales.csv"));
  const porColumna = Object.fromEntries(avisos.map((a) => [a.column, a]));

  it("avisa de las cuatro columnas, con su tipo", () => {
    expect(porColumna.correo?.tipo).toBe("correo");
    expect(porColumna.telefono?.tipo).toBe("telefono");
    expect(porColumna.documento?.tipo).toBe("documento");
    expect(porColumna.nombre_completo?.tipo).toBe("nombre");
    expect(avisos).toHaveLength(4);
  });

  it("dice si lo supo por el contenido, por el nombre de la columna o por los dos", () => {
    expect(porColumna.correo?.via).toBe("ambos");
    expect(porColumna.telefono?.via).toBe("ambos");
    expect(porColumna.documento?.via).toBe("ambos");
    expect(porColumna.nombre_completo?.via).toBe("ambos");
    expect(porColumna.correo?.cuota).toBe(1);
  });

  it("no avisa de las columnas que no son personales", () => {
    for (const columna of [
      "edad",
      "plan",
      "uso_mensual_gb",
      "reclamos",
      "se_dio_de_baja",
    ])
      expect(porColumna[columna], columna).toBeUndefined();
  });

  it("jamás lleva un valor: ni una sola celda de las columnas avisadas aparece en el resultado", () => {
    const t = tabla("clientes-con-datos-personales.csv");
    expect(valoresFiltrados(t, avisos)).toEqual([]);
    // solo hay estas claves
    for (const aviso of avisos)
      expect(Object.keys(aviso).sort()).toEqual(["column", "cuota", "tipo", "via"]);
  });

  it("el chequeo de privacidad se demuestra fallando: con un valor inyectado en un aviso, lo encuentra", () => {
    const t = tabla("clientes-con-datos-personales.csv");
    const correo = t.rows[0]![t.headers.indexOf("correo")]!;
    const sucio = avisos.map((a) =>
      a.column === "correo" ? { ...a, column: `correo (${correo})` } : a,
    );
    expect(valoresFiltrados(t, sucio)).toEqual([`correo: ${correo}`]);
  });
});

describe("los archivos limpios del kit no disparan el aviso", () => {
  const limpios = readdirSync(KIT).filter(
    (f) =>
      f.endsWith(".csv") &&
      f !== "clientes-con-datos-personales.csv" &&
      // este no se puede leer como CSV (punto y coma): es el caso de rechazo
      f !== "ejemplo-exportado-de-excel.csv",
  );
  it("hay archivos que mirar", () => {
    expect(limpios.length).toBeGreaterThanOrEqual(15);
  });
  it.each(limpios)("%s", (archivo) => {
    const lectura = parseCsvWithLimits(
      readFileSync(join(KIT, archivo), "utf8"),
    );
    if (!lectura.ok) return; // un archivo del kit hecho para fallar al leerse
    expect(detectarPersonales(lectura.table).map((a) => a.column)).toEqual([]);
  });
});

describe("por el contenido", () => {
  const cinco = (v: string[]) => v.concat(v);
  it("un correo, con o sin el nombre de la columna", () => {
    const t = de(
      ["contacto"],
      [cinco(["a@x.co", "b@y.org", "c.d@z.net", "e@f.com", "g@h.es"])],
    );
    expect(detectarPersonales(t)).toEqual([
      { column: "contacto", tipo: "correo", via: "valor", cuota: 1 },
    ]);
  });

  it("un teléfono escrito con separadores o con «+», pero no un número corrido", () => {
    const escritos = cinco([
      "+57 300 123 4567",
      "(555) 123-4567",
      "300 123 4567",
      "+34 612 345 678",
      "555-123-4567",
    ]);
    expect(
      detectarPersonales(de(["c"], [escritos])).map((a) => a.tipo),
    ).toEqual(["telefono"]);
    const corridos = cinco([
      "3001234567",
      "3109876543",
      "3205551212",
      "3151112233",
      "3004445566",
    ]);
    expect(detectarPersonales(de(["c"], [corridos]))).toEqual([]);
  });

  it("un número corrido SÍ avisa si la columna se llama como un teléfono", () => {
    const t = de(
      ["celular"],
      [["3001234567", "3109876543", "3205551212", "3151112233", "3004445566"]],
    );
    expect(detectarPersonales(t)).toEqual([
      { column: "celular", tipo: "telefono", via: "nombre", cuota: null },
    ]);
  });

  it("un documento con dígito de control válido; con el dígito mal puesto, no", () => {
    const buenos = [
      "12345678Z",
      "X1234567L",
      "00000000T",
      "87654321X",
      "11111111H",
    ];
    expect(
      detectarPersonales(de(["c"], [cinco(buenos)])).map((a) => a.tipo),
    ).toEqual(["documento"]);
    const malos = [
      "12345678A",
      "X1234567A",
      "00000000A",
      "87654321A",
      "11111111A",
    ];
    expect(detectarPersonales(de(["c"], [cinco(malos)]))).toEqual([]);
  });

  it("un RUT con su dígito verificador y un SSN con formato", () => {
    const rut = cinco([
      "12.345.678-5",
      "76.543.210-3",
      "1.111.111-4",
      "9.999.999-3",
      "5.126.663-3",
    ]);
    // se prueba la regla del módulo 11 con valores calculados a mano
    expect(detectarPersonales(de(["c"], [rut])).map((a) => a.tipo)).toEqual([
      "documento",
    ]);
    const ssn = cinco([
      "123-45-6789",
      "078-05-1120",
      "219-09-9999",
      "457-55-5462",
      "536-90-4399",
    ]);
    expect(detectarPersonales(de(["c"], [ssn])).map((a) => a.tipo)).toEqual([
      "documento",
    ]);
    expect(
      detectarPersonales(
        de(
          ["c"],
          [
            cinco([
              "000-12-3456",
              "666-12-3456",
              "900-12-3456",
              "123-00-4567",
              "123-45-0000",
            ]),
          ],
        ),
      ),
    ).toEqual([]);
  });

  it("nombres propios por patrón: se piden varios valores y casi todos distintos", () => {
    const nombres = [
      "Ana López",
      "Luis Pérez Gómez",
      "María de la Cruz",
      "John Smith",
      "Sofía Martínez",
      "Pedro Díaz",
      "Lucía Fernández",
      "Jorge Ramos",
      "Elena Torres",
      "Diego Navarro",
      "Carmen Ruiz",
      "Pablo Ortega",
    ];
    expect(detectarPersonales(de(["c"], [nombres])).map((a) => a.tipo)).toEqual(
      ["nombre"],
    );
    // una categoría con nombre propio se repite: no es una persona
    const ciudades = Array.from(
      { length: 30 },
      (_, i) => ["Buenos Aires", "Nueva York", "San José"][i % 3]!,
    );
    expect(detectarPersonales(de(["c"], [ciudades]))).toEqual([]);
  });

  it("con pocas celdas no se juzga por el contenido", () => {
    expect(detectarPersonales(de(["c"], [["a@x.co", "b@y.org"]]))).toEqual([]);
  });
});

describe("por el nombre de la columna", () => {
  const distintos = (n: number) =>
    Array.from({ length: n }, (_, i) => `valor${i}`);
  it.each([
    ["Correo Electrónico", "correo"],
    ["e-mail", "correo"],
    ["Teléfono", "telefono"],
    ["phone_number", "telefono"],
    ["cédula", "documento"],
    ["DNI", "documento"],
    ["apellidos", "nombre"],
    ["first_name", "nombre"],
    ["nombre_cliente", "nombre"],
    ["customerName", "nombre"],
  ])("«%s» → %s", (encabezado, tipo) => {
    const t = de([encabezado], [distintos(12)]);
    expect(detectarPersonales(t)).toEqual([
      { column: encabezado, tipo, via: "nombre", cuota: null },
    ]);
  });

  it.each([
    "nombre_producto",
    "product_name",
    "name",
    "ciudad",
    "tipo_documento_dummy_x",
    "plan",
  ])("«%s» no es una persona", (encabezado) => {
    // «tipo_documento_dummy_x» tiene la palabra documento pero casi no tiene valores distintos: no se avisa
    const columna =
      encabezado === "tipo_documento_dummy_x"
        ? Array.from({ length: 12 }, (_, i) => ["CC", "TI"][i % 2]!)
        : distintos(12);
    expect(detectarPersonales(de([encabezado], [columna]))).toEqual([]);
  });

  it("una columna llamada como un dato personal pero casi sin valores distintos no avisa", () => {
    const t = de(
      ["correo"],
      [Array.from({ length: 30 }, (_, i) => ["sí", "no"][i % 2]!)],
    );
    expect(detectarPersonales(t)).toEqual([]);
  });

  it("una columna que CUENTA cosas («correos_abiertos», «llamadas_telefono») no guarda el dato", () => {
    const cuenta = Array.from({ length: 12 }, (_, i) => String(i));
    expect(detectarPersonales(de(["correos_abiertos"], [cuenta]))).toEqual([]);
    expect(detectarPersonales(de(["llamadas_telefono"], [cuenta]))).toEqual([]);
    expect(detectarPersonales(de(["total_correos"], [cuenta]))).toEqual([]);
  });

  it("«número de teléfono» y «número de cédula» SÍ son el dato; los conteos con «número» siguen sin avisar (auditoría H-04, S18)", () => {
    const digitos = Array.from({ length: 20 }, (_, i) =>
      String(3001230000 + i * 7919),
    );
    expect(
      detectarPersonales(de(["numero_telefono"], [digitos]))[0]?.tipo,
    ).toBe("telefono");
    expect(
      detectarPersonales(de(["Número de cédula"], [digitos]))[0]?.tipo,
    ).toBe("documento");
    expect(detectarPersonales(de(["num_documento"], [digitos]))[0]?.tipo).toBe(
      "documento",
    );
    const cuenta = Array.from({ length: 12 }, (_, i) => String(i));
    expect(detectarPersonales(de(["numero_llamadas"], [cuenta]))).toEqual([]);
    expect(detectarPersonales(de(["total_telefonos"], [cuenta]))).toEqual([]);
    expect(detectarPersonales(de(["numero_de_pedidos"], [cuenta]))).toEqual([]);
  });

  it("el nombre con tildes, mayúsculas y camelCase se reconoce igual", () => {
    expect(
      detectarPersonales(de(["TeléfonoMóvil"], [distintos(12)]))[0]?.tipo,
    ).toBe("telefono");
  });
});

describe("el detector es determinista y no cambia la tabla", () => {
  it("dos corridas dan lo mismo y la tabla queda igual", () => {
    const t = tabla("clientes-con-datos-personales.csv");
    const antes = JSON.stringify(t);
    expect(detectarPersonales(t)).toEqual(detectarPersonales(t));
    expect(JSON.stringify(t)).toBe(antes);
  });
});
