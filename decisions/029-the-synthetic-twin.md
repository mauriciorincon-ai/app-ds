# ADR 029 — The synthetic twin: a Gaussian copula with a fixed seed, a report that can say «do not share»

- **Status:** accepted
- **Date:** 2026-10-25
- **Sprint:** 020 (synthetic data, feature 17 of the VISION)

## Context

The VISION promises a synthetic copy of a table that keeps its shape and its relationships and lets the user share a sample without
sharing the people. A synthetic table can fail in two opposite ways: it can **not resemble** the data (useless), or it can **resemble
it too closely** (rows of real people show through). The app already refuses to claim more than it measures, so the twin ships with a
report that can end in «do not share». Constraints: 100 % CPU in the browser, no new dependency (`numpy`, `scipy` and `scikit-learn` are
already in the worker), deterministic (a fixed seed), and the data never leaves the browser.

## Decision

### 1. What travels and what does not

TypeScript (`engine/gemelo.ts`) decides which columns go to the worker, and the worker only ever sees those. **Out, and named on screen
with the reason:** a column the personal-data notice of sprint 18 flagged (`personal`), free text (`texto_libre`: a mean length over 40
characters, or more than 50 distinct values that are more than half of the rows), identifiers (`identificador`: a text with a distinct
value in every row, or an integer column with almost one distinct value per row **and** that counts like a counter or is named
`id`/`código`/`folio`…; a continuous amount with all-distinct values is _not_ an identifier, as the sanitation of the app already says),
dates (`fecha`), constants and columns with almost no data (`vacia`). In the worker, a category with **fewer than 5 rows is merged into
«otras»** before anything is sampled, so a rare category never travels as it is. If no column can travel, the panel says so and does not
generate.

### 2. The generator: a Gaussian copula

Each column keeps its **marginal**: numbers by the empirical quantile function (linear between observed values, never outside the observed
range, integers stay integers, the share of empties is kept) and categories by their ordered frequencies. The **dependence** is the
correlation matrix of the normal scores of the ranks (a category gets a seeded point inside its interval of the cumulative
frequencies), with an eigenvalue floor of 1e-6 so it can be factorised (Cholesky). Sampling uses a `RandomState(seed)` with the
fixed seed 42: the same table gives the same twin. By default it has as many rows as the data (at most 50,000).

### 3. Zero exact copies, and the proof does not live in the worker alone

Any synthetic row identical to a real one (numbers to 6 significant digits, rare categories already merged) is **drawn again**, up to 20
rounds. If copies remain (a table with few possible combinations copies itself), the number is reported, the verdict is «do not share» and
the screen says why. The reader of the contract (`contrato-gemelo.ts`) **recounts the copies itself** with the real table in hand and rejects
a result whose `copies` is not the number it finds: a worker that said «zero» with a copied row, or the other way round, is refused.

### 4. The report: against the data _and_ against two real halves

Judging a twin against a fixed number («KS < 0.1») is unfair: a sample of 200 rows already differs from another sample of 200 real rows by
chance. Every figure is therefore read **against how much two halves of the real data differ from each other** (the «floor»), with a
fixed minimum floor so large data does not ask the impossible:

| Part | Measure | Floor | «good» | «review» | «bad» |
| --- | --- | --- | --- | --- | --- |
| Column by column | mean KS (numbers) / total variation distance (categories) twin–data | the same between two seeded halves of the data (min 0.03) | ≤ 1.25 × floor | ≤ 2 × floor | more |
| Relationships | mean \|Δ\| of Pearson (numbers) and of Cramér's V (categories), twin–data, with **the measures of the exploration of sprint 18** (`relaciones`) | the same between halves, averaged over 6 seeded splits (min 0.05) | ≤ 1.25 × floor | ≤ 2 × floor | more |
| Closeness | distance from each synthetic row to the nearest real row (numbers in deviations, categories one-hot with a change weighing 1; at most 2,000 rows each side) against the distance from each real row to the nearest _other_ real row | — | median ratio ≥ 0.8 and ≤ 15 % of the synthetic rows closer than the closest 5 % of the real ones | ratio ≥ 0.5 and ≤ 25 % | less |

**The verdict.** _Do not share_ is a question of privacy: any exact copy, or a «bad» closeness. _Review_ is a question of fidelity (or a
doubtful closeness): something is not «good» but nothing leaks. Otherwise, _safe to share_. The sentence says the reasons.

**Measured on the kit** (seed 42, a twin as long as the data; two halves of 100 rows): columns 0.037–0.050 against a floor of
0.091–0.109; relationships \|Δr\| 0.043–0.116 against a floor of 0.087–0.118; closeness ratio 0.95–1.92 with 1.5–13 % of the rows under the
real 5 %; zero copies. A table of two columns with two categories each (4 possible rows) gives copies after 20 rounds and ends in
«do not share». The verdict is a measurement of this table with these rules, **not a legal opinion and not a guarantee of anonymity**
(the screen says so): a twin of a very small group can still identify its people by being the only one with some combination.

## Consequences

- No dependency, no new call to a model, no new endpoint; the worker answers a new command with the synthetic rows and the figures.
- The comparison of relationships runs in the main thread after the worker answers (the panel says «comparing the relationships»); it
  uses a sample of at most 4,000 rows for the floor.
- Dates do not travel to the twin (a date column is named and left out). A twin of a series is the forecast's job
  (ADR 028), not this one's.
- The CSV is built and downloaded in the browser with the protection against formulas of every download of the app.

## Sources

- Patki, N., Wedge, R. & Veeramachaneni, K. (2016), «The Synthetic Data Vault», _IEEE DSAA_: the Gaussian copula synthesizer over
  per-column marginals.
- DataCebo, _SDMetrics_ documentation: the column-shape (KS, total variation), column-pair (correlation, contingency) and
  distance-to-closest-record measures this report adapts.
- Sklar's theorem (1959): a joint distribution is its marginals plus a copula.
