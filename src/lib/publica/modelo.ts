// S17 (ADR 024): el `.probeta.json` del modelo activo, pedido al worker que lo tiene y empaquetado como en «Exportar»
// (mismo contrato: el resultado pasa por su lector y el archivo lleva su SHA-256). Los ids son negativos y salen del asignador
// único de los paneles (S19): la máquina de estados del hook de Probeta (ids ≥ 0) no los toma por suyos y dos paneles no chocan.
// S19: `pedirExport` es la mitad del pedido (lo que el worker entrega al exportar) y también la usa el Protocolo para su archivo.
import type { SanitationReport } from "@/engine/sanitize";
import { packModelFile, type ModelFile } from "@/lib/model-file";
import { validateExportResult } from "@/workers/contract";
import { siguienteIdDePanel } from "@/workers/ids-panel";
import type {
  ExperimentResult,
  ExportResult,
  RunnerResponse,
} from "@/workers/protocol";

/** Lo que el worker entrega al exportar su modelo retenido (esquema, perfil de entrenamiento y payload), ya validado. */
export function pedirExport(worker: Worker): Promise<ExportResult> {
  return new Promise((ok, no) => {
    const id = siguienteIdDePanel();
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
      ok(exportado.value);
    };
    worker.addEventListener("message", alResponder);
    worker.postMessage({ id, type: "export-model" });
  });
}

export async function pedirModelo(
  worker: Worker,
  datos: {
    readonly datasetName: string;
    readonly result: ExperimentResult;
    readonly sanitation: SanitationReport | null;
  },
): Promise<ModelFile> {
  const exported = await pedirExport(worker);
  return packModelFile({
    datasetName: datos.datasetName,
    result: datos.result,
    exported,
    sanitation: datos.sanitation ?? undefined,
  });
}
