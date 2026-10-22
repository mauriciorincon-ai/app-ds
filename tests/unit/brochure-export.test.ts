import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  brochureExportSchema,
  versionCompatible,
} from "./brochure-export.schema";

// El export que consume la vitrina de hoja-de-vida (contrato v1.0.0 del portafolio).
// Existe porque la acceptance #3 de su entrega ("conteo del export = pie del brochure =
// MANUAL") se verifica UNA vez a mano y se desincroniza en silencio la primera vez que
// alguien toque una feature sin acordarse del JSON. Aquí queda permanente.

type Feature = {
  id: string;
  nombre: string;
  que_hace: string;
  seccion_manual: string;
};
type Grupo = {
  orden: number;
  estrella: boolean;
  nombre: string;
  features: Feature[];
};
type Metrica = {
  clave: string;
  valor: number;
  fuente: string;
  detalle: string;
};

const exportado = JSON.parse(
  readFileSync("docs/brochure-export.json", "utf8"),
) as {
  schema_version: string;
  app: { estado: string; sellado_en: string | null };
  funcionalidades: {
    total: number;
    fuente_del_conteo: string;
    grupos: Grupo[];
  };
  metricas: Metrica[];
  enlaces: { produccion: string | null; repositorio: string | null };
};

const brochure = readFileSync("docs/BROCHURE.html", "utf8");

// Tope de `metricas[].detalle` del contrato de ficha técnica de CV Viva.
const DETALLE_MAX = 400;

describe("brochure-export.json", () => {
  it("el total cuadra con el pie del BROCHURE.html", () => {
    const pie = brochure.match(/data-contador="(\d+)"/);
    expect(pie, "el pie del brochure debe declarar su conteo").not.toBeNull();
    expect(exportado.funcionalidades.total).toBe(Number(pie![1]));
  });

  it("los grupos suman exactamente el total (agrupar sí, omitir jamás)", () => {
    const suma = exportado.funcionalidades.grupos.reduce(
      (n, g) => n + g.features.length,
      0,
    );
    expect(suma).toBe(exportado.funcionalidades.total);
  });

  // S6 (AU-S6-06): el export decía «8 ADR» con 14 y un peso viejo del brochure,
  // todo con `fuente: "medido"`. Lo que se puede recontar desde el repo, se recuenta.
  it("las métricas que se recuentan desde el repo cuadran (ADR, peso del brochure, dependencias, etapas)", async () => {
    const valor = (clave: string) =>
      exportado.metricas.find((m) => m.clave === clave)!.valor;
    const adrs = readdirSync("decisions").filter((f) =>
      /^\d{3}-.+\.md$/.test(f),
    );
    expect(valor("decisiones_registradas")).toBe(adrs.length);
    expect(valor("peso_brochure")).toBe(
      readFileSync("docs/BROCHURE.html").length,
    );
    // S16: las etapas del Protocolo que el export dice construidas son las que el código define como construidas
    const { PROTOCOLO_DS } = await import("@/engine/protocolo/protocolo-ds");
    expect(valor("etapas_protocolo")).toBe(
      PROTOCOLO_DS.filter((etapa) => etapa.construida).length,
    );
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(valor("dependencias_runtime")).toBe(
      Object.keys(pkg.dependencies).length,
    );
  });

  it("toda métrica lleva su fuente, y de las cuatro admitidas", () => {
    const admitidas = ["medido", "calculada", "declarado", "estimacion"];
    for (const metrica of exportado.metricas) {
      expect(admitidas, `métrica «${metrica.clave}»`).toContain(metrica.fuente);
      // El contrato de ficha técnica de CV Viva (app-hoja-de-vida,
      // docs/contrato-ficha-tecnica/plantilla.ficha-tecnica.json: «detalle: 1–400 caracteres») rechaza
      // un detalle más largo y su build cae. Con solo `> 0`, un detalle de 490 pasó aquí en el S7.
      expect(
        metrica.detalle.length,
        `métrica «${metrica.clave}»`,
      ).toBeGreaterThan(0);
      expect(
        metrica.detalle.length,
        `métrica «${metrica.clave}»: detalle de ${metrica.detalle.length} caracteres, el contrato de CV Viva admite ${DETALLE_MAX}`,
      ).toBeLessThanOrEqual(DETALLE_MAX);
    }
  });

  it("cero enlaces: ni producción, ni repositorio, ni una URL colada en el archivo", () => {
    expect(exportado.enlaces.produccion).toBeNull();
    expect(exportado.enlaces.repositorio).toBeNull();
    expect(readFileSync("docs/brochure-export.json", "utf8")).not.toMatch(
      /vercel\.app|workers\.dev/,
    );
  });

  it("el estado y el sello son coherentes entre sí", () => {
    expect(["inicial", "sellado"]).toContain(exportado.app.estado);
    if (exportado.app.estado === "inicial") {
      expect(exportado.app.sellado_en).toBeNull();
    } else {
      expect(exportado.app.sellado_en).not.toBeNull();
    }
  });

  it("el documento contra el que se cuadró el conteo existe de verdad", () => {
    // Sin esto, `fuente_del_conteo` es una afirmación: apuntaría a un archivo
    // renombrado o borrado y el total seguiría pareciendo respaldado.
    expect(() =>
      readFileSync(exportado.funcionalidades.fuente_del_conteo, "utf8"),
    ).not.toThrow();
  });

  it("cada feature dice qué hace y de qué sección del manual salió", () => {
    const ids = new Set<string>();
    for (const grupo of exportado.funcionalidades.grupos) {
      for (const feature of grupo.features) {
        expect(feature.que_hace.length, feature.id).toBeGreaterThan(0);
        expect(feature.seccion_manual.length, feature.id).toBeGreaterThan(0);
        expect(ids.has(feature.id), `id duplicado: ${feature.id}`).toBe(false);
        ids.add(feature.id);
      }
    }
  });

  it("cada sección del manual que cita el export existe en el manual", () => {
    // S7 (AU-A-11): una `seccion_manual` que no está en el manual deja la feature sin respaldo, y el
    // conteo «cuadrado contra el manual» deja de serlo. Cuenta como sección un encabezado
    // («### Nombre · desde Sprint N») o una viñeta en negrita («- **Nombre:**»).
    const manual = readFileSync(
      exportado.funcionalidades.fuente_del_conteo,
      "utf8",
    );
    const secciones = new Set<string>();
    for (const linea of manual.split("\n")) {
      const encabezado = /^#{2,4} (.+?)(?: · .*)?$/.exec(linea);
      if (encabezado) secciones.add(encabezado[1].trim());
      const vineta = /^\s*- \*\*(.+?):?\*\*/.exec(linea);
      if (vineta) secciones.add(vineta[1].trim());
    }
    const sinRespaldo = exportado.funcionalidades.grupos
      .flatMap((grupo) => grupo.features)
      .filter((feature) => !secciones.has(feature.seccion_manual))
      .map((feature) => `${feature.id}: «${feature.seccion_manual}»`);
    expect(sinRespaldo, "secciones del manual que no existen").toEqual([]);
  });
});

/**
 * S16 — el export se valida con el MISMO esquema que lo va a leer la vitrina de hoja-de-vida (`brochure-export.schema.ts`,
 * copia literal; ds no tenía un esquema ejecutable propio y un export que pasa aquí y revienta allá no le sirve a nadie),
 * y cabe en los topes de la ficha técnica de CV Viva (`docs/contrato-ficha-tecnica/plantilla.ficha-tecnica.json`, v1.3.1):
 *
 *   - de la app, el nombre (≤ 60), el ciclo (≤ 16) y la versión (≤ 20);
 *   - de la promesa, el tagline (≤ 80), la intro y el «para quién» (1–400);
 *   - el stack, de 1 a 8 piezas, cada una con su nombre (≤ 40) y su papel (≤ 160);
 *   - los grupos de funcionalidades, de 2 a 10, con su nombre (≤ 40) y su línea (≤ 120);
 *   - y de cada métrica, la clave (≤ 60), la etiqueta (≤ 60), la unidad (≤ 40) y el detalle (1–400).
 *
 * Con uno fuera de su tope la ficha no se arma y el build de CV Viva falla, y CV Viva no edita lo que exporta otra app.
 */
type Tope = [campo: string, medida: number, minimo: number, maximo: number];
const largo = (
  campo: string,
  texto: string,
  maximo: number,
  minimo = 1,
): Tope => [campo, texto.length, minimo, maximo];

const completo = exportado as unknown as {
  app: {
    nombre: string;
    ciclo: string;
    version_repo: string;
    sprints_cerrados: number;
  };
  promesa: { tagline: string; intro: string; para_quien: string };
  funcionalidades: {
    descartadas: { id: string; nombre: string; razon: string }[];
    grupos: { nombre: string; linea: string; features: { id: string }[] }[];
  };
  metricas: {
    clave: string;
    etiqueta: string;
    unidad: string;
    detalle: string;
  }[];
  stack: { nombre: string; papel: string }[];
};

const TOPES_DE_LA_FICHA: Tope[] = [
  largo("app.nombre", completo.app.nombre, 60),
  largo("app.ciclo", completo.app.ciclo, 16),
  largo("app.version_repo", completo.app.version_repo, 20),
  largo("promesa.tagline", completo.promesa.tagline, 80),
  largo("promesa.intro", completo.promesa.intro, 400),
  largo("promesa.para_quien", completo.promesa.para_quien, 400),
  ["stack", completo.stack.length, 1, 8],
  ...completo.stack.flatMap((p, i) => [
    largo(`stack[${i}].nombre`, p.nombre, 40),
    largo(`stack[${i}].papel`, p.papel, 160),
  ]),
  ["funcionalidades.grupos", completo.funcionalidades.grupos.length, 2, 10],
  ...completo.funcionalidades.grupos.flatMap((g, i) => [
    largo(`funcionalidades.grupos[${i}].nombre`, g.nombre, 40),
    largo(`funcionalidades.grupos[${i}].linea`, g.linea, 120),
  ]),
  ...completo.metricas.flatMap((m) => [
    largo(`metricas.${m.clave}.clave`, m.clave, 60),
    largo(`metricas.${m.clave}.etiqueta`, m.etiqueta, 60),
    largo(`metricas.${m.clave}.unidad`, m.unidad, 40, 0),
    largo(`metricas.${m.clave}.detalle`, m.detalle, 400),
  ]),
];

describe("brochure-export.json: el contrato de la vitrina (S16)", () => {
  it("lo acepta el esquema con que lo lee la vitrina, en la versión que sabe leer, y cabe en la ficha técnica de CV Viva", () => {
    const r = brochureExportSchema.safeParse(exportado);
    expect(
      r.success,
      r.success ? "" : JSON.stringify(r.error.issues, null, 2),
    ).toBe(true);
    expect(versionCompatible(exportado.schema_version)).toBe(true);
    const fuera = TOPES_DE_LA_FICHA.filter(
      ([, medida, minimo, maximo]) => medida < minimo || medida > maximo,
    ).map(([campo, medida, minimo, maximo]) =>
      medida > maximo
        ? `${campo} (${medida} de ${maximo})`
        : `${campo} (${medida}, mínimo ${minimo})`,
    );
    expect(fuera, "campos fuera de los topes de la ficha técnica").toEqual([]);
  });

  it("el esquema de la vitrina rechaza un total que no cuadra con los grupos (el candado se ve fallar)", () => {
    const roto = structuredClone(exportado) as unknown as {
      funcionalidades: { total: number };
    };
    roto.funcionalidades.total += 1;
    const r = brochureExportSchema.safeParse(roto);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toMatch(/total declarado/);
  });

  it("las funcionalidades que la VISION nombra y no existen van como descartadas, con su razón", () => {
    const { descartadas, grupos } = completo.funcionalidades;
    expect(descartadas.length).toBeGreaterThan(0);
    const construidas = new Set(
      grupos.flatMap((g) => g.features.map((f) => f.id)),
    );
    for (const d of descartadas) {
      expect(d.razon.length, d.id).toBeGreaterThan(0);
      expect(
        construidas.has(d.id),
        `«${d.id}» no puede ser a la vez construida y descartada`,
      ).toBe(false);
    }
  });
});

/**
 * **La copia, contra su original**, cuando ese repo está en el Mac. En la CI no está y esta prueba se salta: es una
 * comprobación local, dicha aquí para que nadie la cuente como gate de la CI.
 */
const VITRINA = join(
  homedir(),
  "Code/app-hoja-de-vida/src/lib/vitrina/schemas.ts",
);

describe("la copia del contrato, contra su original (solo en local)", () => {
  it.skipIf(!existsSync(VITRINA))(
    "el esquema es el de la vitrina, sin tocar",
    () => {
      const copia = readFileSync(
        "tests/unit/brochure-export.schema.ts",
        "utf8",
      );
      expect(copia.slice(copia.indexOf('import { z } from "zod";'))).toBe(
        readFileSync(VITRINA, "utf8"),
      );
    },
  );
});
