// Pantalla "Usar el modelo" (S3): los 4 estados de la orden + preparación de
// import. La lógica (esquema, novedad, ensamblado) vive en motores testeados
// aparte; aquí se prueba que la pantalla los COMUNICA con símbolo + texto.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/provider";
import { downloadTextFile } from "@/lib/files";
import type { ModelMeta, ScoringState } from "@/lib/useExperiment";
import type { CsvTable } from "@/lib/ds/csv";
import { ScoreScreen } from "@/components/ScoreScreen";

vi.mock("@/lib/files", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/files")>();
  return { ...actual, downloadTextFile: vi.fn() };
});

const META: ModelMeta = {
  source: "trained",
  datasetName: "test.csv",
  manifest: null,
  schema: {
    numeric: ["edad"],
    categorical: ["region"],
    target: "convirtio",
    classes: ["no", "si"],
    positive_class: "si",
  },
};

const TABLE: CsvTable = {
  headers: ["edad", "region", "extra"],
  rows: [
    ["34", "norte", "a"],
    ["51", "sur", "b"],
  ],
};

const SCORED: ScoringState = {
  status: "scored",
  fileName: "nuevos.csv",
  table: TABLE,
  check: { ok: true, missing: [], extra: ["extra"], targetPresent: true },
  score: {
    predictions: ["si", "no"],
    probabilities: [0.91, 0.2],
    positive_class: "si",
    novelty: {
      columns: [
        { column: "edad", kind: "numeric", count: 1 },
        { column: "region", kind: "categorical", count: 2 },
      ],
      affected_rows: 1,
      n_rows: 2,
    },
  },
};

function ui(
  scoring: ScoringState,
  overrides: Partial<Parameters<typeof ScoreScreen>[0]> = {},
) {
  const props = {
    meta: META,
    ready: true,
    progress: null,
    scoring,
    onScoreFile: vi.fn(),
    onScoreAnother: vi.fn(),
    onBackToResults: vi.fn(),
    onExit: vi.fn(),
    ...overrides,
  };
  render(
    <I18nProvider>
      <ScoreScreen {...props} />
    </I18nProvider>,
  );
  return props;
}

describe("ScoreScreen — vacío", () => {
  it("dropzone + columnas necesarias + aviso de no incluir el objetivo", async () => {
    const props = ui({ status: "idle" });
    expect(screen.getByText("Usar el modelo")).toBeInTheDocument();
    expect(screen.getByText("edad")).toBeInTheDocument();
    expect(screen.getByText("region")).toBeInTheDocument();
    expect(screen.getByText(/No incluyas «convirtio»/)).toBeInTheDocument();

    // Subir un archivo dispara onScoreFile con contenido y nombre.
    const input = document.querySelector('input[type="file"]')!;
    const file = new File(["edad,region\n34,norte"], "nuevos.csv", {
      type: "text/csv",
    });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() =>
      expect(props.onScoreFile).toHaveBeenCalledWith(
        "edad,region\n34,norte",
        "nuevos.csv",
      ),
    );
  });

  it("volver: a resultados si el modelo es entrenado; al inicio si es importado", () => {
    const trained = ui({ status: "idle" });
    fireEvent.click(screen.getByText("Volver a los resultados"));
    expect(trained.onBackToResults).toHaveBeenCalledOnce();
  });
});

describe("ScoreScreen — preparando (import en curso)", () => {
  it("muestra las etapas y no ofrece dropzone", () => {
    ui({ status: "idle" }, { ready: false, progress: "loading-packages" });
    expect(screen.getByText("Preparando el modelo…")).toBeInTheDocument();
    expect(screen.queryByText(/Arrastra tu CSV/)).toBeNull();
  });
});

describe("ScoreScreen — bloqueo por esquema", () => {
  it("nombra EXACTAMENTE las faltantes y ofrece reintentar", () => {
    const props = ui({
      status: "blocked",
      fileName: "malo.csv",
      check: {
        ok: false,
        missing: ["edad", "region"],
        extra: [],
        targetPresent: false,
      },
    });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("No se puede puntuar «malo.csv»");
    expect(alert).toHaveTextContent("edad");
    expect(alert).toHaveTextContent("region");
    fireEvent.click(screen.getByText("Probar con otro archivo"));
    expect(props.onScoreAnother).toHaveBeenCalledOnce();
  });
});

describe("ScoreScreen — resultados", () => {
  it("panel de novedad con conteos por columna + resumen (símbolo + texto)", () => {
    ui(SCORED);
    expect(
      screen.getByText("El modelo está viendo cosas nuevas"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/«edad»: 1 valores fuera del rango/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/«region»: 2 valores con categorías nunca vistas/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/adivinando en 1 de 2 filas \(50%\)/),
    ).toBeInTheDocument();
  });

  it("avisos de columnas ignoradas y objetivo presente", () => {
    ui(SCORED);
    expect(screen.getByText(/«extra»/)).toBeInTheDocument();
    expect(
      screen.getByText(/trae la columna objetivo «convirtio»/),
    ).toBeInTheDocument();
  });

  it("distribución + vista previa con columnas nuevas y descarga del CSV", () => {
    ui(SCORED);
    // Distribución: una tile por clase, ambas con 1 fila (50%).
    expect(screen.getAllByText("1 (50%)")).toHaveLength(2);
    // Vista previa con los nombres resueltos de las columnas nuevas.
    expect(screen.getByText("prediccion")).toBeInTheDocument();
    expect(screen.getByText("probabilidad_si")).toBeInTheDocument();
    expect(screen.getByText("0.9100")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Descargar CSV puntuado"));
    expect(downloadTextFile).toHaveBeenCalledOnce();
    const [fileName, csv, mime] = vi.mocked(downloadTextFile).mock.calls[0]!;
    expect(fileName).toBe("nuevos-puntuado.csv");
    expect(mime).toContain("text/csv");
    expect(csv).toContain("edad,region,extra,prediccion,probabilidad_si");
    expect(csv).toContain("34,norte,a,si,0.9100");
  });

  it("sin novedad ⇒ mensaje honesto en positivo", () => {
    ui({
      ...SCORED,
      score: {
        ...SCORED.score,
        novelty: { columns: [], affected_rows: 0, n_rows: 2 },
      },
    });
    expect(screen.getByText(/Sin novedades/)).toBeInTheDocument();
  });
});

describe("ScoreScreen — error", () => {
  it("error de puntuación ⇒ mensaje + reintentar", () => {
    const props = ui({ status: "error", kind: "runtime" });
    expect(screen.getByRole("alert")).toHaveTextContent(/No se pudo puntuar/);
    fireEvent.click(screen.getByText("Probar con otro archivo"));
    expect(props.onScoreAnother).toHaveBeenCalledOnce();
  });

  it("error de parseo reutiliza los mensajes honestos del S1", () => {
    ui({ status: "error", kind: "csv-too-large" });
    expect(screen.getByRole("alert")).toHaveTextContent(/5 MB/);
  });

  it("import fallido ⇒ sin reintento de archivo (volver al inicio)", () => {
    const props = ui(
      { status: "error", kind: "import-failed" },
      { meta: { ...META, source: "imported" }, ready: false },
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/No se pudo restaurar/);
    expect(screen.queryByText("Probar con otro archivo")).toBeNull();
    fireEvent.click(screen.getByText("Volver al inicio"));
    expect(props.onExit).toHaveBeenCalledOnce();
  });
});
