"use client";

// Protocolo DS (S19, ADR 027), etapa 10 — «Llévate el ganador». Guarda el ganador de la etapa 7 como un `.probeta.json` (la variante
// del Protocolo) para puntuar filas nuevas y vigilar su desempeño en Probeta. El ganador se vuelve a ajustar con las filas de
// ENTRENAMIENTO (la prueba no se abre y esto no es una apertura), en un worker que se crea al pulsar el botón. Pide los datos cargados:
// el sello de la partición confirma que son los mismos con que se trabajó. El archivo lleva el modelo con los rangos y las categorías
// que vio al entrenar; con los vecinos más cercanos lleva también las filas de entrenamiento, y lo dice ANTES de descargar.
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui";
import type { EvidenciaFicha } from "@/engine/protocolo/ficha";
import type { EtapaId, Previas } from "@/engine/protocolo/etapas";
import { numero, texto } from "@/engine/protocolo/valores";
import { isMemberId, MEMBERS } from "@/engine/roster";
import { METRIC_RULES, type PrimaryMetric } from "@/engine/verdict";
import { useTextosEtapa } from "@/i18n/textos-etapa";
import { downloadTextFile } from "@/lib/files";
import { modelFileName } from "@/lib/model-file";
import { envioGanador } from "@/lib/protocolo/ganador";
import type { Ganador } from "@/lib/protocolo/useGanador";
import type { DatosCargados } from "@/lib/protocolo/useProtocolo";
import { TEXTOS_ETAPA_10 } from "./textos/etapa10";

/** Lo que la etapa 7 y la 8 registraron del ganador, o `null` si falta algo. */
function bloqueDe(previas: Previas) {
  const [c7, c8] = [previas[7]?.chequeos, previas[8]?.chequeos];
  if (!c7 || !c8) return null;
  const [ganador, metrica] = [texto(c7, "ganador"), texto(c7, "metrica")];
  const [valor, nPrueba] = [numero(c8, "prueba_metrica"), numero(c8, "n_prueba")];
  if (!ganador || !metrica || valor === null || nPrueba === null) return null;
  if (!Object.hasOwn(METRIC_RULES, metrica)) return null;
  return { ganador, metrica: metrica as PrimaryMetric, valor, nPrueba };
}

export function Etapa10Modelo({
  evidencias,
  datos,
  ganador,
}: {
  evidencias: Partial<Record<EtapaId, EvidenciaFicha>>;
  datos: DatosCargados | null;
  ganador: Ganador;
}) {
  const t = useTextosEtapa(TEXTOS_ETAPA_10);
  const { estado, exportar } = ganador;
  const [guardado, setGuardado] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  // un segundo clic con la exportación en vuelo no la repite (S21, lote 19-20): el botón vuelve a estar a la mano al terminar el ajuste
  const guardando = useRef(false);
  const previas = useMemo<Previas>(
    () =>
      Object.fromEntries(
        Object.entries(evidencias)
          .filter(([id]) => Number(id) < 10)
          .map(([id, e]) => [id, e.datos]),
      ) as Previas,
    [evidencias],
  );
  const bloque = useMemo(() => bloqueDe(previas), [previas]);
  const envio = useMemo(
    () =>
      datos ? envioGanador(datos.tabla, previas, datos.carga.sha256) : null,
    [datos, previas],
  );

  if (!bloque) return null;
  const ocupado = estado.tipo === "ajustando";

  async function guardar() {
    if (!envio || !datos || !bloque || guardando.current) return;
    guardando.current = true;
    setFallo(null);
    setGuardado(null);
    try {
      const exported = await exportar(envio);
      const { packProtocolModelFile } = await import("@/lib/model-file-protocolo");
      const archivo = await packProtocolModelFile({
        datasetName: datos.carga.nombre,
        exported,
        protocol: {
          winner: envio.sent.winner,
          metric: bloque.metrica,
          test_value: bloque.valor,
          n_train: envio.sent.n_train,
          n_test: bloque.nPrueba,
          huella: envio.sent.huella,
          sello: envio.sent.sello,
        },
      });
      const nombre = modelFileName(datos.carga.nombre);
      downloadTextFile(nombre, JSON.stringify(archivo, null, 2), "application/json");
      setGuardado(nombre);
    } catch (e) {
      setFallo(e instanceof Error ? e.message : "worker");
    } finally {
      guardando.current = false;
    }
  }

  return (
    <section
      className="flex flex-col gap-2 rounded-md border border-hairline p-3 text-sm"
      data-testid="protocolo-modelo10"
    >
      <h3 className="font-medium">{t("protocol.stage.10.model.title")}</h3>
      <p className="text-ink-muted">{t("protocol.stage.10.model.body")}</p>
      <p className="text-ink-muted">
        {t(
          isMemberId(bloque.ganador) &&
            MEMBERS[bloque.ganador].family === "neighbors"
            ? "protocol.stage.10.model.contains-knn"
            : "protocol.stage.10.model.contains",
        )}
      </p>
      {!datos && (
        <p role="status" className="text-caution">
          <span aria-hidden="true">⚠ </span>
          {t("protocol.stage.10.model.need-data")}
        </p>
      )}
      {datos && !envio && (
        <p role="status" className="text-caution">
          <span aria-hidden="true">⚠ </span>
          {t("protocol.stage.10.model.other-file")}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          icon="download"
          type="button"
          onClick={() => void guardar()}
          disabled={!envio || ocupado}
        >
          {t("protocol.stage.10.model.button")}
        </Button>
        <span role="status" aria-live="polite" className="text-xs text-ink-muted">
          {ocupado
            ? t("protocol.stage.10.model.working")
            : guardado
              ? t("protocol.stage.10.model.saved", { nombre: guardado })
              : ""}
        </span>
      </div>
      {fallo && (
        <p role="alert" className="text-negative">
          <span aria-hidden="true">✕ </span>
          {t("protocol.stage.10.model.error", { motivo: fallo })}
        </p>
      )}
    </section>
  );
}
