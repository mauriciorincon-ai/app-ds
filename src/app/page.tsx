"use client";

import dynamic from "next/dynamic";
import { ErrorScreen } from "@/components/ErrorScreen";
import { ScreenLoading } from "@/components/PageError";
import { StartScreen } from "@/components/StartScreen";
import { useExperiment } from "@/lib/useExperiment";

// Workspace del experimento: una sola ruta, máquina de estados. Pyodide se carga
// bajo demanda (al entrenar o importar), no aquí — la landing es liviana (fuera
// del LCP).
//
// S7 (R15, decisión 7): la portada solo dibuja el inicio. Configurar, entrenar,
// resultados y puntuar viajan en sus propios chunks y se piden al llegar a su
// fase — con agrupar y multiclase dentro, el script de "/" pasó el budget de
// 300 KB en la CI (321.841 B). Mientras el chunk llega, «Cargando…» (AU-S7-19); si no
// llega, el límite de error de src/app/error.tsx lo dice.
const ConfigScreen = dynamic(
  () => import("@/components/ConfigScreen").then((m) => m.ConfigScreen),
  { ssr: false, loading: ScreenLoading },
);
const TrainingScreen = dynamic(
  () => import("@/components/TrainingScreen").then((m) => m.TrainingScreen),
  { ssr: false, loading: ScreenLoading },
);
const ResultsScreen = dynamic(
  () => import("@/components/ResultsScreen").then((m) => m.ResultsScreen),
  { ssr: false, loading: ScreenLoading },
);
const ScoreScreen = dynamic(
  () => import("@/components/ScoreScreen").then((m) => m.ScoreScreen),
  { ssr: false, loading: ScreenLoading },
);
export default function Home() {
  const {
    state,
    loadCsv,
    loadXlsx,
    decidirLimpieza,
    getTable,
    selectTarget,
    selectCluster,
    answerTask,
    run,
    runCluster,
    downloadClusterLabels,
    reset,
    goToScoring,
    backToResults,
    resetScoring,
    scoreCsv,
    scoreXlsx,
    exportModel,
    workerRef,
    activateImportedModel,
    chooseMember,
    runLevel2,
    cancelLevel2,
  } = useExperiment();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      {state.phase === "empty" && (
        <StartScreen
          onLoad={loadCsv}
          onLoadXlsx={loadXlsx}
          onImport={activateImportedModel}
        />
      )}

      {state.phase === "configuring" && state.dataset && (
        <ConfigScreen
          dataset={state.dataset}
          sanitation={state.sanitation}
          edaAlerts={state.edaAlerts}
          plan={state.plan}
          clusterPlan={state.clusterPlan}
          origen={state.origen}
          ingesta={state.ingesta}
          onDecidirLimpieza={decidirLimpieza}
          getTable={getTable}
          onSelectTarget={selectTarget}
          onSelectCluster={selectCluster}
          onAnswerTask={answerTask}
          onRun={run}
          onRunCluster={runCluster}
          onBack={reset}
        />
      )}

      {state.phase === "running" && (
        <TrainingScreen
          stage={state.progress}
          detail={state.progressDetail}
          level2={state.level2.status === "running" ? state.level2 : null}
          estimateS={state.routing?.level1EstimateS ?? null}
          cluster={state.runMeta?.target === null}
          onCancel={cancelLevel2}
        />
      )}

      {state.phase === "results" && state.result && state.runMeta && (
        <ResultsScreen
          result={state.result}
          datasetName={state.datasetName}
          cols={state.dataset?.headers.length ?? 0}
          runMeta={state.runMeta}
          sanitation={state.sanitation}
          edaAlerts={state.edaAlerts}
          onAgain={reset}
          onUseModel={goToScoring}
          onExportModel={exportModel}
          worker={workerRef}
          exportState={state.exportState}
          routing={state.routing}
          choice={state.choice}
          onChoose={chooseMember}
          modelReady={state.modelReady}
          profile={state.profile}
          forced={state.forced}
          level2={state.level2}
          onRunLevel2={runLevel2}
          labels={state.labels}
          onDownloadLabels={downloadClusterLabels}
          schema={state.modelMeta?.schema ?? null}
          getTable={getTable}
        />
      )}

      {state.phase === "scoring" && state.modelMeta && (
        <ScoreScreen
          meta={state.modelMeta}
          ready={state.modelReady}
          progress={state.progress}
          scoring={state.scoring}
          exportState={state.exportState}
          onScoreFile={scoreCsv}
          onScoreXlsx={scoreXlsx}
          onScoreAnother={resetScoring}
          onBackToResults={backToResults}
          onExit={reset}
          onExportModel={exportModel}
          worker={workerRef}
          result={state.result}
        />
      )}

      {state.phase === "error" && state.error && (
        <ErrorScreen kind={state.error.kind} onRetry={reset} />
      )}
    </main>
  );
}
