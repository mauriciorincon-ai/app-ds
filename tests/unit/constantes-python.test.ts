// S21 (lote 20-07): las constantes que `pipeline.py` fija y que TypeScript copia a mano (para el lector del contrato, los límites de
// una pantalla o el texto de un aviso) tienen que ser LAS MISMAS. Antes se vigilaban a ojo; ahora este test lee el archivo de Python y
// falla nombrando la constante que se movió de un lado y no del otro.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FILAS_MINIMAS } from "@/components/protocolo/Etapa10Reglas";
import { METODOS, METODOS_SIMPLES } from "@/engine/pronostico";
import { GEMELO_FILAS_MAX, GEMELO_FILAS_MIN, GEMELO_SALIDA_MIN } from "@/engine/gemelo";
import { HORIZONTE_MAX } from "@/engine/serie";
import {
  GEMELO_CATEGORIA_RARA,
  GEMELO_CERCANIA_MAX,
} from "@/workers/contrato-gemelo";
import {
  PRONOSTICO_PERIODOS_MAX,
  PRONOSTICO_PLIEGUES_MAX,
  PRONOSTICO_PLIEGUES_MIN,
} from "@/workers/contrato-pronostico";
import { REGLAS_PROFUNDIDAD_MAX } from "@/workers/contrato-reglas";

const py = readFileSync("src/lib/ds/pipeline.py", "utf8");

/** Un número entero o decimal asignado a `NOMBRE = …` en el nivel de módulo de pipeline.py. */
const numero = (nombre: string): number => {
  const m = new RegExp(`^${nombre} = ([0-9][0-9_]*(?:\\.[0-9]+)?)\\s*(?:#.*)?$`, "m").exec(py);
  if (!m) throw new Error(`pipeline.py ya no define ${nombre} como un número`);
  return Number(m[1]!.replaceAll("_", ""));
};
/** Una tupla de cadenas asignada a `NOMBRE = ("a", "b")`. */
const cadenas = (nombre: string): string[] => {
  const m = new RegExp(`^${nombre} = \\(([^)]*)\\)`, "m").exec(py);
  if (!m) throw new Error(`pipeline.py ya no define ${nombre} como una tupla`);
  return [...m[1]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]!);
};

describe("las constantes de pipeline.py y sus copias en TypeScript", () => {
  const PARES: [string, string, number][] = [
    ["FORECAST_MAX_PERIODS", "PRONOSTICO_PERIODOS_MAX", PRONOSTICO_PERIODOS_MAX],
    ["FORECAST_MAX_FOLDS", "PRONOSTICO_PLIEGUES_MAX", PRONOSTICO_PLIEGUES_MAX],
    ["FORECAST_MIN_FOLDS", "PRONOSTICO_PLIEGUES_MIN", PRONOSTICO_PLIEGUES_MIN],
    ["FORECAST_HORIZON_MAX", "HORIZONTE_MAX (serie.ts)", HORIZONTE_MAX],
    ["SYNTH_RARE_CATEGORY", "GEMELO_CATEGORIA_RARA", GEMELO_CATEGORIA_RARA],
    ["SYNTH_PROXIMITY_MAX", "GEMELO_CERCANIA_MAX", GEMELO_CERCANIA_MAX],
    ["SYNTH_MIN_ROWS", "GEMELO_FILAS_MIN", GEMELO_FILAS_MIN],
    ["SYNTH_MAX_ROWS", "GEMELO_FILAS_MAX", GEMELO_FILAS_MAX],
    ["SYNTH_MIN_OUT", "GEMELO_SALIDA_MIN", GEMELO_SALIDA_MIN],
    ["RULES_DEPTH", "REGLAS_PROFUNDIDAD_MAX", REGLAS_PROFUNDIDAD_MAX],
  ];
  it.each(PARES)("%s es %s", (python, ts, valor) => {
    expect(numero(python), `${python} (Python) y ${ts} (TypeScript)`).toBe(valor);
  });

  it("RULES_MIN_UPLOADED (el menor total que deja 40 filas de ajuste tras apartar el 25 %) es el 53 que el aviso de la etapa 10 dice", () => {
    const [minimo, apartado] = [numero("RULES_MIN_ROWS"), numero("RULES_HOLDOUT")];
    let n = minimo;
    while (n - Math.max(1, Math.round(n * apartado)) < minimo) n += 1;
    expect(n).toBe(FILAS_MINIMAS);
  });

  it("los métodos del pronóstico y los simples son los mismos, en el mismo orden", () => {
    expect(cadenas("FORECAST_METHODS")).toEqual([...METODOS]);
    expect(cadenas("FORECAST_SIMPLE")).toEqual([...METODOS_SIMPLES]);
  });
});
