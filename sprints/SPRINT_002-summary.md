---
sprint: 002
app: ds
status: closed
opened: 2026-07-09
closed: 2026-07-09
branch: sprint-002/porque-honesto
pr: https://github.com/mauriciorincon-ai/app-ds/pull/3
---

# Sprint 002 Summary — Probeta DS

## Outcome

**Sí — ambos logrados.** (1) Tras entrenar, el usuario ve **"¿Por qué predice así?"**: importancia
global por permutación sobre test (gráfico + dirección honesta contra la clase positiva real) y una
narración en llano — **verificada contra los números antes de mostrarse**; sin consentimiento, sin
key, con kill-switch, con proveedor caído o con narrador mentiroso ⇒ **plantilla determinista,
nunca sección vacía**. (2) El usuario descarga una **model card** completa (datos, split, método,
métricas en test, veredicto, fuga, explicabilidad, límites) generada 100% en su navegador.
Verificado end-to-end en navegador real (6 e2e, móvil + desktop).

## Qué se construyó

- **Explicabilidad en Pyodide:** `permutation_importance` sobre TEST (spike: `shap` NO carga en
  Pyodide — sin wheels de numba) + dirección del efecto con umbral estadístico `2/√n` (el ruido
  dice "sin dirección clara", no lleva flecha).
- **Estreno del estándar 7 (IA embebida):** adapter `lib/ia/` (schemas Zod `strict()` · client
  único con ≤2 llamadas/tokens acotados/timeout/cero retries · guardrails · mock CI · costo con
  Pino) + **primer route server-side** `POST /api/narrate` (kill-switch → rate limit → Zod →
  Narrator → **verificación determinista** → Grader). Patrón Explingo: claims verificables;
  variable inventada/dirección falsa/cifra fuera de ε ⇒ descarte.
- **Motores puros TS:** ensamblador del payload (garantía "cero valores de filas" bajo test),
  verificador numérico, plantillas deterministas ES/EN, ensamblador de model card.
- **3 superficies UI** sobre el design-system existente: WhySection (barras CSS, badge
  "✓ verificada" vs "Texto estándar", aria-live), ConsentPanel (opt-in honesto, default OFF,
  localStorage) y ModelCardView (descarga .md por Blob + vista previa).
- **Observabilidad server-side:** Sentry con scrubber (borra la request entera — lleva nombres de
  columnas) + log estructurado de costo por request.

## DoD — checklist (6+1)

- **Testing** ✅ — 120 unit + 5 integración (anti-fuga S1 intacto + explicabilidad con sanity
  empírico sobre los datasets reales) + 6 e2e (happy S1 · porqué→model card con inspección de la
  request · fallback sin consentimiento) + axe. Todo en CI con mock.
- **CI/CD** ✅ — Actions (quality + integration + e2e + lighthouse); preview Vercel a probar en el PR.
- **Observabilidad** ✅ — errores del route → Sentry sin nombres de columnas (scrubber server-side
  nuevo); costo por request con Pino (paga la deuda S1 "Pino sin usar").
- **Seguridad** ✅ — audit high exit 0 (persiste 1 moderate transitiva de S1); key SOLO server-side;
  rate limit + kill-switch + timeout; Zod `strict()` (clave desconocida ⇒ rechazo total); gitleaks
  limpio en cada commit.
- **Performance** ✅ — landing sin peso nuevo (sigue estática; el porqué vive bajo el fold de
  Resultados; AI SDK solo server-side). Lighthouse se valida en el PR.
- **UX/A11y** ✅ — axe sin violaciones (e2e móvil+desktop); `aria-live` en narración; dirección con
  símbolo + texto (nunca solo color); táctil ≥44px; ES/EN con paridad.
- **IA embebida (estreno)** ✅ — checklist `ia-embebida` completo: salida LLM por Zod ✓ guardrails
  input/output ✓ circuit breaker→plantilla ✓ mock en CI (éxito/mentira/caída) ✓ ≤2 llamadas +
  máx. tokens ✓ **nada del LLM se persiste** ✓ costo loggeado ✓ system prompt server-side ✓.
- **Manual de uso** ✅ — el porqué, el badge, qué viaja (y qué no), la model card, límites, 2 FAQs.
- **Revisión de diseño** ✅ — checklist `diseno-ui` + **aprobación visual del usuario** sobre
  galería de la app real ("Aprobado — cierra el sprint", sin ajustes).

## Métricas técnicas (vs. SPRINT_002.md)

- ✅ Narración con consentimiento + mock/key: cita SOLO variables reales con direcciones correctas
  - badge "✓ verificada" (ES y EN).
- ✅ Mock mentiroso ⇒ la verificación la descarta ⇒ plantilla (unit + e2e por mock env).
- ✅ Sin consentimiento / sin key / kill-switch / proveedor caído ⇒ plantilla SIEMPRE (nunca vacío).
- ✅ **Ninguna petición contiene valores de filas** — test unit del ensamblador + e2e que inspecciona
  la request real + Zod `strict()` en el route (3 capas).
- ✅ Sanity empírico: en marketing las columnas de señal real quedan arriba (`dispositivo` +
  `visitas_web`/`correos_abiertos` — la orden decía "canal", columna que no existe; ver D1); en el
  de fuga, `monto_recuperado` domina (>2× la segunda) + advertencia S1 intacta.
- ✅ Model card descargada completa, en el idioma activo (e2e afirma el contenido real).
- ✅ ≤2 llamadas LLM por narración (estructural), máx. tokens 400/150, cero retries.

## Decisiones no anticipadas (ADRs)

- **ADR-004** — explicabilidad: permutation importance sobre test (spike: shap no carga en
  Pyodide); dirección contra la clase positiva con banda nula `2/√n`.
- **ADR-005** — proveedor LLM: Groq vía Vercel AI SDK (precios verificados 2026-07-09: 70B
  $0.59/$0.79, 8B $0.05/$0.08 por M tokens; free tier sin tarjeta) + mock en CI.
- **ADR-006** — privacidad de la narración: qué viaja con opt-in (nombres de columnas +
  agregados), qué JAMÁS (filas, valores, etiqueta de clase), 3 capas de garantía.

## Bugs + resoluciones

- **Honestidad del microcopy (encontrado por el gate visual):** "asociación positiva con el
  objetivo" se leía invertido cuando la clase positiva es la minoritaria («0» en marketing) →
  ahora nombra la clase real; y el ruido con flecha (|r| nulo ~0.28 con n=50) → umbral `2/√n`.
- Testing Library sin auto-cleanup (falta `globals: true`) → renders acumulados entre tests →
  cleanup manual en setup.
- Vista previa de la model card duplicaba títulos en el DOM (modo estricto Playwright) → el
  `<pre>` se monta solo al abrir el `<details>`.
- `getByText` de Playwright es case-insensitive → colisión "Texto estándar"/"texto estándar" →
  match exacto.
- Reglas react-hooks nuevas (`set-state-in-effect`, `refs`): el estado "cargando" de la narración
  se rediseñó como estado DERIVADO (respuesta keyed por payload) — más limpio que el patrón con ref.
- **Lighthouse rojo por 48 bytes** (script budget 300 KB): `useNarration` importaba el schema Zod
  en runtime ⇒ zod entró al bundle del cliente. Fix: type-guard sin zod en el cliente (el route
  sigue siendo el guardián); regla derivada: del lado cliente, `schemas.ts` solo con `import type`.

## Qué salió bien / qué generó fricción

**Bien:** el patrón S1 "spike primero" volvió a pagar (shap descartado en minutos, sin construir
sobre arena); la verificación determinista convirtió "la IA puede mentir" en un problema de
matching comprobable (el mock mentiroso lo demuestra en CI); el gate de diseño encontró un bug
real de honestidad (es exactamente para lo que existe); el e2e que inspecciona la request real es
la evidencia más fuerte de la promesa de privacidad.

**Fricciones (del repo/stack, no del kit):**

- Zod ignora claves desconocidas por defecto — vocabulario cerrado exige `.strict()` explícito
  (lo detectó el propio test del guardrail).
- El runner sirve `public/pyodide/pipeline.py` (copiado en predev): editar `src/lib/ds/pipeline.py`
  con el dev server corriendo no se refleja hasta re-correr `copy-pyodide.mjs`.
- Sin fricciones nuevas del kit v1.2.0 (K# quedó vacío este sprint).

## Sugerencias de mejora al método

- **Promover el patrón "verificación determinista antes que Grader"** (Narrator+Grader+verify) a
  la wiki: es reusable en cualquier app con narrativa LLM sobre números.
- **Documentar en `repo-app.md`:** los esquemas Zod de entrada de un route deben ser `.strict()`
  (vocabulario cerrado real) — el default de Zod silenciosamente acepta y descarta.
- **Regla para el skill `ia-embebida`:** en código cliente, importar de `lib/ia/schemas.ts` SOLO
  con `import type` — un import runtime mete zod al bundle y revienta el budget de la landing.
- **Nota Pyodide:** añadir al patrón wiki existente que `pipeline.py` servido desde `public/` exige
  re-correr `copy-pyodide.mjs` tras editarlo con el dev server vivo.

## Deuda técnica aceptada

- **Rate limit en memoria por instancia serverless** (no global) — suficiente a escala personal;
  se paga si llegan usuarios reales (store compartido).
- **Narración probada con proveedor real (Groq) solo manualmente** — CI usa mock por diseño; la
  validación con key real queda como paso manual del usuario en la preview (checklist del PR).
- **1 audit moderate** (postcss, transitiva de Next) — heredada de S1, se paga cuando Next la bumpee.

## Archivos clave (máx. 10)

1. `src/lib/ds/pipeline.py` — explicabilidad (permutation importance + dirección honesta).
2. `src/lib/narration/{payload,verify,templates}.ts` — la tríada del porqué verificado.
3. `src/lib/ia/{schemas,client,guardrails,mock,cost}.ts` — estándar 7 completo.
4. `src/app/api/narrate/route.ts` — primer route server-side (el circuito entero).
5. `src/lib/modelcard.ts` — la constancia exportable.
6. `src/components/{WhySection,ConsentPanel,ModelCardView}.tsx` — las 3 superficies nuevas.
7. `src/lib/{useConsent,useNarration}.ts` — consentimiento + estado derivado de narración.
8. `tests/e2e/why-modelcard.spec.ts` — la garantía de privacidad sobre la request real.
9. `decisions/00{4,5,6}-*.md` — los 3 ADRs del sprint.
10. `sentry.server.config.ts` + `instrumentation.ts` — observabilidad server-side con scrubber.

## Cómo probar

```bash
pnpm install
pnpm dev                # sin env de narración ⇒ siempre plantilla (honesto)
# Con narración mock:  NARRATION_ENABLED=true NARRATION_PROVIDER=mock pnpm dev
# Con Groq real:       + NARRATION_PROVIDER=groq GROQ_API_KEY=gsk_... en .env.local
pnpm test               # 120 unit + cobertura (UI incluida)
pnpm test:integration   # anti-fuga S1 + explicabilidad en Pyodide real
pnpm test:e2e           # 6 e2e: happy S1 · porqué→model card · fallback sin consentimiento
```
