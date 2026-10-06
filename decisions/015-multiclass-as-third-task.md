# ADR 015 — Several categories as the third task

- **Status:** accepted
- **Date:** 2026-10-05
- **Sprint:** 007 «Agrupar y multiclase»
- **Builds on:** ADR 009 (the league), ADR 013 (regression as the second task), ADR 014 (the model
  file per task, cited, not edited)

## Context

Until S6 a target with 3–20 categories was detected (E1, S5) and shown as «not trained yet». The
VISION promises four tasks, and this one reuses almost everything: the same 14 members exist in
scikit-learn, XGBoost and LightGBM in a native multiclass form. What does not carry over is
everything that assumes two classes: «the positive class», the 2×2 matrix, AUC of one score, the
probability column of the scored CSV, and the narration payload.

Almost every place in the code dispatched with `task === "numerica" ? regression : binary`, so a
new task would have fallen silently into the binary branch.

## Decision

1. **Exhaustive dispatch first (P2).** `src/engine/despacho.ts` (`byTask`, `matchTask`,
   `matchByTask`) is the only place that maps a task to its branch. The types force every branch to
   be written. Python dispatches with `_branch(task)`, which fails on an unknown task. A source test
   forbids `task === "…"` and `?? "binaria"` outside it. Three gates, each born red (S7 log, first
   commit).
2. **Primary metric: balanced accuracy** (user decision 1, F0 stop). Chance is exactly 1/K, and in
   the spike it changed winners in 2 of 5 partitions, against 3 of 5 for macro F1. Macro F1,
   accuracy, log loss and one-vs-rest AUC are shown. Log loss and AUC are `null` for members without
   probabilities (Ridge, linear SVC), shown as «—», never invented.
3. **Baselines and verdict.** The baselines are the majority class and the multinomial logistic
   regression, which is also a league member. The tie tolerance is 0.01 absolute (decision 2), as in
   the binary task. The logistic tie rule of S5 (AU-S5-01) and S6 (AU-S6-18) applies: the logistic
   only gets the tie headline when it decides the verdict.
4. **Same league, same rules.** The same 14 ids form a subsequence of `ALL_MEMBER_IDS`, with
   cross-validation inside train and the one-standard-error rule, and the test set is opened once.
   Labels are encoded 0..K−1 with the classes in a stable order (XGBoost requires it). The cost model
   gains a `(K/5)^d` factor per member, measured in the spike. The balanced variants stay out when
   `minorityShare × K ≥ 0.8`: the same 0.4 × 2 of S5, rewritten for K classes, with an equivalence
   test on the binary task.
5. **Cross-validation and rare categories.** `chooseCvK` uses the smallest category in train. If it
   has fewer than 2 rows, training is refused with `too-few-rows-per-class` and the screen names the
   category. The name stays on screen, never in logs.
6. **What the screen shows.**
   - A K×K confusion matrix on test. The diagonal hits carry ✓ and a screen-reader «hit» label, and
     the table scrolls inside its own named region, so the page never scrolls sideways.
   - The most frequent confusion in one sentence, and per-category precision, recall, F1 and support.
   - Explanations by permutation on balanced accuracy, with «no single direction» stated instead of
     an arrow.
   - A per-category leak (ADR 017) gets its own headline, «Possible data leak — suspicious»: the
     column reveals one category, so the overall figure can be far from perfect (planted example:
     0.78).
7. **Scoring.** The scored CSV adds `<target>_predicted` and `<target>_probability`: the probability
   of the predicted category, with a note that it can be low even when it is the most likely one.
   Formula neutralisation (AU-S6-33) applies.
8. **The model file.** It follows ADR 014: `task: "multiclase"` plus `classes` (3–20), validated
   field by field. S5 and S6 files import and score as before (the `modelo-s5` and `modelo-s6`
   fixtures).
9. **No AI narration.** The client builds a payload only for `binaria`, and the route rejects any
   other `problem` with a 400 (P10). The local template narrates multiclass results from the same
   numbers.

## Consequences

- E1's «Categories» answer to the ambiguous question now trains (debt D2 of S6 paid).
- A column with more than 20 distinct values is not taken as categories. It offers «group similar
  rows instead» (ADR 016).
- Every binary and regression test kept passing, and their contract fixtures did not change shape.
