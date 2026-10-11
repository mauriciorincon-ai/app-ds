"use client";

import { useEffect } from "react";
import { useT } from "@/i18n/use-translation";
import { reportExperimentError } from "@/lib/observability";
import { Button } from "./ui";

// S7 (AU-S7-19): el límite de error de la página. Desde el S7, configurar, entrenar,
// resultados y puntuar llegan en sus propios chunks (R15); si uno no carga (sin red, o
// un despliegue nuevo cambió sus nombres), la app ya no queda en blanco: lo dice. Un
// chunk que falló no se vuelve a pedir en la misma página, así que el botón recarga.
// A Sentry va solo el tipo (regla dura 2: ni el mensaje ni la pila).

/** ¿Falló la carga de un trozo de la app (y no un error del código)? */
export function isChunkError(error: Error): boolean {
  return /chunk/i.test(`${error.name} ${error.message}`);
}

export function PageError({ error }: { error: Error }) {
  const t = useT();
  const chunk = isChunkError(error);
  useEffect(() => {
    reportExperimentError(chunk ? "render-chunk" : "render");
  }, [chunk]);
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <div className="flex flex-col items-start gap-4" role="alert">
        <span aria-hidden className="text-2xl text-negative">
          ⚠
        </span>
        <h1 className="text-2xl font-semibold">{t("errors.title")}</h1>
        <p className="text-ink-muted">
          {t(chunk ? "errors.chunk" : "errors.runtime")}
        </p>
        <Button
          variant="secondary"
          icon="retry"
          onClick={() => window.location.reload()}
        >
          {t("errors.retry")}
        </Button>
      </div>
    </main>
  );
}

/** Mientras llega el trozo de la fase siguiente: algo que el lector oye. */
export function ScreenLoading() {
  const t = useT();
  return (
    <p role="status" className="text-sm text-ink-muted">
      {t("common.loading")}
    </p>
  );
}
