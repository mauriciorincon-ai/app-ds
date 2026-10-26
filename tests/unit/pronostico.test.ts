// S20 (ADR 028): lo que decide TypeScript del pronóstico. Lo que estas pruebas hacen FALLAR:
//  · el veredicto compara al ganador con el MEJOR MÉTODO SIMPLE y respeta el empate del 1 % relativo (METRIC_RULES.mae), en el borde;
//  · la media que gana es «sin estructura»; un simple que gana es «simple»; un elaborado dentro del empate es «empata»;
//  · la regla de un error estándar de TypeScript es la de Python (el más simple dentro del error estándar del mejor);
//  · la frase dice las cifras del resultado, en los dos idiomas, y si una plantilla se rompe cae a la línea mínima;
//  · el CSV lleva la historia (con la marca de lo completado) y el pronóstico con sus bandas, y neutraliza fórmulas.
import { describe, expect, it } from "vitest";
import {
  csvDelPronostico,
  mejorSimple,
  unErrorEstandar,
  veredictoDe,
  type PronosticoViable,
} from "@/engine/pronostico";
import { armarSerie } from "@/engine/serie";
import { fraseVeredicto } from "@/lib/narration/pronostico";
import type { ForecastLeagueRow, ForecastMethod } from "@/workers/protocol";

const NOMBRES: ForecastMethod[] = ["media", "ingenuo", "ingenuo_estacional", "deriva", "holt_winters", "rezagos"];

function liga(mae: Partial<Record<ForecastMethod, number>>, std = 0.2): ForecastLeagueRow[] {
  return NOMBRES.map((name) => {
    const m = mae[name];
    return m === undefined
      ? { name, status: "skipped", reason: "short", cv: null, mase: null }
      : { name, status: "ok", reason: null, cv: { mean: m, std, folds: [m, m, m] }, mase: null };
  });
}

function resultado(mae: Partial<Record<ForecastMethod, number>>, std = 0.2): PronosticoViable {
  const l = liga(mae, std);
  const seleccion = unErrorEstandar(l, 3)!;
  return {
    viable: true,
    n: 60,
    n_input: 60,
    truncated: false,
    season: 12,
    seasonal_ok: true,
    seasonal_reason: "ok",
    period: "mes",
    horizon: 2,
    step: 1,
    origins: [56, 57, 58],
    scale: 1,
    league: l,
    best: seleccion.best,
    winner: seleccion.winner,
    best_simple: mejorSimple(l)!,
    se: seleccion.se,
    forecast: [100, 110],
    lo80: [95, 102],
    hi80: [105, 118],
    lo95: [92, 98],
    hi95: [108, 122],
    elapsed_ms: 1,
  };
}

describe("el veredicto", () => {
  it("un elaborado que baja el error más de 1 % frente al mejor simple «supera», y se nombra a la referencia", () => {
    const v = veredictoDe(resultado({ media: 30, ingenuo: 25, ingenuo_estacional: 10, deriva: 28, holt_winters: 5, rezagos: 7 }, 0.1));
    expect(v.caso).toBe("supera");
    expect(v.ganador).toBe("holt_winters");
    expect(v.referencia).toBe("ingenuo_estacional");
    expect(v.mejora).toBeCloseTo(0.5, 9);
  });

  it("en el borde: 1 % exacto es empate; un poco más de 1 % supera", () => {
    // ingenuo estacional 10; el elaborado 9.9 → mejora de exactamente 1 %
    const empate = veredictoDe(resultado({ media: 30, ingenuo: 25, ingenuo_estacional: 10, holt_winters: 9.9 }, 0.01));
    expect(empate.ganador).toBe("holt_winters");
    expect(empate.caso).toBe("empata");
    const supera = veredictoDe(resultado({ media: 30, ingenuo: 25, ingenuo_estacional: 10, holt_winters: 9.89 }, 0.01));
    expect(supera.caso).toBe("supera");
  });

  it("si gana la media, la serie no tiene estructura; si gana otro simple, «simple»", () => {
    const ruido = veredictoDe(resultado({ media: 11, ingenuo: 13, ingenuo_estacional: 15, deriva: 14, holt_winters: 13, rezagos: 15 }));
    expect(ruido.caso).toBe("sin_estructura");
    expect(ruido.ganador).toBe("media");
    const simple = veredictoDe(resultado({ media: 30, ingenuo: 20, ingenuo_estacional: 10, deriva: 28, holt_winters: 10.1, rezagos: 10.2 }, 0.5));
    expect(simple.ganador).toBe("ingenuo_estacional");
    expect(simple.caso).toBe("simple");
  });

  it("contra el ingenuo estacional a secas la media ganaría en ruido: por eso la vara es el mejor simple", () => {
    const r = resultado({ media: 11, ingenuo: 13, ingenuo_estacional: 15.5, deriva: 14, holt_winters: 13, rezagos: 15 });
    expect(r.best_simple).toBe("media");
    expect(veredictoDe(r).referencia).toBe("media");
  });
});

describe("la regla de un error estándar", () => {
  it("gana el primero del orden a menos de un error estándar del mejor", () => {
    // mejor: rezagos 10; se = 0.6/√3 ≈ 0.346 → umbral 10.346; el primero del orden dentro del umbral es holt_winters (10.3)
    const l = liga({ media: 30, ingenuo: 20, ingenuo_estacional: 15, deriva: 25, holt_winters: 10.3, rezagos: 10 }, 0.6);
    const s = unErrorEstandar(l, 3)!;
    expect(s.best).toBe("rezagos");
    expect(s.winner).toBe("holt_winters");
    expect(s.se).toBeCloseTo(0.6 / Math.sqrt(3), 12);
  });

  it("solo compiten los métodos que concluyeron", () => {
    const s = unErrorEstandar(liga({ media: 4.1, deriva: 4 }), 3)!;
    expect(s.winner).toBe("media");
    expect(unErrorEstandar(liga({}), 3)).toBeNull();
  });
});

describe("la frase del veredicto", () => {
  const ctx = { columna: "ventas", horizonte: 12, pliegues: 9 };
  const supera = veredictoDe(resultado({ media: 30, ingenuo: 25, ingenuo_estacional: 10, deriva: 28, holt_winters: 5, rezagos: 7 }, 0.1));

  it("dice el método, la referencia y las cifras, en español y en inglés", () => {
    const es = fraseVeredicto(supera, ctx, "es");
    expect(es.verificada).toBe(true);
    expect(es.texto).toContain("«Holt-Winters» supera a «ingenuo estacional»");
    expect(es.texto).toContain("5");
    expect(es.texto).toContain("10");
    expect(es.texto).toContain("50 % menos");
    const en = fraseVeredicto(supera, ctx, "en");
    expect(en.verificada).toBe(true);
    expect(en.texto).toContain("“Holt-Winters” beats “seasonal naive”");
    expect(en.texto).toContain("50 % less error");
  });

  it("cada caso se verifica contra sus cifras", () => {
    const casos = [
      resultado({ media: 11, ingenuo: 13, ingenuo_estacional: 15, deriva: 14, holt_winters: 13, rezagos: 15 }),
      resultado({ media: 30, ingenuo: 25, ingenuo_estacional: 10, holt_winters: 9.9 }, 0.01),
      resultado({ media: 30, ingenuo: 20, ingenuo_estacional: 10, deriva: 28, holt_winters: 10.1, rezagos: 10.2 }, 0.5),
    ];
    for (const r of casos)
      for (const locale of ["es", "en"] as const) {
        const f = fraseVeredicto(veredictoDe(r), ctx, locale);
        expect(f.verificada, `${veredictoDe(r).caso}/${locale}`).toBe(true);
      }
  });

  it("un nombre de columna con cifras no cuenta como cifra ajena", () => {
    const f = fraseVeredicto(supera, { ...ctx, columna: "ventas 2024" }, "es");
    expect(f.verificada).toBe(true);
  });
});

describe("el CSV del pronóstico", () => {
  const etiquetas = {
    periodo: "periodo", tipo: "tipo", valor: "valor", inferior80: "inferior_80", superior80: "superior_80",
    inferior95: "inferior_95", superior95: "superior_95", completado: "completado", historia: "historia",
    pronostico: "pronostico", si: "si", no: "no",
  };
  it("lleva la historia (con lo completado marcado) y el pronóstico con sus bandas", () => {
    const s = armarSerie(["2026-01-01", "2026-02-01", "2026-04-01"], [1, 2, 4], "mes", "suma");
    if (!s.ok) throw new Error("serie");
    const csv = csvDelPronostico(s.serie, [1, 2, 3, 4], [false, false, true, false], resultado({ media: 1 }), etiquetas);
    const lineas = csv.trimEnd().split("\n");
    expect(lineas[0]).toBe("periodo,tipo,valor,inferior_80,superior_80,inferior_95,superior_95,completado");
    expect(lineas[1]).toBe("2026-01,historia,1,,,,,no");
    expect(lineas[3]).toBe("2026-03,historia,3,,,,,si");
    expect(lineas[5]).toBe("2026-05,pronostico,100,95,105,92,108,no");
    expect(lineas[6]).toBe("2026-06,pronostico,110,102,118,98,122,no");
    expect(lineas).toHaveLength(7);
  });
});
