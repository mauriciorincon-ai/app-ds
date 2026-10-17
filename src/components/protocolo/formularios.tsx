"use client";

// Protocolo DS (S8, ADR 020): el contrato entre la tarjeta de una etapa y su formulario.
// Cada etapa construida trae su formulario (lo que pregunta y lo que calcula sobre los datos)
// y lo entrega a la compuerta con `onRegistrar`; la compuerta acepta o devuelve el rechazo
// nombrado, que el formulario muestra con `MensajeRechazo`. Un formulario no escribe el
// cuaderno: solo propone.
import type { ComponentType } from "react";
import type { RechazoRegistro } from "@/engine/protocolo/compuerta";
import type { DatosEtapa, EtapaId, Previas } from "@/engine/protocolo/etapas";
import { useT } from "@/i18n/use-translation";
import type { DatosCargados } from "@/lib/protocolo/useProtocolo";

export type PropsFormulario = {
  readonly datos: DatosCargados | null;
  /** Lo que la etapa registró la última vez (para corregir), si hay. */
  readonly anterior: DatosEtapa | null;
  /** Lo que registraron las etapas previas ya cumplidas. */
  readonly previas: Previas;
  readonly onRegistrar: (datos: DatosEtapa) => RechazoRegistro | null;
};

/** Los formularios de las etapas construidas (las demás no abren). */
export const FORMULARIOS: Readonly<
  Partial<Record<EtapaId, ComponentType<PropsFormulario>>>
> = {};

export function MensajeRechazo({
  rechazo,
}: {
  rechazo: RechazoRegistro | null;
}) {
  const t = useT();
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
                .map((id) => t(`protocol.stage.${rechazo.etapa}.missing.${id}`))
                .join(" · "),
            })
          : t(base, { n: rechazo.etapa });
  return (
    <p role="alert" className="text-sm text-caution">
      {texto}
    </p>
  );
}
