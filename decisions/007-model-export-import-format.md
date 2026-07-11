# ADR 007 — Model export/import format: pickle+zlib+base64 in a single JSON file with an honest manifest (ONNX does not load in Pyodide)

- **Status:** accepted
- **Date:** 2026-07-11
- **Sprint:** 003

## Context

Sprint 003 makes the trained model survive the tab: export as a single local file, re-import in a
fresh session, and score new data without retraining. The preferred interchange format was ONNX
(portable, no code execution on load, already the H2 deployment target). Risk #1 of the sprint
plan: the converter (`skl2onnx`) may not load in the WASM runtime. Hard constraints: everything
client-side (user data never leaves the browser), no new dependencies, and the file must be
validated honestly BEFORE anything is deserialized.

## Decision

**Single-file `.probeta.json` = `{ format_version, manifest, payload }`, where the payload is the
fitted sklearn `Pipeline` serialized with stdlib `pickle` (protocol 5) → `zlib.compress` →
base64 — and the manifest is validated (shape, format version, SHA-256 of the payload bytes)
before the payload is ever deserialized.**

- **Spike result (2026-07-11, Pyodide 314.0.2 / Python 3.14.2 / sklearn 1.8.0):**
  `micropip.install("skl2onnx")` fails — `ValueError: Can't find a pure Python 3 wheel for
'onnx>=1.2.1'` (onnx requires compiled protobuf C++; no emscripten wheel exists). ONNX export
  is not viable in this runtime today.
- **Pickle is acceptable for H1** because the file round-trips within the SAME app and runtime
  (same Pyodide/sklearn versions self-hosted in `public/pyodide/`), it is a local file the user
  owns (no server surface), and joblib would add nothing here (it wraps pickle; its wins are
  memory-mapped large arrays on disk, irrelevant in WASM) while pickle is stdlib.
- **Import validates BEFORE deserializing** (all in TypeScript, without touching Pyodide):
  1. JSON shape + `format_version` known (hand-rolled structural validation — zod stays
     server-side; pulling it into the client bundle broke the 300KB script budget);
  2. **SHA-256 of the decoded payload bytes matches `manifest.payload_sha256`** (Web Crypto);
  3. runtime versions in the manifest vs the app's `RUNTIME_VERSIONS` constant — mismatch loads
     best-effort with an honest warning; unpickle failure surfaces a clear error.
     Foreign/corrupt files are rejected with the payload untouched.
- **The manifest is the honest face of the file** (human-readable JSON): app+version, date,
  dataset name, n_train/n_test, schema (numeric/categorical/target/classes/positive_class),
  `training_profile` (per-numeric train min/max; per-categorical seen categories — the basis of
  the novelty report), test metrics, verdict, leakage warnings, runtime versions, payload hash
  and encoding (`pickle+zlib+base64`).
- **zlib before base64** keeps the RandomForest (n=200) payload small enough for `postMessage`
  and disk without new dependencies.

## Consequences

- Zero new dependencies (pickle/zlib/base64 are Python stdlib; zod and Web Crypto already ship).
- **Residual risk, stated openly:** unpickling executes code by design. Mitigated by hash +
  manifest validation before deserialization, rejection of foreign files, and the microcopy
  "only load files exported by Probeta"; the risk is local to the user's own browser (no server
  ever touches the file). This trade-off is explicit in the manual.
- The file is NOT portable outside Probeta (no ONNX runtime interop) and is version-coupled to
  the runtime; the manifest records versions so the import screen can warn honestly. Integration
  tests keep `RUNTIME_VERSIONS` truthful against the real runtime and assert
  export→import→identical predictions.
- ONNX is re-evaluated in H2 when public deployment ("publish in one click") needs it; the
  `format_version` field and the encoding tag in the manifest leave room to add an ONNX payload
  without breaking old files.
