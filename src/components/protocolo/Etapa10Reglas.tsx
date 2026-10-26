"use client";

// Protocolo DS (S20, ADR 027 adenda), etapa 10 — «Las reglas del ganador». El mismo árbol de Probeta, armado con las filas que el
// usuario sube (el ganador reajustado no conserva las de su entrenamiento). La prueba se abrió una vez en la etapa 8 y no se vuelve a
// abrir: el envío lleva SOLO las columnas que el modelo lee —la del objetivo se quita aquí, antes de salir del hilo principal— y el
// lector del resultado exige que la verdad venga vacía. El ganador se vuelve a ajustar con el entrenamiento sellado en un worker que se
// crea al pulsar (no antes). Se carga diferido, con su pantalla.
import { useMemo, useRef, useState } from "react";
import { LecturaReglas } from "@/components/reglas/ReglasPanel";
import { Button } from "@/components/ui";
import type { EtapaId, Previas } from "@/engine/protocolo/etapas";
import type { EvidenciaFicha } from "@/engine/protocolo/ficha";
import { useI18n } from "@/i18n/provider";
import { useTextosEtapa } from "@/i18n/textos-etapa";
import { parseCsvWithLimits } from "@/lib/ds/csv";
import { TEXTOS_REGLAS } from "@/lib/narration/textos-reglas";
import { clasesDelGanador, envioGanador } from "@/lib/protocolo/ganador";
import { useGanador } from "@/lib/protocolo/useGanador";
import type { DatosCargados } from "@/lib/protocolo/useProtocolo";
import type { ReglasSent } from "@/workers/contrato-reglas";
import type { RulesResult } from "@/workers/protocol";
import { TEXTOS_ETAPA_10 } from "./textos/etapa10";

/** Las filas mínimas que pide `pipeline.py` (RULES_MIN_ROWS): solo para el texto; quien decide es el worker. */
const FILAS_MINIMAS = 40;

type Estado =
  | { readonly tipo: "inactivo" }
  | { readonly tipo: "trabajando" }
  | { readonly tipo: "lista"; readonly r: RulesResult; readonly nombre: string }
  | { readonly tipo: "aviso"; readonly clave: string; readonly params?: Record<string, string | number> };

export function Etapa10Reglas({
  evidencias,
  datos,
}: {
  evidencias: Partial<Record<EtapaId, EvidenciaFicha>>;
  datos: DatosCargados | null;
}) {
  const t = useTextosEtapa(TEXTOS_ETAPA_10);
  const tr = useTextosEtapa(TEXTOS_REGLAS);
  const { locale } = useI18n();
  const { reglas } = useGanador();
  const entrada = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<Estado>({ tipo: "inactivo" });
  const previas = useMemo<Previas>(
    () =>
      Object.fromEntries(
        Object.entries(evidencias)
          .filter(([id]) => Number(id) < 10)
          .map(([id, e]) => [id, e.datos]),
      ) as Previas,
    [evidencias],
  );
  const envio = useMemo(
    () => (datos ? envioGanador(datos.tabla, previas, datos.carga.sha256) : null),
    [datos, previas],
  );

  async function alElegir(archivo: File) {
    if (!envio) return;
    const { payload } = envio;
    setEstado({ tipo: "trabajando" });
    const parsed = parseCsvWithLimits(await archivo.text());
    if (!parsed.ok) {
      setEstado({ tipo: "aviso", clave: "csv", params: { motivo: parsed.error.kind } });
      return;
    }
    const { headers, rows } = parsed.table;
    const usadas = [...payload.numeric, ...payload.categorical];
    const faltan = usadas.filter((c) => !headers.includes(c));
    if (faltan.length > 0) {
      setEstado({ tipo: "aviso", clave: "missing", params: { columnas: faltan.join(", ") } });
      return;
    }
    // SOLO las columnas que el modelo lee: la del objetivo (si el archivo la trae) no sale de aquí
    const indices = usadas.map((c) => headers.indexOf(c));
    const sent: ReglasSent = {
      task: envio.sent.task,
      numeric: payload.numeric,
      categorical: payload.categorical,
      classes: clasesDelGanador(datos!.tabla, previas, datos!.carga.sha256),
      source: "uploaded",
      truthAsked: false,
    };
    try {
      const r = await reglas(
        envio,
        { headers: usadas, rows: rows.map((fila) => indices.map((i) => fila[i] ?? "")) },
        sent,
      );
      setEstado({ tipo: "lista", r, nombre: archivo.name });
    } catch (e) {
      const motivo = e instanceof Error ? e.message : "worker";
      setEstado(
        motivo === "too-few-rows"
          ? { tipo: "aviso", clave: "too-few", params: { min: FILAS_MINIMAS } }
          : { tipo: "aviso", clave: "error", params: { motivo } },
      );
    }
  }

  const trabajando = estado.tipo === "trabajando";
  return (
    <section
      className="flex flex-col gap-2 rounded-md border border-hairline p-3 text-sm"
      data-testid="protocolo-reglas10"
    >
      <h3 className="font-medium">{t("protocol.stage.10.reglas.title")}</h3>
      <p className="text-ink-muted">{t("protocol.stage.10.reglas.body")}</p>
      <p className="text-ink-muted">{t("protocol.stage.10.reglas.never-truth")}</p>
      {!datos && (
        <p role="status" className="text-caution">
          <span aria-hidden="true">⚠ </span>
          {t("protocol.stage.10.reglas.need-data")}
        </p>
      )}
      {datos && !envio && (
        <p role="status" className="text-caution">
          <span aria-hidden="true">⚠ </span>
          {t("protocol.stage.10.reglas.other-file")}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          icon="upload"
          type="button"
          variant="secondary"
          onClick={() => entrada.current?.click()}
          disabled={!envio || trabajando}
        >
          {t("protocol.stage.10.reglas.button")}
        </Button>
        <input
          ref={entrada}
          type="file"
          tabIndex={-1}
          aria-hidden
          accept=".csv,text/csv"
          className="sr-only"
          data-testid="protocolo-reglas-csv"
          onChange={(event) => {
            const archivo = event.target.files?.[0];
            event.target.value = "";
            if (archivo) void alElegir(archivo);
          }}
        />
        <span role="status" aria-live="polite" className="text-xs text-ink-muted">
          {trabajando ? t("protocol.stage.10.reglas.working") : ""}
        </span>
      </div>
      {estado.tipo === "aviso" && (
        <p
          role={estado.clave === "error" || estado.clave === "csv" ? "alert" : "status"}
          className={estado.clave === "error" || estado.clave === "csv" ? "text-negative" : "text-caution"}
          data-testid="protocolo-reglas-aviso"
        >
          <span aria-hidden="true">{estado.clave === "error" || estado.clave === "csv" ? "✕ " : "⚠ "}</span>
          {t(`protocol.stage.10.reglas.${estado.clave}`, estado.params)}
        </p>
      )}
      {estado.tipo === "lista" && (
        <>
          <p className="text-xs text-ink-muted">
            {t("protocol.stage.10.reglas.from-file", { nombre: estado.nombre })}
          </p>
          <LecturaReglas
            r={estado.r}
            t={tr}
            locale={locale}
            unidad={null}
            datasetName={datos?.carga.nombre ?? null}
          />
        </>
      )}
    </section>
  );
}
