import * as Sentry from "@sentry/nextjs";

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
