# Probeta DS (app-ds) — constitución de la app (Claude Code)

> Auto-cargado en cada sesión de este repo. Esta app pertenece al pipeline **AI-APPs**; su plan
> vive en la casa planeadora. Estampada desde kit-app v1.2.0 el 2026-07-08 (Sprint 001).

## Las dos casas (regla dura)

| Casa           | Path                            | Escritor único   | Qué vive ahí                                                                     |
| -------------- | ------------------------------- | ---------------- | -------------------------------------------------------------------------------- |
| **Planeadora** | `C:\Code\hr01-develop-ai-apps\` | su propia sesión | brief, VISION, sprints (plan+retro), órdenes de construcción, método, estándares |
| **Esta app**   | este repo                       | **tú**           | código, tests, ADRs de implementación, bitácora y summary del sprint             |

- ✅ Puedes **leer** la planeadora (agregada como `additionalDirectories`, o por path absoluto).
- ❌ **Nunca escribes** en la planeadora. Si el plan necesita cambio, lo anotas en tu
  `sprints/SPRINT_NNN-implementation-log.md` bajo `## Desviación del plan` y avisas al usuario.
- El avance de implementación vive **solo aquí** — la planeadora te lee, tú no le reportas a mano.

## Qué es esta app

**Probeta DS** — _"Ciencia de datos honesta, de principio a fin."_ App web que lleva a
profesionales **no científicos de datos** por el ciclo completo (cargar → limpiar → entender →
modelar → comprobar → publicar) para construir un **modelo defendible a nivel de investigación**:
sin fuga de datos, validado correctamente, honesto contra un baseline, con incertidumbre y un
pipeline reproducible. El diferenciador **no** es el AutoML (commodity) sino la **honestidad
metodológica automática**. Contrato de alcance: `portafolio/ds/VISION.md` (planeadora, aprobada
2026-07-08). Sprint 001: "El veredicto honesto".

## ⚠️ Reglas duras de esta app (producto, no estilo)

1. **100% CPU / computación tradicional — CERO GPU.** Prohibidos: modelos fundacionales tabulares
   (TabPFN/TabICL), backend WebGPU, tiers GPU en cloud, entrenamiento pesado de deep learning. El
   modelado se apoya en árboles/boosting (óptimos para tabular y CPU-nativos) + AutoML CPU; el DL
   son solo **redes ligeras entrenables en CPU** (MLPs), opcionales y honestamente etiquetadas.
2. **Los datos del usuario NUNCA salen de su navegador.** El cómputo (perfilado, EDA,
   entrenamiento) corre client-side con Pyodide/WASM. No se suben datasets a ningún servidor. Los
   logs/observabilidad **jamás** incluyen valores del dataset (solo metadatos: nº filas/columnas,
   tipos, forma — nunca contenido ni, idealmente, nombres de columnas del usuario).
3. **Honestidad por diseño, no como opción.** La **fuga de datos es imposible por construcción**
   (el preprocesamiento se ajusta SOLO en train; la UI no ofrece otro camino). El **veredicto
   contra baseline es franco**: si el modelo no supera a una regresión/clase mayoritaria, se dice
   de frente. Nunca inflar métricas ni ocultar que un modelo no sirve.
4. **El LLM (desde S2) nunca ejecuta ni escribe datos.** Propone planes en vocabulario cerrado de
   operaciones; un motor determinista los ejecuta en sandbox; siempre hay fallback heurístico sin
   LLM. Toda narrativa (EDA/SHAP) se verifica contra los números antes de mostrarse.

## Stack

- **Frontend:** Next.js 15 + TypeScript strict + Tailwind + shadcn/ui. Bilingüe ES/EN día 1
  (i18n approach → ADR). Responsive móvil (360–420px) + desktop (≥1024px).
- **Cómputo:** **Pyodide** (pandas + scikit-learn en WASM) en un **Web Worker** (no bloquear el
  hilo principal), single-thread en S1, **cargado bajo demanda** al iniciar el experimento.
  Assets de Pyodide **self-hosteados** en `public/pyodide/` (o CDN con excepción de CSP → ADR).
- **Backend/BD/Auth:** **ninguno en Sprint 1** — todo client-side. Supabase entra más adelante
  **solo para metadata** (proyectos, planes de wrangling, métricas, model cards) con RLS desde la
  primera tabla; **jamás datos crudos del usuario**.
- **IA embebida:** **ninguna en Sprint 1.** Desde S2: adapter multi-proveedor **conmutable por env**
  (Azure AI Foundry / Claude API / Gemini / Groq / self-host OpenAI-compatible), presupuesto
  runtime **≤ US$10/mes** (etapa inicial), guardrails + circuit breaker con fallback determinista.
  Patrón obligatorio: skill `ia-embebida`. **NO instalar SDK de ningún proveedor antes de su ADR (S2).**
- **Tests:** Vitest (unit/integration) + Playwright (e2e) + Testing Library + @axe-core/playwright.
- **Deploy:** Vercel (preview por PR, prod desde `main`). **Observabilidad:** Pino + Sentry (logs
  sin contenido del dataset — ver regla dura 2). Despliegue de modelos del usuario: ONNX en el
  navegador (ONNX Runtime Web, backend WASM/CPU) desde S3.

## Estructura

```
src/
├─ app/            (App Router: workspace del experimento)
├─ components/     (UI sin lógica: carga · configuración · entrenamiento · resultados/veredicto)
├─ engine/         (motores puros, >80% cobertura: verdict.ts modelo-vs-baseline · leakage heurística)
├─ workers/        (protocol.ts — contrato tipado UI↔worker; el runner es un module worker
│                   autónomo en public/pyodide-runner.js — ver ADR-001, fricción K11 de Turbopack)
├─ lib/
│  ├─ ds/          (parsing/validación CSV · perfilado · pipeline sklearn anti-fuga [.py embebido])
│  └─ ia/          (S2 — patrón IA-embebida: schemas.ts · client.ts · guardrails.ts · persist.ts)
├─ i18n/           (es · en — paridad exigida por tests)
└─ types/
datasets/                 (ejemplos empaquetados, anonimizados; uno con fuga plantada)
public/pyodide/           (assets de Pyodide self-hosteados)
tests/{unit,integration,e2e}/
design-system.md          (fuente de verdad visual — se crea en el sprint 1 desde cero)
docs/MANUAL-DE-USO.md     (manual en español llano — OBLIGATORIO, vivo desde S1)
sprints/SPRINT_NNN-implementation-log.md · SPRINT_NNN-summary.md
decisions/NNN-titulo.md   (ADRs de implementación)
```

## Reglas de desarrollo

1. **TypeScript strict.** Sin `any` ni `@ts-ignore` sin justificación en comentario.
2. **Tests con cada feature.** Motores puros de `engine/` >80% (el split-sin-fuga, el veredicto y
   la heurística de fuga tienen test unit que FALLA si alguien rompe la garantía), UI >50%, ≥1 e2e
   por feature core.
3. **Motor separado de UI.** El pipeline/veredicto/fuga en `engine/` y `lib/ds/` puros; componentes
   sin lógica de negocio. El worker de Pyodide expone una API tipada; la UI no habla WASM directo.
4. **Toda salida de LLM que se persista pasa por esquema Zod** (skill `ia-embebida`) — aplica desde
   S2; nunca texto libre directo a almacenamiento.
5. **A11y desde el inicio:** tabindex, aria-labels, contraste AA, `prefers-reduced-motion`,
   táctil ≥44px. Nada comunica solo con color (métricas/veredicto con símbolo + texto).
6. **Commits convencionales**; branch `sprint-NNN/<tema>`; **jamás push directo a `main`** (hook lo
   bloquea); PR con CI verde + preview probado.
7. **Secrets solo en `.env.local` (gitignored) y Vercel env vars.** Doble protección gitleaks
   (hook PreToolUse + `githooks/pre-commit`). El hook nace ejecutable (100755) y `core.hooksPath`
   se re-aplica en cada `pnpm install` (script `prepare` — K12 pagada en S3); si un commit con
   secreto de prueba NO es bloqueado, el gate está muerto. **Carnada canónica verificada (kit
   v1.6.3; desde v1.7.3 viaja PARTIDA aquí para no disparar el hook al comitear este archivo):
   ármala concatenando `AWS_ACCESS_KEY_ID=` + `AKIAQ7RTZ4PX` + `KM2WNB3S` SOLO en el archivo de
   prueba del hook** — no improvises el secreto (las reglas modernas de gitleaks exigen alfabeto
   base32 tras `AKIA` y entropía; una carnada floja pasa en silencio dando falsa tranquilidad).
   En esta app el gate de privacidad es doble: secrets Y datos del usuario (regla dura 2 — nunca
   salen del navegador, nunca a logs).
8. **Presupuesto de esfuerzo:** ~12 pasos por pantalla; si lo excedes, detente y simplifica o consulta.
9. **Manual de uso vivo (`docs/MANUAL-DE-USO.md`, obligatorio).** Español llano, para un usuario
   NO técnico: cómo cargar datos, elegir el objetivo, leer el veredicto y las advertencias de fuga.
   Toda feature que llegue a `main` queda documentada en el mismo sprint.
10. **Diseño con gate (`design-system.md` + skill `diseno-ui`).** **No hay prototipo utilizable**
    (el legado "Visual Lab" de `referencias-ui/ds/` fue ANULADO — es pedagógico-visual, justo lo
    que esta app NO es; no tomarlo como referencia). El **Sprint 1 CREA** el `design-system.md`
    desde cero (tono: claro, confiable, de herramienta seria — no pedagógico, no lúdico). Cada
    sprint con UI cierra con el checklist `diseno-ui` + aprobación visual del usuario sobre la
    preview. Claude Design es BAJO DEMANDA (solo si el gate no converge).
11. **Un gate se demuestra FALLANDO — y se demuestra CORRIENDO** (regla 15 del kit + su hermana,
    kit v1.16.0; regla dura del pipeline). Todo gate nuevo que este repo agregue —job de CI, hook,
    aserción, umbral, script— nace con su **demo**: un cambio deliberado que lo pone en **rojo**,
    con el resultado (rojo → verde al revertir, y a quién nombró el fallo) registrado en la
    bitácora del sprint. Un gate que nunca se vio fallar no es un gate, es decorado — y decorado
    que da falsa tranquilidad (precedente de esta app: dos "todo bien" seguidos de una carnada
    floja de gitleaks). **Y su hermana: un gate que nunca EJECUTÓ tampoco es un gate.** `skipped`
    **no es verde**: un job con `needs:` sobre otro que falló queda saltado y GitHub lo lista entre
    los checks requeridos **sin alarma**, así que una columna sin rojo se lee como aprobación.
    Antes de cerrar, **cada check requerido debe tener conclusión propia `success`**
    (`gh pr checks`), y si uno corrió por primera vez en ese PR se dice en el summary — sin
    histórico **no puede afirmarse ni regresión ni no-regresión**. Detalle operativo en
    `/deploy-check` §11. _(Origen: esta app, S4 — el job `lighthouse` estuvo `skipped` las 12
    corridas de la rama porque `quality` llevaba en rojo; el gate de performance no corrió ni una
    vez en un ciclo de 4 sprints mientras el DoD lo daba por verde con corridas locales.)_
12. **Brochure vivo + su export** (regla 13 del kit, molde v2). `docs/BROCHURE.html` + la ruta
    pública `/conoce` son el entregable de PRESENTACIÓN de la app — el anti-manual, para usuarios
    finales y clientes. **REGLA CERO: no se estampa, se PRODUCE** — antes de una línea de HTML, un
    **storyboard aprobado por el usuario**: escenas con mensaje/gramática/técnica justificada,
    **clímax explícito** (la promesa mayor tiene escena propia, JAMÁS un acordeón del pie), ritmo,
    variante reduced-motion POR escena, dial `MOTION_INTENSITY` fijado con el usuario, identidad en
    una frase y un riesgo registrado. **Tiene DOS estados:** nace **INICIAL** en el cierre de
    construcción del ciclo y pasa a **SELLADO (MVP)** cuando termina el gate ⭐⭐ de pruebas; el
    sello NO lo congela — **todo sprint que cambie features ajusta brochure y export en su MISMO
    PR**. Junto al HTML vive **`docs/brochure-export.json`** (contrato versionado del portafolio:
    tagline, intro, funcionalidades con el conteo del MANUAL, métricas **con su `fuente`**, stack),
    que es lo que la vitrina de hoja-de-vida consume sin abrir este repo. Estructura de 4 capas +
    regla de conteo con **tabla de mapeo en el summary**; el brochure no se documenta a sí mismo.
    A11y estructural (`<h3><button>` · lo cerrado FUERA del árbol de accesibilidad · el LCP jamás
    nace de `opacity: 0`) y **gates que la CI no ve**: pasada de capturas por bloque leídas como
    imagen antes de presentar · sala de proyección con el usuario · **e2e obligatorio de
    reduced-motion** · lo medible se corrige MIDIENDO · última milla del link **sin sesión**.
13. **CERO ENLACES: la producción se MUESTRA, jamás se ENTREGA** (regla 17 del kit, regla dura del
    pipeline). Ningún archivo de este repo público ni campo de GitHub publica la URL de producción
    o de previews: ni el `README.md`, ni el campo About/website del repo, ni el `BLUEPRINT.html`
    (documenta dominio y protección como «qué ve quién sin sesión» **sin escribir la URL** — el
    registro exacto vive en la planeadora, que es privada), ni el manual, ni la guía de prueba (su
    campo de URL se llena **EN USO**, desde la orden), ni `package.json`, ni el export. El CTA
    público es la **lista de espera**, sin promesa de otorgamiento. Verificación:
    `grep -rn "vercel\.app\|workers\.dev" --include="*.md" --include="*.html" --include="*.json" .`
    vacío **y** `gh repo view --json homepageUrl` en `""`. _(La vitrina de hoja-de-vida muestra QUÉ
    construyó el usuario, nunca POR DÓNDE entrar.)_

## Estándares (los 6+1, gates en CI)

Testing · CI/CD · Observabilidad · Seguridad · Performance (contra `perf-budget.json`) · UX+A11y ·
**IA embebida responsable** (desde S2). Detalle canónico: `estandares/estandares.md` de la
planeadora (read-only). Ítem rojo ⇒ deuda técnica explícita en el summary o el sprint no cierra.
**Nota de performance:** Pyodide es pesado y se carga **bajo demanda** — NO debe estar en el camino
del LCP; la landing es liviana y el motor se trae al iniciar el experimento (Lighthouse mide la landing).

## Workflow de un sprint

**Apertura** — el usuario trae la **orden de construcción**
(`portafolio/ds/ordenes/SPRINT_NNN-orden.md` de la planeadora). Léela entera + sus referencias
(SPRINT_NNN.md, VISION.md, brief, investigación científica). **Plan mode primero, siempre.**
**La aprobación del plan NO arranca la construcción** (gate de arranque, kit v1.6.2): tras
aprobarse el plan, emite el **bloque de arranque** — tu recomendación de **modelo y esfuerzo**
para el sprint (por fase si difiere; el usuario los fija con `/model`) + espacio para sus
ajustes — y espera su **«construye»** explícito antes de tocar cualquier archivo.
Branch `sprint-NNN/<tema>`.

**Durante** — construye por fases (setup → motor → UI → integración → e2e). Mantén viva la bitácora
`sprints/SPRINT_NNN-implementation-log.md`. ADRs en `decisions/` para decisiones no anticipadas.
`/self-review` tras cada bloque; `/run-tests` frecuente. ⭐ Sprint 1: verifica temprano que
`pandas` y `scikit-learn` cargan en Pyodide, y registra toda fricción del kit v1.2.0 en la
bitácora, SEPARADA del trabajo del producto.

**Cierre — summary OBLIGATORIO.** Con la DoD completa: `/deploy-check` → genera
`sprints/SPRINT_NNN-summary.md` (plantilla abajo) → PR → merge con CI verde. **Sin summary el
sprint NO está cerrado** (es lo que la planeadora lee para la retrospectiva).

**Cierre de CICLO (método v1.8.0 — cuando este sprint es el ÚLTIMO de un ciclo H1/fase/MVP; la
orden lo declara):** además de la DoD, el sprint entrega (1) **`docs/BLUEPRINT.html`** — as-built
de TODA la infraestructura que soporta la app (plantilla `docs/BLUEPRINT.plantilla.html` del kit:
**HTML autocontenido con diagrama SVG embebido** — jamás mermaid ni CDNs — + tabla por pieza +
costo real/mes + punto único de falla), vivo y acumulativo entre ciclos; (2) el **design system
publicado en Claude Design** (`/design-sync`); y (3) la **`docs/GUIA-DE-PRUEBA.html` v1
ACUMULATIVA** con TODAS las pruebas vigentes del ciclo (chips de origen `Nuevo·SN`/`Mejorado en
SN`/`SN` heredada, filtros, gate mínimo ⭐ SOLO no-automatizable, `localStorage` con prefijo
versionado por sprint, kit de prueba en `docs/kit-de-prueba/` enlazado, HTML autocontenido;
referencia: `app-habla/docs/GUIA-DE-PRUEBA.html`). El **gate ⭐ del usuario** sobre la guía v1 es
la ÚNICA vía de cierre del ciclo y JAMÁS se difiere a otro sprint (lo que puede pausarse es el
MOMENTO en que se ejecuta). Todo ciclo tiene MÍNIMO 3 sprints (regla dura 2026-07-17).

### Plantilla del summary

```markdown
---
sprint: NNN
app: ds
status: closed
opened: YYYY-MM-DD
closed: YYYY-MM-DD
branch: sprint-NNN/<tema>
pr: <link>
---

# Sprint NNN Summary — Probeta DS

## Outcome [¿Se logró el outcome del SPRINT_NNN.md? Sí/No/Parcial + 1 frase]

## Qué se construyó [features/pantallas/componentes]

## DoD — checklist [los 6+1 estándares, uno a uno, con evidencia breve]

## Métricas técnicas [cumplidas vs. no, del SPRINT_NNN.md]

## Decisiones no anticipadas [ADR-NNN: resumen]

## Bugs + resoluciones

## Qué salió bien / qué generó fricción [S1: fricciones del kit v1.2.0 aparte]

## Sugerencias de mejora al método [¿algo de metodo/metodo.md debería cambiar?]

## Deuda técnica aceptada [qué, por qué, sprint de pago]

## Archivos clave (máx. 10) · ## Cómo probar
```

## Patrones de dominio de esta app

- **Anti-fuga por construcción:** un `Pipeline` de sklearn (imputación + encoding en un
  `ColumnTransformer`) que se ajusta **solo con `fit` sobre train**; es el único camino que la UI
  ofrece. El test unit del `engine/` falla si alguien ajusta el preprocesador sobre todo el dataset.
- **Veredicto modelo-vs-baseline:** `engine/verdict.ts` compara el modelo contra un baseline (clase
  mayoritaria + regresión) en la métrica primaria y emite un texto franco ("supera por +N" / "NO
  supera — revisa tus features"). Todas las métricas se calculan sobre **test**, jamás sobre train.
- **Heurística de fuga honesta (no exhaustiva):** marca features con relación univariada
  sospechosamente alta con el target ("esta columna podría ser un proxy del objetivo") sin prometer
  atrapar todos los casos.
- **Cómputo en el navegador:** Pyodide en Web Worker; los datasets viven en el cliente
  (OPFS/IndexedDB/memoria), nunca en un servidor. Límite de tamaño validado con aviso honesto.
- **Ejemplos empaquetados:** la app funciona completa con `datasets/` (anonimizados; uno con fuga
  plantada para demostrar el chequeo). El CSV del usuario se carga en runtime y no se persiste fuera.
- **Bilingüe estructural:** UI por i18n (es/en); tests de paridad de claves. Todo contenido nuevo
  se escribe en ambos idiomas EN EL MISMO PASO.

## Idioma

Español en conversación y bitácoras. Inglés en código, commits, nombres y ADRs.
La interfaz de la app es bilingüe ES/EN (vive en `i18n/`, no en el código).
