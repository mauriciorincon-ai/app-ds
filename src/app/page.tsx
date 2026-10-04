"use client";

import { ConfigScreen } from "@/components/ConfigScreen";
import { ErrorScreen } from "@/components/ErrorScreen";
import { ResultsScreen } from "@/components/ResultsScreen";
import { ScoreScreen } from "@/components/ScoreScreen";
import { StartScreen } from "@/components/StartScreen";
import { TrainingScreen } from "@/components/TrainingScreen";
import { useExperiment } from "@/lib/useExperiment";

// Workspace del experimento: una sola ruta, máquina de estados. Pyodide se carga
// bajo demanda (al entrenar o importar), no aquí — la landing es liviana (fuera
// del LCP).
export default function Home() {
  const {
    state,
    loadCsv,
    selectTarget,
    run,
    reset,
    goToScoring,
    backToResults,
    resetScoring,
    scoreCsv,
    exportModel,
    activateImportedModel,
    chooseMember,
    runLevel2,
    cancelLevel2,
  } = useExperiment();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      {state.phase === "empty" && (
        <StartScreen onLoad={loadCsv} onImport={activateImportedModel} />
      )}

      {state.phase === "configuring" && state.dataset && (
        <ConfigScreen
          dataset={state.dataset}
          sanitation={state.sanitation}
          edaAlerts={state.edaAlerts}
          plan={state.plan}
          onSelectTarget={selectTarget}
          onRun={run}
          onBack={reset}
        />
      )}

      {state.phase === "running" && (
        <TrainingScreen
          stage={state.progress}
          detail={state.progressDetail}
          level2={state.level2.status === "running" ? state.level2 : null}
          estimateS={state.routing?.level1EstimateS ?? null}
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
          exportState={state.exportState}
          routing={state.routing}
          choice={state.choice}
          onChoose={chooseMember}
          modelReady={state.modelReady}
          profile={state.profile}
          forced={state.forced}
          level2={state.level2}
          onRunLevel2={runLevel2}
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
          onScoreAnother={resetScoring}
          onBackToResults={backToResults}
          onExit={reset}
          onExportModel={exportModel}
        />
      )}

      {state.phase === "error" && state.error && (
        <ErrorScreen kind={state.error.kind} onRetry={reset} />
      )}
    </main>
  );
}
