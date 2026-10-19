// Protocolo DS (S12), etapa 7 — LO QUE VIAJA AL WORKER. Solo las filas del entrenamiento sellado en la
// etapa 6 (`Particion.entrenamiento`), en orden, y los pliegues como posiciones dentro de ellas: la prueba
// no está en el payload, ni sus filas ni sus índices (la prueba espía de tests/unit lo vigila con
// marcadores). La métrica y el roster salen igual que en Probeta (verdict.ts, encarrilador.ts) con lo que
// de verdad entrena. Vive fuera del motor del Protocolo porque usa el encarrilador y el estimador de ancho
// de Probeta, y la página inicial de /protocolo no los carga: solo la pantalla de la etapa 7, al abrirla.
import { matchTask } from "@/engine/despacho";
import {
  LEVEL1_CEILING_S,
  routeModels,
  rosterFor,
  type RouteProfile,
} from "@/engine/encarrilador";
import type { Plan7 } from "@/engine/protocolo/etapa7";
import { PERMUTACIONES } from "@/engine/protocolo/permutacion";
import { SEMILLA_7 } from "@/engine/protocolo/pliegues";
import type { MemberId } from "@/engine/roster";
import { pickPrimaryMetric, type PrimaryMetric } from "@/engine/verdict";
import type { CsvTable } from "@/lib/ds/csv";
import { estimateEncodedWidth } from "@/lib/experiment";
import type { ValidationSent } from "@/workers/contract";
import type { ValidationPayload } from "@/workers/protocol";

export type Envio7 = {
  readonly payload: ValidationPayload;
  /** Lo que el lector del resultado coteja (contract.ts). */
  readonly sent: ValidationSent;
  readonly metrica: PrimaryMetric;
  readonly roster: readonly MemberId[];
};

/** El payload de la etapa 7, o `null` si no hay pliegues o no hay columnas que entrenar. */
export function envio7(tabla: CsvTable, plan: Plan7): Envio7 | null {
  if (!plan.pliegues.ok) return null;
  const numeric = [...plan.numericas];
  const categorical = [...plan.categoricas];
  if (numeric.length + categorical.length === 0) return null;
  const d = plan.diseno;
  const entrenamiento = plan.particion.entrenamiento;
  const posicion = new Map(entrenamiento.map((f, i) => [f, i] as const));
  const objetivo = tabla.headers.indexOf(plan.objetivo);
  // la clase de cada fila con el nombre que le da el Protocolo («1.0» y «1» son la misma clase)
  const clases = d.clases;
  const rows = entrenamiento.map((f) => {
    const fila = [...tabla.rows[f]!];
    if (clases) fila[objetivo] = clases[f]!;
    return fila;
  });
  const n = entrenamiento.length;
  const cuenta = new Map<string, number>();
  if (clases)
    for (const f of entrenamiento)
      cuenta.set(clases[f]!, (cuenta.get(clases[f]!) ?? 0) + 1);
  const menor = clases ? Math.min(...cuenta.values()) : null;
  const metrica: PrimaryMetric = matchTask(plan.forma, {
    binaria: () => pickPrimaryMetric((cuenta.get(d.positivo ?? "") ?? 0) / n),
    multiclase: () => "balanced_accuracy" as const,
    numerica: () => "mae" as const,
  });
  const profile: RouteProfile = {
    task: plan.forma,
    rows: n,
    nTrain: n,
    width: estimateEncodedWidth(
      tabla.headers,
      tabla.rows,
      numeric,
      categorical,
      entrenamiento,
    ),
    minorityShare: menor === null ? null : menor / n,
    ...matchTask(plan.forma, {
      binaria: () => ({}),
      multiclase: () => ({ classes: cuenta.size }),
      numerica: () => ({}),
    }),
    k: plan.pliegues.k,
  };
  const roster = rosterFor(routeModels(profile, LEVEL1_CEILING_S, []), 1);
  const folds = plan.pliegues.pliegues.map((p) => ({
    train: p.entrenamiento.map((f) => posicion.get(f)!),
    val: p.validacion.map((f) => posicion.get(f)!),
  }));
  const classes = matchTask(plan.forma, {
    binaria: () => undefined,
    multiclase: () => [...cuenta.keys()].sort(),
    numerica: () => undefined,
  });
  const positive = matchTask(plan.forma, {
    binaria: () => d.positivo ?? undefined,
    multiclase: () => undefined,
    numerica: () => undefined,
  });
  const payload: ValidationPayload = {
    task: plan.forma,
    headers: [...tabla.headers],
    rows,
    target: plan.objetivo,
    numeric,
    categorical,
    seed: SEMILLA_7,
    primary_metric: metrica,
    roster,
    folds,
    ...(classes ? { classes } : {}),
    ...(positive !== undefined ? { positive } : {}),
    permutations: {
      budget_ms: PERMUTACIONES.presupuestoMs,
      min: PERMUTACIONES.min,
      max: PERMUTACIONES.max,
    },
  };
  const sent: ValidationSent = {
    task: plan.forma,
    roster,
    primary_metric: metrica,
    folds,
    ...(classes ? { classes } : {}),
    ...(positive !== undefined ? { positive } : {}),
    permutations: { min: PERMUTACIONES.min, max: PERMUTACIONES.max },
  };
  return { payload, sent, metrica, roster };
}
