# ADR 001 — Client-side compute engine: Pyodide in a self-hosted module worker

- **Status:** accepted
- **Date:** 2026-07-08
- **Sprint:** 001

## Context

The product's hard rule is that the user's data never leaves their browser (privacy by design).
The modelling needs `pandas` + `scikit-learn`, and the app is CPU-only (no GPU). So the compute must
run client-side, without shipping datasets to any server, and without blocking the UI thread.

## Decision

Run the heavy compute with **Pyodide** (CPython + pandas + scikit-learn compiled to WASM), loaded
**on demand** (when the user trains, not at page load) inside a **Web Worker**.

- **Self-host the runtime.** `scripts/copy-pyodide.mjs` copies the Pyodide core from `node_modules`
  and resolves the wheel closure for `pandas` + `scikit-learn` from `pyodide-lock.json`, copying
  cached wheels and downloading any missing ones from the Pyodide CDN at build time into
  `public/pyodide/` (gitignored, ~39 MB). Runtime loads are same-origin — no CDN dependency, simple
  CSP.
- **The worker is a standalone module worker served from `public/pyodide-runner.js`**, not a bundled
  worker. Reason: Turbopack instantiates `new Worker(new URL(...))` as a **classic** worker (it
  ignores `{ type: "module" }`), and Pyodide's ESM runtime rejects classic workers ("classic web
  workers are not supported"). A file served from `public/` is loaded as a real module worker and
  loads the ESM runtime cleanly.
- **Pure orchestration stays on the main thread** (`lib/experiment.ts`: parse, profile, split,
  leakage, verdict) — fast, and unit-testable. The worker only trains and returns metrics.

## Consequences

- Datasets never touch the network; the runtime does (self-hosted, no user content).
- First training run pays a one-time ~5 s runtime load; the UI shows honest progress. Pyodide is
  kept out of the landing LCP (loaded on demand).
- Build downloads wheels once and produces a ~39 MB static bundle under `public/pyodide/`; larger
  deploy, acceptable for Vercel static assets.
- The `public/` module-worker approach is validated by the e2e (real browser).
- Source maps for the WASM layer are not our concern; app-level Sentry runs client-only (see ADR 001
  is compute; observability is separate).
