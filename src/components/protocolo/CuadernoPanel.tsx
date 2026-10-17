"use client";

// Protocolo DS (S8, ADR 020): el cuaderno que se escribe solo. Cada evidencia dice qué etapa,
// cuándo, con qué datos y qué respondió y calculó; las corregidas quedan, marcadas. Se exporta
// como `.protocolo.json` (el respaldo, y la salida de la ventana privada) y se importa.
import { useRef, useState } from "react";
import { CONTENIDO_ETAPAS } from "@/content/protocolo";
import {
  ultimaEvidencia,
  type Cuaderno,
  type Evidencia,
} from "@/engine/protocolo/cuaderno";
import { useI18n } from "@/i18n/provider";
import { fecha, huellaCorta, valorTexto } from "@/lib/protocolo/formato";
import { thousands } from "@/lib/quantity";
import { Button } from "@/components/ui";

function Entrada({
  evidencia,
  cuaderno,
}: {
  evidencia: Evidencia;
  cuaderno: Cuaderno;
}) {
  const { locale, t } = useI18n();
  const vigente =
    ultimaEvidencia(cuaderno, evidencia.etapa)?.seq === evidencia.seq;
  const carga = cuaderno.cargas.find((c) => c.sha256 === evidencia.huella);
  const palabras = {
    si: t("protocol.notebook.yes"),
    no: t("protocol.notebook.no"),
  };
  const filas = [
    ...Object.entries(evidencia.datos.respuestas).map(
      ([id, v]) =>
        [`protocol.stage.${evidencia.etapa}.field.${id}`, v] as const,
    ),
    ...Object.entries(evidencia.datos.chequeos).map(
      ([id, v]) =>
        [`protocol.stage.${evidencia.etapa}.check.${id}`, v] as const,
    ),
  ];
  return (
    <li
      className={`rounded-md border border-hairline p-3 ${vigente ? "bg-surface" : "bg-sunken"}`}
    >
      <p className="text-sm font-medium">
        {t("protocol.notebook.entry", {
          n: evidencia.etapa,
          title: CONTENIDO_ETAPAS[evidencia.etapa].titulo[locale],
        })}
      </p>
      <p className="text-xs text-ink-muted">
        {fecha(evidencia.fecha, locale)}
        {carga &&
          ` · ${t("protocol.notebook.with-data", { name: carga.nombre })}`}
        {!vigente && ` · ${t("protocol.notebook.superseded")}`}
      </p>
      {filas.length > 0 && (
        <dl className="mt-2 grid gap-x-3 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          {filas.map(([clave, valor]) => (
            <div key={clave} className="contents">
              <dt className="text-ink-muted">{t(clave)}</dt>
              <dd className="break-words">{valorTexto(valor, palabras)}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}

export function CuadernoPanel({
  cuaderno,
  onExportar,
  onImportar,
  onNuevo,
}: {
  cuaderno: Cuaderno;
  onExportar: () => { nombre: string; contenido: string };
  onImportar: (file: File) => void;
  onNuevo: () => void;
}) {
  const { locale, t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [confirmando, setConfirmando] = useState(false);

  function exportar() {
    const { nombre, contenido } = onExportar();
    const url = URL.createObjectURL(
      new Blob([contenido], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section aria-labelledby="cuaderno-titulo" className="flex flex-col gap-3">
      <h2 id="cuaderno-titulo" className="text-xl font-semibold tracking-tight">
        {t("protocol.notebook.title")}
      </h2>
      <p className="text-sm text-ink-muted">{t("protocol.notebook.desc")}</p>

      {cuaderno.evidencias.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("protocol.notebook.empty")}</p>
      ) : (
        <ol className="flex flex-col gap-2" data-testid="cuaderno-evidencias">
          {cuaderno.evidencias.map((evidencia) => (
            <Entrada
              key={evidencia.seq}
              evidencia={evidencia}
              cuaderno={cuaderno}
            />
          ))}
        </ol>
      )}

      {cuaderno.cargas.length > 0 && (
        <div className="text-sm">
          <p className="font-medium">{t("protocol.notebook.loads")}</p>
          <ul className="mt-1 flex flex-col gap-1 font-mono text-xs text-ink-muted">
            {cuaderno.cargas.map((carga) => (
              <li key={`${carga.sha256}-${carga.fecha}`}>
                {t("protocol.notebook.load", {
                  date: fecha(carga.fecha, locale),
                  name: carga.nombre,
                  rows: thousands(carga.filas),
                  hash: huellaCorta(carga.sha256),
                })}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button icon="download" onClick={exportar}>
          {t("protocol.notebook.export")}
        </Button>
        <Button
          variant="secondary"
          icon="import"
          onClick={() => inputRef.current?.click()}
        >
          {t("protocol.notebook.import")}
        </Button>
        <Button
          variant="ghost"
          icon="plus"
          onClick={() => setConfirmando(true)}
        >
          {t("protocol.notebook.new")}
        </Button>
        <input
          ref={inputRef}
          type="file"
          tabIndex={-1}
          aria-hidden
          accept=".json,application/json"
          className="sr-only"
          data-testid="protocolo-importar"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) onImportar(file);
          }}
        />
      </div>

      {confirmando && (
        <div
          role="alertdialog"
          aria-label={t("protocol.notebook.new")}
          className="flex flex-col gap-2 rounded-md border border-caution/40 p-3"
        >
          <p className="text-sm">{t("protocol.notebook.new-confirm")}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              icon="check"
              onClick={() => {
                setConfirmando(false);
                onNuevo();
              }}
            >
              {t("protocol.notebook.new-yes")}
            </Button>
            <Button
              variant="ghost"
              icon="x"
              onClick={() => setConfirmando(false)}
            >
              {t("protocol.notebook.new-no")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
