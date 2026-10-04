// UI de la liga (S5): tarjeta de tarea (E1), quién compite (E2), la tabla de la
// liga (CV para elegir, prueba a pedido y etiquetada, ★ ganador y ◆ elegido por
// ti con texto, nunca solo color), el veredicto del elegido y el progreso.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useState, type ReactNode } from "react";
import { ConfigScreen } from "@/components/ConfigScreen";
import { LeagueTable } from "@/components/LeagueTable";
import { ResultsScreen } from "@/components/ResultsScreen";
import { RosterCard } from "@/components/RosterCard";
import { TaskCard } from "@/components/TaskCard";
import { TrainingScreen } from "@/components/TrainingScreen";
import { routeModels, type RouteProfile } from "@/engine/encarrilador";
import { selectOneSe } from "@/engine/roster";
import { detectTask, type AmbiguousChoice } from "@/engine/tarea";
import { I18nProvider } from "@/i18n/provider";
import { assembleResult, summarizeDataset } from "@/lib/experiment";
import type { ChoiceState, TargetPlan } from "@/lib/useExperiment";
import type { BinaryResult } from "@/workers/protocol";
import { pipelineResult } from "./factories";

function ui(children: ReactNode) {
  return render(<I18nProvider>{children}</I18nProvider>);
}

const KIT: RouteProfile = {
  task: "binaria",
  rows: 200,
  nTrain: 150,
  width: 10,
  minorityShare: 0.3,
  k: 5,
};
const MEDIANA: RouteProfile = {
  task: "binaria",
  rows: 5000,
  nTrain: 3750,
  width: 33,
  minorityShare: 0.33,
  k: 5,
};

/** Liga de rotación (F0): NB tiene el máximo con un EE ancho; la logística,
 *  primera del orden y dentro del EE, gana. El ganador sale de la regla real. */
function rotationResult(): BinaryResult {
  const py = pipelineResult(
    { roster: ["logistic", "ridge", "naive_bayes", "hgb", "forest"], cv_k: 5 },
    {
      logistic: 0.707,
      ridge: 0.703,
      naive_bayes: 0.72,
      hgb: 0.6,
      forest: 0.701,
    },
  );
  const nb = py.league[2]!;
  nb.cv = { ...nb.cv!, std: 0.04 * Math.sqrt(5) };
  const sel = selectOneSe(py.league, 5, "higher")!;
  const winner = py.league.find((row) => row.name === sel.winner)!;
  return assembleResult(
    {
      ...py,
      winner: sel.winner,
      model_name: sel.winner,
      model: winner.test!,
      cv: { ...py.cv, best: sel.best, se: sel.se },
    },
    [],
  );
}

const IDLE: ChoiceState = { status: "idle" };

function table(
  result: BinaryResult,
  opts: {
    choice?: ChoiceState;
    onChoose?: (m: string) => void;
    routing?: ReturnType<typeof routeModels> | null;
  } = {},
) {
  return ui(
    <LeagueTable
      result={result}
      routing={opts.routing ?? null}
      choice={opts.choice ?? IDLE}
      onChoose={opts.onChoose ?? (() => {})}
    />,
  );
}

describe("TaskCard (E1)", () => {
  it("binaria: se puede entrenar, con la razón", () => {
    ui(<TaskCard detection={detectTask(["si", "no", "si"])} />);
    expect(
      screen.getByText("2 valores distintos → clasificación binaria."),
    ).toBeInTheDocument();
    expect(screen.getByText("Se puede entrenar.")).toBeInTheDocument();
  });

  it("otras tareas: se nombran y se dice que llegan en una próxima versión (no se esconden)", () => {
    ui(<TaskCard detection={detectTask(["a", "b", "c", "a"])} />);
    expect(
      screen.getByText(
        /3 categorías distintas → clasificación en varias categorías/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/llega en una próxima versión/),
    ).toBeInTheDocument();
  });

  // S6: estimar una cantidad se entrena, y la tarjeta dice en qué unidades.
  it("una cantidad: se entrena, con la unidad si el nombre la trae y franqueza si no", () => {
    const values = Array.from({ length: 30 }, (_, i) => String(i * 1.5));
    const { unmount } = ui(
      <TaskCard
        detection={detectTask(values)}
        target="consumo_kwh"
        unit={{ suffix: "kwh", symbol: "kWh" }}
      />,
    );
    expect(
      screen.getByText(/30 números distintos → predicción de una cantidad/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Vas a estimar una cantidad, en kWh/),
    ).toBeInTheDocument();
    unmount();
    ui(
      <TaskCard
        detection={detectTask(values)}
        target="edad"
        unit={{ suffix: null, symbol: null }}
      />,
    );
    expect(screen.getByText(/en las unidades de «edad»/)).toBeInTheDocument();
  });

  it("ambigua: sugiere la lectura más probable", () => {
    ui(<TaskCard detection={detectTask(["1", "2", "3", "4", "5", "1"])} />);
    expect(
      screen.getByText("Lo más probable: clasificación en varias categorías."),
    ).toBeInTheDocument();
  });

  // S6 (D2): la app pregunta, no adivina — dos botones, la sugerida con ★ + texto.
  it("ambigua con pregunta: dos respuestas por teclado, la sugerida marcada", () => {
    const onAnswer = vi.fn();
    const detection = detectTask(["1", "2", "3", "4", "5", "6", "2", "3"]);
    ui(
      <TaskCard detection={detection} target="ocupantes" onAnswer={onAnswer} />,
    );
    const group = screen.getByRole("group", {
      name: "¿«ocupantes» guarda categorías o una cantidad?",
    });
    const buttons = within(group).getAllByRole("button");
    expect(buttons).toHaveLength(2);
    const suggested = detection.suggested === "numerica" ? 0 : 1;
    expect(buttons[suggested]).toHaveTextContent("★Sugerida");
    expect(buttons[1 - suggested]).not.toHaveTextContent("Sugerida");
    fireEvent.click(
      within(group).getByRole("button", { name: /Una cantidad/ }),
    );
    expect(onAnswer).toHaveBeenCalledWith("numerica");
  });

  it("responder y cambiar la respuesta: el foco va a lo que aparece (AU-S6-04)", () => {
    const detection = detectTask(["1", "2", "3", "4", "5", "6", "2", "3"]);
    function Harness() {
      const [choice, setChoice] = useState<AmbiguousChoice | null>(null);
      return (
        <TaskCard
          detection={detection}
          target="ocupantes"
          resolved={choice ?? "ambigua"}
          choice={choice}
          unit={{ suffix: null, symbol: null }}
          onAnswer={setChoice}
        />
      );
    }
    ui(<Harness />);
    // Al montar no se roba el foco.
    expect(document.activeElement).toBe(document.body);
    const answer = screen.getByRole("button", { name: /Una cantidad/ });
    answer.focus();
    fireEvent.click(answer);
    // El párrafo de la respuesta, no el body (que también contiene el texto).
    const head = document.activeElement as HTMLElement;
    expect(head.tagName).toBe("P");
    expect(head).toHaveTextContent("Respondiste: Una cantidad.");
    fireEvent.click(
      screen.getByRole("button", { name: /Cambiar la respuesta/ }),
    );
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: /Una cantidad/ }),
    );
  });

  it("cada respuesta se nombra por su etiqueta y se describe una sola vez (AU-S6-38)", () => {
    const detection = detectTask(["1", "2", "3", "4", "5", "6", "2", "3"]);
    ui(
      <TaskCard detection={detection} target="ocupantes" onAnswer={vi.fn()} />,
    );
    const quantity = screen.getByRole("button", { name: /Una cantidad/ });
    expect(quantity).toHaveAccessibleName(/^Una cantidad( Sugerida)?$/);
    expect(quantity).toHaveAccessibleDescription(/^Se estima el número/);
  });

  it("una columna que no sirve como objetivo no promete una próxima versión (AU-S6-05)", () => {
    ui(
      <TaskCard
        detection={detectTask(
          Array.from({ length: 50 }, (_, i) => `c${i % 25}`),
        )}
      />,
    );
    expect(screen.getByText(/no algo que predecir/)).toBeInTheDocument();
    expect(
      screen.getByText(
        "Esta columna no sirve como objetivo. Elige una columna con dos categorías o con una cantidad.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/próxima versión/)).toBeNull();
  });

  it("ambigua respondida: dice la respuesta, la tarea que resulta y deja cambiarla", () => {
    const onAnswer = vi.fn();
    const detection = detectTask(["1", "2", "3", "4", "5", "6", "2", "3"]);
    const { unmount } = ui(
      <TaskCard
        detection={detection}
        target="ocupantes"
        resolved="numerica"
        choice="numerica"
        unit={{ suffix: null, symbol: null }}
        onAnswer={onAnswer}
      />,
    );
    expect(screen.getByText("Respondiste: Una cantidad.")).toBeInTheDocument();
    expect(screen.getByText(/Vas a estimar una cantidad/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /Cambiar la respuesta/ }),
    );
    expect(onAnswer).toHaveBeenCalledWith(null);
    unmount();
    ui(
      <TaskCard
        detection={detection}
        target="ocupantes"
        resolved="multiclase"
        choice="multiclase"
        onAnswer={onAnswer}
      />,
    );
    expect(screen.getByText("Respondiste: Categorías.")).toBeInTheDocument();
    expect(
      screen.getByText(/llega en una próxima versión/),
    ).toBeInTheDocument();
  });
});

describe("RosterCard (E2)", () => {
  it("Nivel 1 con su estimación y lo que queda fuera con su razón", () => {
    const routing = routeModels(KIT);
    ui(
      <RosterCard
        routing={routing}
        rows={200}
        minorityShare={0.3}
        k={5}
        smallSample={false}
      />,
    );
    expect(
      screen.getByText(/Nivel 1 · ahora · 13 modelos · unos \d+ s/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/una red neuronal necesita al menos 500/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Nada se esconde/)).toBeInTheDocument();
  });

  it("Nivel 2 con el costo de cada uno y el de la liga completa", () => {
    const routing = routeModels(MEDIANA);
    ui(
      <RosterCard
        routing={routing}
        rows={5000}
        minorityShare={0.33}
        k={5}
        smallSample={false}
      />,
    );
    expect(
      screen.getByText(/Nivel 2 · después, si quieres · \d+ modelos más/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/podrás correr la liga completa/),
    ).toBeInTheDocument();
  });

  it("un forzado (U3) dice por qué el encarrilador lo dejaba fuera", () => {
    const routing = routeModels({ ...KIT, rows: 100 }, 5, ["mlp"]);
    ui(
      <RosterCard
        routing={routing}
        rows={100}
        minorityShare={0.3}
        k={5}
        smallSample
      />,
    );
    expect(
      screen.getByText(
        /lo incluiste tú; el encarrilador lo dejaba fuera porque tu dataset tiene 100 filas/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Muestra pequeña \(100 filas\)/),
    ).toBeInTheDocument();
  });
});

describe("ConfigScreen con el plan (E1 + E2)", () => {
  const dataset = summarizeDataset({
    headers: ["x", "y", "z"],
    rows: [
      ["1", "0", "a"],
      ["2", "1", "b"],
      ["3", "0", "c"],
    ],
  });
  const plan = (
    target: string,
    routing: TargetPlan["routing"],
  ): TargetPlan => ({
    target,
    task: dataset.targetTasks[target]!,
    choice: null,
    resolved: dataset.targetTasks[target]!.task,
    unit: null,
    routing,
    profile: routing ? KIT : null,
    smallSample: false,
    blocked: null,
  });
  const screenWith = (p: TargetPlan, value: string) => {
    ui(
      <ConfigScreen
        dataset={dataset}
        sanitation={null}
        edaAlerts={null}
        plan={p}
        onSelectTarget={() => {}}
        onRun={() => {}}
        onBack={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText(/¿Qué quieres predecir?/), {
      target: { value },
    });
  };

  it("todas las columnas se ofrecen, cada una con su tarea", () => {
    screenWith(plan("y", routeModels(KIT)), "y");
    const options = within(
      screen.getByLabelText(/¿Qué quieres predecir?/),
    ).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      "Elige una columna…",
      "x · categorías o cantidad",
      "y · clasificación binaria",
      "z · clasificación en varias categorías",
    ]);
  });

  it("binaria con reparto ⇒ quién compite + entrenar habilitado", () => {
    screenWith(plan("y", routeModels(KIT)), "y");
    expect(screen.getByText("Quién compite")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Entrenar modelos/ }),
    ).toBeEnabled();
  });

  it("tarea que el S5 no entrena ⇒ entrenar deshabilitado y sin «quién compite»", () => {
    screenWith(plan("z", null), "z");
    expect(screen.queryByText("Quién compite")).toBeNull();
    expect(
      screen.getByRole("button", { name: /Entrenar modelos/ }),
    ).toBeDisabled();
  });

  it("binaria sin CV honesta posible ⇒ el motivo exacto, y no entrena", () => {
    screenWith({ ...plan("y", null), blocked: "too-few-rows" }, "y");
    expect(
      screen.getByText(
        /la validación cruzada necesita al menos 2 de cada clase/,
      ),
    ).toBeInTheDocument();
    // La tarjeta de tarea no dice «✓ Se puede entrenar» junto al bloqueo (AU-S5-02).
    expect(screen.queryByText("Se puede entrenar.")).toBeNull();
    expect(
      screen.getByText(/no se pueden comparar modelos con honestidad/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Entrenar modelos/ }),
    ).toBeDisabled();
  });
});

describe("LeagueTable", () => {
  it("la regla a la vista; ★ ganador y ▲ mejor puntaje con TEXTO; la banda ≈ del error estándar", () => {
    table(rotationResult());
    expect(
      screen.getByRole("heading", { name: "La liga: 5 modelos" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /sirve para elegir. El veredicto se calcula con el conjunto de prueba: sirve para creer/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Ganador (validación cruzada)"),
    ).toBeInTheDocument();
    expect(screen.getByText("mejor puntaje")).toBeInTheDocument();
    // ridge y forest quedan dentro del EE del mejor (0,72 − 0,04 = 0,68); hgb (0,60), no.
    expect(screen.getAllByText("≈ empata con el mejor")).toHaveLength(2);
    expect(screen.getAllByText("En uso").length).toBeGreaterThan(0);
  });

  it("la prueba se abre a pedido, rotulada «no sirve para elegir», con su advertencia", () => {
    table(rotationResult());
    expect(
      screen.queryByText(/Estos puntajes son del conjunto de prueba/),
    ).toBeNull();
    const toggle = screen.getByRole("button", {
      name: /Ver puntajes de prueba/,
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(
      screen.getByText(/Estos puntajes son del conjunto de prueba/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Prueba · AUC · no sirve para elegir/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Ocultar puntajes de prueba/ }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("«Elegir» llama con el miembro; mientras ajusta, todo se deshabilita", () => {
    const onChoose = vi.fn();
    const { unmount } = table(rotationResult(), { onChoose });
    fireEvent.click(
      screen.getAllByRole("button", { name: "Elegir Random Forest" })[0]!,
    );
    expect(onChoose).toHaveBeenCalledWith("forest");
    unmount();
    table(rotationResult(), {
      choice: { status: "fitting", member: "forest" },
    });
    expect(screen.getAllByText("Ajustando…").length).toBeGreaterThan(0);
    for (const button of screen.getAllByRole("button", { name: /^Elegir / })) {
      expect(button).toBeDisabled();
    }
  });

  it("elegido por ti: ◆ con texto, y el ganador ofrece volver", () => {
    const onChoose = vi.fn();
    const base = rotationResult();
    const chosen: BinaryResult = {
      ...base,
      modelName: "forest",
      selection: { ...base.selection, by: "user" },
    };
    table(chosen, { onChoose });
    expect(screen.getByText("Elegido por ti")).toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Volver al ganador" })[0]!,
    );
    expect(onChoose).toHaveBeenCalledWith("logistic");
  });

  it("ninguno se omite: pendientes del Nivel 2 y «fuera» con su razón; un error, con su tipo", () => {
    const base = rotationResult();
    const withError: BinaryResult = {
      ...base,
      league: base.league.map((row) =>
        row.name === "hgb"
          ? {
              ...row,
              status: "error",
              cv: null,
              test: null,
              error_type: "ValueError",
            }
          : row,
      ),
    };
    table(withError, { routing: routeModels({ ...MEDIANA, rows: 300 }) });
    expect(screen.getByText("✕ no concluyó (ValueError)")).toBeInTheDocument();
    expect(
      screen.getAllByText(/Fuera: tu dataset tiene/).length,
    ).toBeGreaterThan(0);
  });

  it("un error al elegir se dice y el modelo anterior sigue activo", () => {
    table(rotationResult(), { choice: { status: "error", member: "hgb" } });
    expect(screen.getByRole("alert")).toHaveTextContent(
      /No se pudo ajustar «HistGradientBoosting»/,
    );
  });
});

describe("ResultsScreen — el veredicto de la liga", () => {
  const RUN_META = {
    target: "renuncio",
    numericFeatures: 6,
    categoricalFeatures: 1,
    seed: 42,
  };
  const screenWith = (result: BinaryResult, modelReady = true) =>
    ui(
      <ResultsScreen
        result={result}
        datasetName="rotacion.csv"
        cols={7}
        runMeta={RUN_META}
        sanitation={null}
        edaAlerts={null}
        onAgain={() => {}}
        onUseModel={() => {}}
        onExportModel={() => {}}
        exportState="idle"
        routing={null}
        choice={IDLE}
        onChoose={() => {}}
        modelReady={modelReady}
      />,
    );

  it("R2: si gana la logística (también baseline), se dice que la liga no encontró nada mejor", () => {
    const result = rotationResult();
    screenWith({
      ...result,
      verdict: { ...result.verdict, level: "ties", delta: 0 },
    });
    expect(
      screen.getByText(
        "La liga no encontró nada mejor que la regresión de referencia",
      ),
    ).toBeInTheDocument();
  });

  it("R2: si gana la logística pero PIERDE contra la clase mayoritaria, el veredicto franco se mantiene", () => {
    const result = rotationResult();
    screenWith({
      ...result,
      verdict: {
        ...result.verdict,
        level: "loses",
        delta: -0.04,
        modelScore: 0.46,
        baselineScore: 0.5,
      },
    });
    expect(
      screen.queryByText(
        "La liga no encontró nada mejor que la regresión de referencia",
      ),
    ).toBeNull();
    expect(
      screen.getByRole("heading", { level: 1, name: /NO supera al baseline/ }),
    ).toBeInTheDocument();
  });

  it("U1: elegido a mano ⇒ el veredicto habla de él, etiquetado; usar/exportar esperan al modelo", () => {
    const base = rotationResult();
    screenWith(
      {
        ...base,
        modelName: "forest",
        selection: { ...base.selection, by: "user" },
      },
      false,
    );
    expect(
      screen.getByText(/◆ Elegido por ti, no por la validación cruzada/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Usar el modelo" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Exportar modelo/ }),
    ).toBeDisabled();
  });
});

describe("TrainingScreen — progreso modelo a modelo", () => {
  it("nombra el modelo y la fase, con una barra de progreso accesible", () => {
    ui(
      <TrainingScreen
        stage="training"
        detail={{ phase: "test", member: "hgb", index: 2, total: 9 }}
      />,
    );
    expect(
      screen.getByText(
        "Conjunto de prueba · modelo 3 de 9: HistGradientBoosting",
      ),
    ).toBeInTheDocument();
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", String(9 + 3));
    expect(bar).toHaveAttribute("aria-valuemax", "18");
    // La región viva anuncia la etapa, no cada modelo (AU-S5-24).
    expect(screen.getByRole("status")).not.toHaveTextContent(
      /modelo \d+ de \d+/,
    );
  });

  it("Nivel 1: muestra el tiempo estimado que prometió Configuración (AU-S5-21)", () => {
    ui(<TrainingScreen stage="training" estimateS={4.2} />);
    expect(
      screen.getByText(/^Unos 5 s de cálculo en un computador de escritorio/),
    ).toBeInTheDocument();
  });
});
