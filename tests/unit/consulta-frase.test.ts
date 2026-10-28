// S21 (ADR 030): la consulta en palabras y la frase del resultado de «Pregúntale a tus datos». Lo que estos tests hacen FALLAR:
//  · la frase dice las cifras del resultado (la primera, la última, el total, el porcentaje) y ninguna otra;
//  · si el motor y la recuenta por otro camino no coinciden, la frase cae a la línea mínima y NO afirma nada;
//  · la consulta en palabras dice lo mismo que el plan (filtros, unión, «los N», ventana) en los dos idiomas.
import { describe, expect, it } from "vitest";
import {
  armarCatalogo,
  correr,
  type QueryPlan,
  type Resultado,
} from "@/engine/consulta";
import { leerPregunta } from "@/engine/pregunta";
import { enPalabras, fraseResultado, recontar } from "@/lib/narration/consulta";
import { TEXTOS_PREGUNTA } from "@/lib/narration/textos-pregunta";
import { catalogoDelKit } from "../fixtures/preguntas/ayudas";

const cat = catalogoDelKit("ventas-por-region.csv");
const consulta = (pregunta: string): QueryPlan => {
  const l = leerPregunta(pregunta, cat);
  if (l.tipo !== "consulta") throw new Error(`no es una consulta: ${pregunta}`);
  return l.plan;
};

describe("la frase del resultado", () => {
  it("por categoría: dice el total, el primero con su parte del total y el último, con cifras que existen", () => {
    const plan = consulta("total de unidades por región");
    const r = correr(plan, cat);
    const f = fraseResultado(plan, cat, r, "es");
    expect(f.verificada).toBe(true);
    expect(f.texto).toMatch(
      /^Por «region», la suma de «unidades» fue [\d,]+: «\w+» va primero con [\d,]+, el \d+ % del total y «\w+» queda al final con [\d,]+\.$/,
    );
    // el total es la suma de los grupos, y el primero es el mayor
    const total = r.grupos.reduce((a, g) => a + g.valor, 0);
    expect(f.texto).toContain(total.toLocaleString("en-US"));
    expect(r.grupos[0]!.valor).toBe(Math.max(...r.grupos.map((g) => g.valor)));
  });

  it("por periodo: del primero al último y el mejor, en orden cronológico", () => {
    const plan = consulta("promedio de unidades por trimestre");
    const f = fraseResultado(plan, cat, correr(plan, cat), "es");
    expect(f.verificada).toBe(true);
    expect(f.texto).toMatch(
      /pasa de [\d.,]+ en 2024-Q1 a [\d.,]+ en 2025-Q4; el mejor trimestre fue 20\d\d-Q\d con/,
    );
  });

  it("sin agrupar: una cifra sobre sus filas; en inglés habla en inglés", () => {
    const plan = consulta("total de unidades");
    const f = fraseResultado(plan, cat, correr(plan, cat), "en");
    expect(f.verificada).toBe(true);
    expect(f.texto).toMatch(/^the sum of «unidades»: [\d,]+, over 832 rows\.$/);
  });

  it("con un solo grupo no habla de «primero» y «último»", () => {
    const plan = consulta("ventas de premium por región, los 1 mayores");
    const f = fraseResultado(plan, cat, correr(plan, cat), "es");
    expect(f.verificada).toBe(true);
    expect(f.texto).toMatch(
      /^la suma de «ventas_usd» en «\w+»: [\d,.]+, sobre \d+ filas\.$/,
    );
  });

  it("el porcentaje del total no se dice si hay cifras negativas", () => {
    const c = armarCatalogo({
      headers: ["grupo", "saldo"],
      rows: [
        ["a", "100"],
        ["a", "-30"],
        ["b", "-50"],
        ["c", "20"],
      ],
    });
    const l = leerPregunta("total de saldo por grupo", c);
    if (l.tipo !== "consulta") throw new Error("no es una consulta");
    const f = fraseResultado(l.plan, c, correr(l.plan, c), "es");
    expect(f.verificada).toBe(true);
    expect(f.texto).not.toContain("% del total");
    expect(f.texto).toMatch(/[-−]50/);
  });

  it("si el motor y la recuenta no coinciden, cae a la línea mínima y no afirma ninguna cifra", () => {
    const plan = consulta("total de unidades por región");
    const r = correr(plan, cat);
    const manipulado: Resultado = {
      ...r,
      grupos: r.grupos.map((g, i) =>
        i === 0 ? { ...g, valor: g.valor * 2 } : g,
      ),
    };
    expect(recontar(plan, cat, manipulado).coincide).toBe(false);
    const f = fraseResultado(plan, cat, manipulado, "es");
    expect(f.verificada).toBe(false);
    expect(f.texto).toBe("El resultado tiene 4 grupos; mira la tabla.");
  });

  // el segundo respaldo: la recuenta cuadra con el motor, pero la PLANTILLA (un texto que alguien editó) dice una cifra que no está o calla
  // una que sí. Sin este caso, `verificarTexto` podía quitarse de `fraseResultado` y ninguna prueba lo notaba (demo en rojo del S21).
  it("si la plantilla dice una cifra que no está, o calla una que sí, cae a la línea mínima", () => {
    const frase = (
      TEXTOS_PREGUNTA.es as unknown as {
        pregunta: { frase: Record<string, string> };
      }
    ).pregunta.frase;
    const original = frase.categoria!;
    const plan = consulta("total de unidades por región");
    const r = correr(plan, cat);
    expect(fraseResultado(plan, cat, r, "es").verificada).toBe(true);
    try {
      frase.categoria =
        "Por «{grupo}», {medida} fue {total}: «{primero}» va primero con 123456789 y «{ultimo}» queda al final con {vn}.";
      const inventa = fraseResultado(plan, cat, r, "es");
      expect(inventa.verificada).toBe(false);
      expect(inventa.texto).toBe("El resultado tiene 4 grupos; mira la tabla.");

      frase.categoria =
        "Por «{grupo}», {medida}: «{primero}» va primero con {v1} y «{ultimo}» queda al final con {vn}.";
      const calla = fraseResultado(plan, cat, r, "es");
      expect(calla.verificada).toBe(false);
      expect(calla.texto).toBe("El resultado tiene 4 grupos; mira la tabla.");
    } finally {
      frase.categoria = original;
    }
    expect(fraseResultado(plan, cat, r, "es").verificada).toBe(true);
  });

  it("si el primer grupo no es el mayor, la recuenta lo descubre", () => {
    const plan = consulta("total de unidades por región");
    const r = correr(plan, cat);
    const desordenado: Resultado = { ...r, grupos: [...r.grupos].reverse() };
    expect(recontar(plan, cat, desordenado).coincide).toBe(false);
    expect(fraseResultado(plan, cat, desordenado, "es").verificada).toBe(false);
  });

  it("un resultado vacío no inventa una frase", () => {
    const plan = consulta("ventas por región");
    const vacio: Resultado = {
      ...correr(plan, cat),
      grupos: [],
      gruposTotales: 0,
      filasUsadas: 0,
    };
    expect(fraseResultado(plan, cat, vacio, "es").verificada).toBe(false);
  });
});

describe("la consulta en palabras", () => {
  it("dice los filtros, la unión, la ventana y «los N» como el plan", () => {
    const plan = consulta(
      "ventas de premium y estandar en 2025 por región, los 2 mayores",
    );
    const es = enPalabras(plan, "es");
    expect(es).toContain("la suma de «ventas_usd»");
    expect(es).toContain("separada por «region»");
    expect(es).toContain("del 2025-01-01 al 2025-12-31");
    expect(es).toContain("«producto» es «premium» o «producto» es «estandar»");
    expect(es).toContain("mostrando los 2 mayores");
    const en = enPalabras(plan, "en");
    expect(en).toContain("«producto» is «premium» or «producto» is «estandar»");
    expect(en).toContain("showing the 2 largest");
  });

  it("un filtro numérico y uno de exclusión", () => {
    const es = enPalabras(
      consulta("ventas con unidades mayores a 30 sin premium"),
      "es",
    );
    expect(es).toContain("«unidades» es mayor que 30");
    expect(es).toContain("«producto» no es «premium»");
    expect(es).toContain(" y ");
  });
});
