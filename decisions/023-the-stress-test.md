# ADR 023 — The stress test: how much does the model take?

- **Status:** accepted
- **Date:** 2026-10-24
- **Sprint:** 017 (the stress test in Probeta and in stage 8 of the Protocol, and the robustness line of the card)

## Context

The VISION promises a stress test: «with 10 % noise your accuracy falls from 91 % to 74 %». It is the third thing the
user can do with a model after reading the verdict and the importance: ask how much of the verdict survives when the data
moves a little. It must obey the rules that already hold: 100 % CPU, no value of the dataset leaves the browser, no
generative AI, the honesty accompanies and does not block (rule 3), and in the Protocol the test is opened once and every
distinct opening is counted (ADR 022 §3).

## Decision

1. **One engine, two entries.** `pipeline.py` measures the same model, without retraining it, on the same test, perturbed three
   ways with a fixed seed: (a) Gaussian noise in the numeric columns at 5, 10 and 20 % of their standard deviation in
   training; (b) every column shuffled alone, five repeats, ordered from the one that hurts most; (c) the three most
   affected numeric columns moved +0.5 and +1 standard deviation, as time would. `run_stress` serves Probeta (the retained
   model and its test, kept in memory only: `export_model` builds the pickle key by key and `eval` is not one of them, with
   a test that opens the pickle); `run_stress_test` serves stage 8 (the same envelope that opened the test, the winner is
   refit with the training rows as `run_test` does). The metric is the primary one of the verdict. It returns column names
   and numbers, never a value of the data. Clustering has no target and no test: `not-applicable`, said on screen.
2. **Deterministic by construction.** Every step draws from its own generator derived from the run seed, so the order of
   the steps does not change a figure and the same seed gives the same figure twice (a test runs it twice, changes the seed
   and sets the noise to zero, which must give the base). Constants live in one place per language and a test compares them.
3. **It reads, it does not choose.** The stress test never picks a model, a threshold or a decision. In stage 8 it is **not an
   opening**: it reuses the rows of the test that was already opened, with the same seal and the same winner, and the reader
   (`contrato-estres.ts`) rejects an answer whose winner, seal or fingerprint is not the one sent. If the configuration changes,
   that is another opening (ADR 022 §3) and the reading is requested again. There is no new gate: it is optional.
4. **The criterion of the ✓ is the verdict's own rule.** With 10 % noise the model **still beats its best rival without a model**
   in the primary metric, judged by `computeVerdict` with `METRIC_RULES` (the same tolerance of a tie, in the same direction).
   No new threshold is invented. The rival is the verdict's in Probeta and, in stage 8, the one Python measures on the same
   test (majority/median or the logistic/linear of the league). If the model does not beat the rival even without noise the
   line says so, because then the noise is not the cause. The figure is shown whether or not the criterion passes.
5. **The card gains one line, and only what is stored.** Stage 8 stores three optional fields (`estres_ruido`, `estres_rival`,
   `estres_rival_id`); the card recomputes the criterion from them and writes `robustez`, `robustez-cae`, `robustez-ya-perdia`
   or `robustez-sin-medir`, each with its source (stage 8). Not measured is an honest line, not a hole. The notebook format
   stays version 1: the fields are additive and an older notebook opens (ADR 022 §5).
6. **It is a reading of this test, not a guarantee.** The screen says so and shows the seed. Noise is Gaussian and independent
   per column, the shift moves numerics only, and a few hundred rows give wide margins of luck: «better under noise» is
   written as chance, never as an improvement.

## Consequences

- Probeta needs the worker that holds the model: `useExperiment` exposes a generic `ask` channel (the only eager code of the sprint,
  measured against `main`); the panel, its texts, its reader and its view travel in their own chunk.
- A model imported from a file has no test to stress (`no-eval`); the screen tells the user to stress it in the run where it was trained.
- Categorical columns get only the shuffle: there is no honest «noise» for a category.
- The cost grows with `rows × columns × 5` predictions of the winner; the screen shows it is running and the figure does not depend on it.
