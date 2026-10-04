# ADR 013 — Regression as the second task: same league, verdict in the target's units

- **Status:** accepted
- **Date:** 2026-10-04
- **Sprint:** 006 «Estimar» (cycle H2, sprint 2 of 3)
- **Thresholds:** fixed by the user at the Phase 0 STOP (2026-10-04), from the in-browser spike
  (`sprints/SPRINT_006-spike-regresores.md`)

## Context

Since S5 the app detects five kinds of target (E1, ADR 010), but only `binaria` trains. A numeric
target (a price, a consumption, a duration) showed «predicción de una cantidad: llega en una próxima
versión». The S5 league already has every honest mechanism: selection by cross-validation inside
train, the one-standard-error rule, a test set opened once, cost routers, and labels instead of
blocks (ADR 009, 010, 011). The question was how to add a second task **without breaking the binary
league**, whose tests and contract fixtures were the hard condition of the sprint.

## Decision

Regression enters **parametrised by task**, never as a fork of the binary path.

1. **A required `task` discriminator crosses every seam** (`"binaria" | "numerica"`). TS sends it,
   `_validate_payload` checks it, Python returns it, and `contract.ts` checks it against what was
   sent. A missing task is a contract error, not an implicit default.
2. **One id space, one roster per task.**
   - Models that exist in both tasks share their id, ficha and short name: ridge, tree, kNN, the
     three boosters, extra trees, forest, MLP.
   - `linear` and `lasso` are new.
   - `ALL_MEMBER_IDS` fixes a global priority, and each roster is a subsequence of it.
   - Classification-only models (logistic, the balanced variants, NB, linear SVM) do not compete in
     regression.
   - A long name may change with the task: Ridge is «Clasificador Ridge» when classifying and
     «Regresión Ridge» when estimating (`memberNameKey`).
3. **One rule per metric (`METRIC_RULES`).** Direction and tie tolerance live in one table. It
   governs `selectOneSe`, `pickBestBaseline` and `computeVerdict`, and has a parity tripwire with
   Python's `METRIC_DIRECTION`.
   - Binary keeps its exact rule: higher is better, absolute ±0.01.
   - Regression uses the **MAE** in the target's units: lower is better, and it ties within **1 %
     relative** to the best baseline's MAE.
   - CV scores with `neg_mean_absolute_error`, and Python flips the sign, so `cv.mean` is already
     the MAE.
4. **Baselines: the median and linear regression.** For MAE the optimal constant is the median, not
   the mean. Measured in 9 of 9 datasets, the mean baseline would hand the model an easier win.
   Linear regression is a baseline AND a member, like logistic regression in S5:
   - its tie headline («La liga no encontró nada mejor que la regresión lineal de referencia»)
     appears **only** when linear regression is the deciding baseline and the verdict ties;
   - «NO supera» is never covered (AU-S5-01).
5. **Split by quantile bands.** Five range bands of the target, stratified, so 200 rows still get a
   test set across the whole range. CV uses `KFold(shuffle, seed)`, and `k` follows `n_train`.
6. **Guard rails with measured thresholds.**
   - **Continuous leakage:** |Spearman| ≥ 0.98 for numeric features, and η² ≥ 0.98 for categorical
     ones, with a **minimum support of 5 rows per category** (rarer categories are pooled, like
     `min_frequency`). The support rule is new: the binary check has none.
   - A column is checked only with **at least 10 rows with a value in train**
     (`LEAKAGE_MIN_PAIRS`, sprint log D8): with 10 pairs, a chance |Spearman| ≥ 0.98 has an exact
     probability of 1/181 440; with 3 pairs it is 1/3. The binary check needs the same idea per
     class, and that is S7's debt.
   - **Informative EDA:** `target-skewed` when |skew| ≥ 1, and `target-outliers` when ≥ 1 % of the
     target lies beyond 3·IQR.
7. **The verdict in units.** «Se equivoca en promedio ±X; [baseline] ±Y».
   - The unit comes from a **closed table of column-name suffixes** (`_kwh`, `_usd`, `_min`…).
     Without a known suffix the UI says «en las unidades de «columna»»; it never invents one.
   - Figures use a dot decimal and comma thousands, like the rest of the app, with three
     significant digits of the smallest value they are compared with, and a non-breaking space
     before the unit.
8. **Estimate-vs-actual as data in the contract.**
   - Python returns a deterministic sample of test points, capped at 200.
   - It also returns error quantiles computed on the WHOLE test set; they feed the text equivalent
     of the chart.
   - These values derive from the target, so they live only in the browser (hard rule 2). The
     league breadcrumb carries only `task`.
   - Whether the model «tends to estimate over or under» is decided by an **exact sign test at
     α = 5 %** on the chart's sample (`RESIDUAL_LEAN_ALPHA`, sprint log D9), and its side must
     match the median error of the whole test set. A fixed share of the MAE called an unbiased
     model «leaning» in 74–83 % of runs with 50 test rows.
9. **No AI narration for regression (double lock).**
   - `useNarration` never builds a payload or calls the route for a regression result.
   - The route's schema accepts only `binary-classification`.
   - The deterministic template covers regression, and the screen says plainly that AI narration
     does not apply.
10. **An ambiguous target is asked, not guessed.** With few distinct numbers the app asks
    «¿categorías o una cantidad?», showing E1's suggestion marked with a symbol and text.
    - «Una cantidad» trains the regression.
    - «Categorías» routes to multiclass, which honestly says it comes in a later version
      (deviation D2).

### Design-system entry (the system grows only through an ADR)

`PredichoVsReal` is a library-free SVG:

- the diagonal y = x is a solid `ink` line;
- the ±MAE band is `accent/10` with dashed full-`accent` edges (≥ 3:1 against the background in both themes);
- points change **shape**, not only colour: a filled `accent` disc inside the band, a `caution` ring
  outside;
- the legend draws a sample of each element.

The chart has a descriptive accessible name, and the error quantiles below it serve as its text
equivalent. It lives on Results, outside the landing's LCP and script budget. The
`design-system.md` section «Añadidos Sprint 006» records it with the other S6 pieces.

## Consequences

- The binary league kept working untouched. Its inherited tests and 49 Python→TS baits stayed
  green. The only changes to binary fixtures were the additive `task` field, regenerated with the
  real emitter.
- Contract coverage per new field (after the sprint audit):
  - TS→Python 9/9;
  - league 36/36 (including the linear member scoring exactly as the linear baseline);
  - manual choice 6/6;
  - export 4/4;
  - scoring 4/4;
  - the regression manifest 12/12.
- Each new rule was seen red with `scripts/demo-rojo.sh` (sprint log, F1 #1–#14, F2 #15–#28, audit
  #29–#69).
- Trees, forests and kNN do not extrapolate beyond the training range; the kNN and Random Forest
  fichas say so, and the manual's known limitations say it for all of them.
- Multiclass (S7) will add a third rule set to `METRIC_RULES` and a third roster without touching
  this structure.
