// S17 (ADR 023): el lector del resultado de la prueba de estrés (`run_stress` en Probeta, `run_stress_test` en la
// etapa 8). Vive aparte de contract.ts, que ya llega al bundle inicial de `/` y de `/protocolo`: a este módulo lo
// importan solo los hooks diferidos del panel de estrés. Además de la forma cruza lo que solo el lector puede
// comprobar: es de la tarea y la métrica enviadas, la prueba tiene el tamaño enviado, cada columna aparece UNA vez
// y con su tipo, los niveles son los de la receta (NOISE_LEVELS / SHIFT_LEVELS), el corrimiento toca solo
// numéricas, y en la etapa 8 el ganador, el sello y la huella vuelven tal cual se mandaron (el eco). Rechaza
// nombrando el campo, jamás con un valor.
import { byTask } from "@/engine/despacho";
import { SHIFT_COLUMNS, NOISE_LEVELS, SHIFT_LEVELS } from "@/engine/estres-niveles";
import type { SupervisedTask } from "@/engine/tarea";
import { METRIC_RULES, type PrimaryMetric } from "@/engine/verdict";
import {
  arr,
  check,
  int,
  num,
  obj,
  oneOf,
  optional,
  refine,
  str,
  type Checked,
  type Validator,
} from "@/lib/validate";
import type { StressResult } from "./protocol";

/** Lo que el hilo principal conoce y el lector tiene que cotejar. */
export type StressSent = {
  readonly task: SupervisedTask;
  readonly primary_metric: PrimaryMetric;
  readonly n_test: number;
  /** Las columnas del modelo: numéricas y categóricas (cada una aparece una vez en `shuffle`). */
  readonly numeric: readonly string[];
  readonly categorical: readonly string[];
  /** Solo la etapa 8: el eco del ganador, el sello y la huella del envío. */
  readonly echo?: {
    readonly winner: string;
    readonly huella: string;
    readonly sello: string;
  };
};

const nonNegInt = refine(int, (v) => (v as number) >= 0);
const unit01 = refine(num, (v) => (v as number) >= 0 && (v as number) <= 1);

export function validateStressResult(
  raw: unknown,
  sent: StressSent,
): Checked<StressResult> {
  // la métrica va de 0 a 1 salvo el error medio, que no es negativo (y no tiene techo)
  const valor: Validator = byTask(sent.task, {
    binaria: unit01,
    multiclase: unit01,
    numerica: refine(num, (v) => (v as number) >= 0),
  });
  const shaped = check<StressResult>(
    obj({
      task: oneOf([sent.task]),
      metric: obj({
        name: oneOf([sent.primary_metric]),
        direction: oneOf(["higher", "lower"]),
      }),
      base: valor,
      n_test: nonNegInt,
      seed: int,
      noise: arr(obj({ level: num, value: valor })),
      shuffle: arr(
        obj({
          column: str,
          kind: oneOf(["numeric", "categorical"]),
          value: valor,
        }),
        1,
      ),
      shift: arr(obj({ level: num, columns: arr(str, 1), value: valor })),
      elapsed_ms: nonNegInt,
      baseline: optional(obj({ name: str, value: valor })),
      winner: optional(str),
      huella: optional(str),
      sello: optional(str),
    }),
    raw,
  );
  if (!shaped.ok) return shaped;
  const r = shaped.value;
  if (r.metric.direction !== METRIC_RULES[sent.primary_metric].direction)
    return { ok: false, field: "metric.direction" };
  if (r.n_test !== sent.n_test) return { ok: false, field: "n_test" };

  // sin numéricas no hay dónde poner ruido ni corrimiento; con ellas, los niveles son los de la receta, en orden
  const conNumericas = sent.numeric.length > 0;
  const niveles = (
    got: readonly { level: number }[],
    want: readonly number[],
  ) => got.length === want.length && got.every((e, i) => e.level === want[i]);
  if (!niveles(r.noise, conNumericas ? NOISE_LEVELS : []))
    return { ok: false, field: "noise" };

  // cada columna del modelo, una sola vez y con su tipo
  const kinds = new Map<string, "numeric" | "categorical">([
    ...sent.numeric.map((c) => [c, "numeric"] as const),
    ...sent.categorical.map((c) => [c, "categorical"] as const),
  ]);
  const seen = new Set<string>();
  for (const e of r.shuffle) {
    if (kinds.get(e.column) !== e.kind || seen.has(e.column))
      return { ok: false, field: "shuffle" };
    seen.add(e.column);
  }
  if (seen.size !== kinds.size) return { ok: false, field: "shuffle" };

  // el corrimiento: ninguno sin numéricas (o si todas son constantes); con él, los niveles de la receta, hasta
  // SHIFT_COLUMNS columnas numéricas y las mismas en cada nivel
  const firstShift = r.shift[0];
  if (firstShift) {
    if (
      !conNumericas ||
      !niveles(r.shift, SHIFT_LEVELS) ||
      r.shift.some(
        (e) =>
          e.columns.length > SHIFT_COLUMNS ||
          e.columns.some((c) => kinds.get(c) !== "numeric") ||
          e.columns.join("\u0000") !== firstShift.columns.join("\u0000"),
      )
    )
      return { ok: false, field: "shift" };
  }

  // la etapa 8 trae el rival y el eco; Probeta ninguno de los dos
  if (sent.echo) {
    if (!r.baseline) return { ok: false, field: "baseline" };
    if (r.winner !== sent.echo.winner) return { ok: false, field: "winner" };
    if (r.huella !== sent.echo.huella) return { ok: false, field: "huella" };
    if (r.sello !== sent.echo.sello) return { ok: false, field: "sello" };
  } else if (r.baseline || r.winner || r.huella || r.sello) {
    return { ok: false, field: "echo" };
  }
  return shaped;
}
