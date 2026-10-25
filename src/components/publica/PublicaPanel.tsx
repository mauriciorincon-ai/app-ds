"use client";

// «Llévatelo» (S17, ADR 024): la receta reproducible, el puntuador portátil y la plantilla de servicio. Probeta no despliega
// nada ni guarda credenciales: arma archivos que se quedan en el equipo del usuario. Antes de descargar se dice qué lleva cada
// uno (el modelo lleva rangos, categorías y, con vecinos más cercanos, filas del entrenamiento; la receta, ninguna fila).
// Todo se pide al pulsar: ni las plantillas, ni el modelo, ni nada de esto entra al peso inicial de la página.
import { useState, type RefObject } from "react";
import { Button, Card } from "@/components/ui";
import { matchByTask } from "@/engine/despacho";
import type { SanitationReport } from "@/engine/sanitize";
import { useI18n } from "@/i18n/provider";
import { useTextosEtapa } from "@/i18n/textos-etapa";
import { datasetSlug, downloadTextFile } from "@/lib/files";
import { declaracionDe, AZAR_SENSIBLE } from "@/lib/publica/declaracion";
import { descargarBytes } from "@/lib/publica/descargar";
import {
  armarPuntuador,
  armarReceta,
  armarServicio,
} from "@/lib/publica/ensamblar";
import { pedirModelo } from "@/lib/publica/modelo";
import { esServible } from "@/lib/publica/no-servibles";
import { pipelinePy, plantilla } from "@/lib/publica/plantillas";
import type { ExperimentResult } from "@/workers/protocol";
import { version as APP_VERSION } from "../../../package.json";
import { TEXTOS_PUBLICA } from "./textos";

type Que = "receta" | "puntuador" | "servicio";
type Estado =
  | { readonly tipo: "inactivo" }
  | { readonly tipo: "preparando"; readonly que: Que }
  | { readonly tipo: "listo"; readonly archivo: string }
  | { readonly tipo: "error" };

export function PublicaPanel({
  result,
  datasetName,
  sanitation,
  target,
  seed,
  worker,
  ocupado = false,
}: {
  result: ExperimentResult;
  datasetName: string | null;
  sanitation: SanitationReport | null;
  /** `null` al agrupar. */
  target: string | null;
  seed: number;
  worker?: RefObject<Worker | null>;
  /** El worker está ajustando otro modelo: no se pide su archivo mientras tanto. */
  ocupado?: boolean;
}) {
  const t = useTextosEtapa(TEXTOS_PUBLICA);
  const { locale } = useI18n();
  const [estado, setEstado] = useState<Estado>({ tipo: "inactivo" });
  const nombre = datasetName ?? "dataset";
  const modelo = result.modelName;
  const supervisada = matchByTask(result, {
    binaria: (r) => r,
    multiclase: (r) => r,
    numerica: (r) => r,
    agrupar: () => null,
  });
  const supervisado = supervisada !== null;
  const servible = supervisado && esServible(modelo);
  const base = `${datasetSlug(nombre) || "modelo"}-${modelo}`;
  const trabajando = estado.tipo === "preparando";

  const llevar = async (que: Que) => {
    setEstado({ tipo: "preparando", que });
    try {
      if (que === "receta") {
        if (supervisada === null || target === null) throw new Error("agrupar");
        const [pipeline, tpl, req] = await Promise.all([
          pipelinePy(),
          plantilla("receta.py"),
          plantilla("requirements-receta.txt"),
        ]);
        const receta = armarReceta(
          pipeline,
          tpl,
          declaracionDe({
            result: supervisada,
            target,
            seed,
            datasetName: nombre,
            sanitation,
            appVersion: APP_VERSION,
            idioma: locale,
          }),
          req,
        );
        const archivo = `receta-${base}.py`;
        downloadTextFile(archivo, receta, "text/x-python");
        setEstado({ tipo: "listo", archivo });
        return;
      }
      const w = worker?.current;
      if (!w) throw new Error("worker");
      const archivoModelo = await pedirModelo(w, {
        datasetName: nombre,
        result,
        sanitation,
      });
      if (que === "puntuador") {
        const [tpl, motor] = await Promise.all([
          plantilla("puntuador.html"),
          plantilla("puntuar.py"),
        ]);
        const archivo = `puntuador-${base}.html`;
        downloadTextFile(
          archivo,
          armarPuntuador(tpl, motor, JSON.stringify(archivoModelo)),
          "text/html",
        );
        setEstado({ tipo: "listo", archivo });
        return;
      }
      const [servicio, motor, requirements, readme] = await Promise.all([
        plantilla("servicio.py"),
        plantilla("puntuar.py"),
        plantilla("requirements-servicio.txt"),
        plantilla("README-servicio.md"),
      ]);
      const archivo = `servicio-${base}.zip`;
      descargarBytes(
        archivo,
        armarServicio({
          servicio,
          puntuar: motor,
          requirements,
          readme,
          modelo: JSON.stringify(archivoModelo, null, 2),
        }),
        "application/zip",
      );
      setEstado({ tipo: "listo", archivo });
    } catch {
      setEstado({ tipo: "error" });
    }
  };

  const fila = (
    que: Que,
    titulo: string,
    descripcion: string,
    boton: string,
    nota: string | null,
    disponible: boolean,
  ) => (
    <li className="flex flex-col gap-2 border-t border-hairline pt-3 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-medium">{titulo}</h3>
      <p className="max-w-prose text-sm text-ink-muted">{descripcion}</p>
      {nota && (
        <p className="max-w-prose text-xs text-ink-muted" data-testid={`publica-nota-${que}`}>
          {nota}
        </p>
      )}
      <div>
        <Button
          variant="secondary"
          icon="download"
          onClick={() => void llevar(que)}
          disabled={!disponible || trabajando || ocupado}
          data-testid={`publica-${que}`}
        >
          {boton}
        </Button>
      </div>
    </li>
  );

  return (
    <section aria-labelledby="publica-title" data-testid="publica-panel">
      <Card className="p-5">
        <h2 id="publica-title" className="text-sm font-semibold">
          {t("publica.title")}
        </h2>
        <p className="mt-1 max-w-prose text-sm text-ink-muted">{t("publica.desc")}</p>
        <div className="mt-3 rounded-md border border-caution/40 bg-caution/10 p-3 text-sm">
          <p className="font-medium text-caution">
            <span aria-hidden="true">⚠ </span>
            {t("publica.warning.title")}
          </p>
          <p className="mt-1 max-w-prose">{t("publica.warning.body")}</p>
        </div>
        <ul className="mt-4 flex flex-col gap-3">
          {fila(
            "receta",
            t("publica.receta.title"),
            t("publica.receta.desc"),
            t("publica.receta.button"),
            !supervisado
              ? t("publica.receta.agrupar")
              : AZAR_SENSIBLE.has(modelo)
                ? t("publica.receta.aprox")
                : null,
            supervisado,
          )}
          {fila(
            "puntuador",
            t("publica.puntuador.title"),
            t("publica.puntuador.desc"),
            t("publica.puntuador.button"),
            null,
            true,
          )}
          {fila(
            "servicio",
            t("publica.servicio.title"),
            t("publica.servicio.desc"),
            t("publica.servicio.button"),
            !supervisado
              ? t("publica.servicio.agrupar")
              : !servible
                ? t("publica.servicio.knn")
                : null,
            servible,
          )}
        </ul>
        <p
          role="status"
          className={`mt-3 text-sm ${estado.tipo === "error" ? "text-negative" : "text-ink-muted"}`}
          data-testid="publica-estado"
        >
          {estado.tipo === "preparando"
            ? t("publica.status.preparing")
            : estado.tipo === "listo"
              ? t("publica.status.done", { archivo: estado.archivo })
              : estado.tipo === "error"
                ? t("publica.status.error")
                : ""}
        </p>
      </Card>
    </section>
  );
}
