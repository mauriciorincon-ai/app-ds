import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// El export que consume la vitrina de hoja-de-vida (contrato v1.0.0 del portafolio).
// Existe porque la acceptance #3 de su entrega ("conteo del export = pie del brochure =
// MANUAL") se verifica UNA vez a mano y se desincroniza en silencio la primera vez que
// alguien toque una feature sin acordarse del JSON. Aquí queda permanente.

type Feature = { id: string; nombre: string; que_hace: string; seccion_manual: string };
type Grupo = { orden: number; estrella: boolean; nombre: string; features: Feature[] };
type Metrica = { clave: string; valor: number; fuente: string; detalle: string };

const exportado = JSON.parse(
  readFileSync("docs/brochure-export.json", "utf8"),
) as {
  schema_version: string;
  app: { estado: string; sellado_en: string | null };
  funcionalidades: { total: number; fuente_del_conteo: string; grupos: Grupo[] };
  metricas: Metrica[];
  enlaces: { produccion: string | null; repositorio: string | null };
};

const brochure = readFileSync("docs/BROCHURE.html", "utf8");

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

  it("toda métrica lleva su fuente, y de las cuatro admitidas", () => {
    const admitidas = ["medido", "calculada", "declarado", "estimacion"];
    for (const metrica of exportado.metricas) {
      expect(admitidas, `métrica «${metrica.clave}»`).toContain(metrica.fuente);
      expect(metrica.detalle.length, `métrica «${metrica.clave}»`).toBeGreaterThan(0);
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
});
