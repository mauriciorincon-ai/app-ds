# ADR 002 — Anti-leakage by construction

- **Status:** accepted
- **Date:** 2026-07-08
- **Sprint:** 001

## Context

Data leakage (fitting any preprocessing on data that includes the test set) is the single most
common methodological failure in applied ML, and it silently inflates metrics. The product's
differentiator is methodological honesty, so leakage must be **impossible by construction** — not
merely discouraged in docs or left to the user's discipline.

## Decision

Make the leak-free path the **only** path the engine exposes, and guard it with tests.

- **Split in pure TypeScript** (`engine/split.ts`): stratified, seeded, deterministic; returns
  train/test **indices**. Unit-tested for stratification, no overlap, and determinism.
- **Preprocess only on train.** The indices go to `lib/ds/pipeline.py`, where a scikit-learn
  `Pipeline` wrapping a `ColumnTransformer` (median impute + scale for numeric; most-frequent impute
  - one-hot for categorical) is fit **only on the train rows**, then applied to test. There is no
    function that preprocesses before the split.
- **Metrics on test only** (accuracy, precision, recall, F1, AUC + confusion matrix).
- **Guard with tests that fail on regression:** the pure split has unit tests, and an **integration
  test** (`tests/integration/pipeline.test.ts`, Pyodide) asserts the imputer's learned median comes
  from train only (it would be a different value if fit on the full dataset) — so re-introducing
  leakage breaks CI.
- **Honest leakage heuristic** (`engine/leakage.ts`): flags features whose univariate association
  with the target is suspiciously high (rank-AUC for numeric, category purity for categorical),
  computed on train only. It is explicitly a **warning, not a guarantee** — non-exhaustive by design.

## Consequences

- The API shape makes misuse hard: the UI never offers a "preprocess everything then split" route.
- The two guarantees (correct split, fit-on-train) are enforced in CI, not by convention.
- The leakage check helps users catch obvious proxies (demonstrated by the planted-leak example
  dataset) without over-promising completeness.
