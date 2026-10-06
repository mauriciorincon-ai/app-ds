# ADR 016 — Grouping similar rows without a target

- **Status:** accepted
- **Date:** 2026-10-05
- **Sprint:** 007 «Agrupar y multiclase»
- **Builds on:** ADR 011 (honesty that accompanies), ADR 014 (the model file per task, cited, not
  edited)

## Context

Some users have nothing to predict: they want to know whether their rows form groups and what sets
each group apart. Without a target there is no test set and no baseline to beat, so the app's usual
promise («the table serves to choose, the test serves to believe») needs another way to believe.
Clustering also always returns groups, even on pure noise. In the spike, K-Means on uniform data
gave silhouette 0.62 and stability 0.98 (S7 spike, §2.2). A reading without a reference would call
noise «stable groups».

## Decision

1. **A choice on the dataset, not a column type.** «No target: group similar rows» is the first
   option of the target selector. A column that cannot be a target offers it too. The supervised
   path is untouched: `prepareClusterRun` and the cluster payload are separate, and Python rejects a
   cluster payload that carries `target`, `train_idx`, `test_idx`, `primary_metric` or `cv_k`.
2. **Features.** With at least two numeric columns, similarity is measured on the numeric ones. The
   categorical ones only describe the groups: in the spike, one-hot encoding made up groups. With
   fewer, it uses all columns. Identifiers and dates are left out and listed with their reason. The
   preprocessing is fitted on all rows, and the screen and the model card say so.
3. **Four clusterers, k in 2..10.**
   - K-Means and Agglomerative (Ward) choose k by silhouette, on one seeded sample of up to 2,000
     rows shared by all of them.
   - GMM chooses k by BIC.
   - HDBSCAN finds its own groups, with `min_cluster_size = max(5, n/50)`.

   The comparable score is `silhouette × (1 − noise share)`, so HDBSCAN cannot win by discarding the
   hard rows.

4. **The winner, by consensus** (user decision 4). The winning k is the one most clusterers agree
   on; among them, the highest score wins. In the spike it recovered the planted k in 3 of 3 cases;
   the highest score alone did so in 2 of 3. The rule always picks a winner. It is only _called_ a
   consensus when at least two clusterers agree (`hasConsensus`). Otherwise the screen, the card and
   the model card say «winner by score».
5. **What serves to believe: the null reference and stability** (user decision 5).
   - The winner is compared with the same clusterer on structureless data in the same box: a gap of
     at least 0.10 is required. In the spike, the gap without structure stayed at or below 0.045, and
     with planted groups it stayed at or above 0.209.
   - The winner is refitted on 10 seeded subsamples of 80 % of the rows, and the mean ARI must be at
     least 0.7.

   Together they give one of three readings, each with a symbol and text: ● «the groups exist», ⚠
   «they are fragile», ○ «no group structure». The table of clusterers stays visible in every case.

6. **Agglomerative above 8,000 rows** (user decision 8). Above `AGGLO_MAX_ROWS = 8000` it is fitted
   on a seeded sample of 8,000 rows, and the rest go to the nearest group. It never disappears. The
   note appears before running, next to the reading if it wins, in its row, in the model card and in
   the exported file. With large data it moves to Level 2, because its cost grows with n².
7. **Assigning new rows without training rows in the file** (P12).
   - K-Means and Agglomerative: the nearest centroid.
   - GMM: the most probable component, with its probability.
   - HDBSCAN: the nearest centroid, unless the row lies farther than the farthest member of that
     group, in which case it is «outside every group».

   The file keeps preprocessing and centroids (means, covariances and weights for GMM), and the
   model card reports how many training rows the rule reproduces.

8. **Per-row labels never leave the download** (P13). They are fetched from the worker only when the
   user downloads «rows with their group», validated, written and forgotten. They are never in the
   state, the result, the manifest, the model card or a log. The CSV is the user's whole table as it
   arrived: each original row gets its sanitized twin's group (`dedupeIndex`). That way identifiers
   removed by sanitation come back.
9. **No leakage check and no AI narration.** There is no target that a column could reveal, and the
   narration covers only the binary task. Both are stated as «does not apply».

## Consequences

- Clustering copy never borrows the league's words: no cross-validation, no «full league», no
  «N models». A guard test keeps it that way.
- The model file follows ADR 014 with `task: "agrupar"`, no `target`, `groups`, `noise` and
  `assign`. An unknown task is still rejected by name.
