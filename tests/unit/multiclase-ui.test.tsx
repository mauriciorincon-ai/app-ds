// S7 (F1): la multiclase ya entrena en el MOTOR, y su UI llega en la F3 (D3 del
// plan). Mientras tanto: (1) la narración con IA no la narra — cero llamadas al
// route, plantilla local (P10, R2); (2) una superficie de la UI que la recibiera
// falla nombrándose, en vez de pintar la rama binaria (pendingSurface).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/provider";
import { assembleMulticlassResult } from "@/lib/experiment";
import { buildModelCard } from "@/lib/modelcard";
import { useNarration } from "@/lib/useNarration";
import type { MulticlassPipelineResult } from "@/workers/protocol";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider>{children}</I18nProvider>
);

const multiclassResult = () =>
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
    [],
  );

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

describe("S7 (D3): una superficie de la UI sin su rama falla NOMBRÁNDOSE", () => {
  it("la model card de varias categorías no se arma con la rama binaria", () => {
    expect(() =>
      buildModelCard({
        locale: "es",
        datasetName: "planes-suscripcion.csv",
        cols: 7,
        numericFeatures: 4,
        categoricalFeatures: 2,
        target: "plan",
        seed: 42,
        result: multiclassResult(),
        verifiedNarrative: null,
      }),
    ).toThrow("superficie sin rama todavía: modelcard (multiclase)");
  });
});
