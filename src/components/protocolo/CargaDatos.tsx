"use client";

// Protocolo DS (S8, G-Plan 1a): cargar el CSV del usuario. El archivo no se guarda; su huella
// sí, en el cuaderno: al volver, el usuario lo carga de nuevo y la huella dice si es el mismo.
// Si es otro, la app pregunta si es otra versión de los mismos datos o es otro proyecto (lo
// que el código no puede saber se pregunta).
import { useRef } from "react";
import { ultimaCarga, type Cuaderno } from "@/engine/protocolo/cuaderno";
import { useI18n } from "@/i18n/provider";
import { huellaCorta } from "@/lib/protocolo/formato";
import type { DatosCargados } from "@/lib/protocolo/useProtocolo";
import { csvLimitParams, thousands } from "@/lib/quantity";
import { Button, Card } from "@/components/ui";

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
  const previa = ultimaCarga(cuaderno);

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
        <Button icon="upload" onClick={() => inputRef.current?.click()}>
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
        <Card role="alertdialog" className="flex flex-col gap-3 p-4">
          <p className="font-medium">{t("protocol.data.different.title")}</p>
          <p className="text-sm text-ink-muted">
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
          <div className="flex flex-wrap gap-2">
            <Button icon="retry" onClick={onVersion}>
              {t("protocol.data.different.version")}
            </Button>
            <Button variant="secondary" icon="plus" onClick={onOtro}>
              {t("protocol.data.different.other")}
            </Button>
            <Button variant="ghost" icon="x" onClick={onDescartar}>
              {t("protocol.data.different.cancel")}
            </Button>
          </div>
        </Card>
      )}
    </section>
  );
}
