// @vitest-environment node
/**
 * S18 — la liga contra la VISION (fila 6 de «las 37»). La VISION v2.1.0 nombra los modelos de la liga; este test cruza cada
 * nombre con el roster de cada tarea. Si uno falta de una tarea, el código tiene que decir por qué (`SIN_LUGAR_EN_LA_TAREA` en
 * roster.ts); si el roster lo lleva y hay una razón, la razón caducó; y cada miembro del roster que la VISION no nombra
 * tiene que estar declarado como variante o afín (`FUERA_DE_LA_LISTA_DE_LA_VISION`).
 *
 * La VISION es de la planeadora, que es privada, y la CI de esta app es pública: el test lleva la lista tal como la escribe la
 * VISION (con la cita) y, SI el archivo está en esta máquina, comprueba además que la lista sigue siendo la que dice.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_MEMBER_IDS,
  FUERA_DE_LA_LISTA_DE_LA_VISION,
  ROSTER_BY_TASK,
  SIN_LUGAR_EN_LA_TAREA,
  type MemberId,
} from "@/engine/roster";
import type { TrainTask } from "@/engine/tarea";

const SUPERVISADAS: TrainTask[] = ["binaria", "multiclase", "numerica"];

/** VISION v2.1.0, «4 · Construye el modelo», líneas 59 a 62: lo que dice, en el orden en que lo dice. */
const VISION = {
  version: "2.1.0",
  cita: "VISION.md § «La liga completa, del más simple al más potente» y «Agrupar sin objetivo»",
  modelos: [
    { texto: "regresión lineal", id: "linear", tareas: SUPERVISADAS },
    { texto: "logística", id: "logistic", tareas: SUPERVISADAS },
    { texto: "Ridge", id: "ridge", tareas: SUPERVISADAS },
    { texto: "Lasso", id: "lasso", tareas: SUPERVISADAS },
    { texto: "Naive Bayes", id: "naive_bayes", tareas: SUPERVISADAS },
    { texto: "KNN", id: "knn", tareas: SUPERVISADAS },
    { texto: "árboles de decisión", id: "decision_tree", tareas: SUPERVISADAS },
    { texto: "Random Forest", id: "forest", tareas: SUPERVISADAS },
    { texto: "ExtraTrees", id: "extra_trees", tareas: SUPERVISADAS },
    { texto: "HistGradientBoosting", id: "hgb", tareas: SUPERVISADAS },
    { texto: "XGBoost", id: "xgboost", tareas: SUPERVISADAS },
    { texto: "LightGBM", id: "lightgbm", tareas: SUPERVISADAS },
    { texto: "redes neuronales ligeras", id: "mlp", tareas: SUPERVISADAS },
    { texto: "K-Means", id: "kmeans", tareas: ["agrupar"] as TrainTask[] },
  ],
} as const;

describe("la liga contra la VISION", () => {
  const combos = VISION.modelos.flatMap((m) =>
    m.tareas.map((tarea) => ({ ...m, tarea })),
  );

  it.each(combos.map((c) => [`${c.texto} (${c.id}) en ${c.tarea}`, c] as const))(
    "%s: está en el roster o el código dice por qué no",
    (_nombre, c) => {
      const esta = (ROSTER_BY_TASK[c.tarea] as readonly string[]).includes(c.id);
      const razon = SIN_LUGAR_EN_LA_TAREA[c.tarea]?.[c.id];
      if (esta) {
        expect(razon, `la razón de «${c.id}» en ${c.tarea} caducó: el roster ya lo lleva`).toBeUndefined();
      } else {
        expect(razon, `«${c.texto}» (${c.id}) falta en ${c.tarea} y el código no dice por qué`).toBeTruthy();
        expect((razon ?? "").length).toBeGreaterThan(20);
      }
    },
  );

  it("toda razón declarada se refiere a un modelo de la VISION y a una tarea que lo exige", () => {
    for (const [tarea, razones] of Object.entries(SIN_LUGAR_EN_LA_TAREA)) {
      for (const id of Object.keys(razones ?? {})) {
        const modelo = VISION.modelos.find((m) => m.id === id);
        expect(modelo, `«${id}» no está en la lista de la VISION`).toBeDefined();
        expect(modelo!.tareas as readonly string[], `${id} no se exige en ${tarea}`).toContain(tarea);
      }
    }
  });

  it("todo miembro del roster está en la VISION o declarado como variante o afín, y viceversa", () => {
    const nombrados = new Set<string>(VISION.modelos.map((m) => m.id));
    for (const id of ALL_MEMBER_IDS as readonly MemberId[]) {
      expect(
        nombrados.has(id) || id in FUERA_DE_LA_LISTA_DE_LA_VISION,
        `«${id}» está en el roster y ni la VISION lo nombra ni el código lo declara`,
      ).toBe(true);
    }
    for (const id of Object.keys(FUERA_DE_LA_LISTA_DE_LA_VISION)) {
      expect(nombrados.has(id), `«${id}» ya lo nombra la VISION: sobra su declaración`).toBe(false);
      expect((ALL_MEMBER_IDS as readonly string[]).includes(id), `«${id}» no está en el roster`).toBe(true);
    }
  });

  it("se demuestra fallando: si a una tarea le falta un modelo de la VISION sin razón, el cruce lo encuentra", () => {
    const sinKnn = (ROSTER_BY_TASK.binaria as readonly string[]).filter((id) => id !== "knn");
    const sinRazon = VISION.modelos
      .filter((m) => (m.tareas as readonly string[]).includes("binaria"))
      .filter((m) => !sinKnn.includes(m.id) && !SIN_LUGAR_EN_LA_TAREA.binaria?.[m.id])
      .map((m) => m.id);
    expect(sinRazon).toEqual(["knn"]);
  });

  const ruta = join(homedir(), "Code/hr01-develop-ai-apps/portafolio/ds/VISION.md");
  describe.skipIf(!existsSync(ruta))("contra el archivo de la VISION, cuando está en esta máquina", () => {
    const texto = existsSync(ruta) ? readFileSync(ruta, "utf8") : "";
    const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

    it("sigue siendo la versión que el test cruza", () => {
      expect(texto, `la VISION cambió de versión: relee su lista de la liga y actualiza ${VISION.cita}`).toMatch(
        new RegExp(`version:\\s*${VISION.version.replace(/\./g, "\\.")}`),
      );
    });

    it("nombra cada modelo de la lista", () => {
      const lectura = sinTildes(texto);
      for (const modelo of VISION.modelos)
        expect(lectura, `la VISION ya no nombra «${modelo.texto}»`).toContain(sinTildes(modelo.texto));
    });
  });
});
