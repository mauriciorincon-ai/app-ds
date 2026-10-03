# ADR 010 — Deterministic routers (task · models by level · reading sheets) and the league cost model

- **Status:** accepted
- **Date:** 2026-10-02
- **Sprint:** 005 «La liga honesta»

## Context

With fourteen members (ADR 009) somebody has to decide, before training, what kind of prediction a
column implies, which models run now and which later, and how long that will take in the user's
browser. None of these decisions may be delegated to an LLM (hard rule 4 — and there is no new AI
in this sprint), none may look at what is being evaluated, and none may hide anything (hard rule 3,
ADR 011).

## Decision

### E1 — task router (`engine/tarea.ts`)

`detectTask(values)` classifies any column as `binaria` · `multiclase` · `numerica` ·
`sin-objetivo` · `ambigua`, with the reason in numbers ("2 valores distintos → clasificación
binaria"). Thresholds are exported constants (`AMBIGUOUS_MAX_DISTINCT = 10`,
`MULTICLASS_MAX_CLASSES = 20`). Every column is offered as a target with its task; only `binaria`
trains in S5 (`TRAINABLE_TASKS`) and the others say so — the column is never hidden.

### E2 — model router (`engine/encarrilador.ts`)

`routeModels(profile, ceilingS, forced)` places every member at level 1, level 2 or "out", each with
a reason code. The profile is **shape only** — rows, train rows, width after one-hot (estimated
without fitting anything, same criterion as the encoder: categories with ≥ 2 occurrences in train
plus one infrequent bucket), minority share in train, k — the same principle as
`pickPrimaryMetric`.

- **Out, only where measured (D9):** `mlp` below `MLP_MIN_ROWS = 500` rows (it learns nothing
  stable — measured on the kit), and the balanced variants when the minority share is
  `≥ BALANCED_MIN_MINORITY = 0.40` (they would repeat their base). The planned KNN and Naive Bayes
  exclusions were dropped: KNN costs 1.5 s of CV at 20 000 rows and NB with categoricals _wins_ on
  one kit dataset. Excluding without a measured reason is preventing, not advising.
- **Level 1 vs level 2 by cost against a ceiling (D3):** walking the priority order, a member enters
  level 1 while the accumulated estimate fits `LEVEL1_CEILING_S = 5` s (F0-1, fixed by the user —
  the whole league fits for the 200-row kit datasets; at 20 000 rows, 7 do). The first member always
  enters, so a league is never empty. The rest goes to level 2 with its own estimate.
- **Forcing (U3):** an "out" member can be included anyway; it goes to level 2 with reason
  `forced` and keeps the reason it was out for («lo incluiste tú; el encarrilador lo dejaba fuera
  porque…»).
- **Level 2 reruns the union (D5):** level 1 ∪ level 2 ∪ forced, in priority order — one result
  shape, one selection over everything. `planLevel2()` reports what would be added, what can still
  be forced and the estimate.
- Python receives the roster and never re-derives it.

### E3 — reading sheets (`src/content/modelos.ts`)

One sheet per base model plus the majority baseline — what it is · when it works · when it does
not · what to watch in this app · what it costs — as `{es, en}` data written in each language
(kit rule 20), with a parity test against the roster. Balanced variants share their base's sheet
plus a paragraph of their own. The sheet opens in a native `<dialog>` loaded with `import()` (the
content does not ship in the landing bundle) and states what happened to that model in _this_
league (winner · chosen · rank k of n · did not finish · pending · out because… · baseline).

### Cost model (`engine/costos.ts`)

Per member, fitted on the F0 spike (Chromium on the production build, 8 datasets):

`t_cv5 ≈ t0 + a · (n_train/1000)^b · (width/33)^c` seconds; a fit on a fraction `f` of train costs
`t0/5 + (variable/5)·(f/0.8)^b`; a member's estimate is its k fits on `(k−1)/k` plus the final fit
on all of train (the test of every member is computed in the same run — F0-5).

Devices differ (WebKit ≈ 1.4×, a phone 2–4×), so the level 2 estimate is **calibrated**: the factor
is what the previous run actually took over what was estimated for the members that ran, clamped to
`[0.25, 8]` so one odd measurement (a background tab) neither over-promises nor scares. The level 1
estimate on the configuration screen is labelled as the reference desktop figure.

### Cancelling level 2 (R1)

A synchronous Python call cannot be interrupted. Before level 2 starts, the current model is
exported as a snapshot; cancelling terminates the worker, spawns a new one and re-imports the
snapshot (the ADR 007 path). Use/export wait for `modelReady`. If level 2 fails (Python error,
contract violation, dead worker) the previous result comes back with a notice instead of the error
screen; if the worker dies before the snapshot exists, the app says the model could not be
recovered. `reset()` with work in flight also terminates the worker, so a new experiment never
queues behind an abandoned league (R15).

## Consequences

- Every router is a pure function with exported constants and tests; changing a threshold is a
  reviewed code change, not a prompt.
- "Out" is a recommendation, never a wall: the table lists out and pending members with their
  reasons, and both can be run.
- The cost coefficients age with Pyodide/sklearn versions; the gate is indirect (the e2e that runs
  `liga-mediana.csv` expects a non-empty level 2). Re-measuring is a spike, recorded as debt when
  the runtime changes.
