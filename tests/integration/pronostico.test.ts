// @vitest-environment node
//
// S20 (ADR 028): pronosticar una serie en el Pyodide REAL. Garantías que estos tests hacen FALLAR si se rompen:
//  - el EMISOR real (`run_forecast`) y el lector (`validateForecastResult`) se entienden; este test escribe los fixtures del contrato
//    (CONTRATO_ACTUALIZAR=1 los regenera) y tests/unit/contract-pronostico.test.ts corre sus carnadas;
//  - en una serie con tendencia y temporada (la del kit) Holt-Winters o los rezagos le ganan al ingenuo estacional, y el veredicto es
//    «supera»; en una de ruido blanco (la del kit) la media gana y el veredicto dice que no hay estructura;
//  - la misma serie da la misma cifra dos veces (no hay azar);
//  - el backtest NUNCA mira el futuro: los errores de un pliegue son idénticos si la serie se corta justo después de él;
//  - propiedades: una serie constante no se equivoca, una tendencia pura la sigue la deriva, una temporada pura la repite el
//    ingenuo estacional;
//  - sin dos temporadas completas el ingenuo estacional no compite (y se dice por qué); una serie corta dice cuánto falta; un
//    payload con una clave de más se rechaza nombrándola.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PyodideInterface } from "pyodide";
import { veredictoDe, type PronosticoViable } from "@/engine/pronostico";
import { validateForecastResult } from "@/workers/contrato-pronostico";
import type { ForecastPayload, ForecastResult } from "@/workers/protocol";
import { loadRuntime, pyFunction } from "./runtime";

let py: PyodideInterface;
beforeAll(async () => {
  py = await loadRuntime();
}, 300_000);

const call = (payload: unknown): ForecastResult =>
  JSON.parse(
    pyFunction(py, "run_forecast")(JSON.stringify(payload)),
  ) as ForecastResult;

function failure(payload: unknown): string {
  try {
    call(payload);
  } catch (error) {
    return String((error as Error).message);
  }
  return "";
}

const FIXTURES = resolve(process.cwd(), "tests/fixtures/contrato");
const UPDATE = process.env.CONTRATO_ACTUALIZAR === "1";

function shape(value: unknown): unknown {
  if (Array.isArray(value))
    return value.length ? ["array", shape(value[0])] : ["array"];
  if (value === null) return "null";
  if (typeof value === "object")
    return Object.fromEntries(
      Object.keys(value as object)
        .sort()
        .map((k) => [k, shape((value as Record<string, unknown>)[k])]),
    );
  return typeof value;
}

function emit(name: string, value: unknown) {
  const file = resolve(FIXTURES, `${name}.json`);
  if (UPDATE) {
    mkdirSync(FIXTURES, { recursive: true });
    writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
    return;
  }
  expect(
    existsSync(file),
    `falta el fixture ${name}.json (CONTRATO_ACTUALIZAR=1)`,
  ).toBe(true);
  expect(
    shape(value),
    `la forma de ${name} cambió: regenera con CONTRATO_ACTUALIZAR=1 y revisa las carnadas`,
  ).toEqual(shape(JSON.parse(readFileSync(file, "utf8"))));
}

const serieDelKit = (archivo: string): number[] =>
  readFileSync(resolve(process.cwd(), "docs/kit-de-prueba", archivo), "utf8")
    .trim()
    .split("\n")
    .slice(1)
    .map((linea) => Number(linea.split(",")[1]));

const mensual = (y: number[], horizon = 12): ForecastPayload => ({
  y,
  season: 12,
  horizon,
  period: "mes",
});
const enviado = (p: ForecastPayload) => ({
  n: p.y.length,
  season: p.season,
  horizon: p.horizon,
  period: p.period,
});

function viable(r: ForecastResult): PronosticoViable {
  expect(r.viable).toBe(true);
  return r as PronosticoViable;
}

/** El resultado sin el reloj. */
const sinReloj = (r: PronosticoViable) => ({ ...r, elapsed_ms: 0 });

describe("la liga con origen móvil", () => {
  it("serie estacional (kit): Holt-Winters o los rezagos le ganan al ingenuo estacional y el veredicto es «supera»", () => {
    const payload = mensual(serieDelKit("serie-ventas-mensual.csv"));
    const raw = call(payload);
    emit("forecast-result", raw);
    const r = viable(raw);
    expect(validateForecastResult(raw, enviado(payload)).ok).toBe(true);
    expect(r.seasonal_ok).toBe(true);
    expect(r.best_simple).toBe("ingenuo_estacional");
    expect(["holt_winters", "rezagos"]).toContain(r.winner);
    const mae = (m: string) => r.league.find((f) => f.name === m)!.cv!.mean;
    expect(mae(r.winner)).toBeLessThan(mae("ingenuo_estacional"));
    const v = veredictoDe(r);
    expect(v.caso).toBe("supera");
    expect(v.referencia).toBe("ingenuo_estacional");
    // las bandas contienen al pronóstico y no se angostan
    r.forecast.forEach((f, i) => {
      expect(r.lo80[i]).toBeLessThanOrEqual(f);
      expect(r.hi80[i]).toBeGreaterThanOrEqual(f);
      expect(r.lo95[i]).toBeLessThanOrEqual(r.lo80[i]!);
      expect(r.hi95[i]).toBeGreaterThanOrEqual(r.hi80[i]!);
    });
  });

  it("ruido blanco (kit): la media gana y el veredicto dice que no hay estructura", () => {
    const payload = mensual(serieDelKit("serie-ruido.csv"));
    const r = viable(call(payload));
    expect(validateForecastResult(r, enviado(payload)).ok).toBe(true);
    expect(r.winner).toBe("media");
    expect(veredictoDe(r).caso).toBe("sin_estructura");
  });

  it("la misma serie da la misma cifra dos veces", () => {
    const payload = mensual(serieDelKit("serie-ventas-mensual.csv"));
    expect(sinReloj(viable(call(payload)))).toEqual(
      sinReloj(viable(call(payload))),
    );
  });

  it("el backtest nunca mira el futuro: cortar la serie justo después de un pliegue no cambia sus errores", () => {
    const y = serieDelKit("serie-ventas-mensual.csv");
    const completa = viable(call(mensual(y)));
    expect(completa.origins.length).toBeGreaterThanOrEqual(5);
    // desde el pliegue 2 la serie cortada todavía tiene dos temporadas en tres pliegues: la misma liga
    for (const j of [2, 4, completa.origins.length - 1]) {
      const origen = completa.origins[j]!;
      const cortada = viable(call(mensual(y.slice(0, origen + completa.horizon))));
      expect(cortada.seasonal_ok).toBe(true);
      expect(cortada.origins.at(-1)).toBe(origen);
      for (const fila of completa.league) {
        const otra = cortada.league.find((f) => f.name === fila.name)!;
        expect(otra.status).toBe(fila.status);
        if (fila.cv) expect(otra.cv!.folds.at(-1)).toBeCloseTo(fila.cv.folds[j]!, 9);
      }
    }
  });

  it("el backtest nunca mira el futuro: ensuciar lo que viene después de un pliegue no cambia los pliegues anteriores", () => {
    const y = serieDelKit("serie-ventas-mensual.csv");
    const completa = viable(call(mensual(y)));
    const j = 4;
    const sucia = y.map((v, i) => (i >= completa.origins[j]! + completa.horizon ? v * 37 + 1000 : v));
    const otra = viable(call(mensual(sucia)));
    expect(otra.origins).toEqual(completa.origins);
    for (const fila of completa.league) {
      const b = otra.league.find((f) => f.name === fila.name)!;
      for (let k = 0; k <= j; k++) expect(b.cv!.folds[k]).toBeCloseTo(fila.cv!.folds[k]!, 9);
    }
  });

  it("el backtest nunca ve la ventana que tiene que acertar: con la ventana de un pliegue fija en 500, el error del ingenuo y de la media es el de no haberla visto", () => {
    const y = serieDelKit("serie-ventas-mensual.csv");
    const h = 12;
    const completa = viable(call(mensual(y, h)));
    const o = completa.origins.at(-1)!;
    const ventana = y.map((v, i) => (i >= o ? 500 : v));
    const r = viable(call(mensual(ventana, h)));
    const ultimo = (m: string) => r.league.find((f) => f.name === m)!.cv!.folds.at(-1)!;
    // ingenuo: repite y[o-1]; media: el promedio de lo anterior — sin ver la ventana, el error es |500 − eso|
    expect(ultimo("ingenuo")).toBeCloseTo(Math.abs(500 - y[o - 1]!), 9);
    const media = y.slice(0, o).reduce((a, b) => a + b, 0) / o;
    expect(ultimo("media")).toBeCloseTo(Math.abs(500 - media), 9);
    // deriva: la recta entre el primero y el último de lo anterior, extendida h periodos
    const pendiente = (y[o - 1]! - y[0]!) / (o - 1);
    const esperado =
      Array.from({ length: h }, (_, i) => Math.abs(500 - (y[o - 1]! + pendiente * (i + 1)))).reduce((a, b) => a + b, 0) / h;
    expect(ultimo("deriva")).toBeCloseTo(esperado, 9);
  });

  it("propiedad: una serie constante no se equivoca y no tiene escala", () => {
    const r = viable(call(mensual(Array.from({ length: 60 }, () => 5))));
    for (const fila of r.league) {
      expect(fila.cv!.mean).toBeCloseTo(0, 9);
      expect(fila.mase).toBeNull();
    }
    expect(r.scale).toBeNull();
    expect(r.winner).toBe("media");
    r.forecast.forEach((f) => expect(f).toBeCloseTo(5, 9));
  });

  it("propiedad: una tendencia pura la sigue la deriva (error ~0)", () => {
    const r = viable(
      call(mensual(Array.from({ length: 60 }, (_, i) => 10 + 3 * i))),
    );
    const deriva = r.league.find((f) => f.name === "deriva")!;
    expect(deriva.cv!.mean).toBeCloseTo(0, 6);
    r.forecast.forEach((f, i) => expect(f).toBeCloseTo(10 + 3 * (60 + i), 3));
  });

  it("propiedad: una temporada pura la repite el ingenuo estacional (error 0) y gana", () => {
    const ciclo = [10, 12, 15, 11, 9, 14, 20, 18, 13, 10, 8, 16];
    const r = viable(
      call(mensual(Array.from({ length: 60 }, (_, i) => ciclo[i % 12]!))),
    );
    expect(
      r.league.find((f) => f.name === "ingenuo_estacional")!.cv!.mean,
    ).toBeCloseTo(0, 9);
    expect(r.winner).toBe("ingenuo_estacional");
    r.forecast.forEach((f, i) =>
      expect(f).toBeCloseTo(ciclo[(60 + i) % 12]!, 9),
    );
  });
});

describe("lo que la serie no alcanza a decir", () => {
  it("con menos de dos temporadas en tres pliegues el ingenuo estacional no compite y se dice por qué", () => {
    const payload = mensual(
      serieDelKit("serie-ventas-mensual.csv").slice(0, 36),
    );
    const raw = call(payload);
    const r = viable(raw);
    expect(validateForecastResult(raw, enviado(payload)).ok).toBe(true);
    expect(r.seasonal_ok).toBe(false);
    expect(r.seasonal_reason).toBe("short");
    const fila = r.league.find((f) => f.name === "ingenuo_estacional")!;
    expect(fila.status).toBe("skipped");
    expect(fila.reason).toBe("short");
    expect(r.best_simple).not.toBe("ingenuo_estacional");
  });

  it("una serie demasiado corta dice cuánto falta", () => {
    const payload = mensual(
      serieDelKit("serie-ventas-mensual.csv").slice(0, 15),
    );
    const raw = call(payload);
    emit("forecast-result-corta", raw);
    expect(raw.viable).toBe(false);
    if (raw.viable) return;
    expect(raw.n).toBe(15);
    expect(raw.needed).toBeGreaterThan(15);
    expect(validateForecastResult(raw, enviado(payload)).ok).toBe(true);
  });

  it("con más de 2 000 periodos usa los más recientes y lo dice", () => {
    const y = Array.from(
      { length: 2100 },
      (_, i) => 50 + 8 * Math.sin((2 * Math.PI * i) / 7) + (i % 5) * 0.1,
    );
    const payload: ForecastPayload = {
      y,
      season: 7,
      horizon: 7,
      period: "dia",
    };
    const raw = call(payload);
    const r = viable(raw);
    expect(r.truncated).toBe(true);
    expect(r.n).toBe(2000);
    expect(r.n_input).toBe(2100);
    expect(validateForecastResult(raw, enviado(payload)).ok).toBe(true);
  }, 120_000);
});

describe("el payload se valida al entrar", () => {
  const ok = mensual(serieDelKit("serie-ventas-mensual.csv"));
  it.each([
    [
      "una clave de más (nombra la clave, no su valor)",
      { ...ok, fechas: ["2021-01-01"] },
      "contract:fechas",
    ],
    [
      "una serie con un texto",
      { ...ok, y: [...ok.y.slice(0, 5), "x"] },
      "contract:y",
    ],
    ["un horizonte de cero", { ...ok, horizon: 0 }, "contract:horizon"],
    ["un horizonte enorme", { ...ok, horizon: 1000 }, "contract:horizon"],
    ["un periodo que no existe", { ...ok, period: "año" }, "contract:period"],
    ["una temporada negativa", { ...ok, season: -1 }, "contract:season"],
  ])("rechaza %s", (_nombre, payload, esperado) => {
    expect(failure(payload)).toContain(esperado);
  });
});
