import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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
  it("las métricas que se recuentan desde el repo cuadran (ADR, peso del brochure, dependencias)", () => {
    const valor = (clave: string) =>
      exportado.metricas.find((m) => m.clave === clave)!.valor;
    const adrs = readdirSync("decisions").filter((f) =>
      /^\d{3}-.+\.md$/.test(f),
    );
    expect(valor("decisiones_registradas")).toBe(adrs.length);
    expect(valor("peso_brochure")).toBe(
      readFileSync("docs/BROCHURE.html").length,
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
