# Bitácora de implementación — Sprint 001: El veredicto honesto

> App: **Probeta DS** (ds) · Branch: `sprint-001/veredicto-honesto` · Abierta: 2026-07-08
> Documento **vivo** (escritor único: este repo). La planeadora lo lee para la retrospectiva.
> Español en la bitácora; inglés en código/commits/ADRs.

## Estado por fase

- [x] **Fase 0 — Setup**
- [ ] Fase 1 — Motor/núcleo (spike Pyodide + engines puros + pipeline anti-fuga)
- [ ] Fase 2 — UI (design-system.md + 5 pantallas)
- [ ] Fase 3 — Integración + e2e + observabilidad (Sentry)
- [ ] Fase 4 — Calidad / cierre (/deploy-check + summary)

## Verificación de supuestos del kit v1.2.0 (fricciones K#)

| #   | Hallazgo                                                                                    | Estado                                        |
| --- | ------------------------------------------------------------------------------------------- | --------------------------------------------- |
| K1  | `layout.tsx`/`page.tsx` con boilerplate "Create Next App" (metadata genérica, `lang="en"`)  | ✅ resuelto en Fase 0                         |
| K2  | shadcn/ui NO instalado pese a estar en el stack                                             | ⏳ diferido a Fase 2 (con `design-system.md`) |
| K3  | i18n NO cableado pese a "bilingüe día 1"                                                    | ✅ resuelto en Fase 0 (diccionario ligero)    |
| K4  | Sentry NO instalado pese a la DoD de observabilidad                                         | ⏳ Fase 3 (DSN ya provisto por el usuario)    |
| K5  | `lighthouse-urls.json` solo mide `/` — correcto: Pyodide no debe estar en el LCP            | ✅ mantenido a propósito                      |
| K6  | coverage 70% global; el CLAUDE.md exige **>80%** en `engine/`                               | ⏳ Fase 1 (al escribir los primeros tests)    |
| K7  | el script `test` no pasa `--coverage` → los umbrales de `vitest.config` no se aplican en CI | ⏳ Fase 1                                     |

## Desviación del plan

- **D1** — La orden y `SPRINT_001.md` dicen "Next.js 15"; el kit estampó **Next 16.2.10**. Sin acción; solo registro. (Avisado al usuario.)
- **D2** — La orden nombra 2 ADRs (Pyodide · anti-fuga). El CLAUDE.md además pide **ADR de i18n** → serán **3 ADRs**. Aprobado por el usuario al elegir el enfoque de i18n (diccionario ligero propio).
- **Ajuste de secuencia (no cambia alcance):** el `pnpm add pyodide` se movió al spike de Fase 1 y el init de shadcn/ui a Fase 2, para mantener Fase 0 como scaffolding determinista sin dependencias de red. Todas las tareas del `SPRINT_001.md` se cumplen íntegras.

## Log

### Fase 0 — Setup (2026-07-08) ✅

- Branch `sprint-001/veredicto-honesto` creado. DSN de Sentry en `.env.local` (gitignored) + `.env.example` commiteado.
- **i18n ligero ES/EN**: `messages/{es,en}.json` + `src/i18n/{config,dictionaries,provider,use-translation}` con `useSyncExternalStore` (SSR-safe, sin hidratación inconsistente).
- Boilerplate limpio (metadata Probeta DS); **landing placeholder estática** (candidato LCP) con toggle de idioma accesible (`aria-pressed`, táctil ≥44px).
- Estructura `src/{engine,lib/ds,workers,components}`, `decisions/`, `public/datasets/` con `.gitkeep` autodocumentados.
- `scripts/copy-pyodide.mjs` (self-host de Pyodide) + hooks `prebuild`/`predev` — **no-op guardado** hasta instalar `pyodide` en Fase 1.
- `.gitignore`: `public/pyodide/` (assets generados en build).
- **Bug resuelto:** el provider i18n disparaba la regla `react-hooks/set-state-in-effect` (leer localStorage con `setState` en `useEffect`) → migrado a `useSyncExternalStore`.
- Gates verdes: `typecheck` · `lint` · `build` (`/` estático) · `test`.
- Commit: `7ea2454`.

### Fase 1 — Motor/núcleo (en curso)

**Spike Pyodide (riesgo #1 de la orden) — ✅ de-riskeado.** `pyodide@314.0.2` instalado (devDep).
En Node: pyodide cargó en ~1.3 s; `pandas`+`scikit-learn` en ~4.2 s; humo de `RandomForest` OK.
Versiones WASM confirmadas: python=3.14.2 · numpy=2.4.3 · scipy=1.18.0 · pandas=3.0.2 · sklearn=1.8.0.
El paquete npm trae **solo el runtime core** (sin wheels) → self-hostear exige que `copy-pyodide.mjs`
**descargue** las wheels (pandas, numpy, scipy, scikit_learn, joblib, threadpoolctl, python_dateutil,
pytz, six) además de copiar el core. Se refina en el ADR del motor de cómputo.

**Motores puros (TS) + tests — ✅ completos.**

- `engine/split.ts` — split estratificado, seeded (mulberry32), determinista. Devuelve índices; el
  preprocesamiento se ajustará SOLO sobre `trainIdx`. Cobertura 100/100/100.
- `engine/verdict.ts` — veredicto estructurado (beats/ties/loses) con margen de empate honesto
  (`TIE_EPSILON`); selección de métrica primaria (AUC si desbalanceado, F1 si balanceado) y mejor
  baseline. El texto franco bilingüe lo arma la UI vía i18n. Cobertura 100/90/100.
- `engine/leakage.ts` — heurística de fuga: AUC univariada por rangos (numéricas) + pureza de
  categoría (categóricas), agnóstica a la dirección, ignora nulos. Cobertura 98.6/97/87.5.
- `tests/unit/i18n-parity.test.ts` — paridad de claves es/en.
- **35 tests verdes**; umbral engine >80% cumplido (todos ≥87.5%).

**Bugs propios encontrados y resueltos (en los tests, no en los motores):**

- Test de veredicto frágil a punto flotante (`0.5 + TIE_EPSILON` ≠ `0.01` exacto) → reescrito con
  un delta claramente dentro del margen.
- Fixture de leakage "limpio" era en realidad un separador inverso perfecto → reemplazado por uno
  con relación débil real.

**Fricción de config (K8):** la cobertura v8 intentaba parsear los `.gitkeep` como JS (el `include`
del kit era `src/lib/**`, no `*.ts`) → `PARSE_ERROR`. Corregido a `src/lib/**/*.ts` +
`src/engine/**/*.ts`. Además K7 resuelto: el script `test` ahora pasa `--coverage`.

**Datasets de ejemplo + ingesta — ✅ completos.**

- `scripts/make-example-datasets.mjs` — generador seeded (reproducible, 100% sintético) →
  `public/datasets/`: `marketing-campania.csv` y `rotacion-empleados.csv` (limpios, con señal real)
  - `credito-fuga-plantada.csv` (**fuga plantada**: `monto_recuperado`, variable post-resultado,
    proxy casi perfecto del objetivo). 200 filas c/u.
- `lib/ds/csv.ts` — parser RFC-4180 (comillas, comas/saltos/comillas escapadas), límite de tamaño
  honesto (5 MB / 50k filas), detección de filas irregulares, y perfilado (tipo, nulos,
  cardinalidad, detección de columna de fecha). El parseo es en TS (fuente única) y Python recibirá
  los registros ya parseados.
- Tests: `csv.test.ts` (parseo/límites/perfilado) + `leakage-datasets.test.ts` que valida el
  **criterio de aceptación sobre los datasets reales**: el de fuga marca `monto_recuperado`, los
  limpios no disparan. **54 tests verdes**; cobertura global 98.7%.

**Fricción de config (K9):** eslint lintaba el directorio generado `coverage/` (warning de directiva
eslint-disable) → añadido `coverage/**` a los `globalIgnores` de `eslint.config.mjs`.

**Pipeline anti-fuga + test de integración — ✅ completos.**

- `lib/ds/pipeline.py` — corre en Pyodide. Recibe/devuelve JSON. Split por índices (los da
  `engine/split.ts`); `ColumnTransformer` (imputación mediana + escalado para numéricas;
  most_frequent + one-hot para categóricas) dentro de un `Pipeline` que hace **`fit` SOLO en train**.
  Baselines (clase mayoritaria + regresión logística) + Random Forest. Métricas sobre **test**
  (accuracy, precision, recall, F1, AUC) + matriz de confusión. Positiva = clase minoritaria.
- **Test de integración `tests/integration/pipeline.test.ts`** (Pyodide, entorno node, config
  aparte) — el test DoD: afirma que la mediana aprendida por el imputer proviene SOLO de train
  (2.5, no 3.5); **falla si alguien ajusta sobre todo el dataset**. + smoke de forma/métricas.
  Job `integration` añadido a la CI. 2 tests verdes (~11.5 s con carga WASM).

**Calidad de los datasets — ajuste tras validación empírica en Pyodide.** La primera versión
generaba señal **lineal**, así que la regresión logística (baseline) igualaba o batía al Random
Forest → nunca había veredicto "supera". Se rediseñó `marketing-campania` con señal **no lineal**
(interacción canal×dispositivo) para que el RF sí gane. Los tres datasets ahora cuentan tres
historias honestas:

| Dataset                 | Veredicto (val. empírica)                               | Demuestra                                |
| ----------------------- | ------------------------------------------------------- | ---------------------------------------- |
| `marketing-campania`    | forest AUC 0.75 vs baseline 0.65 → **+0.10 supera**     | RF gana con señal no lineal (happy path) |
| `rotacion-empleados`    | forest 0.76 ≈ logística 0.76 → **empata**               | honestidad: "un modelo simple basta"     |
| `credito-fuga-plantada` | ambos AUC 1.00 → perfecto **sospechoso** + fuga marcada | métricas infladas por fuga               |

**Decisión pendiente de ADR:** self-host de Pyodide. El paquete npm trae solo el core; `copy-pyodide.mjs`
deberá **descargar** las wheels (pandas, numpy, scipy, scikit_learn, joblib, threadpoolctl,
python_dateutil, pytz, six) a `public/pyodide/`. Se implementa junto al **worker** (`workers/pyodide-worker.ts`),
que es glue de navegador y se valida en el **e2e** — por eso se construye en el puente Fase 1→2
(su API de mensajes la moldea el consumo de la UI). El núcleo testeable de Fase 1 (motores + pipeline

- garantía anti-fuga) está **completo y en CI**.

### Puente Fase 1→2 — worker + self-host de Pyodide — ✅

- `scripts/copy-pyodide.mjs` (self-host, decisión del ADR de cómputo): copia el runtime core +
  resuelve el cierre de dependencias desde `pyodide-lock.json` y copia/descarga las 9 wheels
  (pandas + scikit-learn + transitivas) + `pipeline.py` a `public/pyodide/` (gitignored, ~39 MB).
  Corre en `prebuild`/`predev`; en CI descarga del CDN de Pyodide. Verificado local: 9 wheels + core.
- `workers/protocol.ts` — contrato tipado UI↔worker (init · loadDataset · runExperiment; progress ·
  dataset · result · error).
- `workers/pyodide-worker.ts` — carga Pyodide bajo demanda desde `/pyodide/`, orquesta
  parse → perfilado → split (engine) → `pipeline.py` → verdict (engine) → leakage (engine, sobre
  train). La lógica pura ya está testeada; el runtime en navegador se valida con el **e2e** (Fase 3).
- **Fricción de config (K10):** eslint lintaba los 39 MB de JS generado en `public/pyodide/`
  (5905 problemas) → añadido `public/pyodide/**` a los `globalIgnores`.
- Gates: typecheck · lint · build verdes con la copia real de 39 MB.

## Fase 2 — UI (en curso)

**`design-system.md` creado desde cero.** Personalidad: instrumento de laboratorio — preciso,
confiable, sobrio (nunca pedagógico/lúdico/genérico). Paleta: papel cálido + tinta + **un** acento
petróleo (`#0E6E6B`) + semánticos del veredicto. Tipografía Geist Sans (UI) + Geist Mono (todas las
cifras, tabular-nums). Tokens, radios, sombras, motion definidos.

**Gate de diseño — alineación de dirección: ✅ APROBADA por el usuario** (2026-07-08) sobre una
preview visual (Artifact: paleta + tipografía + el momento del veredicto en claro y oscuro),
respuesta "Apruebo — construye las pantallas", sin ajustes. El gate final se re-corre sobre la app
real corriendo al cerrar la fase.

_(pendiente: tokens en globals.css → microcopy i18n → 5 pantallas → hook del worker → gate final)_
