# ADR 006 — Narration privacy: what leaves the browser, and only with opt-in

- **Status:** accepted
- **Date:** 2026-07-09
- **Sprint:** 002

## Context

Hard rule 2 of the app: the user's data never leaves their browser. The S2 narration feature
needs an LLM (server-side route → external provider), so for the first time _something_ about the
experiment can travel. This ADR fixes exactly what, when, and what never.

## Decision

- **What travels (only with explicit opt-in):** column names, aggregate statistics (metrics on
  test, verdict scores/deltas, top-8 permutation importances with direction), dataset shape
  (row/column counts), locale, and the names of leakage-flagged columns. This is the minimum
  needed to narrate.
- **What NEVER travels:** dataset rows or any cell value — including the positive-class label
  (it is a cell value). Guarded three ways:
  1. the payload assembler (`lib/narration/payload.ts`) has no access path to rows, and a unit
     test asserts the serialized payload contains no cell values;
  2. the route schema is **`.strict()` Zod** — a request smuggling extra keys (e.g. `rows`) is
     rejected entirely, not silently stripped;
  3. the e2e inspects the actual network request body.
- **Consent is opt-in, default OFF, informed and remembered locally** (localStorage,
  `useSyncExternalStore` pattern): the panel says in plain language that column names and
  aggregate statistics are sent to an AI provider, and that rows never are. Without consent the
  UI **never calls the route** — the deterministic template renders directly (zero network).
- **No persistence, no logging of names:** the route stores nothing; cost logs carry only
  model/tokens/USD; Sentry reports carry only an error kind (`narration-error:<kind>`), with the
  same scrubber discipline as S1 (`lib/observability.ts`, contract under unit test).
- **The model card is exempt** — it is generated fully client-side and downloaded by the user,
  so it MAY include the positive-class label and anything else local; it never touches the
  network.

## Consequences

- The privacy story stays honest and checkable: "your rows never leave; names and aggregates
  only if you say yes" — enforced by tests at three layers, not by promise.
- The provider sees column names when consented; users with sensitive column names can simply
  not opt in and lose nothing but the AI phrasing (template always available).
- If a future sprint adds narration of EDA or per-row explanations, this ADR must be revisited
  BEFORE any new field enters the payload schema.

## Amendment (2026-07-20) — the S4 `eda` block, revisited as this ADR requires

S4 extended the payload with an optional `eda` block before this ADR was formally revisited (the
closing audit flagged the missing trail; the design itself honored this ADR). Recorded now:

- `eda` carries **aggregates and column names only** — alert kind, minority rate, or the flagged
  column's name — never cell values; it enters the same Zod `.strict()` schema.
- A clean dataset **omits the key entirely**, so the payload is byte-identical to S3's (locked by
  a unit test): zero privacy regression for the common case.
- Same consent gate, same three-layer enforcement. Column names remain user-controlled text that
  reaches the provider **only after opt-in** — and are treated as untrusted data by the prompt
  (see ADR-005 amendment 2026-07-20).
