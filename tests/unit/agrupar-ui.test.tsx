// S7 (ADR 016, F3): agrupar en la app. La pantalla de resultados LEE (la lectura
// contra datos sin estructura + la estabilidad) en vez de dar un veredicto, dice
// qué distingue a cada grupo, deja elegir otro agrupador y descargar las filas con
// su grupo; la muestra del jerárquico (decisión 8 del usuario) se dice donde se
// lee el resultado. Puntuar asigna grupos; el import resume el archivo. P13: las
// etiquetas por fila se piden al worker al descargar y no pasan por el estado.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
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
import { ClusterResults } from "@/components/ClusterResults";
import { ConfigScreen } from "@/components/ConfigScreen";
import { RosterCard } from "@/components/RosterCard";
import {
  rosterFor,
  routeModels,
  type RouteProfile,
} from "@/engine/encarrilador";
import FichaModelo from "@/components/FichaModelo";
import { ScoreScreen } from "@/components/ScoreScreen";
import { StartScreen } from "@/components/StartScreen";
import { TrainingScreen } from "@/components/TrainingScreen";
import { LOCALE_STORAGE_KEY } from "@/i18n/config";
import { I18nProvider } from "@/i18n/provider";
import { assembleClusterResult, summarizeDataset } from "@/lib/experiment";
import { downloadTextFile } from "@/lib/files";
import { buildClusterCard } from "@/lib/modelcard";
import { packModelFile } from "@/lib/model-file";
import { useExperiment, type ModelMeta } from "@/lib/useExperiment";
import type {
  ClusterPipelineResult,
  ClusterResult,
  ExportResult,
  ScoreResult,
} from "@/workers/protocol";

vi.mock("@/lib/files", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/files")>()),
  downloadTextFile: vi.fn(),
}));

const fixture = <T,>(name: string) =>
  JSON.parse(
    readFileSync(
      resolve(process.cwd(), "tests/fixtures/contrato", `${name}.json`),
      "utf8",
    ),
  ) as T;

const TRAIN = fixture<ClusterPipelineResult>("train-result-agrupar");
const clusterResult = (): ClusterResult => assembleClusterResult(TRAIN);

const ui = (children: ReactNode) =>
  render(<I18nProvider>{children}</I18nProvider>);

const BINARY_OR_TEST =
  /clase positiva|supera al baseline|conjunto de prueba ·|Validación cruzada ·/;

function screenFor(result: ClusterResult, extra: Record<string, unknown> = {}) {
  const props = {
    result,
    datasetName: "segmentos-clientes.csv",
    cols: 5,
    runMeta: {
      target: null,
      numericFeatures: 3,
      categoricalFeatures: 1,
      seed: 42,
      excluded: [],
    },
    sanitation: null,
    onAgain: vi.fn(),
    onUseModel: vi.fn(),
    onExportModel: vi.fn(),
    exportState: "idle" as const,
    routing: null,
    choice: { status: "idle" as const },
    onChoose: vi.fn(),
    onDownloadLabels: vi.fn(),
    ...extra,
  };
  return { ...ui(<ClusterResults {...props} />), props };
}

/** Un resultado con el jerárquico en modo muestra (más de AGGLO_MAX_ROWS filas). */
function sampled(): ClusterResult {
  const base = clusterResult();
  return {
    ...base,
    nRows: 12000,
    league: base.league.map((row) =>
      row.name === "agglomerative" ? { ...row, sample_rows: 8000 } : row,
    ),
    assignment: { ...base.assignment, sample_rows: 8000 },
  };
}

afterEach(() => {
  vi.clearAllMocks();
  window.localStorage.removeItem(LOCALE_STORAGE_KEY);
});

describe("S7: Resultados al agrupar (sin veredicto ni prueba)", () => {
  it("la lectura es el h1, con su porqué en cifras; dice que no hay prueba ni baseline", () => {
    const { container } = screenFor(clusterResult());
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Los grupos existen: 3 grupos estables",
    );
    expect(
      screen.getByText(
        /puntaje 0\.48 frente a 0\.23, una diferencia de 0\.25 \(hace falta al menos 0\.10\)/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /se parecen en 0\.88 de 1 \(hace falta al menos 0\.70\)/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /no hay conjunto de prueba ni veredicto contra un baseline/,
      ),
    ).toBeInTheDocument();
    // Ni marcas binarias ni columnas de la liga con objetivo.
    expect(container.textContent).not.toMatch(BINARY_OR_TEST);
    // La marca de la lectura no reusa ◆, que en toda la app es «Elegido por ti»
    // (Mauricio lee por símbolo, no por color): «existen» lleva ●.
    expect(screen.getByText("●")).toBeInTheDocument();
    expect(container.textContent).not.toContain("◆");
  });

  it.each([
    [
      "fragile",
      "Hay 3 grupos, pero son frágiles",
      /Léelos como una partición posible/,
    ],
    ["none", "No hay estructura de grupos", /no un hallazgo/],
  ] as const)(
    "lectura «%s»: su titular y su porqué",
    (level, headline, detail) => {
      const base = clusterResult();
      screenFor({ ...base, reading: { ...base.reading, level } });
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
        headline,
      );
      expect(screen.getByText(detail)).toBeInTheDocument();
    },
  );

  it("qué distingue a cada grupo: las columnas que separan, en las unidades del usuario", () => {
    screenFor(clusterResult());
    expect(
      screen.getByRole("heading", { name: "Qué distingue a los 3 grupos" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Lo que más separa a los grupos: «gasto_mensual_usd» \(η² 0\.95\)/,
      ),
    ).toBeInTheDocument();
    for (const n of [1, 2, 3]) {
      expect(
        screen.getByRole("heading", { name: `Grupo ${n}` }),
      ).toBeInTheDocument();
    }
    expect(
      screen.getAllByText(
        /«gasto_mensual_usd»: [\d,.]+ \(promedio de los grupos: [\d,.]+\)/,
      ),
    ).toHaveLength(3);
    expect(screen.getAllByText(/«canal»: sobre todo «/)).toHaveLength(3);
  });

  it("una cifra diminuta (~1e-11) no se muestra como «0»", () => {
    const base = clusterResult();
    const tiny = {
      ...base,
      profiles: {
        ...base.profiles,
        groups: base.profiles.groups.map((g, i) => ({
          ...g,
          numeric: { ...g.numeric, gasto_mensual_usd: (i + 1) * 1.2e-11 },
        })),
      },
    };
    screenFor(tiny);
    expect(
      screen.getByText(/«gasto_mensual_usd»: 1\.20e-11/),
    ).toBeInTheDocument();
  });

  it("la tabla de agrupadores: el consenso, el ganador ★ y elegir otro", () => {
    const { props } = screenFor(clusterResult());
    const table = screen.getByRole("region", { name: "Los agrupadores: 4" });
    expect(
      screen.getByText(/Consenso: 3 de 4 agrupadores encontraron 3 grupos/),
    ).toBeInTheDocument();
    const winner = within(table)
      .getAllByRole("row")
      .find((r) => r.textContent?.includes("Ganador por consenso"))!;
    expect(
      within(winner).getByRole("button", { name: /Ficha de Jerárquico/ }),
    ).toBeInTheDocument();
    expect(within(table).getAllByText("3 · silueta")).toHaveLength(1);
    expect(within(table).getByText("3 · BIC")).toBeInTheDocument();
    expect(within(table).getByText("3 · densidad")).toBeInTheDocument();
    fireEvent.click(
      within(table).getAllByRole("button", { name: /Elegir K-Means/ })[0]!,
    );
    expect(props.onChoose).toHaveBeenCalledWith("kmeans");
  });

  it("descargar las filas con su grupo pide las etiquetas con los nombres del idioma", () => {
    const { props } = screenFor(clusterResult());
    fireEvent.click(
      screen.getByRole("button", { name: /Descargar filas con su grupo/ }),
    );
    expect(props.onDownloadLabels).toHaveBeenCalledWith({
      column: "grupo",
      noise: "fuera de todo grupo",
      fileSuffix: "agrupado",
    });
  });

  it("si el modelo ya no guarda las etiquetas, se dice (no un error genérico)", () => {
    screenFor(clusterResult(), { labels: "unavailable" });
    expect(screen.getByRole("alert").textContent).toMatch(
      /ya no guarda el grupo de tus filas/,
    );
  });
});

describe("S7 (decisión 8): la muestra del jerárquico, donde se lee el resultado", () => {
  it("junto a la lectura (si gana) y en su fila, con el porqué en llano (ES)", () => {
    screenFor(sampled());
    const reading = screen.getByRole("heading", { level: 1 }).closest("div")!;
    expect(reading.parentElement!.textContent).toMatch(
      /Ajustado sobre una muestra de 8,000 de tus 12,000 filas; las demás se asignaron al grupo más cercano\..*memoria.*teléfono.*Los demás agrupadores usan todas tus filas/,
    );
    const table = screen.getByRole("region", { name: "Los agrupadores: 4" });
    expect(
      within(table).getByText(
        /Ajustado sobre una muestra de 8,000 de tus 12,000 filas/,
      ),
    ).toBeInTheDocument();
  });

  it("en inglés, con separador de miles inglés", () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    screenFor(sampled());
    expect(
      screen.getAllByText(/Fitted on a sample of 8,000 of your 12,000 rows/)
        .length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("sin modo muestra, ninguna nota", () => {
    screenFor(clusterResult());
    expect(screen.queryByText(/Ajustado sobre una muestra/)).toBeNull();
  });

  it("la model card la registra, con su límite", () => {
    const md = buildClusterCard({
      locale: "es",
      datasetName: "grande.csv",
      cols: 5,
      seed: 42,
      excluded: [],
      result: sampled(),
      date: new Date(2026, 9, 4),
    });
    expect(md).toContain(
      "Ajustado sobre una muestra de 8,000 de tus 12,000 filas",
    );
    expect(md).toContain(
      "Con más de 8,000 filas, el jerárquico se ajusta sobre una muestra",
    );
  });
});

describe("S7: la model card de agrupar", () => {
  const card = (locale: "es" | "en") =>
    buildClusterCard({
      locale,
      datasetName: "segmentos-clientes.csv",
      cols: 5,
      seed: 42,
      excluded: [{ column: "fecha_alta", reason: "date" }],
      result: clusterResult(),
      date: new Date(2026, 9, 4),
    });

  // S7 (AU-S7-04): con 20,000 filas el Nivel 1 corre solo K-Means y GMM. La card describe a
  // los que compitieron, no a los cuatro.
  it.each(["es", "en"] as const)(
    "en %s, la card nombra solo a los agrupadores que compitieron",
    (locale) => {
      const full = clusterResult();
      const two = full.league.filter(
        (r) => r.name === "kmeans" || r.name === "gmm",
      );
      const md = buildClusterCard({
        locale,
        datasetName: "grande.csv",
        cols: 5,
        seed: 42,
        excluded: [],
        result: {
          ...full,
          league: two,
          selection: { ...full.selection, competitors: two.length },
        },
        date: new Date(2026, 9, 4),
      });
      const line = md
        .split("\n")
        .find((l) => /Compitieron|clusterers competed/.test(l))!;
      expect(line).toMatch(/\b2\b/);
      expect(line, "la card nombra un agrupador que no corrió").not.toMatch(
        /HDBSCAN|Jerárquico|Hierarchical/,
      );
      expect(line).toMatch(/K-Means/);
      expect(line).toMatch(/GMM/);
    },
  );

  it("lectura, liga, grupos y regla; fuga e IA «no aplica»; sin prueba ni etiquetas", () => {
    const md = card("es");
    expect(md).toContain("## Lectura (sirve para creer)");
    expect(md).toContain("**Los grupos existen: 3 grupos estables**");
    expect(md).toContain("## Los agrupadores (sirve para elegir)");
    expect(md).toContain(
      "Ganó por consenso: 3 de 4 agrupadores encontraron 3 grupos",
    );
    expect(md).toContain("- Grupo 1:");
    expect(md).toContain("«fecha_alta» no entra: es una fecha");
    expect(md).toContain("No aplica: al agrupar no hay objetivo");
    expect(md).toContain("Narración con IA: no aplica");
    expect(md).not.toMatch(/clase positiva|Prueba: \d+ filas/);
    expect(md).not.toContain('"labels"');
  });

  it("en inglés", () => {
    const md = card("en");
    expect(md).toContain("**The groups are real: 3 stable groups**");
    expect(md).toContain("Not applicable: grouping has no target");
  });
});

describe("S7: asignar filas nuevas a un grupo (puntuar al agrupar)", () => {
  const META: ModelMeta = {
    source: "trained",
    datasetName: "segmentos-clientes.csv",
    manifest: null,
    schema: {
      numeric: ["gasto_mensual_usd", "visitas_mes"],
      categorical: [],
      task: "agrupar",
      groups: 3,
      noise: true,
      assign: { method: "centroid-radius", sample_rows: null },
    },
  };
  const table = {
    headers: ["gasto_mensual_usd", "visitas_mes"],
    rows: [
      ["100", "2"],
      ["900", "9"],
      ["99999", "0"],
    ],
  };
  const score: ScoreResult = {
    task: "agrupar",
    predictions: [0, 2, -1],
    probabilities: null,
    novelty: { columns: [], affected_rows: 0, n_rows: 3 },
  };

  it("el grupo de cada fila (desde 1), «fuera de todo grupo», la regla y el CSV", () => {
    ui(
      <ScoreScreen
        meta={META}
        ready
        progress={null}
        scoring={{
          status: "scored",
          fileName: "nuevos.csv",
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
      screen.getByText("Modelo: segmentos-clientes.csv · 3 grupos"),
    ).toBeInTheDocument();
    expect(screen.getByText("Grupos asignados (3 filas)")).toBeInTheDocument();
    expect(
      screen.getByText(
        /salvo que la fila quede más lejos que el miembro más lejano/,
      ),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /Descargar CSV puntuado/ }),
    );
    expect(vi.mocked(downloadTextFile).mock.lastCall?.[1]).toBe(
      "gasto_mensual_usd,visitas_mes,grupo\n100,2,1\n900,9,3\n99999,0,fuera de todo grupo\n",
    );
  });

  it("la columna que hay que traer no menciona un objetivo", () => {
    ui(
      <ScoreScreen
        meta={META}
        ready
        progress={null}
        scoring={{ status: "idle" }}
        exportState="idle"
        onScoreFile={vi.fn()}
        onScoreAnother={vi.fn()}
        onBackToResults={vi.fn()}
        onExit={vi.fn()}
        onExportModel={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/Al agrupar no hay objetivo: basta con estas columnas/),
    ).toBeInTheDocument();
  });
});

describe("S7: importar un archivo de agrupar", () => {
  it("el resumen dice sus grupos, su lectura y cómo se eligió", async () => {
    const file = await packModelFile({
      datasetName: "segmentos-clientes.csv",
      result: clusterResult(),
      exported: fixture<ExportResult>("export-result-agrupar"),
    });
    const onImport = vi.fn();
    ui(<StartScreen onLoad={vi.fn()} onImport={onImport} />);
    const input = document.querySelector(
      'input[accept=".json,application/json"]',
    )!;
    fireEvent.change(input, {
      target: {
        files: [
          new File([JSON.stringify(file)], "m.probeta.json", {
            type: "application/json",
          }),
        ],
      },
    });
    await waitFor(() =>
      expect(
        screen.getByText(/Agrupa filas sin objetivo: 3 grupos/),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText("Lectura al entrenar: los grupos existen"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Ganador entre 4 agrupadores (3 grupos)."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Usar este modelo/ }));
    expect(onImport).toHaveBeenCalledTimes(1);
  });
});

describe("S7: la ficha de un agrupador y la configuración", () => {
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

  it("la ficha del ganador por consenso, con su línea de estado", () => {
    ui(
      <FichaModelo
        target={{
          id: "kmeans",
          status: { kind: "consensus" },
          task: "agrupar",
        }}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(/ganador por consenso/),
    ).toBeInTheDocument();
  });

  it("sin consenso, la ficha del ganador dice «por puntaje»", () => {
    ui(
      <FichaModelo
        target={{ id: "kmeans", status: { kind: "score" }, task: "agrupar" }}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/ganador por puntaje/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/ganador por consenso/)).toBeNull();
  });

  it("«Sin objetivo: agrupar» es la primera opción; una columna que no sirve ofrece agrupar", () => {
    const dataset = summarizeDataset({
      headers: ["id", "x", "y"],
      rows: Array.from({ length: 30 }, (_, i) => [`c${i}`, `${i}`, `${i % 7}`]),
    });
    const onSelectCluster = vi.fn();
    const onSelectTarget = vi.fn();
    ui(
      <ConfigScreen
        dataset={dataset}
        sanitation={null}
        edaAlerts={null}
        plan={null}
        clusterPlan={null}
        onSelectTarget={onSelectTarget}
        onSelectCluster={onSelectCluster}
        onRun={vi.fn()}
        onRunCluster={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    const options = screen.getAllByRole("option");
    expect(options[1]!.textContent).toBe(
      "Sin objetivo: agrupar filas parecidas",
    );
    fireEvent.change(screen.getByLabelText("¿Qué quieres predecir?"), {
      target: { value: (options[1] as HTMLOptionElement).value },
    });
    expect(onSelectCluster).toHaveBeenCalledTimes(1);
    expect(onSelectTarget).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /Agrupar filas/ }),
    ).toBeDisabled();
  });

  it("una columna llamada como la opción de agrupar no choca con ella", async () => {
    const { clusterOptionValue } = await import("@/components/ConfigScreen");
    expect(clusterOptionValue(["a"])).toBe("__agrupar__");
    expect(clusterOptionValue(["__agrupar__", "__agrupar___"])).toBe(
      "__agrupar____",
    );
  });

  it("el progreso al agrupar: el barrido de cada agrupador y la lectura del ganador", () => {
    const { rerender } = ui(
      <TrainingScreen
        stage="training"
        cluster
        detail={{ phase: "cluster", member: "gmm", index: 2, total: 4 }}
      />,
    );
    expect(
      screen.getByText("Buscando grupos · agrupador 3 de 4: GMM"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Buscando grupos: cada agrupador prueba/),
    ).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "3",
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuemax",
      "5",
    );
    rerender(
      <I18nProvider>
        <TrainingScreen
          stage="training"
          cluster
          detail={{ phase: "stability", member: "gmm", index: 2, total: 4 }}
        />
      </I18nProvider>,
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "5",
    );
  });
});

describe("S7: el flujo de agrupar en el hook (P13: las etiquetas no pasan por el estado)", () => {
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
  const SEGMENTOS = readFileSync(
    resolve(process.cwd(), "docs/kit-de-prueba/segmentos-clientes.csv"),
    "utf8",
  );
  const reply = (
    worker: FakeWorker,
    id: number,
    command: string,
    result: unknown,
  ) =>
    act(() =>
      worker.onmessage?.({
        data: { id, type: "result", command, result },
      } as MessageEvent),
    );

  beforeEach(() => vi.stubGlobal("Worker", FakeWorker));
  afterEach(() => vi.unstubAllGlobals());

  it("planear → agrupar → resultado validado → descargar las filas con su grupo", () => {
    const { result } = renderHook(() => useExperiment());
    // Con una fila repetida al final: el saneamiento la quita (y aparta cliente_id),
    // pero el CSV que se descarga es la tabla del usuario ENTERA.
    const firstRow = SEGMENTOS.split("\n")[1]!;
    const withDuplicate = `${SEGMENTOS.trimEnd()}\n${firstRow}`;
    act(() => result.current.loadCsv(withDuplicate, "segmentos-clientes.csv"));
    act(() => result.current.selectCluster());
    const plan = result.current.state.clusterPlan;
    expect(plan?.ok).toBe(true);
    if (!plan?.ok) return;
    expect(plan.distance).toBe("numeric");
    expect(plan.routing.level1).toEqual([
      "kmeans",
      "agglomerative",
      "gmm",
      "hdbscan",
    ]);

    act(() => result.current.runCluster());
    const worker = FakeWorker.last!;
    const train = worker.posted.at(-1)!;
    expect(train.type).toBe("train");
    expect(train.payload).toMatchObject({
      task: "agrupar",
      distance: "numeric",
    });
    expect(train.payload).not.toHaveProperty("target");
    expect(result.current.state.runMeta?.target).toBeNull();

    reply(worker, train.id, "train", TRAIN);
    expect(result.current.state.phase).toBe("results");
    expect(result.current.state.result).toMatchObject({
      task: "agrupar",
      modelName: "agglomerative",
    });
    expect(result.current.state.modelMeta?.schema).toMatchObject({
      task: "agrupar",
      groups: 3,
      noise: false,
      categorical: [],
    });

    act(() =>
      result.current.downloadClusterLabels({
        column: "grupo",
        noise: "fuera de todo grupo",
        fileSuffix: "agrupado",
      }),
    );
    expect(result.current.state.labels).toBe("fetching");
    const ask = worker.posted.at(-1)!;
    expect(ask.type).toBe("cluster-labels");
    const labels = Array.from({ length: TRAIN.n_rows }, (_, i) => i % 3);
    reply(worker, ask.id, "cluster-labels", { labels });
    expect(result.current.state.labels).toBe("idle");
    const [name, csv] = vi.mocked(downloadTextFile).mock.lastCall!;
    expect(name).toMatch(/agrupado/);
    const lines = csv.trimEnd().split("\n");
    expect(lines[0]).toMatch(/,grupo$/);
    expect(lines[1]).toMatch(/,1$/);
    // La tabla del usuario, no la saneada: con su identificador, y la fila
    // repetida con el grupo de su gemela.
    expect(
      lines[0]!.startsWith("cliente_id,"),
      "el CSV no es la tabla del usuario: le falta cliente_id",
    ).toBe(true);
    expect(lines).toHaveLength(TRAIN.n_rows + 2);
    expect(lines.at(-1)).toBe(lines[1]);
    // P13: el estado nunca guardó las etiquetas.
    expect(JSON.stringify(result.current.state)).not.toContain('"labels":[');
  });

  // S7 (AU-S7-01): con basura en una numérica («?» que el saneamiento vacía), la fila sale
  // tal como llegó y cada fila recibe SU grupo: ni celdas perdidas ni grupos «NaN».
  it("con basura coaccionada, el CSV conserva la celda y ningún grupo sale «NaN»", () => {
    const { result } = renderHook(() => useExperiment());
    const [header, first, ...rest] = SEGMENTOS.trimEnd().split("\n");
    const cells = first!.split(",");
    cells[2] = "?"; // visitas_mes: una basura en una columna casi toda numérica
    const dirty = cells.join(",");
    // La fila con basura, más su duplicado exacto al final.
    const csvIn = [header, dirty, ...rest, dirty].join("\n");
    act(() => result.current.loadCsv(csvIn, "segmentos-clientes.csv"));
    act(() => result.current.selectCluster());
    act(() => result.current.runCluster());
    const worker = FakeWorker.last!;
    reply(worker, worker.posted.at(-1)!.id, "train", TRAIN);
    act(() =>
      result.current.downloadClusterLabels({
        column: "grupo",
        noise: "fuera de todo grupo",
        fileSuffix: "agrupado",
      }),
    );
    const ask = worker.posted.at(-1)!;
    const labels = Array.from({ length: TRAIN.n_rows }, (_, i) => i % 3);
    reply(worker, ask.id, "cluster-labels", { labels });
    const csv = vi.mocked(downloadTextFile).mock.lastCall![1];
    const lines = csv.trimEnd().split("\n");
    expect(lines[1], "la celda «?» se perdió").toBe(`${dirty},1`);
    expect(lines.at(-1), "el duplicado no recibió el grupo de su gemela").toBe(
      lines[1],
    );
    expect(csv, "un grupo salió «NaN»").not.toContain("NaN");
  });

  it("un resultado de agrupar que no cuadra con lo enviado se rechaza nombrando el campo", () => {
    const { result } = renderHook(() => useExperiment());
    act(() => result.current.loadCsv(SEGMENTOS, "segmentos-clientes.csv"));
    act(() => result.current.runCluster());
    const worker = FakeWorker.last!;
    reply(worker, worker.posted.at(-1)!.id, "train", { ...TRAIN, n_rows: 299 });
    expect(result.current.state.phase).toBe("error");
    expect(result.current.state.error).toEqual({
      kind: "contract",
      message: "n_rows",
    });
  });

  it("elegir otro agrupador manda el payload de agrupar sin roster, y el esquema pasa a ser el suyo", () => {
    const { result } = renderHook(() => useExperiment());
    act(() => result.current.loadCsv(SEGMENTOS, "segmentos-clientes.csv"));
    act(() => result.current.runCluster());
    const worker = FakeWorker.last!;
    reply(worker, worker.posted.at(-1)!.id, "train", TRAIN);
    // El fixture de fit-member es el de la mezcla gaussiana (Pyodide real).
    act(() => result.current.chooseMember("gmm"));
    const fit = worker.posted.at(-1)!;
    expect(fit.type).toBe("fit-member");
    expect(fit.payload).toMatchObject({ task: "agrupar", member: "gmm" });
    expect(fit.payload).not.toHaveProperty("roster");
    reply(worker, fit.id, "fit-member", fixture("fit-member-result-agrupar"));
    expect(result.current.state.result).toMatchObject({
      modelName: "gmm",
      selection: { by: "user" },
    });
    expect(result.current.state.modelMeta?.schema).toMatchObject({
      groups: 3,
      assign: { method: "gaussian" },
    });
  });
});

describe("S7: el copy de agrupar no dice lo que al agrupar no existe", () => {
  // Al agrupar no hay liga supervisada: ni validación cruzada, ni «la liga
  // completa», ni «N modelos», ni «gana el más simple». Lo reusado de la liga lo
  // decía (9.000 filas en el reconocimiento de la guía v4); cada superficie lleva
  // ahora su propio copy.
  const FALSE_FOR_CLUSTER =
    /misma validación cruzada|puntajes de validación cruzada|elegir por validación cruzada|la liga completa|La liga tardó|\b\d+ modelos?\b|gana el más simple/;
  const profile: RouteProfile = {
    task: "agrupar",
    rows: 9000,
    nTrain: 9000,
    width: 3,
    minorityShare: null,
    k: 10,
  };

  it("sin consenso: la tabla y la model card dicen «por puntaje», no «consenso»", () => {
    const base = clusterResult();
    const result: ClusterResult = {
      ...base,
      selection: { ...base.selection, votes: 1, voters: 3 },
    };
    const { container } = screenFor(result);
    expect(
      screen.getByText(
        "Sin consenso: cada agrupador encontró un número distinto de grupos, así que gana el de mayor puntaje.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Ganador por puntaje")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Consenso:|Ganador por consenso/);
    const md = buildClusterCard({
      locale: "es",
      datasetName: "segmentos-clientes.csv",
      cols: 5,
      seed: 42,
      excluded: [],
      result,
    });
    expect(md).toContain(
      "Ganó por puntaje: no hubo consenso entre los 3 agrupadores",
    );
    expect(md).not.toContain("Ganó por consenso");
  });

  it("quién compite, el Nivel 2 pendiente y su corrida hablan de agrupadores", () => {
    const routing = routeModels(profile);
    expect(rosterFor(routing, 2)).toContain("agglomerative");
    const roster = ui(
      <RosterCard
        routing={routing}
        rows={120}
        minorityShare={null}
        k={10}
        smallSample
        cluster
      />,
    );
    expect(roster.container.textContent).toMatch(/\d+ agrupador/);
    expect(roster.container.textContent).toMatch(/la silueta y la estabilidad/);
    expect(roster.container.textContent).not.toMatch(FALSE_FOR_CLUSTER);
    roster.unmount();

    const base = clusterResult();
    const pending: ClusterResult = {
      ...base,
      smallSample: true,
      league: base.league.filter((row) => row.name !== "hdbscan"),
    };
    const { container, unmount } = screenFor(pending, {
      profile,
      onRunLevel2: vi.fn(),
    });
    expect(
      screen.getByRole("heading", { name: "Nivel 2: todos los agrupadores" }),
    ).toBeInTheDocument();
    expect(container.textContent).toMatch(/El agrupamiento tardó/);
    expect(container.textContent).not.toMatch(FALSE_FOR_CLUSTER);
    unmount();

    const running = ui(
      <TrainingScreen
        stage="training"
        cluster
        level2={{ count: 4, estimateS: 8 }}
      />,
    );
    expect(running.container.textContent).toMatch(/Nivel 2 · 4 agrupadores/);
    expect(running.container.textContent).not.toMatch(FALSE_FOR_CLUSTER);
  });
});
