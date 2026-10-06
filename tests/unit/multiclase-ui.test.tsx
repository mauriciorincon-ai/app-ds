// S7: la multiclase en la UI. (1) La narración con IA no la narra — cero llamadas
// al route, plantilla local (P10, R2). (2) Sus superficies (resultados, liga,
// puntuar, ficha, model card) no muestran marcas binarias: ni «clase positiva» ni
// la matriz 2×2 (gate 3 del despacho, P2).
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
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ConfigScreen } from "@/components/ConfigScreen";
import FichaModelo from "@/components/FichaModelo";
import { ConfusionTable, topConfusion } from "@/components/MulticlassResults";
import { ResultsScreen } from "@/components/ResultsScreen";
import { ScoreScreen } from "@/components/ScoreScreen";
import { MULTICLASS_FICHA_FIELDS } from "@/content/modelos";
import { BASELINE_IDS_BY_TASK, ROSTER_BY_TASK } from "@/engine/roster";
import { LOCALE_STORAGE_KEY } from "@/i18n/config";
import { I18nProvider } from "@/i18n/provider";
import { computeEdaAlerts } from "@/engine/eda";
import { sanitizeTable } from "@/engine/sanitize";
import { parseCsvWithLimits } from "@/lib/ds/csv";
import { assembleMulticlassResult, summarizeDataset } from "@/lib/experiment";
import { downloadTextFile } from "@/lib/files";
import { buildModelCard } from "@/lib/modelcard";
import type { ModelMeta } from "@/lib/useExperiment";
import { useNarration } from "@/lib/useNarration";
import type { MulticlassPipelineResult } from "@/workers/protocol";

vi.mock("@/lib/files", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/files")>()),
  downloadTextFile: vi.fn(),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider>{children}</I18nProvider>
);

const multiclassResult = (
  leakage: Parameters<typeof assembleMulticlassResult>[1] = [],
) =>
  assembleMulticlassResult(
    JSON.parse(
      readFileSync(
        resolve(
          process.cwd(),
          "tests/fixtures/contrato/train-result-multiclase.json",
        ),
        "utf8",
      ),
    ) as MulticlassPipelineResult,
    leakage,
  );

const ui = (children: ReactNode) =>
  render(<I18nProvider>{children}</I18nProvider>);

const BINARY_MARKS = /clase positiva|Pred 0|Real 1|positive class/i;

describe("S7 (P10): la narración con IA no narra varias categorías", () => {
  it("cerrojo del cliente: pedir la narración NO llama al route; la plantilla existe", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { result } = renderHook(
      () =>
        useNarration({
          result: multiclassResult(),
          target: "plan",
          cols: 7,
        }),
      { wrapper },
    );
    expect(result.current.aiAvailable).toBe(false);
    act(() => result.current.requestNarration());
    expect(result.current.ai.kind).toBe("idle");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.template).toContain("exactitud balanceada");
    fetchSpy.mockRestore();
  });
});

describe("S7: la model card de varias categorías (sin marcas binarias)", () => {
  const card = (locale: "es" | "en") =>
    buildModelCard({
      locale,
      datasetName: "planes-suscripcion.csv",
      cols: 7,
      numericFeatures: 4,
      categoricalFeatures: 2,
      target: "plan",
      seed: 42,
      result: multiclassResult(),
      verifiedNarrative: null,
      date: new Date(2026, 9, 4),
    });

  it("la tarea, la exactitud balanceada con su azar, la matriz K×K y las clases; la IA no aplica", () => {
    const md = card("es");
    const k = multiclassResult().classes.length;
    expect(md).toContain(`clasificación en ${k} categorías`);
    expect(md).toContain("Exactitud balanceada");
    expect(md).toContain(`adivinar al azar da ${(1 / k).toFixed(2)}`);
    expect(md).toContain("## Categorías (sobre prueba)");
    for (const name of multiclassResult().classes) expect(md).toContain(name);
    expect(md).toContain("Narración con IA: no aplica");
    expect(md).not.toMatch(/clase positiva/i);
    expect(md).not.toContain("clasificación binaria");
  });

  it("en inglés tampoco habla de una clase positiva", () => {
    const md = card("en");
    expect(md).toContain("Balanced accuracy");
    expect(md).not.toMatch(/positive class/i);
  });
});

describe("S7: Resultados con varias categorías (sin marcas binarias)", () => {
  afterEach(() => vi.restoreAllMocks());

  const screenFor = (result = multiclassResult()) =>
    ui(
      <ResultsScreen
        result={result}
        datasetName="planes-suscripcion.csv"
        cols={7}
        runMeta={{
          target: "plan",
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

  it("veredicto en exactitud balanceada, «cuál mirar» con el azar, matriz K×K con ✓ en la diagonal y sin IA", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { container } = screenFor();
    const result = multiclassResult();
    const k = result.classes.length;
    // En el fixture gana la logística multinomial y empata con el baseline que
    // decide, que es ella misma: se dice así (AU-S5-01), no «empata con el baseline».
    expect(result.verdict.level).toBe("ties");
    expect(
      screen.getByRole("heading", { level: 1 }).textContent,
    ).toBe("La liga no encontró nada mejor que la regresión de referencia");
    expect(
      screen.getByText(/Métrica principal: Exactitud balanceada/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        new RegExp(`Con ${k} categorías, adivinar al azar da ${(1 / k).toFixed(2)}`),
      ),
    ).toBeInTheDocument();
    // La matriz: una región desplazable con nombre; K filas de datos.
    const region = screen.getByRole("region", {
      name: "Matriz de confusión (prueba)",
    });
    const rows = within(region).getAllByRole("row");
    expect(rows).toHaveLength(k + 1);
    // Los nombres de las filas quedan fijos al desplazar la matriz de lado (con 20
    // categorías a 360 px se perdía de qué fila era cada cifra).
    for (const header of within(region).getAllByRole("rowheader")) {
      expect(header.className, "la columna de nombres no queda fija").toMatch(
        /\bsticky\b.*\bleft-0\b|\bleft-0\b.*\bsticky\b/,
      );
    }
    // Los aciertos llevan ✓ y su nombre para el lector (no solo color).
    expect(within(region).getAllByText("✓")).toHaveLength(k);
    expect(within(region).getAllByText(/acierto:/)).toHaveLength(k);
    // Dónde se equivoca, en palabras.
    expect(
      screen.getByText(/La confusión más frecuente: filas de «premium» que el modelo tomó por «empresa» \(5 en la prueba\)/),
    ).toBeInTheDocument();
    // Ni «clase positiva» ni la matriz 2×2 de la binaria.
    expect(container.textContent).not.toMatch(BINARY_MARKS);
    // La IA no narra varias categorías, y se dice.
    expect(screen.queryByRole("button", { name: /Narrar con IA/ })).toBeNull();
    expect(
      screen.getByText(/Con varias categorías, la lectura es el texto estándar/),
    ).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("la fuga por clase nombra la columna Y la categoría", () => {
    screenFor(
      multiclassResult([
        {
          column: "descuento_estudiantil",
          score: 1,
          reason: "category-purity",
          class: "estudiante",
        },
      ]),
    );
    expect(
      screen.getByText(
        "La columna «descuento_estudiantil» separa casi a la perfección la categoría «estudiante» del resto: podría ser un proxy del objetivo.",
      ),
    ).toBeInTheDocument();
    // La fuga delata UNA categoría: el titular dice la sospecha, no «casi
    // perfectas» (con la fuga plantada del kit la cifra global es 0.78).
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Posible fuga de datos — sospechoso",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/casi perfectas/)).toBeNull();
  });

  it("la liga muestra la exactitud balanceada con 3 decimales", () => {
    screenFor();
    expect(
      screen.getByRole("columnheader", {
        name: "Validación cruzada · Exactitud balanceada",
      }),
    ).toBeInTheDocument();
    const logistic = multiclassResult().league.find((r) => r.name === "logistic")!;
    expect(screen.getByText(logistic.cv!.mean.toFixed(3))).toBeInTheDocument();
  });

  it("topConfusion: la celda más grande fuera de la diagonal; sin errores, null", () => {
    expect(
      topConfusion([
        [5, 1, 0],
        [0, 4, 3],
        [2, 0, 6],
      ]),
    ).toEqual({ real: 1, predicted: 2, count: 3 });
    expect(
      topConfusion([
        [2, 0],
        [0, 2],
      ]),
    ).toBeNull();
  });
});

describe("S7: puntuar con varias categorías («<objetivo>_predicho» + su probabilidad)", () => {
  const META: ModelMeta = {
    source: "trained",
    datasetName: "planes-suscripcion.csv",
    manifest: null,
    schema: {
      numeric: ["uso_gb_mes"],
      categorical: [],
      target: "plan",
      classes: ["basico", "estandar", "premium"],
      task: "multiclase",
    },
  };
  const table = { headers: ["uso_gb_mes"], rows: [["3"], ["40"], ["90"]] };

  it("la categoría predicha, la probabilidad de ESA categoría, la distribución y el CSV", () => {
    const { container } = ui(
      <ScoreScreen
        meta={META}
        ready
        progress={null}
        scoring={{
          status: "scored",
          fileName: "nuevos.csv",
          table,
          check: { ok: true, missing: [], extra: [], targetPresent: false },
          score: {
            task: "multiclase",
            predictions: ["basico", "estandar", "premium"],
            probabilities: [0.9, 0.45, 0.6],
            novelty: { columns: [], affected_rows: 0, n_rows: 3 },
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
    expect(
      screen.getByText("Modelo: planes-suscripcion.csv · objetivo: plan · 3 categorías"),
    ).toBeInTheDocument();
    expect(screen.getByText("plan_predicho")).toBeInTheDocument();
    expect(screen.getByText("plan_probabilidad")).toBeInTheDocument();
    expect(
      screen.getByText(/La probabilidad es la de la categoría predicha/),
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(BINARY_MARKS);
    fireEvent.click(
      screen.getByRole("button", { name: /Descargar CSV puntuado/ }),
    );
    expect(vi.mocked(downloadTextFile).mock.lastCall?.[1]).toBe(
      "uso_gb_mes,plan_predicho,plan_probabilidad\n3,basico,0.9000\n40,estandar,0.4500\n90,premium,0.6000\n",
    );
  });
});

// S7, Fase 2 de la auditoría (AU-S7-33, AU-S7-36): los conteos con miles en las dos
// lenguas (R9), el porcentaje con el espacio de su idioma, y sin probabilidad no se
// promete «ordenar por riesgo» (eso es de la binaria).
describe("S7 (auditoría): cifras y frases de varias categorías", () => {
  const scoreWith = (
    predictions: string[],
    probabilities: number[] | null,
  ) =>
    ui(
      <ScoreScreen
        meta={{
          source: "trained",
          datasetName: "planes-suscripcion.csv",
          manifest: null,
          schema: {
            numeric: ["uso_gb_mes"],
            categorical: [],
            target: "plan",
            classes: ["basico", "estandar", "premium"],
            task: "multiclase",
          },
        }}
        ready
        progress={null}
        scoring={{
          status: "scored",
          fileName: "nuevos.csv",
          table: {
            headers: ["uso_gb_mes"],
            rows: predictions.map((_, i) => [String(i)]),
          },
          check: { ok: true, missing: [], extra: [], targetPresent: false },
          score: {
            task: "multiclase",
            predictions,
            probabilities,
            novelty: { columns: [], affected_rows: 0, n_rows: predictions.length },
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

  it("sin probabilidad, puntuar no habla de ordenar por riesgo", () => {
    const { container } = scoreWith(["basico", "premium"], null);
    expect(
      screen.getByText(
        "Este modelo decide la categoría pero no da una probabilidad, así que esa columna no se incluye.",
      ),
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/riesgo/);
  });

  it("los mosaicos de puntuar: miles con coma y «%» con espacio no separable", () => {
    const predictions = [
      ...Array.from({ length: 1800 }, () => "basico"),
      ...Array.from({ length: 200 }, () => "premium"),
    ];
    const { container } = scoreWith(predictions, null);
    expect(container.textContent).toContain("1,800 (90\u00a0%)");
    expect(container.textContent).not.toMatch(/\b1800\b/);
  });

  it("la matriz escribe 1,800, no 1800", () => {
    const { container } = ui(
      <ConfusionTable
        classes={["basico", "premium"]}
        matrix={[
          [1800, 3],
          [2, 1500],
        ]}
      />,
    );
    expect(container.textContent).toContain("1,800");
    expect(container.textContent).toContain("1,500");
    expect(container.textContent).not.toMatch(/\b1800\b/);
  });

  it("la model card: la partición, el soporte y la matriz, con miles", () => {
    const base = multiclassResult();
    const result = {
      ...base,
      nTrain: 7200,
      nTest: 1800,
      confusionMatrix: base.confusionMatrix.map((row, i) =>
        row.map((count, j) => (i === 0 && j === 0 ? 1800 : count)),
      ),
      perClass: base.perClass.map((c, i) =>
        i === 0 ? { ...c, support: 1803 } : c,
      ),
    };
    const md = buildModelCard({
      locale: "es",
      datasetName: "planes-suscripcion.csv",
      cols: 7,
      numericFeatures: 4,
      categoricalFeatures: 2,
      target: "plan",
      seed: 42,
      result,
      verifiedNarrative: null,
      date: new Date(2026, 9, 4),
    });
    for (const figure of ["7,200", "1,800", "1,803"])
      expect(md).toContain(figure);
    expect(md).not.toMatch(/\b(7200|1800|1803)\b/);
  });
});

describe("S7: la ficha con varias categorías", () => {
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

  // Lo que solo vale con dos clases: «sí»/«no», «las dos clases», el AUC binario.
  // S7 (AU-S7-15): también el «AUC o F1» del veredicto binario, que la mayoritaria decía.
  const TWO_CLASSES =
    /«sí» o hacia «no»|las dos clases|Su AUC se calcula|[«“]yes[»”] or [«“]no[»”]|the two classes|Its AUC comes|AUC o F1|AUC or F1/;

  // S7 (AU-S7-15): TODAS las fichas que la pantalla de varias categorías abre (los miembros de
  // su liga y sus dos baselines), no solo las que tienen reemplazo: una que falte, cae.
  const MULTICLASS_FICHAS = [
    ...new Set([
      ...ROSTER_BY_TASK.multiclase,
      ...BASELINE_IDS_BY_TASK.multiclase,
    ]),
  ];

  it("toda ficha con reemplazo es de la liga de varias categorías", () => {
    for (const id of Object.keys(MULTICLASS_FICHA_FIELDS))
      expect(MULTICLASS_FICHAS).toContain(id);
  });

  it.each(MULTICLASS_FICHAS)(
    "%s: los apartados de dos clases se reemplazan (ES y EN)",
    (id) => {
      for (const locale of ["es", "en"] as const) {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
        const { unmount } = ui(
          <FichaModelo
            target={{
              id: id as "logistic",
              status:
                id === "majority" ? { kind: "baseline" } : { kind: "winner" },
              task: "multiclase",
            }}
            onClose={vi.fn()}
          />,
        );
        const dialog = screen.getByRole("dialog");
        expect(dialog.textContent).not.toMatch(TWO_CLASSES);
        unmount();
      }
      window.localStorage.removeItem(LOCALE_STORAGE_KEY);
    },
  );

  it("en la binaria la ficha sigue igual (el reemplazo es solo de varias categorías)", () => {
    ui(
      <FichaModelo
        target={{ id: "linear_svc", status: { kind: "winner" } }}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("dialog").textContent).toMatch(/las dos clases/);
  });
});

// S7 (AU-S7-14): antes de entrenar, con varias categorías, los avisos nombran la categoría
// y no dicen «usa AUC» (el veredicto usa la exactitud balanceada).
describe("Configuración con varias categorías: los avisos nombran la categoría", () => {
  const configWith = (file: string, target: string) => {
    const parsed = parseCsvWithLimits(
      readFileSync(resolve(process.cwd(), "public/datasets", file), "utf8"),
    );
    if (!parsed.ok) throw new Error(file);
    const table = sanitizeTable(parsed.table).table;
    ui(
      <ConfigScreen
        dataset={summarizeDataset(table)}
        sanitation={null}
        edaAlerts={computeEdaAlerts(table, target, "multiclase")}
        plan={null}
        onSelectTarget={() => {}}
        onRun={() => {}}
        onBack={() => {}}
      />,
    );
    fireEvent.change(document.querySelector("#target")!, {
      target: { value: target },
    });
  };

  it("el desbalance nombra la categoría más chica y la exactitud balanceada, sin AUC", () => {
    configWith("clientes-sucio.csv", "canal");
    const box = screen.getByText(/Antes de entrenar/).closest("div")!;
    expect(box.textContent, "el aviso dice «usa AUC»").not.toMatch(/AUC/);
    expect(box.textContent).toMatch(/La categoría más chica, «[^»]+», es el/);
    expect(box.textContent).toMatch(/exactitud balanceada/);
  });

  it("la fuga nombra la columna y la categoría que delata", () => {
    configWith("planes-fuga-plantada.csv", "plan");
    expect(
      screen.getByText(
        /«cargo_corporativo_usd» separa casi a la perfección la categoría «empresa» del resto/,
      ),
    ).toBeInTheDocument();
  });
});
