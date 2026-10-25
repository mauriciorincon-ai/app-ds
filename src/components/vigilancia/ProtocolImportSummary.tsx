"use client";

// S19 (ADR 027): el resumen de un `.probeta.json` que viene del Protocolo DS, ANTES de usarlo. Dice de dónde viene y qué NO trae (el
// Protocolo no mide una liga ni una línea base en esa forma), la cifra del ganador en la prueba que se abrió una vez y las filas con
// que se ajustó. Se carga solo cuando se elige un archivo de este tipo; sus textos viajan con él.
import { memberNameKey } from "@/engine/roster";
import { useTextosEtapa } from "@/i18n/textos-etapa";
import { TEXTOS_VIGILANCIA } from "@/lib/narration/textos-vigilancia";
import type { ProtocolManifest } from "@/lib/model-file-protocolo";
import type { VersionWarning } from "@/lib/model-file";
import { formatQuantity, quantityDecimals, thousands } from "@/lib/quantity";
import { Button } from "../ui";

export function ProtocolImportSummary({
  manifest,
  warnings,
  onConfirm,
  onCancel,
}: {
  manifest: ProtocolManifest;
  warnings: VersionWarning[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTextosEtapa(TEXTOS_VIGILANCIA);
  const { protocol } = manifest;
  const valor = formatQuantity(
    protocol.test_value,
    protocol.metric === "mae" ? quantityDecimals([protocol.test_value]) : 2,
  );
  return (
    <div className="flex flex-col gap-2 text-sm" data-testid="importar-protocolo">
      <p className="font-medium">
        <span aria-hidden className="mr-1 text-positive">
          ✓
        </span>
        {t("vigilancia.protocolo.titulo")}
      </p>
      <ul className="ml-5 list-disc">
        <li>
          {t("vigilancia.protocolo.resumen", {
            dataset: manifest.dataset.name,
            modelo: t(memberNameKey(manifest.model_name, manifest.task)),
            filas: thousands(protocol.n_train),
          })}
        </li>
        <li className="font-mono tabular-nums">
          {t("vigilancia.protocolo.prueba", {
            metric: t(`results.metrics.${protocol.metric}`),
            valor,
            n: thousands(protocol.n_test),
          })}
        </li>
        <li>{t("vigilancia.protocolo.no_trae")}</li>
      </ul>
      {warnings.length > 0 && (
        <p className="rounded-md border border-caution/40 bg-caution/10 p-3 text-caution">
          <span aria-hidden className="mr-1">
            ⚠
          </span>
          {t("start.import.summary.versionWarning", {
            list: warnings
              .map((w) => `${w.component} ${w.file} → ${w.runtime}`)
              .join(", "),
          })}
        </p>
      )}
      <div className="mt-1 flex flex-wrap gap-3">
        <Button icon="check" onClick={onConfirm}>
          {t("vigilancia.protocolo.continuar")}
        </Button>
        <Button variant="secondary" icon="retry" onClick={onCancel}>
          {t("vigilancia.protocolo.cancelar")}
        </Button>
      </div>
    </div>
  );
}
