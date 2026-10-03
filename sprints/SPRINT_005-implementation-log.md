# Sprint 005 — Bitácora de implementación («La liga honesta» · ciclo H2, sprint 1 de 3)

Branch: `sprint-005/liga-honesta` · Orden: `portafolio/ds/ordenes/SPRINT_005-orden.md` · Plan:
`portafolio/ds/sprints/SPRINT_005.md` · Plan de ejecución aprobado por el usuario el 2026-10-02
(plan mode) · «construye» recibido el 2026-10-02 con Opus 5.5 (esfuerzo alto en F1/F2/cierre).

La app pasa de 4 modelos elegidos por argmax sobre TEST a **la liga completa de clasificación**
(12 modelos + 2 variantes balanceadas) elegida por **validación cruzada dentro de train**, con tres
encarriladores deterministas (tarea · modelos por nivel · fichas) y la honestidad que **acompaña y
etiqueta; no bloquea ni esconde**. Cero IA nueva.

## Decisiones del usuario en la planificación (2026-10-02)

| #   | Pregunta                                                                      | Respuesta del usuario                                                                                                           |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| U1  | Con elección manual, ¿de quién habla el veredicto principal?                  | **Del elegido, etiquetado** («◆ Elegido por ti, no por la validación cruzada…»); el ganador de la CV sigue marcado en la tabla. |
| U2  | El brochure dice «Dos modelos compiten… No eliges tú», que el S5 vuelve falso | **Corregir solo lo falso** en el mismo PR (sin escenas nuevas, conteo 33).                                                      |
| U3  | ¿«Fuera» (E2) es definitivo?                                                  | **Forzable en el Nivel 2** («incluir de todos modos», con costo y etiqueta).                                                    |

## Desviación del plan

Registradas al aprobar el plan (2026-10-02); la planeadora las lee aquí (no se escribe en ella):

- **D1 — Brochure.** La orden dice «Qué NO tocar: el brochure y su export». Al mergear el S5, la
  tarjeta «Dos modelos compiten y se dice cuál ganó… No eliges tú: habla el resultado»
  (`docs/BROCHURE.html:805`, `docs/brochure-export.json:92-93,377`) queda FALSA en la ruta pública
  `/conoce`. Por la regla «Brochure vivo + su export» (todo sprint que cambie features ajusta
  brochure y export en su MISMO PR) y la regla dura «Honestidad por diseño», se corrigen **solo las
  frases que el S5 vuelve falsas**; sin escenas nuevas, el conteo sigue en 33. El re-armado completo
  queda para el cierre del ciclo H2 (decisión U2 del usuario).
- **D2 — «Fuera» forzable en el Nivel 2** (decisión U3). Amplía las pantallas 2 y 4 del plan.
- **D3 — E2 reparte niveles por costo contra el techo**, no por umbrales fijos de filas
  (`FOREST_LEVEL2_FROM_ROWS` del plan): entra al Nivel 1 todo lo que cabe en el techo que fija el
  usuario, en orden de prioridad. Las constantes siguen exportadas y probadas.
- **D4 — Roster = 12 modelos + 2 variantes `class_weight='balanced'`** (logística y bosque; cierra
  A4) = 14 filas en la liga; 12 fichas + 2 de baselines (las balanceadas comparten ficha).
- **D5 — El Nivel 2 re-corre la unión** (Nivel 1 ∪ Nivel 2): una sola forma de resultado en el
  contrato; la estimación incluye ese costo.
- **D6 — `docs/kit-de-prueba/liga-mediana.csv`** (~5.000 filas, determinista): los datasets del kit
  (200 filas) caben enteros en el Nivel 1, así que sin él no hay Nivel 2 que probar ni cancelar.
- **D7 — Delta «comandos»:** se re-estampan `deploy-check.md`, `plan-sprint.md`, `run-tests.md` y
  `design-sync.md` desde el kit v1.33.0 (además de estampar `audita-sprint.md`).

## Fase 0 — delta del kit + constitución + spike en el navegador

### Delta del kit v1.16.0 → v1.33.0 (por nombre)

Cada gate nace en rojo en su MISMO commit (regla 11 — «rojo en el mismo commit», kit v1.25.0).

**K1 · `/audita-sprint` + comandos re-estampados (v1.8→v1.31)** — commit `8c514d0`. Comandos, no
gates: sin demo. `run-tests.md` lleva además el paso propio `pnpm test:integration` (el job
`integration` de esta app; el kit no lo trae).

**K2 · Hooks gitleaks B-8 (v1.32.1)** — `.claude/settings.json` (PreToolUse escanea
`tool_input.content`/`new_string` con `jq` + `gitleaks detect --pipe`) y `githooks/pre-commit`
(falla CERRADO; solo `KIT_SIN_GITLEAKS=1` pasa, a sabiendas). Gate permanente en
`tests/integration/gitleaks-hook.test.ts` (5 pruebas nuevas, comando REAL leído del settings).

- 🔴 **Rojo (2026-10-02):** con los hooks de `main` restaurados → **4 fallan**: «BLOQUEA (exit 2)
  un Write…», «…un Edit…», «BLOQUEA el commit (exit 1) si gitleaks no está instalado», «solo
  KIT_SIN_GITLEAKS=1…» (el hook viejo avisaba y dejaba pasar con exit 0).
- 🟢 **Verde:** con los nuevos → 7/7.
- **Modo real (tercer filo):** un `Write` de la carnada canónica armada al scratchpad (FUERA del
  repo) fue **bloqueado por el hook en vivo** («SECRET DETECTADO en el contenido a escribir») y el
  archivo no llegó a existir; `env PATH=/usr/bin:/bin sh githooks/pre-commit` → «commit BLOQUEADO»,
  exit 1.

**K3 · Sentry `beforeSend` sin el mensaje de la excepción (v1.33.0)** — pesa doble aquí: un
traceback de pandas/sklearn cita el valor de celda que no pudo convertir (regla dura 2). La
limpieza pasa a una función pura compartida, `src/lib/sentry-scrub.ts`, usada por
`instrumentation-client.ts` y `sentry.server.config.ts` (antes: dos copias a mano que ya
divergían — `xhr` en una, `http` en la otra). Gate: `tests/unit/sentry-scrub.test.ts`.

- 🔴 **Rojo (2026-10-02):** sin la línea `v.value = v.type` → **1 falla**: «reemplaza el mensaje de
  la excepción por su tipo (nunca el valor de celda)».
- 🟢 **Verde:** restaurada → 3/3.
- De paso: `tests/integration/gitleaks-hook.test.ts` no pasaba `pnpm typecheck` (el `env` mínimo no
  cumple `ProcessEnv` de los tipos de Next) — cazado por el typecheck antes del push; cast comentado.

### Constitución

2026-10-02 — `CLAUDE.md`: el párrafo del diferenciador y la regla dura 3 «Honestidad por diseño»
reemplazados por el **texto aprobado literal** (F0 #13). La frase centinela «la honestidad acompaña
y etiqueta; no bloquea ni esconde» queda en UNA sola línea (`CLAUDE.md:25`) para que el `grep` de la
planeadora la encuentre — la primera versión la partía en dos líneas y el grep daba vacío (cazado
al verificar, antes de commitear). Además: reglas 10 (gate de mirada, dos clases, matriz de una
fila), 11 (rojo en el mismo commit, ¿puede fallar?, modo, `gh pr checks` tras cada push, `manual`),
13 (barrido `git grep` total + homepage = el repo), nuevas 14 (PRs de dependencias — regla 18 del
kit) y 15 (gate de contrato entre lenguajes — regla 19 del kit), patrones de dominio (liga +
encarriladores + contenido `{es,en}` — regla 20 del kit), workflow con gates de fase,
`/audita-sprint` y summary EN el PR, y plantilla del summary con «Auditoría» y la sección fija
«Gate ⭐ — diferimiento y contrapesos».

## Fricciones del kit (SEPARADAS del producto)

- **K-S5-1 — `audita-sprint.md` tiene dos casillas numeradas «6»** (líneas 73 y 93 del kit): en la
  práctica son 7 casillas. Se estampa tal cual; se audita con ambas.
- **K-S5-2 — `.claude/commands/README.md` del kit no lista `/audita-sprint` ni `/design-sync`.**
- **K-S5-3 — La cabecera de `dependabot.yml` del kit dice «kit v1.26.0»** aunque ya trae v1.32.1.
- **K-S5-4 — `verificar-dependencias.mjs` sale VERDE si la rama base es ilegible** («se omite»):
  la misma ilusión que «un gate saltado se ve igual que uno verde» (señalado por la auditoría de
  planlang, AU-S2-B37). Se estampa tal cual y se anota.
- **K-S5-5 — Huecos ANTERIORES a v1.16 en esta app**, fuera del delta pedido y por eso no
  adoptados: sin `packageManager` en `package.json` (v1.10.2), sin `lighthouse-categorias.json`
  (v1.12.0), sin las reglas 12 (no entregar por artifacts) y 14 (código primero) del kit en el
  `CLAUDE.md`. Se reportan para que la planeadora decida.
- **K-S5-6 — «Una carnada por campo» no está en el wiki**: `gate-de-contrato-entre-lenguajes.md`
  prescribe fixture del emisor + tipo del lector + un test de punta a punta, pero no carnadas. La
  mecánica «detectó k de n» se toma de `reusables/diagramador/CONTRATO.md`.
