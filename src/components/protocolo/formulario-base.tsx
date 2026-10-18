"use client";

// Protocolo DS (S8, ADR 020): el contrato entre la tarjeta de una etapa y su formulario, y las
// piezas que comparten. Cada etapa construida trae su formulario (lo que pregunta y lo que
// calcula sobre los datos) y lo entrega a la compuerta con `onRegistrar`; la compuerta acepta o
// devuelve el rechazo nombrado, que el formulario muestra con `MensajeRechazo`. Un formulario no
// escribe el cuaderno: solo propone.
import { useState } from "react";
import type { RechazoRegistro } from "@/engine/protocolo/compuerta";
import type {
  DatosEtapa,
  EtapaId,
  Previas,
  Trampa,
} from "@/engine/protocolo/etapas";
import { MULTICLASS_MAX_CLASSES, MULTICLASS_MIN_CLASSES } from "@/engine/tarea";
import { useI18n } from "@/i18n/provider";
import { cifra, proporcion } from "@/lib/protocolo/formato";
import { formatQuantity } from "@/lib/quantity";
import type { DatosCargados } from "@/lib/protocolo/useProtocolo";
import { Button } from "@/components/ui";

export type PropsFormulario = {
  readonly datos: DatosCargados | null;
  /** Lo que la etapa registró la última vez (para corregir), si hay. */
  readonly anterior: DatosEtapa | null;
  /** Lo que registraron las etapas previas ya cumplidas. */
  readonly previas: Previas;
  /** Todo lo que esta etapa registró antes en el cuaderno (la etapa 6 cuenta sus sellos, S11). */
  readonly historia?: readonly DatosEtapa[];
  readonly onRegistrar: (datos: DatosEtapa) => RechazoRegistro | null;
};

export function MensajeRechazo({
  rechazo,
}: {
  rechazo: RechazoRegistro | null;
}) {
  const { t } = useI18n();
  if (!rechazo) return null;
  const base = `protocol.stage.rejected.${rechazo.tipo}`;
  const texto =
    rechazo.tipo === "etapa-cerrada"
      ? t(base, { n: rechazo.etapa, m: rechazo.bloquea })
      : rechazo.tipo === "datos-invalidos"
        ? t(base, { field: rechazo.campo })
        : rechazo.tipo === "criterio-no-cumplido"
          ? t(base, {
              missing: rechazo.faltan
                .map((id) =>
                  t(`protocol.stage.${rechazo.etapa}.missing.${id}`, {
                    min: MULTICLASS_MIN_CLASSES,
                    max: MULTICLASS_MAX_CLASSES,
                  }),
                )
                .join(" · "),
            })
          : t(base, { n: rechazo.etapa });
  return (
    <p role="alert" className="text-sm text-caution">
      {texto}
    </p>
  );
}

/** Cómo se escribe un parámetro de una trampa: porcentajes, enteros y cifras (R9). */
function parametro(
  clave: string,
  valor: string | number,
  t: (key: string) => string,
): string {
  if (typeof valor === "string")
    return clave === "manda" ? t(`protocol.criterion.${valor}`) : valor;
  if (clave.endsWith("Pct")) return formatQuantity(valor * 100, 1);
  // S12: el valor p de la permutación, con los decimales que su resolución pide (1/201 no es «0.00»)
  if (clave === "umbral" || clave === "cuantil" || clave === "p")
    return proporcion(valor);
  return cifra(valor);
}

/** «Lo que esta etapa evitó», en los datos del usuario. */
export function Trampas({
  etapa,
  trampas,
}: {
  etapa: EtapaId;
  trampas: readonly Trampa[];
}) {
  const { t } = useI18n();
  if (trampas.length === 0) return null;
  return (
    <div className="rounded-md border border-hairline bg-sunken p-3 text-sm">
      <p className="font-medium">{t("protocol.stage.trap-title")}</p>
      <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-ink-muted">
        {trampas.map((trampa) => (
          <li key={trampa.clave} className="[overflow-wrap:anywhere]">
            {t(
              `protocol.stage.${etapa}.trap.${trampa.clave}`,
              Object.fromEntries(
                Object.entries(trampa.params).map(([clave, valor]) => [
                  clave,
                  parametro(clave, valor, t),
                ]),
              ),
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** El botón de registrar y el rechazo de la compuerta, comunes a los tres formularios. */
export function Registrar({
  etapa,
  deshabilitado,
  onClick,
}: {
  etapa: EtapaId;
  deshabilitado?: boolean;
  onClick: () => RechazoRegistro | null;
}) {
  const { t } = useI18n();
  const [rechazo, setRechazo] = useState<RechazoRegistro | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <MensajeRechazo rechazo={rechazo} />
      <div>
        <Button
          icon="check"
          disabled={deshabilitado}
          onClick={() => setRechazo(onClick())}
        >
          {t("protocol.form.submit", { n: etapa })}
        </Button>
      </div>
    </div>
  );
}
