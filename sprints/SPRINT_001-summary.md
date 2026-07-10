---
sprint: 001
app: ds
status: closed
opened: 2026-07-08
closed: 2026-07-09
branch: sprint-001/veredicto-honesto
pr: https://github.com/mauriciorincon-ai/app-ds/pull/1
---

# Sprint 001 Summary — Probeta DS

## Outcome

**Sí — logrado.** Un usuario carga un CSV (o elige un ejemplo), selecciona la columna binaria a
predecir y —100% en su navegador— recibe un modelo real + un **veredicto franco** de si supera a un
baseline, con la fuga de datos imposible por construcción y una advertencia cuando detecta una
columna proxy. Verificado end-to-end en navegador real (e2e móvil + desktop).

## Qué se construyó

- **Motores puros (TS, testeados):** split estratificado seeded, veredicto modelo-vs-baseline,
  heurística de fuga (rank-AUC + pureza de categoría).
- **Ingesta:** parser CSV RFC-4180 + límite honesto (5 MB / 50k filas) + perfilado.
- **Pipeline anti-fuga (Pyodide/WASM):** `ColumnTransformer` en `Pipeline` sklearn que ajusta **solo
  en train**; baselines (mayoría + logística) + Random Forest; métricas sobre test.
- **3 datasets** de ejemplo (2 limpios + 1 con fuga plantada), con tres narrativas honestas
  (supera / empata / fuga).
- **5 pantallas** responsive bilingües ES/EN: inicio/carga, configuración, entrenamiento,
  resultados/veredicto, error — sobre un `design-system.md` propio (instrumento de laboratorio).
- **Runner de Pyodide** como module worker autónomo (self-host de assets en `public/pyodide/`).
- **Observabilidad** Sentry client-only, metadata-only.

## DoD — checklist (6+1)

- **Testing** ✅ — unit split/veredicto/fuga + integración fit-solo-en-train + e2e happy path
  (móvil+desktop) + axe. 62 unit + 2 integración + 2 e2e; en CI.
- **CI/CD** ✅ — Actions (quality + integration + e2e + lighthouse) verde en el PR y en `main`
  post-merge; preview Vercel probada a mano antes de mergear.
- **Observabilidad** ✅ — errores del worker → Sentry (metadata-only, sin contenido del dataset).
- **Seguridad** ✅ — `pnpm audit --audit-level high` exit 0 (1 moderate transitiva, no bloquea);
  cero secrets; datos del usuario nunca salen del navegador.
- **Performance** ✅ — Lighthouse verde en CI sobre `/` (landing liviana, Pyodide bajo demanda fuera del LCP).
- **UX/A11y** ✅ — axe sin violaciones; teclado (HTML semántico + focus ring); contraste AA en la paleta.
- **IA embebida** — **N/A** (sin LLM este sprint).
- **Manual de uso** ✅ — `docs/MANUAL-DE-USO.md` con el flujo del veredicto.
- **Revisión de diseño** ✅ — checklist `diseno-ui` + **aprobación visual del usuario** (2 gates:
  dirección y app real).

## Métricas técnicas (vs. SPRINT_001.md)

- ✅ Del inicio al veredicto con un ejemplo, sin tocar código.
- ✅ Veredicto franco modelo-vs-baseline en español llano.
- ✅ El dataset con fuga plantada dispara la advertencia; los limpios no (test sobre datasets reales).
- ✅ Todas las métricas sobre **test** (garantizado por el split unit + el test de integración).
- ✅ CSV sobre el límite → mensaje honesto, no crash.
- ✅ Los datos del usuario nunca salen del navegador (sin llamadas de red con su contenido).
- ✅ UI completa en ES y EN (test de paridad de claves).

## Decisiones no anticipadas (ADRs)

- **ADR-001** motor de cómputo cliente (Pyodide, self-host, module worker desde `public/`).
- **ADR-002** anti-fuga por construcción (split en TS + fit-solo-en-train en sklearn + tests que fallan si se rompe).
- **ADR-003** i18n diccionario ligero propio (no `next-intl`) — 3er ADR pedido por el CLAUDE.md, no por la orden.

## Bugs + resoluciones

- **K11 (bloqueante):** Turbopack instancia `new Worker(new URL(...))` como worker **clásico**;
  Pyodide exige module worker → "classic web workers are not supported". Resuelto moviendo el runner
  a `public/pyodide-runner.js` (module worker real) y la orquestación pura al hilo principal (más
  testeable).
- Tests propios frágiles (FP en el veredicto; fixture de leakage que era separador inverso perfecto)
  → corregidos.
- `empty-table-header` (axe) en la esquina de la matriz de confusión → `<td>`.

## Qué salió bien / qué generó fricción

**Bien:** el spike temprano de Pyodide de-riskeó el corazón del sprint; validar los datasets
empíricamente en Pyodide reveló que la señal lineal hacía ganar siempre a la logística → se rediseñó
con señal no lineal para tener un happy-path honesto. La orquestación en el hilo principal salió más
testeable que el worker original.

**Fricciones del kit v1.2.0 (aparte):**

- **K1–K3** boilerplate CNA, shadcn/i18n no cableados (esperado en S1).
- **K5** `lighthouse-urls.json` solo mide `/` — correcto, se mantuvo.
- **K6/K7** coverage no aplicaba `--coverage` en el script `test`; umbral engine 80% ausente → arreglado.
- **K8** cobertura v8 parseaba `.gitkeep` (include sin `*.ts`) → arreglado.
- **K9/K10** eslint lintaba `coverage/` y `public/pyodide/` (39 MB) → añadidos a ignores.
- **K12** `@sentry/cli` build script → `ERR_PNPM_IGNORED_BUILDS`; declarado ignorado.

## Sugerencias de mejora al método

- **Promover Sentry al kit** (ya validado en 2 apps: nutri-kids y ds). El patrón client-only
  metadata-only + `beforeSend` scrubber es reutilizable.
- **Nota de fricción Pyodide+Turbopack (K11):** documentar en `repo-app.md` que los workers que cargan
  ESM (Pyodide) deben servirse desde `public/` como module workers, no bundlearse.
- **`ignoredBuiltDependencies` para `@sentry/cli`** al estampar apps que usen Sentry sin source maps.

## Deuda técnica aceptada

- **Cobertura unit de la capa UI** — `useExperiment.ts` en 0% y los componentes `.tsx` fuera de la
  medición de cobertura (el CLAUDE.md pide UI >50%). Hoy la UI se valida por e2e (happy path
  móvil+desktop + axe, verdes). Se paga en S2 con Testing Library (ya en el stack, sin usar).
- **Sin source maps de Sentry** (no se subió `@sentry/cli`) — se paga cuando haya release con usuarios.
- **1 audit moderate** (postcss, transitiva de Next) — se paga cuando Next la bumpee.
- **Pino sin usar** (logger de servidor; N/A en app 100% cliente) — entra con backend en S2.

## Archivos clave (máx. 10)

1. `src/engine/{split,verdict,leakage}.ts` — los motores de la honestidad.
2. `src/lib/ds/pipeline.py` — pipeline anti-fuga (fit-solo-en-train).
3. `src/lib/experiment.ts` — orquestación pura (summarize/prepare/assemble).
4. `src/lib/useExperiment.ts` — máquina de estados + runner.
5. `public/pyodide-runner.js` — module worker de Pyodide.
6. `scripts/copy-pyodide.mjs` — self-host de assets.
7. `src/components/ResultsScreen.tsx` — el veredicto (pieza jerárquica).
8. `tests/integration/pipeline.test.ts` — el test DoD anti-fuga.
9. `design-system.md` — sistema visual base.
10. `decisions/00{1,2,3}-*.md` — los 3 ADRs.

## Cómo probar

```bash
pnpm install
pnpm dev            # http://localhost:3000 → elige "Campaña de marketing" → convirtio → Entrenar
pnpm test           # unit + cobertura
pnpm test:integration   # garantía anti-fuga en Pyodide
pnpm test:e2e       # happy path móvil + desktop + axe
```
