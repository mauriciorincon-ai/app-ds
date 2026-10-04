# ADR 014 — The model file per task: an additive `task`, and only usable tasks import

- **Status:** accepted
- **Date:** 2026-10-04
- **Sprint:** 006 «Estimar»
- **Amends:** ADR 007 (model export/import format)

## Context

Since S3 a trained model travels as a single `.probeta.json`: `{ format_version, manifest,
payload }`, with the manifest validated in TypeScript before the payload ever reaches Pyodide (ADR
007). Every manifest so far described a binary classifier: `classes`, `positive_class`,
`positive_rate`, and accuracy/precision/recall/F1/AUC against the majority-class and logistic
baselines. A model that estimates a quantity has none of those. Instead it has a target measured in
training (mean, deviation, range, median, decimals) and errors in the target's units.

S5 files already exist on users' disks, and they must keep importing and scoring exactly as before.

## Decision

1. **`task` is additive and optional in the manifest.**
   - Absent means `binaria`: every S3–S5 file.
   - New binary files write `task: "binaria"`.
   - Regression files write `task: "numerica"`.
   - `format_version` stays at 1, because an additive optional field does not change the meaning
     of any existing field (ADR 007's rule since S4).
2. **The validator dispatches on `task`, and each shape is closed.**
   - **Binary:** still requires `classes` (exactly two), `positive_class` and `positive_rate`.
   - **Regression:** requires none of those, and rejects class metrics. It requires instead:
     - `schema.target_stats`, with an ordered refine: min ≤ median ≤ max, finite numbers, and
       decimals in [0, 6];
     - the five regression metrics, each finite; MAPE is `null` when the target has zeros;
     - the median and linear baselines;
     - a `verdict` on MAE;
     - the league and the selection. These are required, because no regression file predates S5's
       league.
3. **Only usable tasks import (`unsupported-task`).** `validateModelFile(text, usable =
TRAINABLE_TASKS)` rejects an otherwise intact file of a task the UI cannot use, and **names the
   task**.
   - Phase 1 used this to keep regression files out until their screens existed (deviation D4).
   - From S6 Phase 2 both tasks are usable.
   - The rule is permanent: the day S7 writes a multiclass file, an older app version rejects it by
     name, never with a misleading «invalid format».
4. **The schema carries the task into Pyodide.** The exported schema includes `task` and, for
   regression, `target_stats`. `import-model` compares the manifest's schema with the pickle's, as
   ADR 007 required, so a regression pickle under a binary manifest is rejected.
5. **Scoring follows the task.**
   - The scorer returns numbers with `probabilities: null` (never invented).
   - The CSV column is `<target>_estimado`, written with the target's own decimals.
   - The import summary says «Estima «target», una cantidad» and shows the MAE in units.

## Consequences

- **A real S5 file is the regression test.** Before `pipeline.py` changed, the S5 code emitted a
  `.probeta.json` with its own serializer (`tests/fixtures/modelos/modelo-s5.probeta.json`). The S6
  code validates it, restores it and scores `clientes-nuevos.csv` **identically**: predictions,
  probabilities and novelty.
  - Red demo: requiring `task` in the binary manifest makes that real file fail.
- **Every new manifest field has its bait.** The reader rejects each mutation **naming the field**:
  12 of 12 for the regression manifest, and the binary 16 of 16 untouched.
- **Export → reload → import → score** runs end to end in the production build, for a regression
  model (`tests/e2e/regresion-score.spec.ts`) and for a booster (`liga-booster-export.spec.ts`).
  Neither the payload nor the new CSV appears in network traffic.
- The manifest is still neither encrypted nor signed (ADR 007): load only files that came from
  Probeta.
