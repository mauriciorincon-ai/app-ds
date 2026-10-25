// S17 (ADR 024): el `.probeta.json` del modelo activo, pedido al worker que lo tiene y empaquetado como en «Exportar»
// (mismo contrato: el resultado pasa por su lector y el archivo lleva su SHA-256). Los ids son negativos: la máquina de
// estados del hook de Probeta (ids ≥ 0) no los toma por suyos.
import type { SanitationReport } from "@/engine/sanitize";
import { packModelFile, type ModelFile } from "@/lib/model-file";
import { validateExportResult } from "@/workers/contract";
import type { ExperimentResult, RunnerResponse } from "@/workers/protocol";

let ultimoId = -1_000_000;

export function pedirModelo(
  worker: Worker,
  datos: {
    readonly datasetName: string;
    readonly result: ExperimentResult;
    readonly sanitation: SanitationReport | null;
  },
): Promise<ModelFile> {
  return new Promise((ok, no) => {
    const id = --ultimoId;
    const alResponder = (event: MessageEvent<RunnerResponse>) => {
      const m = event.data;
      if (m.id !== id || m.type === "progress") return;
      worker.removeEventListener("message", alResponder);
      if (m.type === "error" || m.command !== "export-model") {
        no(new Error("worker"));
        return;
      }
      const exportado = validateExportResult(m.result);
      if (!exportado.ok) {
        no(new Error(`contrato:${exportado.field}`));
        return;
      }
      packModelFile({
        datasetName: datos.datasetName,
        result: datos.result,
        exported: exportado.value,
        sanitation: datos.sanitation ?? undefined,
      }).then(ok, no);
    };
    worker.addEventListener("message", alResponder);
    worker.postMessage({ id, type: "export-model" });
  });
}
