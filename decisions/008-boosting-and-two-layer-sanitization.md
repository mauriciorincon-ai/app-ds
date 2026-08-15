# ADR 008 — Multi-candidate model selection (RandomForest vs HistGradientBoosting) + two-layer sanitization (structural pre-split in TS, statistical inside the retained pipeline)

- **Status:** accepted
- **Date:** 2026-07-19
- **Sprint:** 004 (cierre del ciclo H1)

## Context

Sprint 004 makes the app survive real, messy CSVs (nulls, mixed types, IDs, constants, rare
categories, duplicate rows) and adds boosting to the model catalogue — without breaking the two
guarantees the app is built on: leakage is impossible by construction (ADR-002) and the export
file round-trips (ADR-007). Three questions had to be answered honestly and verified against the
real runtime before building: which booster, how a new model competes with the existing verdict,
and where each piece of sanitization runs so the anti-leakage guarantee still holds.

## Decision

### 1. Booster = `HistGradientBoostingClassifier` (sklearn), verified in the real runtime

`micropip` is not needed: `HistGradientBoosting{Classifier,Regressor}` ship with the sklearn
already in Pyodide (verified 2026-07-19: sklearn 1.8.0 / Pyodide 314.0.2 / Python 3.14.2). Zero new
dependencies, CPU-native, strong on tabular data. **Its NaN-native mode is NOT used in H1:** the
booster runs _inside_ the same preprocessing pipeline as every other model, so the imputer has
already filled NaNs before HGB sees the data. This is deliberate — one preprocessing path means the
candidates are compared fairly and the export/scoring path stays single. (`sparse_output=False` on
the OneHotEncoder is required because HGB rejects sparse matrices.)

### 2. Multi-candidate, one verdict, no user selector

`RandomForest` and `HistGradientBoosting` are trained as **candidates** with the SAME cloned
preprocessor; `majority` and `logistic` remain the honest baselines. The winner is the argmax of
the **primary metric** among the candidates (tie → forest, a stable deterministic order); the
winner's fitted pipeline is what `_MODEL` retains, exports and scores.

**The metric-selection rule lives in ONE place (`engine/verdict.ts`).** `pickPrimaryMetric` is
symmetric in `p ↔ 1−p`, so TypeScript computes `primary_metric` from any fixed class's rate
without needing to know which class Python will call "positive", and sends it in the payload;
Python selects the winner with it but never re-derives the rule. There is no user-facing model
picker: the verdict speaks (franqueza — regla dura 3). `ResultsScreen` shows every candidate's
score and marks the winner (symbol + text, never colour alone).

### 3. Sanitization in two layers

- **(a) Structural, pre-split, in TypeScript (`engine/sanitize.ts`, pure).** Runs in `loadCsv`,
  before the target is even chosen. It touches nothing that depends on the target, so running it
  pre-split is safe: exclude exact-ID columns (**non-numeric only** — a numeric column with all
  distinct values is a legitimate continuous feature, never silently dropped; the near-ID case is
  merely _flagged_ by the EDA, not excluded), exclude constant columns, **deduplicate exact rows**
  (this is what _prevents_ leakage-by-duplication — the same row landing in train and test), and
  coerce mixed-numeric columns (≥90% parse ⇒ the junk cells become null, counted). Every action is
  declared with exact counts; nothing is silent. An irrecoverable dataset (nothing modelable left)
  surfaces `csv-unusable`.
- **(b) Statistical, inside the retained pipeline (extends ADR-002).** Imputation (already there)
  plus `OneHotEncoder(min_frequency=2)` to group rare categories — **fit ONLY on train** because
  the pipeline's `fit` only ever sees train. This is a literal extension of the anti-leakage
  guarantee: a dedicated integration test fails if the rare-category grouping is learned from
  anything but train. The grouped categories are reported back (`preprocessing.rare_categories`).

The report shown before training states TypeScript facts (rows deduped, cells coerced, columns
excluded, with counts); the statistical figures (rare categories, imputation) are model-level and
appear after training, in the deterministic model card — never invented by the LLM.

### 4. EDA alerts are a separate, honest signal

`engine/eda.ts` emits `EdaAlert`s — a type **distinct** from `LeakageFinding` (it never touches the
manifest's `leakage` array or the file's `isLeakage` validation): `possible-leak` (the same
univariate heuristic as `engine/leakage`, but run over the WHOLE dataset and labelled an
_exploratory pre-split hint_ — the guarantee remains the train-only `detectLeakage` + the
pipeline), `id-like` (non-numeric near-unique columns, excluded from the leak scan so an identifier
is not mislabelled a proxy), and `class-imbalance`. Thresholds are exported constants: leak =
`DEFAULT_LEAKAGE_THRESHOLD` (0.98), id-like ratio ≥ 0.95, minority < 0.15 (the same frontier the
primary-metric rule uses).

## Consequences

- Boosting competes under the exact same honest verdict; no metric is inflated and no model is
  hidden. On tiny datasets HGB (default `min_samples_leaf=20`) may be a degenerate candidate — the
  argmax + forest tie-break keep the choice deterministic, and tests that assert learned behaviour
  use datasets large enough for a fair contest.
- **Scoring does NOT re-sanitize** (a deliberate decision): the model's schema is built from the
  already-sanitized training table, so a new CSV that still carries the excluded columns scores
  fine — `schema-check` treats them as ignored extras. The novelty report is unchanged.
- The three packaged clean datasets are a no-op for sanitize (asserted), so all S1–S3 exact-count
  tests and the byte-identical narration payload (privacy) survive unchanged.
- The export file gains additive, optional manifest fields (`model_name`, `sanitation`) — see the
  Sprint 004 revision of ADR-007.
