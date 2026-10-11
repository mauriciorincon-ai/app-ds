// S6 — la UI de estimar una cantidad: el veredicto EN UNIDADES (con la lineal
// como baseline Y miembro, R10), el gráfico estimado-frente-a-real que no
// comunica solo con color, su equivalente en texto, la liga con «menor es
// mejor», el cerrojo del cliente de la narración (P7), puntuar con
// «<objetivo>_estimado» y la máquina de estados con la pregunta de la ambigua.
// getByText normaliza el espacio NO separable del DOM a uno normal: las
// aserciones de texto usan espacios normales y withUnit fija el NBSP aparte.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import FichaModelo from "@/components/FichaModelo";
import { REGRESSION_NOTES } from "@/content/modelos";
import { buildModelCard } from "@/lib/modelcard";
import { LeagueTable } from "@/components/LeagueTable";
import { PredichoVsReal } from "@/components/PredichoVsReal";
import {
  RegressionDetail,
  RegressionVerdict,
} from "@/components/RegressionResults";
import { ResultsScreen } from "@/components/ResultsScreen";
import { ScoreScreen } from "@/components/ScoreScreen";
import { I18nProvider } from "@/i18n/provider";
import { downloadTextFile } from "@/lib/files";
import { recordLeagueRun } from "@/lib/observability";
import {
  errorReductionPct,
  formatQuantity,
  quantityDecimals,
  withUnit,
} from "@/lib/quantity";
import {
  insideBandShare,
  labelEvery,
  leftMargin,
  MIN_LEFT_MARGIN,
  MIN_RIGHT_MARGIN,
  niceTicks,
  rightMargin,
  scatterDomain,
  TICK_CHAR_WIDTH,
} from "@/lib/scatter";
import { buildScoredCsv, formatEstimates } from "@/lib/scored-csv";
import { useExperiment, type ModelMeta } from "@/lib/useExperiment";
import { useNarration } from "@/lib/useNarration";
import type {
  PipelinePayload,
  RegressionResult,
  ScoreResult,
} from "@/workers/protocol";
import {
  regressionMemberFit,
  regressionMetrics,
  regressionPipelineResult,
  regressionResult,
} from "./factories";

vi.mock("@/lib/files", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/files")>();
  return { ...actual, downloadTextFile: vi.fn() };
});
vi.mock("@/lib/observability", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/observability")>();
  return { ...actual, recordLeagueRun: vi.fn() };
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider>{children}</I18nProvider>
);
const ui = (children: ReactNode) =>
  render(<I18nProvider>{children}</I18nProvider>);
const NBSP = "\u00a0";

describe("cifras en unidades (R9)", () => {
  it("decimales para 3 cifras significativas del valor más chico del grupo", () => {
    expect(quantityDecimals([33.5, 43.8])).toBe(1);
    expect(quantityDecimals([0.42, 12])).toBe(3);
    expect(quantityDecimals([158_912, 201_334])).toBe(0);
    expect(quantityDecimals([0, Number.NaN])).toBe(0);
    expect(quantityDecimals([1e-5])).toBe(6); // el tope del contrato
  });

  it("un valor que se escribiría 0 no decide los decimales (fuga plantada)", () => {
    // La recta con la fuga plantada se equivoca por ~1e-11: antes ponía seis
    // decimales a toda la liga («72,918.000000 USD»).
    expect(quantityDecimals([1e-11, 672.66, 72_918])).toBe(0);
    expect(quantityDecimals([1e-11])).toBe(0);
    expect(formatQuantity(1e-11, quantityDecimals([1e-11, 672.66]))).toBe("0");
  });

  it("punto decimal y miles con coma; la unidad no se separa del número", () => {
    expect(formatQuantity(158_912.4, 0)).toBe("158,912");
    expect(formatQuantity(-0, 1)).toBe("0.0");
    expect(withUnit("33.5", { symbol: "kWh" })).toBe(`33.5${NBSP}kWh`);
    expect(withUnit("33.5", { symbol: null })).toBe("33.5");
    expect(errorReductionPct(33.5, 43.8)).toBe(24);
    expect(errorReductionPct(1, 0)).toBe(0);
  });
});

describe("geometría del gráfico (P6)", () => {
  const points = {
    real: [150, 250, 350, 450, 550],
    predicted: [170, 240, 400, 445, 600],
    n_total: 50,
  };

  it("un rango común con margen, marcas redondas y la fracción dentro de ±MAE", () => {
    const [lo, hi] = scatterDomain(points);
    expect(lo).toBeLessThan(150);
    expect(hi).toBeGreaterThan(600);
    expect(niceTicks(130, 620, 5)).toEqual([200, 300, 400, 500, 600]);
    expect(niceTicks(0, 1, 4)).toEqual([0, 0.5, 1]);
    expect(insideBandShare(points, 33.5)).toBe(0.6);
    expect(scatterDomain({ real: [5], predicted: [5], n_total: 1 })).toEqual([
      3.92, 6.08,
    ]);
  });

  it("cifras largas: más margen a la izquierda y el eje horizontal rotulado salteado", () => {
    expect(leftMargin(["200", "300"])).toBe(MIN_LEFT_MARGIN);
    const long = ["100,000", "500,000"];
    const margin = leftMargin(long);
    // El rótulo (que termina 6 unidades antes del eje) empieza después del
    // título girado, que ocupa hasta ~18.
    expect(margin - 6 - 7 * TICK_CHAR_WIDTH).toBeGreaterThanOrEqual(22);
    // A la derecha, cabe medio rótulo: el de una marca justo en el borde no se corta.
    expect(rightMargin(["200", "300"])).toBe(MIN_RIGHT_MARGIN);
    expect(rightMargin(long)).toBeGreaterThanOrEqual((7 * TICK_CHAR_WIDTH) / 2);
    expect(labelEvery(["200"], 61)).toBe(1);
    expect(labelEvery(long, 48.8)).toBe(2);
    expect(labelEvery(long, 0)).toBe(1);
  });

  it("el gráfico con precios rotula el eje vertical entero y el horizontal salteado", () => {
    const prices = {
      real: [60_000, 500_000],
      predicted: [60_000, 500_000],
      n_total: 2,
    };
    const { container } = ui(
      <PredichoVsReal
        points={prices}
        mae={1e-11}
        unit={{ symbol: "USD" }}
        column="precio_usd"
      />,
    );
    const marks = [...container.querySelectorAll("svg text.font-mono")].map(
      (el) => el.textContent,
    );
    // Cinco marcas en el vertical; en el horizontal, una de cada dos.
    expect(marks.filter((m) => m === "100,000")).toHaveLength(2);
    expect(marks.filter((m) => m === "200,000")).toHaveLength(1);
    expect(marks.filter((m) => m === "500,000")).toHaveLength(2);
    // Y la franja de la fuga plantada no presume seis decimales.
    expect(screen.getByText(/±MAE \(0 USD\)/)).toBeInTheDocument();
  });
});

describe("el veredicto en unidades (P5, R10)", () => {
  it("supera: cuánto se equivoca, contra qué baseline y cuánto menos", () => {
    ui(
      <RegressionVerdict
        result={regressionResult()}
        target="consumo_kwh"
        hasLeak={false}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "«Ridge» supera al baseline" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `En promedio se equivoca por ±33.5 kWh; una regresión lineal se equivoca por ±43.8 kWh: un 24 % menos de error.`,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/en las unidades de/)).toBeNull();
  });

  it("sin unidad reconocible no se inventa: lo dice nombrando la columna", () => {
    ui(
      <RegressionVerdict
        result={regressionResult(regressionPipelineResult(), "edad")}
        target="edad"
        hasLeak={false}
      />,
    );
    expect(screen.getByText(/se equivoca por ±33\.5;/)).toBeInTheDocument();
    expect(
      screen.getByText(/Las cifras están en las unidades de «edad»/),
    ).toBeInTheDocument();
  });

  it("la lineal gana y EMPATA consigo misma: se dice así, no «supera»", () => {
    const py = regressionPipelineResult({ roster: ["linear"], cv_k: 5 });
    const tie = regressionResult({ ...py, model: py.baselines.linear });
    ui(<RegressionVerdict result={tie} target="consumo_kwh" hasLeak={false} />);
    expect(
      screen.getByRole("heading", {
        name: "La liga no encontró nada mejor que la regresión lineal de referencia",
      }),
    ).toBeInTheDocument();
  });

  it("la lineal gana y empata con la MEDIANA: titular normal que nombra a la mediana (AU-S6-18)", () => {
    const py = regressionPipelineResult({ roster: ["linear"], cv_k: 5 });
    const tie = regressionResult({
      ...py,
      model: regressionMetrics({ mae: 40.2 }),
      baselines: {
        median: regressionMetrics({ mae: 40, r2: 0 }),
        linear: regressionMetrics({ mae: 40.2 }),
      },
    });
    ui(<RegressionVerdict result={tie} target="consumo_kwh" hasLeak={false} />);
    expect(
      screen.getByRole("heading", {
        name: "«Lineal» empata con el baseline",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /adivinar siempre la mediana .* se equivoca por ±40\.0 kWh: prácticamente lo mismo/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/no encontró nada mejor que la regresión lineal/),
    ).toBeNull();
  });

  it("la lineal gana pero la mediana rinde mejor: el «NO supera» franco no se reemplaza (AU-S5-01)", () => {
    const py = regressionPipelineResult({ roster: ["linear"], cv_k: 5 });
    const loses = regressionResult({
      ...py,
      model: py.baselines.linear,
      baselines: {
        ...py.baselines,
        median: regressionMetrics({ mae: 30 }),
      },
    });
    ui(
      <RegressionVerdict result={loses} target="consumo_kwh" hasLeak={false} />,
    );
    expect(
      screen.getByRole("heading", { name: "«Lineal» NO supera al baseline" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /adivinar siempre la mediana \(365 kWh\) se equivoca menos: ±30\.0 kWh/,
      ),
    ).toBeInTheDocument();
  });

  it("con fuga, el titular es la sospecha", () => {
    ui(
      <RegressionVerdict
        result={regressionResult()}
        target="consumo_kwh"
        hasLeak
      />,
    );
    expect(
      screen.getByRole("heading", {
        name: "Posible fuga de datos — sospechoso",
      }),
    ).toBeInTheDocument();
  });
});

describe("estimado frente a real: nada solo por color", () => {
  const points = {
    real: [150, 250, 350, 450, 550],
    predicted: [170, 240, 400, 445, 600],
    n_total: 50,
  };

  it("dentro de la franja = disco; fuera = anillo; con descripción y aviso de muestra", () => {
    ui(
      <PredichoVsReal
        points={points}
        mae={33.5}
        unit={{ symbol: "kWh" }}
        column="consumo_kwh"
      />,
    );
    const chart = screen.getByRole("img");
    expect(chart).toHaveAccessibleName(
      `Gráfico de dispersión de 5 filas de prueba: en el eje horizontal el valor real, en el vertical el estimado. 60 de cada 100 quedan a menos de ±33.5${NBSP}kWh de su valor real.`,
    );
    const discs = chart.querySelectorAll("circle.fill-accent");
    const rings = chart.querySelectorAll("circle.stroke-caution");
    expect(discs).toHaveLength(3);
    expect(rings).toHaveLength(2);
    // Los bordes de la franja en `accent` pleno: con `accent/60` quedaban bajo
    // 3:1 contra el fondo, en los dos temas (AU-S6-20).
    expect(
      chart.querySelectorAll('line[stroke-dasharray="4 3"].stroke-accent'),
    ).toHaveLength(2);
    expect(screen.getByText("dentro de la franja")).toBeInTheDocument();
    expect(screen.getByText("fuera de la franja")).toBeInTheDocument();
    expect(
      screen.getByText(/muestra 5 de las 50 filas de prueba/),
    ).toBeInTheDocument();
  });

  it("el equivalente en texto: cuantiles del error y los baselines con su ficha", () => {
    ui(<RegressionDetail result={regressionResult()} target="consumo_kwh" />);
    expect(
      screen.getByText(
        `La mitad de las estimaciones se equivoca entre −20.0 kWh y +25.0 kWh.`.replace(
          "−",
          "-",
        ),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`9 de cada 10 se equivocan por menos de ±55.0 kWh.`),
    ).toBeInTheDocument();
    // 30 de 50 por encima: el azar lo explica (prueba de signo, D9).
    expect(
      screen.getByText(
        `El error mediano es +5.0 kWh: no se ve una inclinación clara hacia un lado.`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ficha de Mediana" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ficha de Regresión lineal" }),
    ).toBeInTheDocument();
  });

  it("con evidencia, «tiende a estimar de más»; un error que redondea a cero va sin signo (D9, AU-S6-15)", () => {
    const base = regressionResult();
    const biased = {
      ...base,
      // 45 de 50 por encima del valor real: p < 0,05.
      predVsReal: {
        ...base.predVsReal,
        predicted: base.predVsReal.real.map((v, i) => v + (i < 45 ? 8 : -8)),
      },
      residuals: { ...base.residuals, p50: 8 },
    };
    const { unmount } = ui(
      <RegressionDetail result={biased} target="consumo_kwh" />,
    );
    expect(
      screen.getByText(
        `El error mediano es +8.0 kWh: tiende a estimar de más.`,
      ),
    ).toBeInTheDocument();
    unmount();
    ui(
      <RegressionDetail
        result={{ ...base, residuals: { ...base.residuals, p50: -0.004 } }}
        target="consumo_kwh"
      />,
    );
    expect(
      screen.getByText(
        `El error mediano es 0.0 kWh: no se ve una inclinación clara hacia un lado.`,
      ),
    ).toBeInTheDocument();
  });
});

describe("la liga al estimar: menor es mejor", () => {
  it("ordena del menor MAE al mayor, en unidades, y lo dice", () => {
    const py = regressionPipelineResult(
      { roster: ["linear", "ridge", "extra_trees"], cv_k: 5 },
      { linear: 40, ridge: 35, extra_trees: 38 },
    );
    ui(
      <LeagueTable
        result={regressionResult(py)}
        routing={null}
        choice={{ status: "idle" }}
        onChoose={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/En esta tabla, menor es mejor/),
    ).toBeInTheDocument();
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(
      rows.map((row) => within(row).getAllByRole("button")[0]!.textContent),
    ).toEqual(["Ridge", "Extra Trees", "Lineal"]);
    expect(
      within(rows[0]!).getByText("Ganador (validación cruzada)"),
    ).toBeInTheDocument();
    expect(within(rows[0]!).getByText(`35.00 kWh`)).toBeInTheDocument();
  });
});

describe("Resultados completos al estimar (P7)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sin botón de IA, con la línea franca, y sin ninguna petición", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    ui(
      <ResultsScreen
        result={regressionResult()}
        datasetName="consumo-energia.csv"
        cols={7}
        runMeta={{
          target: "consumo_kwh",
          numericFeatures: 4,
          categoricalFeatures: 2,
          seed: 42,
        }}
        sanitation={null}
        edaAlerts={null}
        onAgain={vi.fn()}
        onUseModel={vi.fn()}
        onExportModel={vi.fn()}
        exportState="idle"
        routing={null}
        choice={{ status: "idle" }}
        onChoose={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /Narrar con IA/ })).toBeNull();
    expect(
      screen.getByText(/narración con IA solo cubre la clasificación/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/El modelo se equivoca en promedio por ±33\.5/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("▲ a mayor valor, mayor «consumo_kwh»"),
    ).toBeInTheDocument();
    // La importancia al estimar está en las unidades del objetivo (AU-S6-21).
    expect(screen.getByText("61.1 kWh")).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: `Importancia de ocupantes: 61.1${NBSP}kWh`,
      }),
    ).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("cerrojo del cliente: pedir la narración de un resultado de estimar NO llama al route", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { result } = renderHook(
      () =>
        useNarration({
          result: regressionResult(),
          target: "consumo_kwh",
          cols: 7,
        }),
      { wrapper },
    );
    expect(result.current.aiAvailable).toBe(false);
    act(() => result.current.requestNarration());
    expect(result.current.ai.kind).toBe("idle");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.template).toContain(`±33.5${NBSP}kWh`);
  });
});

describe("puntuar al estimar: «<objetivo>_estimado»", () => {
  const META: ModelMeta = {
    source: "trained",
    datasetName: "consumo-energia.csv",
    manifest: null,
    schema: {
      numeric: ["superficie_m2"],
      categorical: [],
      target: "consumo_kwh",
      task: "numerica",
      target_stats: {
        mean: 374.7,
        std: 114.2,
        min: 148.8,
        max: 840.5,
        median: 365.4,
        decimals: 1,
      },
    },
  };
  const score: ScoreResult = {
    task: "numerica",
    predictions: [412.345, 7, 300],
    probabilities: null,
    novelty: { columns: [], affected_rows: 0, n_rows: 3 },
  };
  const table = {
    headers: ["superficie_m2"],
    rows: [["80"], ["20"], ["60"]],
  };

  it("columna nueva con los decimales del objetivo, resumen mín·mediana·máx y sin probabilidad", () => {
    ui(
      <ScoreScreen
        meta={META}
        ready
        progress={null}
        scoring={{
          status: "scored",
          fileName: "nuevas.csv",
          table,
          check: { ok: true, missing: [], extra: [], targetPresent: false },
          score,
        }}
        exportState="idle"
        onScoreFile={vi.fn()}
        onScoreAnother={vi.fn()}
        onBackToResults={vi.fn()}
        onExit={vi.fn()}
        onExportModel={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Modelo: consumo-energia.csv · estima: consumo_kwh"),
    ).toBeInTheDocument();
    expect(screen.getByText("Estimaciones (3 filas)")).toBeInTheDocument();
    expect(screen.getByText("consumo_kwh_estimado")).toBeInTheDocument();
    expect(screen.getByText("412.3")).toBeInTheDocument();
    expect(screen.getByText(`7.0 kWh`)).toBeInTheDocument();
    expect(screen.getByText(`300.0 kWh`)).toBeInTheDocument();
    expect(screen.getByText(`412.3 kWh`)).toBeInTheDocument();
    expect(
      screen.getByText(/Estimar no da una probabilidad/),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /Descargar CSV puntuado/ }),
    );
    const csv = vi.mocked(downloadTextFile).mock.lastCall?.[1];
    expect(csv).toBe(
      "superficie_m2,consumo_kwh_estimado\n80,412.3\n20,7.0\n60,300.0\n",
    );
  });

  it("una sola fila: «Estimaciones (1 fila)», en singular (AU-S6-36)", () => {
    ui(
      <ScoreScreen
        meta={META}
        ready
        progress={null}
        scoring={{
          status: "scored",
          fileName: "una.csv",
          table: { headers: ["superficie_m2"], rows: [["80"]] },
          check: { ok: true, missing: [], extra: [], targetPresent: false },
          score: {
            ...score,
            predictions: [412.345],
            novelty: { columns: [], affected_rows: 0, n_rows: 1 },
          },
        }}
        exportState="idle"
        onScoreFile={vi.fn()}
        onScoreAnother={vi.fn()}
        onBackToResults={vi.fn()}
        onExit={vi.fn()}
        onExportModel={vi.fn()}
      />,
    );
    expect(screen.getByText("Estimaciones (1 fila)")).toBeInTheDocument();
  });

  it("el CSV puntuado de una cantidad no agrega columna de probabilidad", () => {
    expect(
      buildScoredCsv(table, formatEstimates([1, 2, 3], 0), null, {
        prediction: "y_estimado",
        probability: "",
      }),
    ).toBe("superficie_m2,y_estimado\n80,1\n20,2\n60,3\n");
  });
});

describe("useExperiment al estimar (S6)", () => {
  class FakeWorker {
    static last: FakeWorker | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: { message: string }) => void) | null = null;
    posted: Array<{ id: number; type: string; payload?: unknown }> = [];
    constructor() {
      FakeWorker.last = this;
    }
    postMessage(message: { id: number; type: string; payload?: unknown }) {
      this.posted.push(message);
    }
    terminate() {}
  }
  const CONSUMO = readFileSync(
    resolve(process.cwd(), "public/datasets/consumo-energia.csv"),
    "utf8",
  );
  const reply = (worker: FakeWorker, command: string, result: unknown) =>
    act(() => {
      worker.onmessage?.({
        data: { id: worker.posted.at(-1)!.id, type: "result", command, result },
      } as MessageEvent);
    });

  beforeEach(() => {
    vi.stubGlobal("Worker", FakeWorker);
    vi.mocked(recordLeagueRun).mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("ambigua respondida → el Nivel 2 conserva la respuesta; cancelar restaura y registra «numerica» (AU-S6-16)", () => {
    const { result } = renderHook(() => useExperiment());
    act(() => result.current.loadCsv(CONSUMO, "consumo-energia.csv"));
    act(() => result.current.selectTarget("ocupantes"));
    act(() => result.current.answerTask("numerica"));
    act(() => result.current.run("ocupantes"));
    const worker = FakeWorker.last!;
    const sent = worker.posted.at(-1)!.payload as PipelinePayload;
    expect(sent.task).toBe("numerica");
    reply(worker, "train", regressionPipelineResult(sent));
    expect(result.current.state.result?.task).toBe("numerica");

    // El Nivel 2 guarda primero el modelo vigente y después entrena, con la
    // respuesta de la ambigua (sin ella, prepareRun diría «target-ambiguous»).
    act(() => result.current.runLevel2([]));
    expect(worker.posted.at(-1)!.type).toBe("export-model");
    reply(worker, "export-model", {
      payload_b64: "QUJD",
      versions: {
        pyodide: "0.27",
        sklearn: "1.5",
        python: "3.12",
        xgboost: "2.1",
        lightgbm: "4.5",
      },
      schema: {
        numeric: sent.numeric,
        categorical: sent.categorical,
        target: "ocupantes",
        task: "numerica",
        target_stats: {
          mean: 3,
          std: 1,
          min: 1,
          max: 6,
          median: 3,
          decimals: 0,
        },
      },
      training_profile: { numeric: {}, categorical: {} },
    });
    expect(worker.posted.at(-1)).toMatchObject({
      type: "train",
      payload: { task: "numerica", target: "ocupantes" },
    });
    expect(result.current.state.level2).toMatchObject({ status: "running" });

    act(() => result.current.cancelLevel2());
    expect(result.current.state.level2).toEqual({ status: "cancelled" });
    expect(result.current.state.result?.task).toBe("numerica");
    expect(vi.mocked(recordLeagueRun).mock.lastCall?.[0]).toMatchObject({
      task: "numerica",
      level: 2,
      cancelled: true,
    });
  });

  it("cantidad: plan con unidad → liga → resultado en unidades → elegir otro → puntuar", () => {
    const { result } = renderHook(() => useExperiment());
    act(() => result.current.loadCsv(CONSUMO, "consumo-energia.csv"));
    act(() => result.current.selectTarget("consumo_kwh"));
    const plan = result.current.state.plan!;
    expect(plan.resolved).toBe("numerica");
    expect(plan.unit).toEqual({ symbol: "kWh" });
    expect(plan.routing).not.toBeNull();

    act(() => result.current.run("consumo_kwh"));
    const worker = FakeWorker.last!;
    const sent = worker.posted.at(-1)!.payload as PipelinePayload;
    expect(sent.task).toBe("numerica");
    expect(sent.primary_metric).toBe("mae");
    const py = regressionPipelineResult(sent);
    reply(worker, "train", py);

    const state = result.current.state;
    expect(state.phase).toBe("results");
    const res = state.result as RegressionResult;
    expect(res.task).toBe("numerica");
    expect(res.unit.symbol).toBe("kWh");
    expect(state.modelMeta?.schema).toMatchObject({
      task: "numerica",
      target: "consumo_kwh",
      target_stats: py.target_stats,
    });
    // El breadcrumb lleva la tarea y nada del dataset (regla dura 2).
    expect(vi.mocked(recordLeagueRun).mock.lastCall?.[0]).toMatchObject({
      task: "numerica",
    });

    const other = sent.roster.find((id) => id !== res.modelName)!;
    act(() => result.current.chooseMember(other));
    reply(worker, "fit-member", regressionMemberFit(py, other));
    expect(result.current.state.result?.modelName).toBe(other);
    expect(result.current.state.result?.selection.by).toBe("user");

    act(() => result.current.goToScoring());
    const features = [...sent.numeric, ...sent.categorical];
    act(() =>
      result.current.scoreCsv(
        [features.join(","), features.map(() => "1").join(",")].join("\n"),
        "nuevas.csv",
      ),
    );
    reply(worker, "score", {
      task: "numerica",
      predictions: [321.4],
      probabilities: null,
      novelty: { columns: [], affected_rows: 0, n_rows: 1 },
    });
    expect(result.current.state.scoring.status).toBe("scored");
  });

  it("un puntaje con forma de clasificación para un modelo que estima se rechaza", () => {
    const { result } = renderHook(() => useExperiment());
    act(() => result.current.loadCsv(CONSUMO, "consumo-energia.csv"));
    act(() => result.current.run("consumo_kwh"));
    const worker = FakeWorker.last!;
    reply(
      worker,
      "train",
      regressionPipelineResult(
        worker.posted.at(-1)!.payload as PipelinePayload,
      ),
    );
    act(() => result.current.goToScoring());
    const sent = worker.posted[0]!.payload as PipelinePayload;
    const features = [...sent.numeric, ...sent.categorical];
    act(() =>
      result.current.scoreCsv(
        [features.join(","), features.map(() => "1").join(",")].join("\n"),
        "nuevas.csv",
      ),
    );
    reply(worker, "score", {
      task: "binaria",
      predictions: ["si"],
      probabilities: [0.9],
      positive_class: "si",
      novelty: { columns: [], affected_rows: 0, n_rows: 1 },
    });
    expect(result.current.state.scoring).toEqual({
      status: "error",
      kind: "runtime",
    });
  });

  it("ambigua: sin respuesta no se entrena; «cantidad» planea la regresión; «categorías», la multiclase (S7)", () => {
    const { result } = renderHook(() => useExperiment());
    act(() => result.current.loadCsv(CONSUMO, "consumo-energia.csv"));
    act(() => result.current.selectTarget("ocupantes"));
    expect(result.current.state.plan).toMatchObject({
      resolved: "ambigua",
      choice: null,
      routing: null,
    });

    act(() => result.current.answerTask("numerica"));
    expect(result.current.state.plan).toMatchObject({
      resolved: "numerica",
      choice: "numerica",
      unit: { symbol: null },
    });
    expect(result.current.state.plan?.routing).not.toBeNull();
    act(() => result.current.run("ocupantes"));
    const sent = FakeWorker.last!.posted.at(-1)!.payload as PipelinePayload;
    expect(sent).toMatchObject({ task: "numerica", target: "ocupantes" });

    // S7 (cambio esperado, R13): «Categorías» planea la multiclase.
    act(() => result.current.answerTask("multiclase"));
    expect(result.current.state.plan).toMatchObject({
      resolved: "multiclase",
      blocked: null,
    });
    expect(result.current.state.plan?.routing).not.toBeNull();
    act(() => result.current.run("ocupantes"));
    const sentMulti = FakeWorker.last!.posted.at(-1)!.payload as PipelinePayload;
    expect(sentMulti).toMatchObject({
      task: "multiclase",
      target: "ocupantes",
      primary_metric: "balanced_accuracy",
    });

    // Un objetivo nuevo vuelve a preguntar.
    act(() => result.current.selectTarget("consumo_kwh"));
    act(() => result.current.selectTarget("ocupantes"));
    expect(result.current.state.plan?.choice).toBeNull();
  });
});

describe("la model card al estimar (sección «Estimación»)", () => {
  const card = (result: RegressionResult, target = "consumo_kwh") =>
    buildModelCard({
      locale: "es",
      datasetName: "consumo-energia.csv",
      cols: 7,
      numericFeatures: 4,
      categoricalFeatures: 2,
      target,
      seed: 42,
      result,
      verifiedNarrative: null,
      date: new Date(2026, 9, 4),
    });

  it("tarea, unidad, el objetivo en train, errores y «la IA no aplica»; sin clases", () => {
    const md = card(regressionResult());
    expect(md).toContain("## Estimación");
    expect(md).toContain("Objetivo: «consumo_kwh» (estimar una cantidad)");
    expect(md).toContain(`Unidad: kWh, leída del nombre de la columna.`);
    expect(md).toContain(
      `media 374.7${NBSP}kWh, desviación 114.2${NBSP}kWh, mínimo 148.8${NBSP}kWh, mediana 365.4${NBSP}kWh, máximo 840.5${NBSP}kWh (escrito con 1 decimal)`,
    );
    expect(md).toContain("Narración con IA: no aplica a estimar una cantidad");
    expect(md).toContain("estratificado por 5 bandas del objetivo");
    expect(md).toContain(
      "Baselines: la mediana del objetivo y la regresión lineal.",
    );
    expect(md).not.toContain("clase positiva");
    expect(md).not.toContain("Clase mayoritaria");
    // Las importancias, en unidades (AU-S6-21).
    expect(md).toMatch(
      new RegExp(`\\| ocupantes \\| .* \\| 61\\.1${NBSP}kWh \\|`),
    );
  });

  it("métricas en unidades contra mediana y lineal, y el MISMO veredicto que la pantalla", () => {
    const md = card(regressionResult());
    expect(md).toContain("| Métrica | Modelo | Mediana | Regresión lineal |");
    expect(md).toContain(
      `| MAE | 33.5${NBSP}kWh | 80.9${NBSP}kWh | 43.8${NBSP}kWh |`,
    );
    expect(md).toContain("| R² | 0.80 | 0.00 | 0.73 |");
    expect(md).toContain(
      `**«Ridge» supera al baseline** — En promedio se equivoca por ±33.5${NBSP}kWh; una regresión lineal se equivoca por ±43.8${NBSP}kWh: un 24${NBSP}% menos de error.`,
    );
  });

  it("sin MAPE (objetivo con ceros) se escribe «—»; Ridge se llama como al estimar", () => {
    const py = regressionPipelineResult({ roster: ["ridge"], cv_k: 5 });
    const md = card(
      regressionResult({ ...py, model: { ...py.model, mape: null } }),
    );
    expect(md).toMatch(/\| MAPE \| — \|/);
    expect(md).toContain("Modelo elegido: Regresión Ridge.");
  });
});

describe("la ficha al estimar", () => {
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
    };
  });

  it("un modelo compartido suma su párrafo de regresión y su nombre de esta tarea", () => {
    ui(
      <FichaModelo
        target={{ id: "ridge", status: { kind: "winner" }, task: "numerica" }}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Regresión Ridge" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(REGRESSION_NOTES.ridge.es),
    ).toBeInTheDocument();
    // Nada de lo que solo vale al clasificar (probabilidad, AUC, «la clase»).
    expect(dialog.textContent).not.toMatch(/AUC|probabilidad|la clase/);
  });

  it("al clasificar, la misma ficha no lo trae; la mediana tiene ficha propia", () => {
    const { unmount } = ui(
      <FichaModelo
        target={{ id: "ridge", status: { kind: "winner" } }}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText(REGRESSION_NOTES.ridge.es)).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Clasificador Ridge" }),
    ).toBeInTheDocument();
    unmount();
    ui(
      <FichaModelo
        target={{
          id: "median",
          status: { kind: "baseline" },
          task: "numerica",
        }}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Mediana" }),
    ).toBeInTheDocument();
  });
});
