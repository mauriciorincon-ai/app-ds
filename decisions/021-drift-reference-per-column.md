# ADR 021 — The drift reference: what the notebook keeps from a column, and who decides

- **Status:** accepted
- **Date:** 2026-10-21
- **Sprint:** 015 «La ficha que se escribe sola» (decision taken with the user on 2026-10-20) and 016 «El producto completo»
  (the cases that have nothing to compare against)

## Context

Stage 10 writes the model card from the notebook and, with «use», a watch plan: a **drift reference** per column the
model uses, so that a new CSV can be compared against the training data (PSI, the conventions of stage 4: 0.10
moderate, 0.25 alert). Rule 2 says no value of the user's data leaves the browser, and the notebook is a file the user
downloads and may share: whatever it keeps is part of what leaves their hands. A numeric column can be summarised by
rounded quantile cuts and counts, which identify no row. A **text column** cannot be summarised without naming its
categories, and a category name («empleo = ingeniero») is a value of the data, not a count.

Three options were on the table: keep nothing from text columns (the check would be blind to them), keep the names of
every category with enough rows (the card and the exported notebook carry values), or let the owner decide per column.

## Decision

1. **Numeric columns are always kept, as aggregates.** Cuts rounded to `REF_CIFRAS` (3) significant digits, and the
   counts per bucket made with those rounded cuts so a new file falls in the same buckets. The cuts exist only with
   at least `REF_SOPORTE_MIN × DERIVA_CUANTILES` (25) rows with a value: with fewer, a cut would be an individual value.
2. **Text columns are offered unchecked, one by one; the owner decides.** Only the columns the owner checks keep the
   names of their categories, and only the categories with at least `REF_SOPORTE_MIN` (5) rows; the rest go to
   «otras». A column left unchecked keeps **nothing** (not even a count that names a category): the notebook lists
   it as «sin vigilar por decisión del dueño», the card says so, and the drift check does not watch it nor claims it is stable.
   The notebook reader rejects a category name from a column that was not checked: a hand-edited file cannot smuggle values in.
3. **A check never says «stable» where it had nothing to compare.** If a checked text column has no category with
   support, or a numeric column has no cuts, its state is `sin-referencia` (next to stable, moderate, alert,
   few-rows and other-type); a «sigue» verdict speaks only of the columns that could be measured.
4. **The check measures inputs, not performance.** It says so on screen and in the card. Watching performance needs the
   new outcomes and the saved model, and neither lives in the app.

## Consequences

- The default protects the user: nothing that names a value is stored unless they asked for it, at the price of a
  weaker check on text columns until they check them.
- The reference is an input of the card: changing the choice rewrites the card (it is never edited by hand).
- A third approach — storing hashed category names — was rejected: a hash of a short category is reversible by
  enumeration and would look like privacy without being it.
- Whoever extends the check to performance (H-3 and later) reads this ADR first: the notebook still must not hold values.
