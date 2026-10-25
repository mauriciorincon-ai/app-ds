# ADR 022 — The notebook and card format, and the sealed test that is opened once

- **Status:** accepted
- **Date:** 2026-10-21
- **Sprint:** 011 to 016 (the sealed test, the opening, the card); ADR 020 sets the notebook itself

## Context

ADR 020 fixed the gate contract and the `.protocolo.json` notebook. Stages 4–10 added to it things that are expensive
to undo: a **sealed test** that stage 8 opens, a **count of openings** that the card reports, and a **model card**
derived from the notebook. All three cross time (they are written, exported, imported and read years later), so their
shapes are decisions, not details.

## Decision

1. **The notebook only grows, and everything derived is recomputed.** An evidence stores what the user wrote and the
   counts that support it; the card, the stage criteria and the `recalcular` of stages 2 and 4–10 are recomputed from it
   on every evaluation. A stored «met» flag does not exist (ADR 020 §3). The reader (`leerArchivo`/`leerCuaderno`) binds
   what it accepts: identifiers are `^[a-z0-9][a-z0-9_-]{0,39}$`, intervals come ordered (`bajo ≤ alto`), a threshold
   table is monotone (a higher threshold never has more hits or more false alarms), costs stay under `COSTO_MAX` (10^12)
   and the list of openings under `APERTURAS_MAX` (500). A file that fails names the field.
2. **The test is sealed by recipe, not by trust.** Stage 6 seals the test with the SHA-256 of a written recipe
   (`RECETA_SELLO`, `PROTOCOLO-DS/SELLO/1`: the file fingerprint, the scheme, its size and horizon, the seed and the
   indices of the test rows, in order); anyone can redo it with the same file. Stage 8 sends the worker the training rows
   only if the seal that today's table gives equals the sealed one. If the recipe changes, its first line changes and every
   old seal stops matching. The seal is hygiene and traceability, not a promise: it says whether today's test is the one
   that was sealed, not that nobody looked at it.
3. **Opening is counted, not forbidden** (F0 #13, rule 3 of the constitution kept where the Protocol is honest, not
   restrictive). Each opening carries a key derived from the seal and what was evaluated; the notebook records the key
   once (`agregarApertura` ignores a repeated key and stops at the cap), the card says so when the test was opened more
   than once with something distinct, and stage 6 warns when the notebook holds more than one distinct seal.
4. **The card is a view of the notebook** (`ficha.ts`): each line is a dictionary key, its parameters and its source
   (stage, date and fingerprint of the evidence, or «written by the owner»). A line missing its data is not written, not
   invented. No row and no value of the data (rule 2); what travels are counts, costs, column names, the categories of
   the segments that have support, and what the owner wrote.
5. **The file format stays version 1 until a field changes its meaning.** Additions are optional fields read as absent
   (`aperturas`, the drift reference), so a notebook from before the field still opens. A change of meaning is version 2 and
   a migration, never a silent reinterpretation.

## Consequences

- A notebook edited by hand can be internally coherent and still lie about who wrote it: the app recomputes that the
  numbers fit the data, not the author. It is said in the manual.
- Raising a cap or changing an identifier's grammar is a format decision; `COSTO_MAX` and `APERTURAS_MAX` are exported
  constants with tests that name them.
- The text of the card lives in the per-stage dictionaries (`messages/etapas/`), loaded with the screen that uses them,
  so the start page does not pay for them (see the BLUEPRINT, «peso por ruta»).
