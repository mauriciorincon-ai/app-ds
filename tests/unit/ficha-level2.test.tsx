// S5 F2 (tras la mirada de FORMA): la ficha de lectura de cada modelo (E3, en
// un <dialog> nativo que llega por import() dinámico), la tarjeta del Nivel 2
// (estimación calibrada, «incluir de todos modos», avisos de cancelación) y el
// botón de cancelar en el entrenamiento.
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { LeagueTable } from "@/components/LeagueTable";
import { Level2Card } from "@/components/Level2Card";
import { ResultsScreen } from "@/components/ResultsScreen";
import { TrainingScreen } from "@/components/TrainingScreen";
import { BALANCED_NOTES, FICHAS } from "@/content/modelos";
import {
  measuredRun,
  planLevel2,
  routeModels,
  type RouteProfile,
} from "@/engine/encarrilador";
import type { MemberId } from "@/engine/roster";
import { LOCALE_STORAGE_KEY } from "@/i18n/config";
import { I18nProvider } from "@/i18n/provider";
import { assembleResult } from "@/lib/experiment";
import { formatEstimate } from "@/lib/duration";
import type { Level2State } from "@/lib/useExperiment";
import type { ExperimentResult } from "@/workers/protocol";
import es from "../../messages/es.json";
import { pipelineResult } from "./factories";

// jsdom no implementa <dialog>.showModal/close: lo mínimo para que el
// componente real corra (el navegador real lo cubren los e2e).
beforeAll(() => {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & {
    showModal: () => void;
    close: () => void;
  };
  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

afterEach(() => window.localStorage.clear());

function ui(children: ReactNode) {
  return render(<I18nProvider>{children}</I18nProvider>);
}

const KIT: RouteProfile = {
  rows: 200,
  nTrain: 150,
  width: 10,
  minorityShare: 0.3,
  k: 5,
};
const MEDIANA: RouteProfile = {
  rows: 5000,
  nTrain: 3750,
  width: 33,
  minorityShare: 0.33,
  k: 5,
};

/** Resultado de una liga que corrió exactamente `roster`. */
function leagueOf(roster: MemberId[]): ExperimentResult {
  return assembleResult(pipelineResult({ roster, cv_k: 5 }), []);
}

describe("FichaModelo (E3) — desde la tabla de la liga", () => {
  const roster: MemberId[] = ["logistic", "logistic_balanced", "naive_bayes"];

  function openFicha(name: RegExp) {
    ui(
      <LeagueTable
        result={leagueOf(roster)}
        routing={null}
        choice={{ status: "idle" }}
        onChoose={() => {}}
      />,
    );
    const trigger = screen.getByRole("button", { name });
    trigger.focus();
    fireEvent.click(trigger);
    return trigger;
  }

  it("el nombre abre su ficha: cinco apartados, la línea de estado y el foco vuelve al cerrar", async () => {
    const trigger = openFicha(/Ficha de Naive Bayes/);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleName(/Naive Bayes/);
    for (const label of [
      "Qué es",
      "Cuándo sirve",
      "Cuándo no",
      "Qué mirar",
      "Cuánto cuesta",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText(FICHAS.naive_bayes.what.es)).toBeInTheDocument();
    expect(
      screen.getByText(/En esta liga: puesto \d de 3 por validación cruzada/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it("el ganador lo dice con ★ + texto", async () => {
    const result = leagueOf(roster);
    ui(
      <LeagueTable
        result={result}
        routing={null}
        choice={{ status: "idle" }}
        onChoose={() => {}}
      />,
    );
    const winner = es.results.candidates.short[result.selection.cvWinner];
    fireEvent.click(screen.getByRole("button", { name: `Ficha de ${winner}` }));
    const status = await screen.findByText(
      /En esta liga: ganador por validación cruzada/,
    );
    expect(status).toHaveTextContent("★");
  });

  it("la variante balanceada usa la ficha de su base + su párrafo propio", async () => {
    openFicha(/Ficha de .*balanceada/);
    await screen.findByRole("dialog");
    expect(screen.getByText(FICHAS.logistic.what.es)).toBeInTheDocument();
    expect(
      screen.getByText(BALANCED_NOTES.logistic_balanced.es),
    ).toBeInTheDocument();
  });

  it("en inglés, la ficha está redactada en inglés", async () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    openFicha(/About Naive Bayes/);
    await screen.findByRole("dialog");
    expect(screen.getByText(FICHAS.naive_bayes.watch.en)).toBeInTheDocument();
    expect(screen.getByText("What it costs")).toBeInTheDocument();
  });

  it("pendientes y «fuera» también tienen ficha, con su estado", async () => {
    const routing = routeModels({ ...KIT, rows: 100 });
    ui(
      <LeagueTable
        result={leagueOf(routing.level1)}
        routing={routing}
        choice={{ status: "idle" }}
        onChoose={() => {}}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Ficha de Red neuronal/ }),
    );
    expect(
      await screen.findByText(
        /En esta liga: fuera, porque tu dataset tiene \d+ filas/,
      ),
    ).toBeInTheDocument();
  });
});

describe("ResultsScreen — los baselines también abren su ficha", () => {
  it("clase mayoritaria: «no compite en la liga, la juzga»", async () => {
    ui(
      <ResultsScreen
        result={leagueOf(["logistic", "forest"])}
        datasetName="rotacion.csv"
        cols={7}
        runMeta={{
          target: "renuncio",
          numericFeatures: 6,
          categoricalFeatures: 1,
          seed: 42,
        }}
        sanitation={null}
        edaAlerts={null}
        onAgain={() => {}}
        onUseModel={() => {}}
        onExportModel={() => {}}
        exportState="idle"
        routing={null}
        choice={{ status: "idle" }}
        onChoose={() => {}}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Ficha de Clase mayoritaria" }),
    );
    expect(
      await screen.findByText(FICHAS.majority.watch.es),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Baseline del veredicto: no compite en la liga, la juzga.",
      ),
    ).toBeInTheDocument();
  });
});

describe("Level2Card (D5 + U3)", () => {
  function card(
    profile: RouteProfile,
    result: ExperimentResult,
    opts: {
      forced?: MemberId[];
      level2?: Level2State;
      busy?: boolean;
      onRun?: (extra: MemberId[]) => void;
    } = {},
  ) {
    return ui(
      <Level2Card
        result={result}
        profile={profile}
        forced={opts.forced ?? []}
        level2={opts.level2 ?? { status: "idle" }}
        busy={opts.busy ?? false}
        onRun={opts.onRun ?? (() => {})}
      />,
    );
  }

  it("con pendientes: los nombra, estima la unión EN ESTE EQUIPO y corre", () => {
    const routing = routeModels(MEDIANA);
    const result = leagueOf(routing.level1);
    const onRun = vi.fn();
    card(MEDIANA, result, { onRun });
    const plan = planLevel2(
      MEDIANA,
      routing.level1,
      measuredRun(result.selection.elapsedMs, result.league),
    );
    expect(
      screen.getByRole("heading", { name: "Nivel 2: la liga completa" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`Suma ${routing.level2.length} modelos`)),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `${plan.roster.length} modelos · unos ${formatEstimate(plan.estimateS)} en este equipo`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Calibrado con lo que tardó la corrida anterior."),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: `Correr el Nivel 2 (+${routing.level2.length})`,
      }),
    );
    expect(onRun).toHaveBeenCalledWith([]);
  });

  it("U3: sin pendientes, «incluir de todos modos» habilita la corrida y la estimación sube", () => {
    const tiny = { ...KIT, rows: 100 };
    const routing = routeModels(tiny);
    const onRun = vi.fn();
    card(tiny, leagueOf(routing.level1), { onRun });
    expect(
      screen.getByText(/Todos los modelos recomendados ya compitieron/),
    ).toBeInTheDocument();
    const run = screen.getByRole("button", { name: /Correr el Nivel 2/ });
    expect(run).toBeDisabled();

    const mlp = screen.getByRole("checkbox", { name: /Red neuronal/ });
    expect(
      screen.getByText(
        /El encarrilador lo deja fuera porque tu dataset tiene 100 filas/,
      ),
    ).toBeInTheDocument();
    fireEvent.click(mlp);
    expect(mlp).toBeChecked();
    expect(run).toBeEnabled();
    expect(run).toHaveTextContent("Correr el Nivel 2 (+1)");
    fireEvent.click(run);
    expect(onRun).toHaveBeenCalledWith(["mlp"]);
  });

  it("si elegiste a mano, avisa que la liga completa vuelve a elegir por CV", () => {
    const routing = routeModels(MEDIANA);
    const result = leagueOf(routing.level1);
    card(MEDIANA, {
      ...result,
      selection: { ...result.selection, by: "user" },
    });
    expect(
      screen.getByText(/tu elección manual de ahora no se conserva/),
    ).toBeInTheDocument();
  });

  it("cancelado: lo dice y, mientras el modelo vuelve, que se está recuperando; correr espera", () => {
    const routing = routeModels(MEDIANA);
    card(MEDIANA, leagueOf(routing.level1), {
      level2: { status: "cancelled" },
      busy: true,
    });
    expect(
      screen.getByText(
        /Cancelaste el Nivel 2. Sigue vigente el resultado anterior./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Recuperando el modelo anterior…"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Correr el Nivel 2/ }),
    ).toBeDisabled();
  });

  it("restauración fallida: alerta honesta aunque ya no quede nada que sumar", () => {
    const tiny = { ...KIT, rows: 1000, minorityShare: 0.3 };
    const routing = routeModels(tiny);
    expect(routing.level2).toEqual([]);
    expect(routing.out).toEqual([]);
    card(tiny, leagueOf(routing.level1), {
      level2: { status: "restore-failed" },
      busy: true,
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      /No se pudo recuperar el modelo anterior/,
    );
  });

  it("nada que sumar ni que incluir, y sin aviso ⇒ no hay tarjeta", () => {
    const tiny = { ...KIT, rows: 1000, minorityShare: 0.3 };
    const { container } = card(tiny, leagueOf(routeModels(tiny).level1));
    expect(container).toBeEmptyDOMElement();
  });
});

describe("LeagueTable — lo incluido de todos modos se marca", () => {
  it("U3: «lo incluiste tú (el encarrilador lo dejaba fuera)»", () => {
    const tiny = { ...KIT, rows: 100 };
    const routing = routeModels(tiny, undefined, ["mlp"]);
    ui(
      <LeagueTable
        result={leagueOf([...routing.level1, "mlp"])}
        routing={routing}
        choice={{ status: "idle" }}
        onChoose={() => {}}
      />,
    );
    expect(
      screen.getByText("lo incluiste tú (el encarrilador lo dejaba fuera)"),
    ).toBeInTheDocument();
  });
});

describe("TrainingScreen — Nivel 2 cancelable", () => {
  it("dice cuántos y cuánto en este equipo, y «Cancelar el Nivel 2» llama a cancelar", () => {
    const onCancel = vi.fn();
    ui(
      <TrainingScreen
        stage="training"
        detail={null}
        level2={{ count: 14, estimateS: 42 }}
        onCancel={onCancel}
      />,
    );
    expect(
      screen.getByText("Nivel 2 · 14 modelos · unos 42 s en este equipo"),
    ).toBeInTheDocument();
    act(() => {
      fireEvent.click(
        screen.getByRole("button", { name: "Cancelar el Nivel 2" }),
      );
    });
    expect(onCancel).toHaveBeenCalledOnce();
    expect(screen.queryByText(/La primera vez tarda unos segundos/)).toBeNull();
  });

  it("el Nivel 1 no ofrece cancelar (cabe en el techo)", () => {
    ui(<TrainingScreen stage="training" />);
    expect(screen.queryByRole("button", { name: /Cancelar/ })).toBeNull();
  });
});
