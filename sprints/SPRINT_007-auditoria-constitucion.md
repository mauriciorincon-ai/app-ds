# Sprint 007 — Auditoría de la constitución contra el código (cierre del ciclo H2, Acto 1)

- **Fecha:** 2026-10-06.
- **Método:** v1.24.0, «El CLAUDE.md de la app se AUDITA contra el código en cada cierre de ciclo».
- **Auditor:** un subagente independiente, que no construyó el sprint. Trabajó en solo lectura y
  revisó afirmación por afirmación de `CLAUDE.md` (421 líneas) contra lo que el código hace hoy.
- **Árbol:** empezó sobre `32be7f6` y revisó también `e6cf659`, comiteado durante la auditoría.
  `git status --short` quedó vacío al terminar.
- **Qué corrió:**
  - grep, `git grep` y `sed`;
  - `cmp` de las dos copias de `pipeline.py`: idénticas;
  - `diff` contra `portafolio/ds/ordenes/CLAUDE-md-para-app.md`: idéntico hasta la línea 421. La
    copia de la planeadora suma 12 líneas del kit v1.39.0 para la F0 del próximo sprint; eso no es
    deriva;
  - el ruleset de GitHub, `homepageUrl`, el PR #19, el log de la CI de `23dedf1` y el barrido de cero
    enlaces (vacío).

**Resultado: 27 derivas, 3 altas, 10 medias y 14 bajas.** Las más graves:

- La regla de anti-fuga y de «todas las métricas sobre test» no dice que **agrupar** (ADR 016) no
  tiene partición.
- La **matriz de envejecimiento** (regla 18) promete un test que no existe.
- El **brochure** no es bilingüe (regla 16).

## Cómo se paga cada deriva

`CLAUDE.md` es una copia literal que regenera la planeadora: esta app **no la reescribe**. Cada deriva
se paga por uno de tres caminos:

- **T · texto de la constitución.** El código hace lo correcto y el texto quedó viejo. Va a
  `## Desviación del plan` de la bitácora del S7, como pedido a la planeadora con la frase propuesta.
- **C · código o documentos de este repo.** Se paga en la Fase 2 de `/audita-sprint`, con su demo en
  rojo cuando crea o cambia un gate.
- **D · decisión del usuario.** Abre su parada.

| Id    | Sev.  | Camino | Resumen                                                                                                                                                                                                                                                                                                                                                                                  |
| ----- | ----- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1  | Alto  | T      | La anti-fuga «solo `fit` sobre train», «todas las métricas sobre test» y la liga con CV no aplican a agrupar (ADR 016: el preprocesador se ajusta sobre todas las filas, sin CV ni prueba). Falta la viñeta de agrupar con la referencia nula y la estabilidad.                                                                                                                          |
| AC-2  | Alto  | T + C  | La regla 18 promete un test que «dice si venció» una condición de retiro con fecha. No existe, y el retiro del ADR 012 es un **evento** (que `braces` publique parche), no una fecha. C: `scripts/verificar-retiros.mjs` como comando nombrado, fuera de `pnpm test` porque usa red: consulta el aviso y falla si deja de estar sin parche. Nace con su rojo y entra en `/deploy-check`. |
| AC-3  | Alto  | D      | El brochure y el export solo existen en español (regla 16). Es la decisión **D-B** del delta del storyboard.                                                                                                                                                                                                                                                                             |
| AC-4  | Medio | T + C  | «Tailwind + shadcn/ui»: shadcn nunca se instaló; los primitivos son propios (`src/components/ui.tsx`). C: ADR 019 y `design-system.md:72` corregido.                                                                                                                                                                                                                                     |
| AC-5  | Medio | T      | «ONNX en el navegador desde S3»: el ADR 007 eligió `.probeta.json` (`skl2onnx` no carga en Pyodide).                                                                                                                                                                                                                                                                                     |
| AC-6  | Medio | T      | El adapter «multi-proveedor… circuit breaker»: hoy es `groq` y `mock`, con kill-switch, rate limit, timeout y cero reintentos; no hay circuit breaker.                                                                                                                                                                                                                                   |
| AC-7  | Medio | T      | Regla dura 4: el LLM «propone planes en vocabulario cerrado» y la narrativa es «EDA/SHAP». Hoy solo narra la tarea de dos clases y la explicabilidad es por permutación (ADR 004). La garantía «nunca ejecuta ni escribe datos» sí se cumple.                                                                                                                                            |
| AC-8  | Medio | T      | Regla dura 2: falta nombrar la excepción del ADR 006. Con consentimiento por petición, los nombres de columna y los agregados viajan a la narración; jamás filas.                                                                                                                                                                                                                        |
| AC-9  | Medio | T      | El veredicto no cubre la multiclase (exactitud balanceada, empate 0,01, mayoritaria + logística multinomial) ni agrupar (sin baseline). `METRIC_RULES` no lleva «texto»: el texto lo arma la UI.                                                                                                                                                                                         |
| AC-10 | Medio | T      | La fuga por tarea no nombra la regla por clase (ADR 017, soporte 5, que la binaria también adopta) ni el «no aplica» de agrupar.                                                                                                                                                                                                                                                         |
| AC-11 | Medio | T      | «El test unit del `engine/`» que falla si el preprocesador ve todo el dataset es un test de **integración** con Pyodide (`tests/integration/pipeline.test.ts`), del job `integration`.                                                                                                                                                                                                   |
| AC-12 | Medio | C      | `scripts/demo-rojo.sh:95-98` descarta 126 y 127, pero no una señal (exit ≥ 128). La constitución dice que una señal no cuenta como rojo. Mismo hueco en el script del kit: fricción K-S7-6.                                                                                                                                                                                              |
| AC-13 | Medio | C      | `README.md` es la plantilla de create-next-app desde el commit inicial, con rutas, gestores y un enlace de Vercel que no son de esta app. Restos de plantilla: `public/{file,globe,next,vercel,window}.svg`, sin uso, y el `CHANGELOG.md` raíz del kit, congelado en la v1.2.0.                                                                                                          |
| AC-14 | Bajo  | T      | `i18n/`: los textos viven en `messages/{es,en}.json`; `src/i18n/` tiene la lógica.                                                                                                                                                                                                                                                                                                       |
| AC-15 | Bajo  | T      | `src/types/` no existe.                                                                                                                                                                                                                                                                                                                                                                  |
| AC-16 | Bajo  | T      | `datasets/` no existe: es `public/datasets/` + `docs/kit-de-prueba/`, y no todos los archivos salen de `make-example-datasets.mjs`.                                                                                                                                                                                                                                                      |
| AC-17 | Bajo  | T      | `lib/ia/persist.ts` no existe (ADR 005: nada se persiste).                                                                                                                                                                                                                                                                                                                               |
| AC-18 | Bajo  | T      | «Copia idéntica en `public/pyodide/` vigilada por test»: la copia la genera el build (`copy-pyodide.mjs`), está gitignored y no hay test que compare.                                                                                                                                                                                                                                    |
| AC-19 | Bajo  | T      | Al árbol de `engine/` le faltan `split.ts`, `sanitize.ts`, `despacho.ts`, `explainability.ts` y `residuals.ts`; a `app/`, la ruta `api/narrate`.                                                                                                                                                                                                                                         |
| AC-20 | Bajo  | T      | «Backend: ninguno en Sprint 1»: hay un endpoint (`/api/narrate`) desde el S2, y la BD no llegó en el H2.                                                                                                                                                                                                                                                                                 |
| AC-21 | Bajo  | T      | «OPFS/IndexedDB/memoria»: solo memoria (más `localStorage` para el idioma).                                                                                                                                                                                                                                                                                                              |
| AC-22 | Bajo  | T      | «AutoML CPU»: no hay búsqueda de hiperparámetros; hay una liga con selección por CV (ADR 009).                                                                                                                                                                                                                                                                                           |
| AC-23 | Bajo  | T      | Regla 17, «cambiar tema»: la app sigue el tema del sistema y no tiene conmutador; el arnés lo emula.                                                                                                                                                                                                                                                                                     |
| AC-24 | Bajo  | T      | La regla 16 dice «TODO» y la regla 9, «manual en español». Falta declarar qué documentos internos (manual, guía, BLUEPRINT) están exentos.                                                                                                                                                                                                                                               |
| AC-25 | Bajo  | T      | «Inglés en nombres»: la propia constitución prescribe nombres de dominio en español (`tarea.ts`, `encarrilador.ts`…).                                                                                                                                                                                                                                                                    |
| AC-26 | Bajo  | T      | «Con incertidumbre» y «→ publicar» describen el destino de la VISION, no la app de hoy.                                                                                                                                                                                                                                                                                                  |
| AC-27 | Bajo  | C      | Las pruebas de la carnada de gitleaks se **saltan** en la CI: `quality` dice «674 passed \| 1 skipped» e `integration` saltó 5 de 7 en `gitleaks-hook`. gitleaks se baja a `$RUNNER_TEMP` sin entrar al `PATH`, y el comentario de `gitleaks-hook.test.ts:58-59` («igual que el propio hook») es falso desde que el hook falla cerrado.                                                  |

**Por camino:** T 23 (AC-1, AC-2, AC-4 a AC-11 y AC-14 a AC-26) · C 5 (AC-2, AC-4, AC-12, AC-13 y AC-27) · D 1
(AC-3). AC-2 y AC-4 van por los dos caminos: 27 derivas distintas.

## El informe del auditor

### Derivas, con su evidencia

- **AC-1.** `CLAUDE.md:382-384` dice «se ajusta solo con `fit` sobre train; es el único camino que la
  UI ofrece»; `:389-390`, «Todas las métricas se calculan sobre test»; `:391-393`, la liga con
  validación cruzada «dentro de train… recién entonces se abre el test». Para agrupar es falso:
  - `decisions/016-grouping-without-a-target.md`, decisión 2: «The preprocessing is fitted on all
    rows».
  - Decisión 1: Python rechaza un payload de agrupar con `train_idx`, `test_idx` o `cv_k`.
  - Consecuencias: «no cross-validation».
  - `src/engine/roster.ts:104-106`: `agrupar: []`, sin baseline.
  - Las varas de agrupar son `CLUSTER_GAP_MIN` 0,10 y `CLUSTER_STABILITY_MIN` 0,7
    (`src/engine/verdict.ts:201-206`).
  - Riesgo: una sesión nueva podría «arreglar» agrupar o creer rota la regla dura 3.
- **AC-2.** `CLAUDE.md:250-253`.
  - `tests/unit/audit-exceptions.test.ts:24-35` solo exige un ADR que nombre el id y diga «removal
    condition».
  - `tests/unit/runtime-pin.test.ts:30-45` solo compara el pin con la constante.
  - El retiro del ADR 012 es un evento, no una fecha.
  - `grep -rni "envejec\|aging\|venci\|expir" tests scripts src decisions` → 0.
  - La re-lectura del S7 fue a mano: bitácora del S7, sección del delta del kit.
- **AC-3.** `docs/BROCHURE.html:2` `<html lang="es-CO">`, sin inglés, servido en `/conoce`.
  `docs/brochure-export.json`: 0 mapas `{es, en}`.
- **AC-4.** `CLAUDE.md:62`.
  - No hay `components.json`.
  - `package.json` no trae `@radix-ui`, `class-variance-authority`, `clsx` ni `tailwind-merge`.
  - La K2 del S1, «diferido a Fase 2» (`sprints/SPRINT_001-implementation-log.md:20`), nunca se cerró.
  - Lo repiten `design-system.md:72` y `.claude/skills/diseno-ui.md:24`.
- **AC-5.** `CLAUDE.md:78-79`.
  - `decisions/007…:24-25`.
  - `onnxruntime-web` no está en `package.json`.
  - `grep -ri onnx src` → 0.
- **AC-6.** `CLAUDE.md:72-74`.
  - `src/lib/ia/client.ts:19` y `:41-45`: `NarrationProvider = "groq" | "mock"`.
  - `grep -rni "circuit\|breaker" src` → 0.
  - Kill-switch `NARRATION_ENABLED` (`guardrails.ts:18-20`), rate limit de 10/min por IP (`:34-50`),
    timeout de 15 s y cero reintentos (`client.ts:24-26`).
- **AC-7.** `CLAUDE.md:56-58`.
  - `src/app/api/narrate/route.ts:1-7`, Narrator + Grader.
  - `client.ts:80`, «Explain a binary-classification experiment».
  - La explicabilidad es por permutación (ADR 004).
  - El saneamiento es determinista y sin LLM (`src/engine/sanitize.ts`).
- **AC-8.** `CLAUDE.md:40-43` frente a `decisions/006…:15-19`.
- **AC-9.** `CLAUDE.md:385-390`.
  - `src/engine/verdict.ts:47`, `:95-96` y `:51-55` (`MetricRule` = `direction` + `tolerance`).
  - `:3-5`: el texto lo arma la UI.
  - `roster.ts:102`.
- **AC-10.** `CLAUDE.md:404-406`.
  - `detectLeakageByClass` (`src/engine/leakage.ts:226-252`).
  - `LEAKAGE_CLASS_MIN_SUPPORT = 5` (`:49-54`), ADR 017.
  - ADR 016, decisión 9: en agrupar, la fuga no aplica.
- **AC-11.** `CLAUDE.md:384`. `tests/integration/pipeline.test.ts:3-4` y `:33`.
- **AC-12.** `CLAUDE.md:185-186`.
  - `scripts/demo-rojo.sh:95-98`.
  - Sin `--debe-nombrar`, que es opcional y en `:49` solo avisa, un gate muerto por señal (130, 137, 143) cuenta como rojo.
  - La copia del kit tiene el mismo hueco.
- **AC-13.** `README.md` intacto desde `c73018a`, «Initial commit from Create Next App».
  - Cita `app/page.tsx`; ofrece npm, yarn y bun; enlaza el deploy de Vercel.
  - `public/{file,globe,next,vercel,window}.svg`: grep 0 usos.
  - `CHANGELOG.md` raíz: el del kit, en la v1.2.0.
- **AC-14.** `CLAUDE.md:96` y `:421`. ADR 003 `:17`; `src/i18n/dictionaries.ts:2-3`.
- **AC-15.** `CLAUDE.md:97`.
- **AC-16.** `CLAUDE.md:98` y `:412-413`.
  - `make-example-datasets.mjs:12-14`.
  - `liga-mediana.csv` sale de `scripts/kit-de-prueba-liga-mediana.mjs`.
  - `clientes-nuevos*.csv`, `casas-nuevas.csv`, `ejemplo-exportado-de-excel.csv` y `modelo-*.json`
    son a mano (`docs/kit-de-prueba/README.md:53-79`).
- **AC-17.** `CLAUDE.md:94`. Hay `client.ts`, `cost.ts`, `guardrails.ts`, `mock.ts` y `schemas.ts`.
- **AC-18.** `CLAUDE.md:92-93`. `scripts/copy-pyodide.mjs:58-60`, `.gitignore:13` y
  `public/pyodide-runner.js:54`.
- **AC-19.** `CLAUDE.md:85` y `:87-88`.
- **AC-20.** `CLAUDE.md:69-71`. `src/app/api/narrate/route.ts:1`.
- **AC-21.** `CLAUDE.md:410-411`. `grep -rni "indexedDB\|OPFS\|navigator.storage" src` → 0;
  `src/i18n/provider.tsx:30`.
- **AC-22.** `CLAUDE.md:38`. `pipeline.py:402`, «hiperparámetros FIJOS».
- **AC-23.** `CLAUDE.md:248`. `src/app/globals.css:22`.
- **AC-24.** `CLAUDE.md:240-243` frente a `:138`. `docs/GUIA-DE-PRUEBA.html` y `docs/BLUEPRINT.html`
  con `lang="es"`.
- **AC-25.** `CLAUDE.md:420`. `src/engine/tarea.ts:8-9`.
- **AC-26.** `CLAUDE.md:26-27`. `VISION.md:64`, «incertidumbre medida [MVP]».
- **AC-27.** `CLAUDE.md:126-136` y `:166`.
  - `tests/unit/hook-secretos.test.ts:62` (`runIf`).
  - `tests/integration/gitleaks-hook.test.ts:61` y `:113` (`skipIf`).
  - Run 37399501605: `quality` «674 passed | 1 skipped»; `integration`, `gitleaks-hook` «7 tests | 5
    skipped».
  - `ci.yml:21-27`.

### Sin deriva (una evidencia por comprobación)

- **Las dos casas:** la bitácora del S7 tiene `## Desviación del plan`.
- **Qué es esta app:** VISION v1.1.0 aprobada el 2026-10-02; los nombres de los sprints coinciden.
- **Regla dura 1:** sin GPU, WebGPU ni TabPFN (grep 0); MLP con `MLP_MIN_ROWS = 500`
  (`encarrilador.ts:28`).
- **Regla dura 2:**
  - `scrubSentryEvent` deja pasar solo `probeta.*` (`sentry-scrub.ts:25-33`), en cliente y servidor;
  - Pino registra solo modelo, tokens y USD (`cost.ts:40-48`);
  - CSP `connect-src 'self'` + Sentry (`next.config.ts:21`).
- **Regla dura 3:** «sirve para elegir», «no sirve para elegir» y «Elegido por ti» en
  `messages/es.json`.
- **Regla dura 4:** el núcleo se cumple. El LLM no escribe datos y siempre hay plantilla.
- **Stack:**
  - Next 16.3.8, `strict`, Tailwind 4, i18n por ADR 003;
  - Pyodide `314.0.2` con pin y `runtime-pin.test.ts`;
  - module worker cargado al iniciar; self-host por `copy-pyodide.mjs`;
  - Vitest, Playwright, Testing Library y axe; Pino + Sentry.
  - Vercel no es verificable desde el repo.
- **Estructura:** lo que existe coincide (`app`, `components`, `engine`, `workers`, `lib/ds`,
  `content`, `tests`, `design-system.md`, `design-sync/`, los `docs/*`, `sprints/`, `decisions/` y
  `scripts/demo-rojo.sh` en 100755).
- **Reglas de desarrollo:**

  | Regla | Evidencia                                                                                                                                   |
  | ----- | ------------------------------------------------------------------------------------------------------------------------------------------- |
  | 1     | 0 `any` y 0 `@ts-ignore` en `src`.                                                                                                          |
  | 2     | Umbral 80 en `engine/` y en los módulos de garantía (`vitest.config.ts:28-60`).                                                             |
  | 3     | Solo el hook crea el worker.                                                                                                                |
  | 5     | `min-h-11`, `motion-reduce` y axe en 14 sitios de los e2e.                                                                                  |
  | 6     | Ruleset con PR y 4 checks; hook contra el push a `main`.                                                                                    |
  | 7     | `pre-commit` en 100755, `prepare` → `apply-hooks.mjs`; el PreToolUse falla cerrado; gitleaks con sha256 en la CI.                           |
  | 9     | El manual tiene las secciones del S7.                                                                                                       |
  | 10    | `design-sync/` con las tarjetas del S7; `lastPublished` correcto con el Acto 2 pendiente.                                                   |
  | 11    | Los flags de `demo-rojo.sh` existen, salvo lo de AC-12.                                                                                     |
  | 12    | `/conoce`, `MOTION_INTENSITY`, el e2e de reduced-motion y `fuente` en las 11 métricas del export.                                           |
  | 13    | Barrido vacío; `homepageUrl` es el repo.                                                                                                    |
  | 14    | Dependabot 2 × 1, solo minor + patch, con test; peers y `verificar-dependencias` en `quality`; overrides en el workspace; ADR 012 completo. |
  | 15    | Fixtures escritos por Pyodide, carnadas «detectó k de n», `_validate_payload` y `modelo-s5` / `modelo-s6`.                                  |
  | 19    | El inventario está en la bitácora.                                                                                                          |
  | 20    | `pnpm test` es solo Vitest unit, sin red.                                                                                                   |
  | 21    | Un solo worktree.                                                                                                                           |
  | 22    | Existe el molde del spike.                                                                                                                  |

- **Estándares:** budget, categorías y margen cableados en el job `lighthouse`; `lighthouse-urls.json`
  = `["/"]`.
- **Workflow:** PR #19 en borrador con la línea del merge primero.
- **Patrones de dominio:**
  - `ALL_MEMBER_IDS` y `ROSTER_BY_TASK`;
  - la prueba «la selección no mira el test»;
  - E1, E2 y E3 donde se dice;
  - `unsupported-task` y «sin `task` es binaria»;
  - límites de 5 MB y 50 000 filas;
  - fuga plantada en las tres tareas con objetivo;
  - «sin ella, entrena»;
  - el CSV del usuario no se persiste.
