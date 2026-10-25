# ADR 024 — Take it with you: the recipe, the portable scorer and the service template

- **Status:** accepted
- **Date:** 2026-10-24
- **Sprint:** 017 («Lo que faltaba»: the reproducible recipe and «Publish it in one click»)

## Context

The VISION promises that the model leaves Probeta: a script that repeats the experiment and says whether it reproduces, and a way to
publish the model. Three rules bound it. The user's data never leave the browser (rule 2); there is no generative AI (rule 5); and
Probeta deploys nothing and stores no credentials. The model is trained in the browser (Pyodide 314.0.2: CPython 3.14.0 on 32-bit
WebAssembly), which is a different machine from the one a service will run on.

## Decision

1. **Three outputs, one panel, nothing deployed.** `receta.py` (repeats the experiment), `puntuador-<model>.html` (the model inside;
   whoever opens it drops a CSV and their own browser scores it: zero cost, no server) and `servicio-<model>.zip` (a FastAPI service,
   the model, pinned versions and a README of predictable cost). They are built in the browser from files fetched on demand
   (`/plantillas/`, copied at prebuild from `src/lib/ds/plantillas/`), so none of it enters the initial weight of `/` or `/protocolo`.
   The assemblers are pure functions (`src/lib/publica/ensamblar.ts`) used by the screen and by the test that feeds CI.
2. **What each one carries.** The recipe carries **no row and no value of the data**: column names, the task, the seed, the test
   fraction, the model, the metrics the app measured and the number of rows; the positive class and the classes are derived from the
   user's file when it runs. The scorer and the service carry **the model** (the `.probeta.json` of «Export»): the ranges and categories
   seen in training, the dataset's file name and the metrics of its test — and, for nearest neighbours, rows of the training data. The
   panel says so **before** any download (a warning with a symbol and a word) and the README repeats it. The service opens the model with
   `pickle`: it says to open only a file whose origin you know.
3. **One scoring engine, tested against the app.** `puntuar.py` is the engine of the scorer (it runs in Pyodide) and of the service
   (CPython); the integration test exports **every model of the three rosters** and the four clusterers and compares `puntuar.score`
   with the app's own `score_new_data` — labels, probabilities and novelty report — in the real Pyodide.
4. **The recipe's single source.** Its model factories, preprocessor, metrics and target preparation are **copied from `pipeline.py` by
   marked blocks** (`# plantilla:inicio/fin`, eight of them), so there is no second copy of a hyperparameter. What lives in TypeScript in
   the app (reading the CSV, the structural sanitising, the seeded split) is ported to Python (`mulberry32`, the stratified split and
   the quantile split, bit for bit: a test compares them with `split.ts` on thirty cases) and declared by name (the columns set aside).
   The recipe is for the three tasks with a target; clustering has no split and no test (ADR 016) and says so on screen.
5. **«Reproduces» is a measured word with two levels.** The recipe prints the expected metrics next to the obtained ones. Within `1e-6`
   it says «reproduces»; if not, it names the metrics that differ and exits with 1. Measured in CPython 3.14 against Pyodide, every
   model of the rosters is exact **except the forests of trees** (`forest`, `forest_balanced`, `extra_trees`): a floating-point difference
   between the 32-bit browser and a 64-bit machine changes one or two of their 200 trees (a probability moves by 0.005, one prediction of
   the test may flip). Those declare an **approximate tolerance** (10 % of the metric or 0.03, whichever is larger) and the recipe
   says «reproduces approximately» with the largest relative difference and why; beyond that, it does not reproduce. Nothing is
   hidden and nothing is called exact that is not.
6. **The service refuses to start rather than score differently.** It checks the SHA-256 of the model against the manifest, that the
   installed versions are the pinned ones (`requirements.txt`, Python 3.14), and that the model scores on this machine (one row built
   from the model's own profile). The pickle of the **nearest-neighbours** model does not open outside the browser (`Buffer dtype
   mismatch, expected intp_t`: 32 vs 64-bit integers), so the service does not offer it; the scorer does. The list
   (`src/lib/publica/no-servibles.ts`) is not an opinion: the CI exports every model, opens it in CPython and the lists must agree.
   The service takes a CSV or JSON rows, caps body size and rows, logs no value and returns a novelty report.
7. **Pinned versions exist, and the CI proves it.** `scripts/verificar-publica.mjs` checks, with the network, that every file the scorer
   downloads from the public Pyodide CDN answers, that every pin exists on PyPI with a wheel for CPython 3.14 on Linux x86_64 (no
   compiling) and that `actions/setup-python` offers the Python of the runner. It was born red (the test injects the network and breaks it
   three ways). No job is added to the ruleset: the integration job runs it, exports the models, then installs the pins in
   `actions/setup-python` 3.14.0 and runs `tests/python` (the recipe reproduces and the service scores the kit like Pyodide; altered
   recipe, altered model, altered versions and a model that does not open all make it fail).
8. **The scorer validates before it deserialises.** Format, `payload_encoding`, SHA-256 and Pyodide version are checked in the page
   before anything is loaded (ADR 007); a changed file says so and never downloads the engine. Its only host is the public CDN, in the
   version pinned by `package.json`.

## Consequences

- Sharing a model is sharing what the warning says; the product tells it and does not decide for the user.
- A new roster member needs no change here: the CI exports it. A model that does not open in CPython must be added to
  `no-servibles.ts`, and one that stops being in it must be removed, or the CI fails.
- Moving Pyodide, scikit-learn or the pins needs one coordinated change (the lock, `RUNTIME_VERSIONS`, the requirements and this check).
- The recipe's tolerance for forests is a measured fact about floating point, not a quality knob: if a model joins that family, it joins
  `AZAR_SENSIBLE`, and the test says which one was left out.
