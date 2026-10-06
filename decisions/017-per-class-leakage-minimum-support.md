# ADR 017 — Leakage per class, with a minimum support (D8)

- **Status:** accepted
- **Date:** 2026-10-05
- **Sprint:** 007 «Agrupar y multiclase»
- **Pays:** debt D8 of Sprint 006 (a leakage flag on a tiny class is noise)

## Context

The binary leakage check (S1; ADR 002 makes leakage impossible by construction, and this check catches columns that already contain the answer) flagged a column when it alone almost
perfectly separates the target: rank AUC for numeric columns, purity for categories. With several
categories, a column can reveal **one** category and say nothing about the rest. With small classes
the same measures fire by chance. In the spike, raw purity crossed 0.98 in 56–62 % of random draws
with a 2 % class. S6 recorded this as debt D8 for the binary task too.

## Decision

1. **One against the rest, per class.** For each class c, the check runs c against everything else:
   rank AUC (|AUC − ½| ≥ 0.48) for numeric columns, and **normalised purity** for categorical ones.
   Raw purity is high whenever «the rest» is most of the data. In the spike, normalised purity gave 0
   false flags in 255 legitimate columns and 0.0 % by chance.
2. **Minimum support S = 5 on each side.** Class c is only evaluated when both c and the rest have at
   least 5 rows with a value in that column (`LEAKAGE_CLASS_MIN_SUPPORT`). The exact chance of a
   false flag for a numeric column at S = 5 is 0.794 % (3: 3.571 %; 4: 1.587 %; 6: 0.050 %): below
   the 1 % the plan required. The threshold stays at 0.98 (user decision 3).
3. **The binary task adopts the same rule** (K = 2 is the same engine). In the spike, 0 of the 11
   binary targets in the kit changed verdict, and the planted `monto_recuperado` of
   `credito-fuga-plantada.csv` stays flagged with S = 1, 3, 5 and 10. The boundary (S − 1 does not
   flag, S does) has its own unit test.
4. **The flag names the column and the class.** On screen: «column X separates class Y from the rest
   almost perfectly». The class name is the user's data, so it stays on screen and out of logs.

## Consequences

- One rule, in one place, for both classification tasks. Regression keeps its own continuous check
  (|Spearman| / explained variance, S6).
- A per-class flag does not imply near-perfect overall metrics. The multiclass headline says
  «possible data leak» instead (ADR 015).
