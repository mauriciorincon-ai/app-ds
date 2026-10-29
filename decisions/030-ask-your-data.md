# ADR 030 — Ask your data: a deterministic question reader, a query that is shown and validated before it runs, and an SQL that is checked against the engine

- **Status:** accepted
- **Date:** 2026-10-26
- **Sprint:** 021 (feature 15 of the VISION, «Conversa con tus datos»; the last of the 37)

## Context

The VISION promises that the user can ask a question about their table in plain words and get the answer. Hard rule 4 lets a language
model only _narrate_ and never execute or write data; rule 14 says the product is solved with code first; rule 2 says the data never
leaves the browser. A model that writes the query would break the first, would need a new dependency and a new call, and would put the
question and the names of the columns on the wire. So the reader has to be **code**, and since code reads a question worse than a
person does, the design has to make a misreading **visible and impossible to miss** instead of rare.

## Decision

### 1. A reader in TypeScript, in the browser, with no worker and no request

`engine/pregunta.ts` reads the question against the **names of the columns** and the **values of the categorical columns** of the table
as it arrived (the raw table: the structural sanitation removes exact duplicate rows and identifier columns and would change sums and
counts; `bajas-con-fuga.csv` goes from 480 rows to 476). It returns one of three things: a **query** (`QueryPlan`), **open questions with
options**, or «I did not understand» with what it did read. Nothing is sent anywhere: there is no worker, no `fetch`, no log and no
Sentry breadcrumb (a unit test spies on all of them and an e2e test looks at every request for the question, the column names and the
cell values).

### 2. The grammar is small, written as data, and prefers asking to guessing

The lexicon (`engine/pregunta-lexico.ts`) is Spanish and English as **data**, not branches. What it reads:

- **What to measure:** sum · average · count (rows, or the values present in a column) · minimum · maximum · median. A word that is also
  part of a column name belongs to the column (`ingreso_mensual` is a column, not «per month»).
- **What to group by:** one categorical column, or **day, week (Monday), month, quarter or year** of a date column. «per month» groups by
  the month of the date even when «mes» appears in other column names; only a non-date column named exactly like the word wins it.
- **What to filter:** a value of a categorical column that appears in the question (`=`; `≠` after «sin / except / without»); numeric
  comparisons («más de», «al menos», «menor a», «over», «at most»… and the symbols `> >= < <= =`) with the operators of `regla.ts`, at most
  **two conditions** (`CONDICIONES_MAX`); two values of the same column join with «or».
- **A time window**, always against **the latest date of the table, never the clock**: the last {week, month, quarter, year} (the
  calendar period that _contains_ the latest date), the last N {days…years}, the previous period, a year, a month («in March» asks which
  year if the table has more than one), `since` / `until` / `between`, and ISO dates.
- **Order and «the N largest / smallest»** (N ≤ 50), also said as «the 3 regions with the most sales» (the word after the number names
  the group) and «how many rows are there per region» (the rows are what is counted, not an unread word).

What does not fit (three conditions, two groupings, «contains», a second window) is **named**, never dropped: the question keeps a list of
the words it did not read («I did not read: …») and the query that is shown is exactly the one that runs.

### 3. What it asks, what it proposes

It **asks** (with radio options, and it does not let the query run until answered): a word that matches two columns; a value present in
two columns (`norte` in `region` and in `bodega`); an ambiguous day/month order of a date column; two date columns; a number such as
`1,500` (one and a half or fifteen hundred); which column a comparison applies to; which of two figures to measure; which year of a month.
It **proposes and marks «proposed»** (changeable before running): the calculation when the question does not say it (`proponerAgregado`:
a sum unless the name speaks of a rate, price or average) and the period of a date column grouped without one. Nothing runs by itself.

### 4. The query is validated before it runs, with symbol and word

Every check is shown with ✓ / ⚠ / ✕ _and_ a word (colour is never alone): the columns exist · the type serves the calculation (no
sum of a text column, no grouping by a column of numbers or by a column flagged as personal data) · the value of a filter exists in its
column · the window has rows (and a warning when the table ends inside the period) · the result has at most 500 groups (otherwise ask
for «the 10 largest» or filter) · how many rows are left out for an empty cell, an unreadable date or an empty group. «Run the query» is
disabled while any check is an error.

### 5. One semantics in two places, and an SQL that is verified

An empty cell **never** enters: not in the measure, not in the group, not in the date and not in a filter (not even with `≠`); text is
compared exactly. The engine (`engine/consulta.ts`) runs the query in one pass; `sqlDe` writes the same query in SQLite SQL with
explicit `IS NOT NULL` clauses, quoted identifiers (the double quote doubled) and quoted literals, `"tu_tabla"` as a placeholder, dates
read as `YYYY-MM-DD`, quarters as `YYYY-Qn`, weeks starting on Monday, and the median with window functions. The CPython job runs that
SQL in `sqlite3` over the same tables and demands **the same result table** (same groups, same order, same figures to 1e-12, same
number of rows per group) for the whole bank of questions plus a hostile case (`ed"ad`, `O'Brien`, `x; DROP TABLE datos; --`, empty
cells), and demonstrates that an altered SQL differs. The gate found a real defect the first time it ran (the row count of a median
group counted only the middle rows).

### 6. The sentence of the result is checked by another road

The sentence comes from a template in both languages (never from a model) and passes `verificarTexto`. Its figures are **recomputed by
another way** (the values of each group are sorted and then summed, the first group must really be the largest, the total is the sum
of all groups): if the engine and the recount disagree, or the template says a figure that is not there, it falls to a minimal line
that asserts nothing.

### 7. Where it lives and what it costs

A panel next to the exploration, loaded with `next/dynamic` with its engine, texts (`messages/pregunta.{es,en}.json`) and chart (bars in
HTML, a line in SVG, always with the figure written and a table as the accessible equivalent). Every new module is named in the `LAZY`
lists of `portada-liviana.test.ts`, so `/` and `/protocolo` cannot reach it statically.

## What it does not do

No language model writes or reads the query; no joins, subqueries or several measures at once; no connection to the user's systems or to
an external database (dropped on 2026-10-25 for the same reason as for monitoring: the data do not leave the browser); no
forecasting or modelling from a question; no «contains».

## Consequences

- Reading a question wrongly is still possible. The design makes it **visible** (words + SQL + checks + «proposed» + «not read») and
  makes the user press a button before anything runs; the manual says so.
- A table whose column names are in another language than the question gets «I did not understand» or «I did not read», not a guess
  (the reader has no thesaurus between languages).
- `Periodo` of the forecast (day / week / month) is untouched: quarter and year live in the query's own type.

## Sources

- SQLite documentation: window functions (`ROW_NUMBER`, `COUNT OVER`) and `strftime('%w')`, used by the median and the Monday week.
- The measures that shaped sprint 21 (twin proximity on categorical columns of thousands of values and long Holt-Winters) are in the notes
  of ADR 028 and ADR 029.
