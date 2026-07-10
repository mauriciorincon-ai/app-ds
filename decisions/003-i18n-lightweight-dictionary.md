# ADR 003 — i18n: lightweight in-house dictionary

- **Status:** accepted
- **Date:** 2026-07-08
- **Sprint:** 001

## Context

The app is bilingual ES/EN from day one. It is a single-workspace tool (one route, a state machine),
so per-locale URL routing brings no benefit. We want key parity enforced by tests and the smallest
surface that works with SSR.

## Decision

A **lightweight in-house dictionary**, no i18n library.

- Translations live in `messages/{es,en}.json`; the logic in `src/i18n/`.
- A React context provides `t(key, params?)` with dot-path lookup and `{placeholder}` interpolation.
- The active locale is read from `localStorage` via **`useSyncExternalStore`** (SSR-safe: first
  render uses the default locale, matching the server HTML, then the stored preference is applied —
  no hydration mismatch, no `setState`-in-effect).
- **Key parity is enforced by a unit test** (`tests/unit/i18n-parity.test.ts`): both files must have
  the exact same key set. All new copy is written in both languages in the same step.

**Rejected:** `next-intl`. It is mature but adds `[locale]` route segments and weight this
single-workspace app does not need.

## Consequences

- Zero runtime dependency for i18n; trivial to reason about.
- The parity test makes "translate at the end" impossible — a missing translation fails CI.
- If the app later needs locale-based routing or richer formatting (plurals, dates), revisit and
  possibly adopt a library; the dictionary shape (`messages/*.json`) ports easily.
