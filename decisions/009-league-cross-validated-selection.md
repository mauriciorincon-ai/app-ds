# ADR 009 — The league: every browser-trainable classifier competes, selection by cross-validation inside train (one-standard-error rule), the test set opened once

- **Status:** accepted — **supersedes ADR 008 §2** ("multi-candidate, one verdict, no user selector")
- **Date:** 2026-10-02
- **Sprint:** 005 «La liga honesta» (cycle H2, sprint 1 of 3)

## Context

Through H1 the app trained four models (two baselines + Random Forest + HistGradientBoosting) and
picked the winner as the **argmax of the primary metric on the TEST set** (`pipeline.py`, ADR 008
§2). That is the winner's curse: the more candidates look at the test set, the more the reported
number is the luckiest draw, not the expected performance. It is also what capped the catalogue —
adding models made the reported score less honest. Users found "a super limited number of models".

The scarce resource is not the number of models but **the decisions taken on the test set**. If the
choice is made with cross-validation inside train and the test set is opened only after choosing,
the catalogue can grow to everything the browser can train without inflating the verdict.

## Decision

### 1. The roster (D4)

Fourteen members, fixed hyper-parameters, `random_state=seed`, `n_jobs=1` (determinism across
engines, measured identical in Chromium and WebKit in the F0 spike):

`logistic`, `logistic_balanced`, `ridge`, `naive_bayes`, `linear_svc`, `decision_tree`
(`min_samples_leaf=5`), `knn`, `hgb`, `lightgbm`, `xgboost`, `extra_trees`, `forest`,
`forest_balanced` (200 trees each), `mlp` (one hidden layer of 64, `early_stopping=True`,
`max_iter=500`, `n_iter_no_change=10` — F0-4: without early stopping it never converged).

XGBoost 2.1.4 and LightGBM 4.6.0 come from Pyodide's own lockfile (xgboost loaded by wheel URL
without its declared-but-unused closure). Twelve models + two `class_weight="balanced"` variants.
The **priority order** (simplest/cheapest first) lives only in `engine/roster.ts` and travels to
Python with the payload; Python never re-derives it. No "12" or "14" is written by hand: everything
derives from `MEMBER_IDS`, and a parity test pins the ids against `pipeline.py`.

### 2. Cross-validation inside train, preprocessor refit per fold

Every member is scored with `cross_validate(Pipeline([clone(preprocessor), model]), X_train,
y_train, StratifiedKFold(k, shuffle=True, random_state=seed), scoring=SCORER[primary_metric],
error_score="raise")`. The preprocessor lives **inside** the pipeline, so imputation, rare-category
grouping, scaling and one-hot encoding are refit on each fold's training part (ADR 002 extended to
the CV). `k = 5`, `3` above 20 000 rows, bounded by the minority class in train, minimum 2; below
that the run is refused honestly (`too-few-rows`) instead of producing folds without positives.

The primary metric is still decided once, in `engine/verdict.ts` (`pickPrimaryMetric`), and is now
also the CV scorer.

### 3. Selection: the one-standard-error rule (D8)

The F0 spike measured that, with 150 training rows, the **maximum** CV mean among 14 models rewards
luck: two kit datasets flipped from "beats the baseline" to "does NOT beat it" with Naive Bayes and
KNN winning by noise. The textbook remedy (Hastie, Tibshirani & Friedman, _ESL_ §7.10): among the
members whose CV mean is within one standard error of the best (`SE = std(folds, ddof=0)/√k`), pick
the **first in priority order** — the simplest. Across the 8 measured datasets it never chose worse
than the maximum, and on the large ones it chose the same model.

### 4. The test set is opened once, after choosing (D14, F0-5)

Order inside `run_experiment`: validate payload → CV of every member (progress per member) → select
→ **only then** baselines and test. The test scores of the losers are computed in the same run
(eager: 13–20 % of the CV cost) so they can be shown on request — labelled (ADR 011). Baselines
are fitted after selection too, so no full-train fit and no test look happens before the choice;
an integration test with a spy transformer fails if any fit sees validation rows of its fold, and
another fails if permuting the test labels changes the winner or any CV score.

Only the winner stays in `_MODEL` (memory: 20 000 rows × 14 pipelines would not fit).

### 5. Row states (D11)

`ok` · `no-converge` (CV score visible and labelled; it can be chosen by hand but never wins on its
own) · `error` (no score, only the exception TYPE — never its message, which may carry cell values;
hard rule 2). One failing member never stops the league.

### 6. Manual choice (U1, D10)

The user may pick any member that has a test score. `fit_member` refits that member on full train
(same split, same seed ⇒ its league row exactly — determinism test with the random forests) and
retains it. The verdict then speaks about the chosen model, labelled «◆ Elegido por ti, no por la
validación cruzada», against the same baseline; the CV winner keeps its ★ in the table and «Volver
al ganador» restores it. Who chose is app state, not compute state: it lives in TS as
`selection.by: "cv" | "user"` and reaches the manifest; Python only reports which member it fitted
and TS checks it is the one requested.

### 7. Probabilities are not invented (D12)

Ridge and the linear SVM decide a class without a probability. Scoring returns
`probabilities: null`; the scored CSV omits the column and says why. A sigmoid over the decision
function (a fake probability) and `CalibratedClassifierCV` (a different model and cost than the one
measured) were rejected. AUC is still computed from the decision function — AUC only needs ranking.

### 8. The cross-language contract (rule 15)

The payload TS → Python is validated by `_validate_payload` (raises `contract:<field>`); every
Python → TS result is validated in production by the hand-written validators of
`src/workers/contract.ts` (zod would break the 300 KB script budget), which also **recompute the
one-SE selection** and reject a result whose `winner`, `cv.best` or `cv.se` disagree (D15 — Python
chooses, TS checks). Fixtures are emitted by the real serializer (Pyodide) and every field carries a
bait that the reader must reject by name.

## Consequences

- The reported number may go **down** compared with H1: that is the selection bias being removed,
  not a regression. The manual FAQ explains it («¿por qué bajó mi puntaje?»).
- When the logistic regression wins the league it ties with itself as a baseline; the verdict says
  so in its own words («la liga no encontró nada mejor que la regresión de referencia»), not
  "ties the baseline".
- The model-file format version does not change: `league`, `selection` and
  `versions.{xgboost,lightgbm}` are additive-optional manifest fields; S3/S4 files still import.
- Supersedes ADR 008 §2 only. ADR 008 §1 (HGB in the same pipeline), §3 (two-layer sanitization)
  and §4 (EDA alerts) stand.
