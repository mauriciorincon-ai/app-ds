// S20 (regla 19, el lado que LEE): lo que `run_forecast` entrega pasa por su lector antes de usarse. Los fixtures los escribió
// pipeline.py en Pyodide (tests/integration/pronostico.test.ts); aquí cada carnada rompe UNA cosa y el lector la nombra, jamás con un
// valor. También: lo que el lector recalcula (la regla de un error estándar, el mejor simple, el MASE) y lo que cruza con la serie
// que se envió (periodo, temporada, horizonte, cuántos periodos).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  validateForecastResult,
  type PronosticoSent,
} from "@/workers/contrato-pronostico";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fixtures JSON que las carnadas mutan a propósito
type Json = Record<string, any>;
const fixture = (name: string): Json =>
  JSON.parse(readFileSync(resolve(__dirname, `../fixtures/contrato/${name}.json`), "utf8")) as Json;
const copia = (name: string): Json => JSON.parse(JSON.stringify(fixture(name))) as Json;

const ENVIADO: PronosticoSent = { n: 60, season: 12, horizon: 12, period: "mes" };

const rechaza = (r: unknown, campo: string, sent = ENVIADO) => {
  const v = validateForecastResult(r, sent);
  expect(v.ok, `debía rechazar ${campo}`).toBe(false);
  if (!v.ok) expect(v.field).toBe(campo);
};

describe("lo que el emisor real entrega", () => {
  it("una serie con resultado: el lector la acepta tal cual", () => {
    expect(validateForecastResult(fixture("forecast-result"), ENVIADO).ok).toBe(true);
  });

  it("una serie corta: el lector acepta el «no se puede» con lo que falta", () => {
    const r = fixture("forecast-result-corta");
    expect(validateForecastResult(r, { n: r.n, season: 12, horizon: 12, period: "mes" }).ok).toBe(true);
  });
});

describe("carnadas: cada una rompe una cosa y el lector nombra el campo", () => {
  it("no es de la serie que se envió", () => {
    const base = copia("forecast-result");
    rechaza(base, "n_input", { ...ENVIADO, n: 61 });
    rechaza(base, "period", { ...ENVIADO, period: "semana" });
    rechaza(base, "season", { ...ENVIADO, season: 7 });
    rechaza(base, "horizon", { ...ENVIADO, horizon: 6 });
  });

  it("la forma: un campo que falta o con otro tipo", () => {
    for (const campo of ["viable", "league", "forecast", "winner", "origins"]) {
      const r = copia("forecast-result");
      delete r[campo];
      const v = validateForecastResult(r, ENVIADO);
      expect(v.ok).toBe(false);
    }
    const r = copia("forecast-result");
    r.truncated = "no";
    rechaza(r, "truncated");
  });

  it("los orígenes: el último deja justo el horizonte, de a «step», sin pasar de doce", () => {
    const a = copia("forecast-result");
    a.origins[a.origins.length - 1] += 1;
    rechaza(a, "origins");
    const b = copia("forecast-result");
    b.origins[1] += 1;
    rechaza(b, "origins");
    // un paso que no es el del horizonte, con los orígenes bien hechos a ese paso
    const c = copia("forecast-result");
    const ultimo = c.origins.at(-1);
    c.step = 4;
    c.origins = c.origins.map((_: number, i: number) => ultimo - 4 * (c.origins.length - 1 - i));
    rechaza(c, "step");
    const d = copia("forecast-result");
    d.origins = d.origins.slice(0, 2);
    rechaza(d, "origins");
  });

  it("la liga: seis métodos en su orden, con un error por pliegue y sus cuentas", () => {
    const a = copia("forecast-result");
    a.league.pop();
    rechaza(a, "league");
    const b = copia("forecast-result");
    [b.league[0], b.league[1]] = [b.league[1], b.league[0]];
    rechaza(b, "league[0].name");
    const c = copia("forecast-result");
    c.league[3].cv.folds.pop();
    rechaza(c, "league[3].cv.folds");
    const d = copia("forecast-result");
    d.league[3].cv.mean *= 1.5;
    rechaza(d, "league[3].cv.mean");
    const e = copia("forecast-result");
    e.league[3].cv.std += 1;
    rechaza(e, "league[3].cv.std");
    const f = copia("forecast-result");
    f.league[3].mase = (f.league[3].mase ?? 1) * 2;
    rechaza(f, "league[3].mase");
    const g = copia("forecast-result");
    g.scale = null;
    rechaza(g, "league[0].mase");
  });

  it("el ingenuo estacional compite si y solo si hay dos temporadas", () => {
    const a = copia("forecast-result");
    a.seasonal_ok = false;
    a.seasonal_reason = "short";
    rechaza(a, "league[2].status");
    const b = copia("forecast-result");
    b.seasonal_reason = "short";
    rechaza(b, "seasonal_ok");
  });

  it("la selección es la regla de un error estándar recalculada", () => {
    const a = copia("forecast-result");
    a.winner = a.winner === "media" ? "ingenuo" : "media";
    rechaza(a, "winner");
    const b = copia("forecast-result");
    b.best = b.best === "media" ? "ingenuo" : "media";
    rechaza(b, "best");
    const c = copia("forecast-result");
    c.se += 0.5;
    rechaza(c, "se");
    const d = copia("forecast-result");
    d.best_simple = d.best_simple === "media" ? "ingenuo" : "media";
    rechaza(d, "best_simple");
  });

  it("las bandas: contienen al pronóstico, la del 95 % a la del 80 % y no se angostan", () => {
    const a = copia("forecast-result");
    a.lo80[3] = a.forecast[3] + 1;
    rechaza(a, "lo80");
    const b = copia("forecast-result");
    b.hi95[3] = b.hi80[3] - 1;
    rechaza(b, "hi80");
    const c = copia("forecast-result");
    c.hi95[5] = c.forecast[5] + (c.hi95[4] - c.forecast[4]) - 5;
    c.hi80[5] = Math.min(c.hi80[5], c.hi95[5]);
    rechaza(c, "lo95");
    const d = copia("forecast-result");
    d.forecast.pop();
    rechaza(d, "forecast");
  });

  it("una serie corta: lo que falta es más de lo que hay, y es de lo que se envió", () => {
    const a = copia("forecast-result-corta");
    a.needed = a.n;
    rechaza(a, "needed", { ...ENVIADO, n: a.n });
    const b = copia("forecast-result-corta");
    rechaza(b, "n", { ...ENVIADO, n: b.n + 1 });
    const c = copia("forecast-result-corta");
    rechaza(c, "horizon", { ...ENVIADO, n: c.n, horizon: 7 });
  });

  it("el rechazo nombra el campo, jamás un valor", () => {
    const r = copia("forecast-result");
    r.league[3].cv.mean = 12345.678;
    const v = validateForecastResult(r, ENVIADO);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.field).not.toMatch(/12345/);
  });
});
