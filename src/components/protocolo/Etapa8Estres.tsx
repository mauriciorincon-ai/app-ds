"use client";

// Protocolo DS (S17, ADR 023), etapa 8: «Estrésalo» sobre la prueba que ya se abrió. Sin compuerta nueva y sin abrir
// la prueba otra vez: el worker vuelve a ajustar el ganador con el mismo envío y estresa la MISMA prueba; el resultado
// se cuelga de la corrida y, al registrar la etapa, queda en el cuaderno. Vive en el chunk de la etapa 8.
import { EstresVista } from "@/components/estres/EstresVista";
import { TEXTOS_ESTRES } from "@/components/estres/textos";
import { Button } from "@/components/ui";
import type { Corrida8 } from "@/engine/protocolo/etapa8";
import { useTextosEtapa } from "@/i18n/textos-etapa";
import type { EstadoEstres } from "@/lib/protocolo/usePrueba";

export function Etapa8Estres({
  corrida,
  estado,
  onEstresar,
  deshabilitado,
}: {
  corrida: Corrida8;
  estado: EstadoEstres;
  onEstresar: () => void;
  /** No hay envío (el sello no cuadra) o la prueba se está abriendo. */
  deshabilitado: boolean;
}) {
  const t = useTextosEtapa(TEXTOS_ESTRES);
  const lectura = corrida.estres ?? null;
  const midiendo = estado.tipo === "midiendo";
  return (
    <section
      className="flex flex-col gap-2 rounded-md border border-hairline p-3 text-sm"
      data-testid="protocolo-estres8"
    >
      <h3 className="font-medium">{t("stress.title")}</h3>
      <p className="text-ink-muted">{t("stress.desc")}</p>
      <p className="text-xs text-ink-muted">{t("stress.stage8.note")}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          icon={lectura ? "retry" : "play"}
          variant={lectura ? "secondary" : "primary"}
          onClick={onEstresar}
          disabled={deshabilitado || midiendo}
        >
          {lectura ? t("stress.retry") : t("stress.button")}
        </Button>
        {midiendo && (
          <span role="status" className="text-ink-muted">
            {t("stress.running")}
          </span>
        )}
      </div>
      {estado.tipo === "error" && (
        <p role="alert" className="text-caution">
          <span aria-hidden="true">⚠ </span>
          {t("stress.error")}
        </p>
      )}
      {lectura?.baseline && (
        <>
          <EstresVista
            result={lectura}
            rival={lectura.baseline.value}
            unit={null}
            t={t}
            heading="h4"
          />
          <p className="text-xs text-ink-muted">
            {t("stress.stage8.saved")} {t("stress.stage8.reopen")}
          </p>
        </>
      )}
    </section>
  );
}
