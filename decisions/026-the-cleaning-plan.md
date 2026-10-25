# ADR 026 — The cleaning plan: the code proposes, the user approves each step

- **Status:** accepted
- **Date:** 2026-10-25
- **Sprint:** 018 (cleaning plan, personal-data notice)

## Context

The VISION promises «assisted cleaning with an auditable plan»: the code proposes the steps, the user approves or rejects each
one, and what was decided is recorded. Sprint 4 already sanitises by itself (exact duplicate rows, identifier and constant
columns, mixed numeric columns) and **reports** it; that stays. What was missing is the judgment calls: filling empties, fixing
types, treating outliers. They have to respect what the product is built on: **the preprocessor is fitted on the training rows
only** (ADR 002, extended in `sanitize.ts`). Any statistic computed on the whole table before the split — the median that
fills, the quantiles that clip — would let the test rows shape the training, which is the leak the app exists to prevent.
There is also a second consumer problem: whatever the app does to the training table must also happen to the new files the
model scores, in the scorer and in the service, which run in other places (Pyodide in a page, CPython on a server).

## Decision

1. **A step never touches the table.** An approved step travels as an *instruction to the preprocessor* (`SpecLimpieza`: column
   names only) or removes / reclassifies a column. The statistical part is fitted **inside the pipeline, with the training rows**, and
   is pickled with the model — so the scorer, the service and the recipe get it **without a second implementation** in another
   language. A test plants an extreme value only in the test rows and shows that the fitted quantiles never saw it.
2. **Five steps, each with a threshold written as a constant and a test at the edge:**
   `atipicos-cuantiles` (a numeric column with at least 3 values beyond 3·IQR becomes the position of each value among the others,
   `QuantileTransformer`, `random_state=0`) · `vacio-indicador` (a numeric column with 5–60 % empties and at least 10: the
   median fills and a «was empty» flag is added) · `vacio-categoria` (a categorical column with at least 2 % and 5 empties:
   «no data» becomes a category of its own) · `tipo-categoria` (integer codes with at most 12 values *and* a column name that says
   «code», «type», «zone»… are treated as a category, not as a quantity) · `quitar-columna` (a column the notice flagged as
   possibly personal). At most 12 steps are shown, the widest first.
3. **Nothing is applied unless it is approved.** The three states are *undecided*, *approved*, *rejected*; undecided does not
   apply. A step on the column being predicted, or on a column that was removed or became categorical, is **not applied and the
   record says why**. There is no «approve all» button: «step by step» is the promise.
4. **The record.** Each step with its decision, whether it was applied and the counts goes to the state, to the model card
   (a «Cleaning plan» section) and to the model file as an **additive-optional key** `cleaning_plan` (format version stays 1; a file
   from before this sprint imports). The recipe repeats exactly what was applied (`limpieza` in its declaration, column names only);
   the scorer and the service inherit it from the pickle.
5. **No generative AI.** The plan is code. The narrator (ADR 005) is not touched.

## The personal-data notice

A heuristic, never a block, never a value. It looks at formats with structure (email; phone with `+` or separators, never a bare
run of digits; documents with a check digit: DNI/NIE, RUT, SSN-shaped, CURP) and at column names in Spanish and English; person
names by pattern need at least 10 values, 60 % shaped like a name and mostly distinct (a repeated category is not a person). It
returns *column, type, how it knew*; a test shows that no cell of a flagged column appears in the result or in the HTML. It
is **not** an `EdaAlert`: those are born when the target is chosen and this must be seen at load. It does not find everything; the
screen says so. The exported model carries ranges and categories seen in training, so a personal column that is kept can travel
inside it: the notice offers to remove the column in the plan, and the notice that comes before every download (sprint 17) says what
the file carries.

## What it does not do (said in the manual)

- It does **not** recover numbers written with a symbol or a thousands separator (`$1,200`): those cells become empty with a
  notice, as before. Doing it would need the same grammar in TypeScript and Python, for a case the user can fix in the spreadsheet.
- It does not apply to the Protocol, whose stages have their own gates.
- The **counts shown with each proposal** (how many empty cells, how many far-off values) are taken over the whole table, like the
  EDA alerts that come before training; what the model **computes** when a step is applied (the median, the quantiles, the extra
  category) is fitted on the training rows only. The user decides with a description of the data, never with the test rows' influence
  on the model.

## Consequences

- `_make_preprocessor(numeric, categorical, limpieza=None)` keeps the old preprocessor when no plan is approved (same pipeline,
  same payload without the key): nothing changes for whoever approves nothing.
- The CI proves the pickles with the plan open in CPython 3.14.0: the recipe reproduces and the service scores a model trained with
  the three statistical steps.
