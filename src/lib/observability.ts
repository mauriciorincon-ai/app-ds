import * as Sentry from "@sentry/nextjs";
import type { TrainTask } from "@/engine/tarea";

// Reporte de errores del experimento a Sentry — SOLO metadatos. No se envía el
// mensaje crudo del runtime (un traceback de Python/pandas podría filtrar nombres
// de columnas del usuario), únicamente el tipo de error y el tamaño del dataset
// (nº filas/columnas). Regla dura 2.
export function reportExperimentError(
  kind: string,
  meta?: { rows?: number; cols?: number },
): void {
  Sentry.captureMessage(`experiment-error:${kind}`, {
    level: "error",
    tags: { area: "experiment", kind },
    extra: { rows: meta?.rows ?? null, cols: meta?.cols ?? null },
  });
}

// Errores del flujo de narración (route /api/narrate). Mismo contrato de
// privacidad: SOLO el tipo de error — jamás el payload (contiene nombres de
// columnas del usuario) ni mensajes crudos del proveedor.
export function reportNarrationError(kind: string): void {
  Sentry.captureMessage(`narration-error:${kind}`, {
    level: "error",
    tags: { area: "narration", kind },
  });
}

// S3 — scoring/export/import del modelo. Mismo contrato metadata-only: kind y
// conteos; jamás nombres de columnas, valores del CSV nuevo ni contenido del
// archivo del modelo (regla dura 2).
export function reportScoringError(
  kind: string,
  meta?: { rows?: number; cols?: number },
): void {
  Sentry.captureMessage(`scoring-error:${kind}`, {
    level: "error",
    tags: { area: "scoring", kind },
    extra: { rows: meta?.rows ?? null, cols: meta?.cols ?? null },
  });
}

export function reportExportError(kind: string): void {
  Sentry.captureMessage(`model-export-error:${kind}`, {
    level: "error",
    tags: { area: "model-export", kind },
  });
}

export function reportImportError(kind: string): void {
  Sentry.captureMessage(`model-import-error:${kind}`, {
    level: "error",
    tags: { area: "model-import", kind },
  });
}

// S5 — la liga: un breadcrumb por corrida (o cancelación) con SOLO metadatos:
// filas, columnas, cuántos compitieron, nivel, tiempo y si se canceló. Jamás
// valores ni nombres de columnas del usuario (regla dura 2). Viaja adjunto al
// próximo error que se reporte, si lo hay; por sí solo no genera un evento.
export type LeagueRunMeta = {
  /** S6: la tarea (un nombre de la app, nunca un valor ni un nombre de columna). */
  task: TrainTask;
  rows?: number;
  cols?: number;
  competitors: number;
  level: 1 | 2;
  elapsedMs: number | null;
  cancelled: boolean;
};

export function recordLeagueRun(meta: LeagueRunMeta): void {
  Sentry.addBreadcrumb({
    category: "probeta.league",
    level: "info",
    message: meta.cancelled ? "league-cancelled" : "league-run",
    data: {
      task: meta.task,
      rows: meta.rows ?? null,
      cols: meta.cols ?? null,
      competitors: meta.competitors,
      level: meta.level,
      elapsedMs: meta.elapsedMs,
      cancelled: meta.cancelled,
    },
  });
}

// S8 — Protocolo DS: un breadcrumb por intento de registrar una etapa, con SOLO el número
// de la etapa y el resultado (un nombre cerrado de la app). Jamás las respuestas, los costos,
// las clases, el nombre del archivo ni la huella: eso vive solo en el cuaderno del navegador
// (regla dura 2). La prueba fija las dos claves exactas (tests/unit/protocolo-observabilidad).
export type ProtocolOutcome =
  | "recorded"
  | "closed"
  | "not-built"
  | "no-data"
  | "invalid"
  | "criterion-unmet"
  | "unknown-stage";

export function recordProtocolStep(stage: number, outcome: ProtocolOutcome): void {
  Sentry.addBreadcrumb({
    category: "probeta.protocol",
    level: "info",
    message: "protocol-step",
    data: { stage, outcome },
  });
}

/** Fallas del Protocolo (guardar en el navegador, un cuaderno ilegible): solo su tipo. */
export type ProtocolErrorKind =
  | "storage-write"
  | "storage-unreadable"
  | "import-rejected";

export function reportProtocolError(kind: ProtocolErrorKind): void {
  Sentry.captureMessage(`protocol-error:${kind}`, {
    level: "error",
    tags: { area: "protocol", kind },
  });
}
