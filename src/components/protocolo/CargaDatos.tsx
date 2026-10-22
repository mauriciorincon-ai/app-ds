"use client";

// Protocolo DS (S8, G-Plan 1a): cargar el CSV del usuario. El archivo no se guarda; su huella
// sí, en el cuaderno: al volver, el usuario lo carga de nuevo y la huella dice si es el mismo.
// Si es otro, la app pregunta si es otra versión de los mismos datos o es otro proyecto (lo
// que el código no puede saber se pregunta).
import { useRef, useState } from "react";
import { ultimaCarga, type Cuaderno } from "@/engine/protocolo/cuaderno";
import { useI18n } from "@/i18n/provider";
import { huellaCorta } from "@/lib/protocolo/formato";
import type { DatosCargados } from "@/lib/protocolo/useProtocolo";
import { csvLimitParams, thousands } from "@/lib/quantity";
import { Button } from "@/components/ui";
import { Confirmacion } from "./Confirmacion";

export function CargaDatos({
  datos,
  pendiente,
  cuaderno,
  onArchivo,
  onVersion,
  onOtro,
  onDescartar,
}: {
  datos: DatosCargados | null;
  pendiente: DatosCargados | null;
  cuaderno: Cuaderno;
  onArchivo: (file: File) => void;
  onVersion: () => void;
  onOtro: () => void;
  onDescartar: () => void;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  // «Otro proyecto» reemplaza el cuaderno: pide un segundo sí antes de hacerlo (M3 del S8).
  const [reemplazando, setReemplazando] = useState(false);
  const previa = ultimaCarga(cuaderno);
  const descartar = () => {
    setReemplazando(false);
    onDescartar();
  };

  return (
    <section aria-labelledby="datos-titulo" className="flex flex-col gap-3">
      <h2 id="datos-titulo" className="text-xl font-semibold tracking-tight">
        {t("protocol.data.title")}
      </h2>
      {datos ? (
        <p className="font-mono text-sm" data-testid="protocolo-datos">
          {t("protocol.data.loaded", {
            name: datos.carga.nombre,
            rows: thousands(datos.carga.filas),
            cols: datos.carga.columnas,
            hash: huellaCorta(datos.carga.sha256),
          })}
        </p>
      ) : (
        previa && (
          <p className="text-sm text-ink-muted">
            {t("protocol.data.reload", {
              name: previa.nombre,
              rows: thousands(previa.filas),
            })}
          </p>
        )
      )}
      <p className="text-sm text-ink-muted">
        {t("start.dropzone.hint", csvLimitParams())}
      </p>
      <div>
        <Button
          icon="upload"
          data-boton="cargar"
          onClick={() => inputRef.current?.click()}
        >
          {datos ? t("protocol.data.replace") : t("protocol.data.button")}
        </Button>
        <input
          ref={inputRef}
          type="file"
          tabIndex={-1}
          aria-hidden
          accept=".csv,text/csv"
          className="sr-only"
          data-testid="protocolo-csv"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) onArchivo(file);
          }}
        />
      </div>

      {pendiente && (
        <Confirmacion
          // Cada paso es su propio diálogo: el foco vuelve a entrar y el nombre se relee.
          key={reemplazando ? "reemplazo" : "eleccion"}
          testId="protocolo-dialogo-datos"
          titulo={t(
            reemplazando
              ? "protocol.data.different.replace-title"
              : "protocol.data.different.title",
          )}
          onCancelar={reemplazando ? () => setReemplazando(false) : descartar}
          devolverA={() =>
            document.querySelector<HTMLElement>('[data-boton="cargar"]')
          }
          cuerpo={
            reemplazando ? (
              <p>
                {t("protocol.data.different.replace-body", {
                  n: cuaderno.evidencias.length,
                  count: cuaderno.evidencias.length,
                })}
              </p>
            ) : (
              <>
                <p className="text-ink-muted">
                  {t("protocol.data.different.body")}
                </p>
                <p className="font-mono text-xs">
                  {t("protocol.data.loaded", {
                    name: pendiente.carga.nombre,
                    rows: thousands(pendiente.carga.filas),
                    cols: pendiente.carga.columnas,
                    hash: huellaCorta(pendiente.carga.sha256),
                  })}
                </p>
              </>
            )
          }
          acciones={
            reemplazando ? (
              <>
                <Button icon="check" onClick={onOtro}>
                  {t("protocol.data.different.replace-yes")}
                </Button>
                <Button
                  variant="ghost"
                  icon="back"
                  data-autofocus
                  onClick={() => setReemplazando(false)}
                >
                  {t("protocol.data.different.back")}
                </Button>
              </>
            ) : (
              <>
                <Button icon="retry" onClick={onVersion}>
                  {t("protocol.data.different.version")}
                </Button>
                <Button
                  variant="secondary"
                  icon="plus"
                  onClick={() => setReemplazando(true)}
                >
                  {t("protocol.data.different.other")}
                </Button>
                <Button
                  variant="ghost"
                  icon="x"
                  data-autofocus
                  onClick={descartar}
                >
                  {t("protocol.data.different.cancel")}
                </Button>
              </>
            )
          }
        />
      )}
    </section>
  );
}
