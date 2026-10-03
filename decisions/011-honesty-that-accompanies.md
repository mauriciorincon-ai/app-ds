# ADR 011 — Honesty that accompanies: label, never block or hide

- **Status:** accepted (product rule approved by the user, F0 #13, 2026-10-02 — hard rule 3 of
  `CLAUDE.md`)
- **Date:** 2026-10-02
- **Sprint:** 005 «La liga honesta»

## Context

Until H1 the app protected honesty by **restriction**: few models, no model picker ("no eliges tú:
habla el resultado" — ADR 008 §2, the brochure, the design system's "sin selector de usuario").
That kept the verdict clean but made the tool feel limited, and it treated users as people to be
protected from information. Once selection moved to cross-validation inside train (ADR 009), the
restriction stopped buying anything: what keeps the verdict honest is _where_ decisions are taken,
not how much the user is allowed to see.

## Decision

The approved text (literal, hard rule 3): **the differentiator is automatic methodological honesty,
and honesty ACCOMPANIES: it labels, it does not block or hide.** Applied in S5:

| Situation                              | Before (H1)              | Now (S5)                                                                                                                                                        |
| -------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test scores of the losing models       | not computed / not shown | computed once, shown on request under «Prueba · no sirve para elegir» with a warning                                                                            |
| Choosing a model other than the winner | impossible               | allowed; the verdict speaks about it, labelled «◆ Elegido por ti, no por la validación cruzada»; the model card and the manifest record `selection.by = "user"` |
| A model that does not fit the data     | —                        | listed as "out" with its measured reason; can be included anyway (level 2)                                                                                      |
| A model that did not converge          | —                        | score shown, labelled «no convergió: su puntaje puede no ser estable»                                                                                           |
| Models that do not give probabilities  | —                        | the column is omitted and the screen says why; nothing invented                                                                                                 |
| Small samples                          | —                        | «muestra pequeña» note where the scores are shown                                                                                                               |

Three labels carry the whole contract, always next to the number: **«sirve para elegir»**
(cross-validation), **«sirve para creer»** (the verdict on test), **«no sirve para elegir»** (test
scores of the losers). The fixed sentence on the league: «La tabla se calcula con validación
cruzada: sirve para elegir. El veredicto se calcula con el conjunto de prueba: sirve para creer.»

What does **not** change: leakage stays impossible by construction (ADR 002) and the verdict
against the baseline stays frank — frank is not restrictive.

### Accessibility of the labels

The user of this app has mild colour blindness: no state is communicated by colour alone. The CV
winner carries a **filled** ★ disc plus the text «Ganador (validación cruzada)»; the user's choice a
◆ disc plus «Elegido por ti»; best score ▲ + text; within one SE ≈ + text; the test column sits in
an amber band **and** says «no sirve para elegir». Every action button has a stroke icon to the
left of its text.

## Consequences

- Text that contradicted the rule was rewritten in the same PR: `design-system.md` ("sin selector
  de usuario"), the manual's dictionary and S4 section, ADR 008 §2 (superseded by ADR 009) and the
  public brochure's «No eliges tú» card (minimal correction, decision U2).
- Honesty is now verified by **labels and records**, so tests assert the labels: unit tests for
  every mark and state, e2e for the manual choice reaching the model card, and contract baits for
  `selection` in the manifest.
- Future features follow the same test: if a guard can be expressed as a label next to the
  number, it is a label; a hard block needs a reason that labelling cannot cover (e.g. leakage by
  construction, CV without positives).
