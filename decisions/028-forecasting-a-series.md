# ADR 028 — Forecasting a series: its own flow, a rolling-origin league and a verdict against the best simple method

- **Status:** accepted
- **Date:** 2026-10-25
- **Sprint:** 020 (forecast a series, feature 18 of the VISION)

## Context

The VISION promises that, with a date column and a numeric target, the app can project the series. It is a fourth question next to
the three tasks with a target (two classes, several classes, a quantity) and to grouping, but it is not a fourth _classification of
a column_: there is no target to detect, no held-out test to open once, and no `.probeta.json` to take away. Three constraints
shaped the decision: the app adds **no dependency** (`statsmodels` is not hosted for Pyodide and is not added), the forecast is
**deterministic code** (no new call to a language model, rule 14) and the honest verdict has to be possible to _fail_: on a series
with no structure, the screen must be able to say that nothing beats a simple method.

## Decision

### 1. Forecasting is its own flow, not a fourth branch of `matchByTask`

The task unions (`Task`, `TrainTask`, `ByTask`) are closed on purpose: a new literal would touch ~155 dispatch sites in 59 files, four
complete `Record`s and the 40 `"agrupar":` dictionaries of `pipeline.py`, and `despacho.test.ts` pins the number of tasks that
train. So forecasting follows grouping's precedent (ADR 016) one step further: it is **an option of the target selector**
(`__pronosticar__`, lengthened until it cannot collide with a column), a local panel in the configuration screen
(`components/pronostico/`, loaded with `next/dynamic`), and its own worker command `forecast`. It does not touch the retained model
(`_MODEL`), the manifest, `ExperimentResult` or the Protocol. Saving a forecaster as a `.probeta.json` is **not promised** (the
VISION promises projecting the series, and the CSV of the forecast is downloadable).

### 2. It reads the table as it arrived

The structural sanitation drops a column with one distinct value per row as an «identifier» — which is exactly what a date column of
a series is — and a file of two columns (a date and a number) is left with one and is «unusable». So the panel reads the **raw
table** (`getRawTable`), and a file that is only a series (`seriePosible`: a column that looks like a date and one with numbers, but
nothing left to train on after sanitation) opens the configuration screen with **only** the forecast option instead of an error. Rows
are _not_ de-duplicated: two equal rows are two equal sales, and the sum counts both. The worker receives numbers only (the series,
the season, the horizon, the period): no date, no column name.

### 3. The series: one value per period, gaps named and never filled silently

`engine/serie.ts` (pure, no `Date`, no time zone) turns rows into one value per period — day, week starting on Monday, or month —
adding or averaging what falls in each period. The period is **proposed** from the median gap between the distinct dates (≤ 1.5 days
→ day, 5.5–8.5 → week, 25–35 → month; anything sparser is not proposed) and the aggregation from the column name (a rate, price or
average is averaged); the user changes both. If the day/month order of the dates is ambiguous (`05/06`), the existing date reader asks.
Adding daily data into weeks or months drops the incomplete end periods (a half-filled sum would read as a fall) and says which.
**Missing periods are named and the user decides:** they can be filled with the straight line between the neighbours (flagged in the
CSV), but only if they are at most 20 % of the periods. Nothing is filled on its own.

### 4. The league: six methods, a rolling origin, the one-standard-error rule

Mean of the history, naive (last value), seasonal naive (last season), drift (the slope of the whole series), additive Holt-Winters
(level, trend, season; `numpy` + `scipy.optimize`, three fixed starts, the best one-step-ahead error) and a ridge regression on lags and
the position in the season, recursive. **No randomness anywhere**: the same series gives the same figure.

The evaluation is an **expanding rolling origin**: at each origin every method is fitted _only_ on what comes before and has to hit the
next `h` periods. The last origin leaves exactly `h` periods to measure, origins go back in steps of `max(1, ⌊h/4⌋)`, there are at
most 12 and at least 3, and the shortest training set has 8 periods (or two seasons, when the seasonal methods compete). That the
backtest **never looks at the future** is tested: the errors of a fold do not change if the series is cut right after it or if
everything after it is replaced by garbage. The error is the mean absolute error in the units of the series plus the MASE (the same
error divided by the one of repeating the previous period — or season — over the whole series; Hyndman & Koehler, 2006). The winner is
chosen by the rule of one standard error of the app (`select_one_se`, direction «lower», simplest first), which TypeScript recomputes
and rejects the result if it does not match.

With **fewer than two full seasons in three folds** no method assumes a season and the seasonal naive does not compete; the screen
says so. A series too short for three folds returns `viable: false` with how many periods it needs. At most the 2,000 most recent
periods are used, and the screen says so.

### 5. The verdict is against the best simple method

The sprint plan asked for a verdict against the seasonal naive. Measured on 300 white-noise series it cannot be done: the plain mean
(MAE 3.96) and a level smoothing (4.02) beat the seasonal naive (5.64) by ~29 %, so «on white noise nobody beats it» would never be
true. The verdict therefore compares the winner with **the best of the four simple methods** (mean, naive, seasonal naive, drift)
with the 1 % relative tie of the MAE (`METRIC_RULES.mae`), and names it. On a seasonal series that method is the seasonal naive and
the sentence reads as planned. Four cases: _beats_ (an elaborate method wins by more than the tie), _ties_, _simple_ (a simple one
wins: no elaborate method beats it) and _no structure_ (the mean wins: the series shows nothing to project beyond its level). The
sentence comes from a template in both languages and passes the figure check of `narration/cifras.ts`.

**What the verdict can get wrong, measured.** On 150 white-noise series of 60 months (seed 0–149), the verdict said «beats» in
1 of 150 with `h = 12`, 11 of 150 with `h = 6` (12 overlapping folds), 2 of 150 with 120 months and 4 of 150 with 36 months and
`h = 3`. It is a one-standard-error rule over overlapping windows, not a significance test; the manual says so.

### 6. The bands are empirical

The 80 % and 95 % bands are the quantiles of the signed errors **the winner** made in the backtest, per distance from the origin; they
always contain the forecast and never narrow as the horizon grows, and the 95 % contains the 80 %. With 3 to 12 folds they are rough,
and the screen says how many folds they come from and that they are not a guarantee.

## Consequences

- No new dependency, no new call to a model, no new endpoint; the worker answers a new command with numbers only.
- The chart (SVG, no library) and the table of the forecast are in a deferred chunk; `/` and `/protocolo` carry only the few bytes of
  the option and of `seriePosible`. The first forecast downloads the Python engine like any other command.
- Forecast is not in the Protocol (the VISION puts it in Probeta), is not saved as a model, and handles one series at a time.
  Multiplicative Holt-Winters, a yearly season in daily series and several series are left out.
- A file that is a bare series now opens the configuration screen with one option instead of the «nothing left to model» error.

## Sources

- Hyndman, R. J. & Athanasopoulos, G., _Forecasting: Principles and Practice_ (3rd ed.): time-series cross-validation, the naive family,
  exponential smoothing.
- Hyndman, R. J. & Koehler, A. B. (2006), «Another look at measures of forecast accuracy», _International Journal of Forecasting_ 22(4):
  the MASE.
- Hastie, Tibshirani & Friedman, _The Elements of Statistical Learning_ §7.10: the one-standard-error rule, as in ADR 009.

## Addendum (Sprint 021) — the long daily series, measured

The sprint 20 left Holt-Winters on 2,000 daily periods without a figure. It was measured with the real Pyodide (Node, same WebAssembly
engine and Python as the browser; the production-build run in the browser is in the sprint 21 closing): **seasonal series of 2,000 and
2,100 days, season 7, horizons 7, 30 and 120, 12 folds, three starts and `maxiter = 60`: 7.3 to 9.2 s** in total for the league of six
methods, against the budget fixed _before_ measuring (45 s). In the browser (production build, Chromium, 2,000 daily rows through the
real screen, horizons 7, 30 and 120): **13.5 s the first time (it includes downloading the Python engine) and 8.4 s and 6.9 s after it**.
No cap was lowered and no start was removed. The screen already says
«forecasting…» while it runs; there is still no cancel button (the worker is separate, so the page does not freeze).
