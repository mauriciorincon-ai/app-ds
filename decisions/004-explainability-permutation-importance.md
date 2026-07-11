# ADR 004 — Global explainability: permutation importance on test (shap does not load in Pyodide)

- **Status:** accepted
- **Date:** 2026-07-09
- **Sprint:** 002

## Context

Sprint 002 adds a "Why does it predict this way?" section: global feature importance with an
honest, defensible method, computed client-side in Pyodide (hard rule: user data never leaves the
browser; 100% CPU). The preferred method was SHAP (the literature standard, and what the Explingo
narration pattern was built around). Risk #1 of the sprint plan: `shap` may not load in the WASM
runtime.

## Decision

**`sklearn.inspection.permutation_importance` on the test set**, not SHAP.

- **Spike result (2026-07-09, Pyodide 314.0.2 / Python 3.14):** `shap` is not in the official
  Pyodide package repository (`loadPackage("shap")` → "No known package"), and `micropip.install`
  fails to resolve its dependency closure (shap requires compiled packages — numba/llvmlite — that
  have no emscripten wheels). SHAP is not viable in this runtime today.
- **Fallback is scientifically defensible:** permutation importance is model-agnostic, ships with
  the scikit-learn already in the runtime, and measures what the product wants to communicate —
  how much the test score degrades when a feature's relationship to the target is broken.
- **Computed on TEST** (consistent with the app's "all metrics on test" rule), scoring `roc_auc`
  (fallback `accuracy` if the test fold is single-class), `n_repeats=10`, seeded.
- **Direction of effect:** for numeric features, the sign of the univariate feature↔target
  correlation on test (point-biserial, since the target is 0/1), **read against the positive
  class** (the UI names the actual class label so the sign is unambiguous). Below the ~95% null
  band — `|r| < max(0.05, 2/√n)` — or on degenerate columns, the honest answer is "no clear
  direction" (an arrow on noise would dress noise as signal). Categorical features get **no
  direction** (it varies by category) — the UI says so instead of faking a sign.
- **The UI names the method honestly** ("importancia por permutación") and never calls it SHAP.

## Consequences

- Zero new runtime dependencies; the ~39 MB self-hosted bundle is unchanged.
- Known limits (documented in the model card and manual): permutation importance is global (not
  per-prediction), can dilute importance across correlated features, and the direction sign is
  univariate — it does not capture interactions (e.g., in the bundled marketing dataset the signal
  IS an interaction; the importances still rank the interacting columns on top, which the
  integration test asserts empirically).
- Guarded by integration tests in Pyodide: shape/ordering, the real-signal columns of
  `marketing-campania` rank on top, and the planted-leak proxy `monto_recuperado` dominates.
- If Pyodide ever ships shap (or a WASM-compatible alternative), revisit; the JSON contract
  (`explainability.method`) already carries the method name, so the UI adapts without breaking.
