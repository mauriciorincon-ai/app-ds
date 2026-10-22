# ADR 020 — The Protocol as a second mode: gate contract, notebook and persistence

- **Status:** accepted
- **Date:** 2026-10-17
- **Sprint:** 008 «El esqueleto del Protocolo» (H-2; VISION v2.0.0 § 8; G-Plan 2026-10-17: 1a · 2a · 3a)

## Context

VISION v2.0.0 adds a second mode next to Probeta: **Protocolo DS**, ten stages with gates the user
cannot skip, walked with their own data. Rule 5 of the constitution makes the gate the contract:
no stage opens without the previous stage's exit criterion, verified by code or by the user's
written answer; there is no «skip» button and no skip-with-justification; the whole mode is
deterministic code with no generative AI. The same rule keeps rule 3 («honesty accompanies, it
doesn't block») for Probeta: in the Protocol the gate **does** stop, because that is its promise.

Sprint 008 builds the skeleton the ten stages inherit and stages 1–3 on top of it. Decisions here are
expensive to undo: every later stage, every exported notebook and every returning user depends on
them.

## Decision

1. **A route of its own.** The mode lives at `/protocolo` (`src/app/protocolo/page.tsx`), its own
   chunk. The start page only links to it (`next/link` with `prefetch={false}`) and imports nothing
   from the mode but the stage count (`src/engine/protocolo/ids.ts`, no imports);
   `tests/unit/portada-liviana.test.ts` names the path if that changes. Lighthouse measures both URLs.
   The mode does not mount the Pyodide worker: stages 1–3 run in the main thread on the parsed CSV.
2. **Stages are data.** `src/engine/protocolo/etapas.ts` declares, per stage, whether its criterion
   depends on the loaded data, the ids of what it asks and computes, its glossary terms and —once
   built— how to read what it records (`leer`) and its exit criterion (`criterio`). Text lives in
   `src/content/protocolo.ts` and `src/content/glosario.ts` as `{es, en}`. A stage that isn't built
   is shown with its criterion and does not open.
3. **The gate is a pure engine** (`src/engine/protocolo/compuerta.ts`). `evaluar(protocol, notebook,
fingerprint)` derives every stage's state (`cerrada · abierta · cumplida · por-verificar · detenida ·
no-construida`) from the notebook alone: stage N+1 is closed until N is met. `registrar` is the
   **only** way into the notebook; it rejects, naming the blocking stage, any record in a closed or
   unbuilt stage, without the data a stage needs, with the wrong shape, or not meeting the criterion.
   The criterion is **recomputed** from what was recorded every time; a stored «met» flag does not
   exist, so an imported notebook cannot declare a stage met. Gate test:
   `tests/unit/protocolo-compuerta.test.ts`, shown red with `scripts/demo-rojo.sh`.
4. **The notebook only grows** (`src/engine/protocolo/cuaderno.ts`). Each evidence has a sequence
   number, stage, date, the SHA-256 fingerprint of the data it was checked with (only for stages that
   depend on data) and `base`: the evidence of each earlier stage it was built on. Correcting a stage
   appends a new evidence; later stages built on the old one go back to «por verificar». Loads of the
   CSV are recorded too (name, rows, columns, fingerprint), never the file.
5. **Persistence (G-Plan 1a).** The notebook lives in the browser's IndexedDB (`probeta-protocolo`,
   one current notebook, `src/lib/protocolo/almacen.ts`). When IndexedDB can't be opened (private
   window, blocked storage) it falls back to memory and the page says «export your notebook». It is
   exported and imported as `.protocolo.json`, versioned and validated with zod
   (`src/lib/protocolo/archivo.ts`) with named rejection (`invalid-json`, `invalid-format{field}`,
   `unsupported-version`, `file-too-large`) and one bait per field; what comes back from IndexedDB goes
   through the same reader. On return the user reloads the CSV; the fingerprint says whether it is the
   same one. A different file asks: a new version of the same data (data stages are re-checked) or
   another project (a new notebook).
6. **Privacy (rule 2).** Answers, costs, class names, dates and the file name live only in the
   browser and in the file the user downloads. The mode's breadcrumb is `probeta.protocol` with exactly
   `{stage, outcome}`; its errors carry only their kind. No dataset value reaches logs, Sentry or the
   narration (the mode has none).
7. **No new dependency, no new UI kit (G-Plan 2a).** zod was already a dependency; the UI uses the
   app's own primitives (ADR 019) and `design-system.md`. The form of the new screens goes «not seen»
   to the H-2 dress rehearsal. Only tasks with a target enter the mode (G-Plan 3a): without one, stage
   2 sends the user to Probeta's «group» task.

## Consequences

- Every later stage (4–10) is a new entry in the protocol definition plus its form; the gate,
  notebook, persistence and file format don't change. A change to the notebook's shape is a new file
  version, read by a migration, never a silent reinterpretation.
- Without IndexedDB the user can lose the notebook by closing the tab; the page says so and the export
  is the remedy.
- One notebook per browser. Several projects in parallel means exporting one and starting another.

## Status note (2026-10-21, Sprint 016)

All ten stages are built (S8–S15). What this ADR set as the skeleton held: the gate (`compuerta.ts`), the notebook that only
grows, the IndexedDB persistence and the `.protocolo.json` file did not change shape. Two decisions that stages 4–10 added are
recorded apart: the drift reference and what the notebook keeps from a column (**ADR 021**), and the notebook and card
format with the sealed test that is opened once (**ADR 022**). §2's «text lives in `src/content/protocolo.ts`» is now
partial: the texts of stages 4–10 live in `messages/etapas/etapaN.{es,en}.json`, loaded with their screen (S14).
