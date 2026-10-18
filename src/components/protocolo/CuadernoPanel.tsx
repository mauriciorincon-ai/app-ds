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
import type { Valor } from "@/engine/protocolo/etapas";
import { useI18n } from "@/i18n/provider";
import { fecha, huellaCorta, valorTexto } from "@/lib/protocolo/formato";
import { thousands } from "@/lib/quantity";
import { Button } from "@/components/ui";
import { Confirmacion } from "./Confirmacion";

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
  // Un valor del cuaderno como texto: los nombres cerrados de la app (la forma de la decisión,
  // el orden de las fechas…) en el idioma de la interfaz; lo que escribió el usuario, tal cual.
  const leerValor = (valor: Valor): string => {
    if (typeof valor === "string") {
      const traducido = t(`protocol.value.${valor}`);
      return traducido === `protocol.value.${valor}` ? valor : traducido;
    }
    return valorTexto(valor, palabras);
  };
  const vacio = (valor: Valor) =>
    valor === null ||
    valor === "" ||
    (Array.isArray(valor) && valor.length === 0);
  const filas = [
    ...Object.entries(evidencia.datos.respuestas).map(
      ([id, v]) =>
        [`protocol.stage.${evidencia.etapa}.field.${id}`, v] as const,
    ),
    ...Object.entries(evidencia.datos.chequeos).map(
      ([id, v]) =>
        [`protocol.stage.${evidencia.etapa}.check.${id}`, v] as const,
    ),
  ].filter(([, valor]) => !vacio(valor));
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
              <dt className="min-w-0 text-ink-muted [overflow-wrap:anywhere]">
                {t(clave)}
              </dt>
              <dd className="min-w-0 [overflow-wrap:anywhere]">
                {leerValor(valor)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}

export function CuadernoPanel({
  cuaderno,
  guardado,
  importePendiente,
  onExportar,
  onImportar,
  onConfirmarImporte,
  onDescartarImporte,
  onNuevo,
}: {
  cuaderno: Cuaderno;
  /** `null`: este navegador no guarda (memoria); `false`: escribiendo; `true`: guardado. */
  guardado: boolean | null;
  /** Un cuaderno válido importado que espera confirmación para reemplazar el actual. */
  importePendiente: Cuaderno | null;
  onExportar: () => { nombre: string; contenido: string };
  onImportar: (file: File) => void;
  onConfirmarImporte: () => void;
  onDescartarImporte: () => void;
  onNuevo: () => void;
}) {
  const { locale, t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [confirmando, setConfirmando] = useState(false);
  // Los botones que abren un diálogo a donde vuelve el foco al cerrarlo.
  const boton = (id: string) => () =>
    document.querySelector<HTMLElement>(`[data-boton="${id}"]`);

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
      {guardado !== null && (
        <p
          role="status"
          className="text-xs text-ink-muted"
          data-testid="cuaderno-guardado"
        >
          <span aria-hidden="true">{guardado ? "✓ " : "… "}</span>
          {t(guardado ? "protocol.notebook.saved" : "protocol.notebook.saving")}
        </p>
      )}

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
          data-boton="importar"
          onClick={() => inputRef.current?.click()}
        >
          {t("protocol.notebook.import")}
        </Button>
        <Button
          variant="ghost"
          icon="plus"
          data-boton="nuevo"
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
        <Confirmacion
          testId="protocolo-dialogo-nuevo"
          titulo={t("protocol.notebook.new")}
          cuerpo={<p>{t("protocol.notebook.new-confirm")}</p>}
          onCancelar={() => setConfirmando(false)}
          devolverA={boton("nuevo")}
          acciones={
            <>
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
                data-autofocus
                onClick={() => setConfirmando(false)}
              >
                {t("protocol.notebook.new-no")}
              </Button>
            </>
          }
        />
      )}

      {importePendiente && (
        <Confirmacion
          testId="protocolo-dialogo-importar"
          titulo={t("protocol.notebook.import-confirm.title")}
          cuerpo={
            <p>
              {t("protocol.notebook.import-confirm.body", {
                now: cuaderno.evidencias.length,
                incoming: importePendiente.evidencias.length,
              })}
            </p>
          }
          onCancelar={onDescartarImporte}
          devolverA={boton("importar")}
          acciones={
            <>
              <Button variant="secondary" icon="download" onClick={exportar}>
                {t("protocol.notebook.import-confirm.export-first")}
              </Button>
              <Button icon="import" onClick={onConfirmarImporte}>
                {t("protocol.notebook.import-confirm.yes")}
              </Button>
              <Button
                variant="ghost"
                icon="x"
                data-autofocus
                onClick={onDescartarImporte}
              >
                {t("protocol.notebook.import-confirm.cancel")}
              </Button>
            </>
          }
        />
      )}
    </section>
  );
}
