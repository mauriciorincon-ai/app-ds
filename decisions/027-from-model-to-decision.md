# ADR 027 — From model to decision: the what-if in money, the model as rules, watching the performance

- **Status:** accepted
- **Date:** 2026-10-25
- **Sprint:** 019 (what-if simulator, surrogate rules, performance watch, the Protocol winner as a file)

## Context

Until sprint 18 the product ended at a number: a verdict against a baseline, a margin of error, a model to take away. The VISION
promises three more things that turn the number into a decision: a **what-if simulator that speaks in money** (feature 16), the
**model translated to rules** that run where Python cannot (feature 20) and **watching the performance after publishing** (the
part of feature 19 that sprint 15 left out: it watches the inputs, not the results). Each of them is exposed to the same two
risks the app is built against: letting the test rows shape something (the Protocol opens its test once, in stage 8), and saying
more than the numbers support.

## Decision

### 1. The what-if is a _score twice_, and its money is an _expected_ cost

1. The worker command `simulate` scores the same rows **as they are and with one column changed** and returns the prediction and the
   **full** probabilities (the existing `score` command returns only the probability of the chosen class in several categories,
   which is not enough for a cost). The change is computed in TypeScript (`engine/simulador.ts`: a percentage, a fixed value, or
   another category _that exists_; an empty stays empty; for every row or a segment written in the grammar of the rule of today,
   `engine/protocolo/regla.ts`). The table is never touched.
2. **At most 5,000 rows** travel per simulation (a sample with the experiment seed, said on screen): the answer is two full
   probability matrices, and a larger payload would only slow the page.
3. **Money = expected cost per 100 decisions, from the model's own probabilities.** Two classes: act when `p ≥ c_FP / (c_FP + c_FN)`;
   acting costs `(1 − p)·c_FP`, not acting costs `p·c_FN`. Several classes: the chosen option is the predicted class and being
   wrong costs `Σ p(k)·cost(k)` over the other classes `k` (`cost(k)` = what it costs to be wrong when the real class is `k`, the
   stage 1 field). Estimating a quantity: the change in the units of the target (no money: there is no real answer for a row that
   does not exist). Grouping: how many rows change group. **It is a simulation, not a measurement**, and the screen says so. A model
   that decides without probabilities (ridge, linear support vector) or the absence of costs gives _no figure in money_ and says why.
4. When the change moves rows outside what the model saw in training (range or category), the panel counts them: there the estimate is
   an extrapolation.
5. The summary sentence comes from a template and passes the figure check of sprint 18 (`narration/cifras.ts`); if it does not match the
   numbers, only the figures are shown. **No new LLM call**; `/api/narrate` is untouched.

### 2. The Protocol never reopens its test: `fit-winner`

The winner of stage 7 is fitted in stage 8 as a local variable and thrown away; the worker of that stage dies when the stage is
recorded. To simulate in stage 9 and to save the file in stage 10 the winner has to be fitted again, so the new command `fit-winner`
takes **the stage 8 envelope without the test** (`FIT_KEYS = TEST_KEYS − {test}`): a `test` key, or any other, breaks the contract
_naming it_; the rows are exactly the training rows that opened the test (one helper builds both envelopes); the model it leaves in
memory has no `eval`, so everything that reads the test (`interval`, `stress`) says `no-eval`. It is not an opening: it does not
touch the notebook. The simulator in stage 9 _informs_ the decision and is **not evidence**: it adds nothing to the notebook, the gate
or the card, so no stage key changes and no old notebook needs a compatibility path. The fit is deterministic (same seed, same rows).

### 3. The model as rules: a surrogate tree on the original columns

A `DecisionTreeClassifier` / `Regressor` of **depth 4** with at least `max(20, 2 % of the rows)` per leaf, trained on **the winner's
predictions** over the training rows (grouping: on the groups, 75 % of the rows; the rest measures). It reads the _original_ columns:
numbers in their units (empties take the training median) and categories as «is / is not» (the 15 most frequent per column with at
least 5 rows). **The fidelity is measured on rows the tree did not see** — in Probeta, the retained test (already opened; the tree has
fixed hyperparameters and nothing is chosen with it, the same logic as the stress test of ADR 023) — and **on the rule form that is
downloaded**, not on `predict` of the library: thresholds are rounded to 6 significant digits and leaf values to 8, so the text, the SQL
and the evaluator in TypeScript are the same function. Also reported: how often the rules are right against the truth, next to the
model's own figure.

- **The threshold.** Fidelity ≥ **0.90** agreement (two classes, several classes, grouping) or ≥ **0.80** R² (estimating). Below it
  the screen gives the figure and calls it «a tree that resembles the model», **never «the model as rules»**. The numbers are
  conventions fixed here by design, like the 0.10 gap and 0.7 stability of grouping (ADR 016); they are constants with a test at the edge.
- **Output.** A text in the user's language (`{es, en}`), one line per leaf, and SQL: one `CASE WHEN … THEN … END` per rule (no `ELSE`: every row has exactly one leaf) with
  double-quoted identifiers (`"` doubled), single-quoted literals (`'` doubled) and `COALESCE` equal to the imputation. «Is not» is
  `(col IS NULL OR col <> 'x')` because an empty category counts as «is not».
- **The gate.** The SQL is run by **CPython's `sqlite3`** (CI job `integration`, no new job) over the CSV that Pyodide predicted and must
  give the same prediction on every row (exact for classes and groups; for numbers, the same literal).
- **Scope.** Only for a model trained in Probeta (it needs the training rows, which live in memory and never in the file). The button
  lives in Results, which only appears after training in the session, so an imported model and the Protocol winner never see it; a model
  with too few rows says so, and if the worker holds no rows the panel says so (`reglas.sin_filas`) instead of inventing a tree.

### 4. Watching the performance: today's figure against the test figure, with its margin

In the scoring screen, if the new CSV carries the target column, `evaluate-new` encodes the target with the model's schema (rows with an
empty target or an unseen class are counted and left out) and returns only numbers; the bootstrap of sprint 18 (`calcularIntervalo`,
1,000 resamples, seed 42) gives today's figure with a 95 % interval in the **primary metric of the model**. The reference is the
figure of its test (the manifest, or the result of the model just trained). Words of the drift check of stage 10 (`sigue · revisar ·
reentrenar`), with the rule of the verdict (`METRIC_RULES`: direction and tie tolerance):

- **reentrenar** when the _whole_ interval of today is worse than the test figure beyond the tie;
- **sigue** when today's figure is not worse than the test figure beyond the tie;
- **revisar** in between, and always with fewer than 50 rows with a real result (`FILAS_PRUEBA_POCAS`): few rows decide nothing.

The test figure is a point with its `n_test`; the manifest does not store its margin, so only today's figure carries one. The results are
uploaded by the user: the app fetches nothing from another system.

### 5. The Protocol winner as a `.probeta.json`

Stage 10 saves the winner as the same file format so it can be scored and watched in Probeta. It is a **manifest variant**
(`origin: "protocolo"`, format version still 1) that **does not invent** what the Protocol never measures — no baselines, leak
findings, league or selection — and carries a `protocol` block instead: winner, metric and its value on the test of stage 8, the rows,
the fingerprint of the data and the seal of the partition. The import summary names it; scoring and watching treat it like any
other. An app older than this sprint refuses it (unknown shape), which is the right outcome.

## What it does not do

- It does not read the Protocol test again, anywhere. It does not store a margin for the test figure.
- No rules for the Protocol, for imported models or for a model that no longer has its rows.
- The simulator is not evidence and not a causal claim: it moves a column and asks the model; the data may move others with it.
- It does not fetch results from another system and does not call a language model.
