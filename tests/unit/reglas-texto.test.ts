// @vitest-environment node
/**
 * S19 (ADR 027): lo que el usuario se lleva del modelo en reglas, en su idioma. Garantías que estos tests hacen FALLAR:
 *  - el texto trae una línea por hoja, numeradas, con los cortes tal cual están en el SQL, y los dos idiomas;
 *  - los grupos se llaman «Grupo n» y «Fuera de todo grupo» (o sus equivalentes), y las cantidades llevan su unidad;
 *  - sin fidelidad suficiente el texto avisa que es un resumen; con ella, no;
 *  - el SQL trae las etiquetas de los grupos en el idioma de la pantalla.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { fidelidadSuficiente, hojasDe } from "@/engine/reglas";
import { etiquetaDe, sqlDeReglas, textoReglas } from "@/lib/narration/reglas";
import type { RulesResult } from "@/workers/protocol";

const fixture = (name: string): RulesResult =>
  JSON.parse(
    readFileSync(resolve(__dirname, `../fixtures/contrato/${name}.json`), "utf8"),
  ) as RulesResult;

describe("el texto de las reglas", () => {
  for (const locale of ["es", "en"] as const) {
    it(`${locale}: una línea numerada por hoja, con la cabecera y la fidelidad`, () => {
      const r = fixture("rules-result-binaria");
      const texto = textoReglas(r, locale, { fidelidadSuficiente: fidelidadSuficiente(r) });
      const lineas = texto.split("\n");
      const hojas = hojasDe(r.tree);
      const numeradas = lineas.filter((l) => /^\d+\. /.test(l));
      expect(numeradas).toHaveLength(hojas.length);
      expect(numeradas.map((l) => Number(l.split(".")[0]))).toEqual(hojas.map((_, i) => i + 1));
      expect(lineas[0]).toContain(locale === "es" ? "Reglas derivadas del modelo" : "Rules derived from the model");
      expect(lineas[1]).toMatch(/\d+(\.\d)? %/);
      expect(texto.endsWith("\n")).toBe(true);
    });
  }

  it("los cortes son los del SQL, sin redondear para la vista", () => {
    const r = fixture("rules-result-numerica");
    const texto = textoReglas(r, "es", { fidelidadSuficiente: true });
    for (const h of hojasDe(r.tree))
      for (const c of h.condiciones)
        if (c.kind === "numeric") expect(texto).toContain(String(c.valor));
  });

  it("sin fidelidad suficiente avisa que es un resumen; con ella, no", () => {
    const r = fixture("rules-result-binaria");
    expect(textoReglas(r, "es", { fidelidadSuficiente: false })).toContain("Es un resumen del modelo");
    expect(textoReglas(r, "es", { fidelidadSuficiente: true })).not.toContain("Es un resumen del modelo");
  });

  it("la mediana con que se llena un vacío se dice, solo de las columnas que las reglas usan", () => {
    const r = fixture("rules-result-binaria");
    const texto = textoReglas(r, "es", { fidelidadSuficiente: true });
    const usadas = new Set(hojasDe(r.tree).flatMap((h) => h.condiciones.map((c) => c.column)));
    for (const c of r.numeric) {
      const linea = `Un valor vacío en "${c.column}" se toma como ${c.median}.`;
      expect(texto.includes(linea)).toBe(usadas.has(c.column));
    }
  });

  it("las cantidades llevan su unidad", () => {
    const r = fixture("rules-result-numerica");
    const texto = textoReglas(r, "es", { unidad: "kWh", fidelidadSuficiente: false });
    expect(texto).toMatch(/entonces \d[\d,.]* kWh/);
  });
});

describe("los grupos", () => {
  it("se llaman «Grupo n» (desde 1) y «Fuera de todo grupo», en el idioma de la pantalla", () => {
    expect(etiquetaDe("agrupar", 0, "es")).toBe("Grupo 1");
    expect(etiquetaDe("agrupar", 2, "en")).toBe("Group 3");
    expect(etiquetaDe("agrupar", -1, "es")).toBe("Fuera de todo grupo");
    expect(etiquetaDe("agrupar", -1, "en")).toBe("Outside every group");
    expect(etiquetaDe("binaria", "si", "es")).toBe("si");
    expect(etiquetaDe("numerica", 12.5, "es")).toBe(12.5);
  });

  it("el SQL y el texto de agrupar nombran los mismos grupos", () => {
    const r = fixture("rules-result-agrupar");
    const sql = sqlDeReglas(r, "es");
    const texto = textoReglas(r, "es", { fidelidadSuficiente: true });
    for (const h of hojasDe(r.tree)) {
      const etiqueta = String(etiquetaDe("agrupar", h.pred, "es"));
      expect(sql).toContain(`THEN '${etiqueta}'`);
      expect(texto).toContain(`«${etiqueta}»`);
    }
  });

  it("el marcador de la tabla del SQL se dice en el idioma de la pantalla (S21, 19-17)", () => {
    const r = fixture("rules-result-binaria");
    expect(sqlDeReglas(r, "es")).toContain('FROM "tu_tabla"');
    expect(sqlDeReglas(r, "en")).toContain('FROM "your_table"');
    expect(sqlDeReglas(r, "en")).not.toContain("tu_tabla");
    // quien la nombra a mano (el gate de CPython) manda sobre el idioma
    expect(sqlDeReglas(r, "en", "tu_tabla")).toContain('FROM "tu_tabla"');
  });

  it("el SQL de estimar trae números, no textos", () => {
    const sql = sqlDeReglas(fixture("rules-result-numerica"), "es");
    expect(sql).toMatch(/THEN -?\d/);
    expect(sql).not.toMatch(/THEN '/);
  });
});
