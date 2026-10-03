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

Registradas en el STOP de la Fase 0 (aprobadas por el usuario el 2026-10-02):

- **D8 — Selección por la regla de un error estándar, no por el máximo de la CV.** El plan decía
  «argmax de la media entre los que concluyeron». El spike midió que, con 150 filas de train, el
  máximo entre 14 premia la suerte (rotación y clientes-sucio pasaban de «supera» a «NO supera»). La
  regla de libro (ESL §7.10) elige, entre los que quedan a menos de un error estándar del mejor, el
  primero del orden de prioridad que TS envía (del más simple/barato al más caro). Nunca eligió peor
  que el máximo en los 8 datasets medidos.
- **D9 — Reglas «fuera» solo con respaldo medido.** El plan traía `KNN_MAX_ROWS`, `KNN_MAX_COLS` y
  `NB_MAX_CAT_SHARE`; el spike midió que KNN cuesta 1,5 s de CV con 20.000 filas y que NB con
  categóricas GANA en rotación. Quedan solo `MLP_MIN_ROWS = 500` y `BALANCED_MIN_MINORITY = 0.40`.
  Cambia la aceptación 4 de la orden («KNN fuera con 20.000 filas» → «MLP fuera con 100 filas;
  balanceada fuera con clases equilibradas; KNN y NB compiten con su advertencia en la ficha»). Con
  el reparto por costo (D3), un KNN caro en el equipo del usuario igual cae al Nivel 2 por costo.

Registradas durante la Fase 1 (se reportan en el STOP de la F1):

- **D10 — `chosen_by_user` no viaja desde Python.** El plan lo listaba en el contrato Python → TS.
  Quién eligió el modelo es estado de la app, no del cómputo: vive en TS (`Selection.by`: `cv` |
  `user`) y llega al manifiesto como `selection.by`. Python solo dice qué miembro ajustó
  (`model_name`); TS coteja que sea el pedido. Una fuente de verdad en vez de dos.
- **D11 — Tres estados por fila, no dos.** El plan decía `no-concluyo` para excepción y para falta
  de convergencia. Quedan `ok` · `no-converge` (puntaje de CV visible y etiquetado; se puede elegir
  a mano, pero no gana solo) · `error` (sin puntaje, solo el TIPO de la excepción). Es la regla dura
  3 aplicada: un puntaje que existe no se esconde, se etiqueta.
- **D12 — Ridge y el SVM lineal no inventan probabilidades.** Deciden la clase sin dar una
  probabilidad: la puntuación devuelve `probabilities: null`, el CSV puntuado omite esa columna y
  la pantalla lo dice («este modelo decide la clase pero no da una probabilidad»). Alternativas
  descartadas: una sigmoide sobre la función de decisión (sería una probabilidad falsa) y
  `CalibratedClassifierCV` (cambia el modelo y el costo que midió la F0). El AUC sí se calcula, con
  la función de decisión (el AUC solo necesita ordenar).
- **D13 — El progreso tiene dos fases** (`detail.phase`: `cv` | `test`, además de
  member/index/total): primero la CV de todos, después el test. La UI puede mostrar que el test se
  abre recién al final.
- **D14 — Los baselines se evalúan DESPUÉS de la selección** (en H1 iban primero). Así ningún
  ajuste sobre train completo ni ninguna mirada al test ocurre antes de elegir; el test anti-fuga
  de la CV lo verifica con un espía.
- **D15 — TS recalcula la selección.** Además de validar la forma, `contract.ts` recalcula la regla
  de un error estándar sobre la liga recibida y rechaza el resultado si Python eligió otra cosa
  (`winner`, `cv.best`, `cv.se`). Es un cruce entre lenguajes, no una segunda regla: Python elige y
  TS comprueba.

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

**K4 · Regla 18 mecánica: `pnpm peers check` + `scripts/verificar-dependencias.mjs` (v1.24/v1.32)**
— pasos nuevos en `quality` (el segundo solo en `pull_request`, tras `git fetch origin main`).
**Adaptación propia (fricción K-S5-4):** en CI (`process.env.CI`) una base ilegible es ROJO, no
«se omite» — el paso hace el fetch, así que una base ilegible significa que el gate no comparó nada.

- 🟢 Verde: «681 paquetes, ninguno por debajo de origin/main» · «No peer dependency issues found».
- 🔴 **Rojo verificar-dependencias (2026-10-02):** ref temporal `refs/demo/regla-18` con el lockfile
  de `main` y `react@99.0.0` → «react: 99.0.0 (refs/demo/regla-18) → 19.2.4 (este árbol)», exit 1;
  ref borrada.
- 🔴 **Rojo base ilegible:** `CI=1 … refs/no-existe` → «el gate NO comparó nada», exit 1 (en local
  sin `CI`: «se omite», exit 0 — comportamiento del kit conservado fuera de CI).
- 🔴 **Rojo peers check:** `pnpm add -D react-test-renderer@17.0.2` (peer `react@17` frente a
  19.2.4) → «✕ unmet peer react», exit 1; revertido (`package.json` + lockfile restaurados, verde).

**K5 · `.github/dependabot.yml` + `tests/unit/dependabot-config.test.ts` + devDep `yaml`
(v1.23→v1.32.1)** — estampados del kit.

- 🔴 **Rojo:** `open-pull-requests-limit: 5` en npm → «npm: expected 5 to be 1», 1 falla; 🟢 3/3.
- ⚠️ **Demo que no demostraba (cazada por la propia regla):** el primer intento usó `sed
'0,/…/s//…/'`, que el `sed` BSD de macOS no soporta: el archivo no cambió y el test siguió
  verde. Un «rojo» sin verificar que el cambio se aplicó habría certificado un gate sin verlo
  fallar. Se repitió editando con Python y comprobando el archivo antes de correr el test.

**K6 · e2e falla con cero pruebas (v1.28.0) + evidencia al fallar (v1.26.0) + Lighthouse con
mediana de 3 (v1.26.0)** — `test:e2e` = `playwright test` (sin `--pass-with-no-tests`);
`upload-artifact` de `test-results/` con `if: failure()`; Lighthouse pasa de `lhci autorun` (1
corrida) a `collect --numberOfRuns=3` + `assert --aggregationMethod=median-run`; `.gitignore`
suma `.lh-*.json`.

- 🔴 **Rojo e2e:** `--grep "zzz-no-casa-con-nada"` → antes (con `--pass-with-no-tests`) exit 0;
  ahora «Error: No tests found», exit 1.
- 🟢/🔴 **Lighthouse en local, build de producción (`pnpm build && lhci collect` ×3):** budget real
  → exit 0 (LCP mediano **2.613 ms** frente a 3.500); budget con LCP 500 ms (copia temporal fuera del
  repo) → «largest-contentful-paint failure… expected ≤500 found 2612.68», exit 1.
- Que el job `lighthouse` y el `e2e` corran de verdad en la CI se verifica con `gh pr checks` tras
  el primer push (regla 11 — hermana).

### Runtime: xgboost + lightgbm, y el gate de peso que nació en rojo SOLO

**R1 · `scripts/pyodide-paquetes.mjs` (fuente única)** — `REQUIRED = [pandas, scikit-learn,
xgboost, lightgbm]`, `CORE_FILES`, `resolveWheels`; lo leen `copy-pyodide.mjs` (self-host) y el
gate de peso. El runner (`public/pyodide-runner.js`, sin bundler) repite la lista y
`tests/unit/pyodide-paquetes.test.ts` coteja ambas (🔴 sin `lightgbm` en el runner → «el runner carga
EXACTAMENTE los paquetes que el self-host copia» falla; 🟢 3/3).

**R2 · Gate nuevo `scripts/verificar-peso-pyodide.mjs` + `pyodide-budget.json`** (paso en `quality`
tras el build). Mide lo que el navegador DESCARGA (núcleo `pyodide.asm.mjs/.wasm`,
`python_stdlib.zip`, `pyodide.mjs`, `pyodide-lock.json` + el cierre de wheels), no el directorio
entero (que trae `.d.ts`, mapas y consolas que nadie pide). **Línea base medida: 40.033.012 bytes
(38,18 MiB)** con pandas + scikit-learn (9 wheels) — no los «39 MB» del spike, que contaban el
directorio. Tope: + 2 MiB (DoD).

- 🔴 **ROJO NATURAL en su primera corrida (2026-10-02):** con la carga estándar (`loadPackage` con
  el cierre del lock) el crecimiento fue **2,24 MiB > 2,00** → exit 1. Desglose: xgboost 704.277 +
  lightgbm 760.436 + **setuptools 756.856** + pyparsing 122.781 bytes. La estimación del plan
  («xgboost 0,7 + lightgbm 0,76 + pyparsing + setuptools ≤ 2 MB») no midió setuptools. **Sin el
  gate, la DoD se habría dado por cumplida a ojo.**
- **Diagnóstico:** setuptools (→ pyparsing) llega solo porque el lock de Pyodide 314.0.2 lo declara
  como dependencia de xgboost. `grep` sobre el wheel de xgboost: **cero** referencias a
  `setuptools`, `pkg_resources`, `distutils` o `pyparsing`; su `METADATA` solo exige numpy y scipy.
- **Verificación en el runtime real (Node + Pyodide 314.0.2, wheels de `public/pyodide/`):**
  `loadPackage([pandas, scikit-learn, lightgbm])` + `loadPackage(<url del wheel de xgboost>)` →
  paquetes cargados sin setuptools ni pyparsing; `XGBClassifier` entrena, `pickle` de ida y vuelta
  reproduce las predicciones, y `setuptools`/`pyparsing` **no están en `sys.modules`**.
- **Decisión:** xgboost se carga por la URL de su wheel, sin su cierre declarado
  (`LOAD_WITHOUT_DEPS`). Crecimiento final **1,40 MiB** (39,58 MiB total) → 🟢. Ahorra 0,84 MiB a
  cada usuario. Un test unit avisa si el lock deja de declarar setuptools (para retirar la
  excepción) y el test de integración del runtime (F1) carga xgboost igual que el navegador.
- 🔴 **Rojos deliberados:** tope de 1 MiB (copia temporal del budget) → exit 1; una wheel faltante
  (`lightgbm` renombrada) → «faltan 1 archivo(s)», exit 1 (una wheel faltante es rojo, no «se
  omite»: el navegador fallaría); restaurado → exit 0.

**K7 · Regla 17 «cero enlaces» (v1.23 / v1.26 / v1.32.1)** — regla 13 de la app reescrita (barrido
`git grep` sobre TODOS los archivos versionados, después del último `git add`; homepage = el repo).

- **Homepage (2026-10-02):** `gh repo view` daba `homepageUrl: ""` (la regla vieja de la app lo pedía
  vacío, justo lo que la GitHub App de Vercel reescribe). `gh repo edit --homepage <url del repo>` →
  verificado: apunta al propio repo.
- **README verificado:** sin URL de producción ni de previews (es aún la plantilla de
  `create-next-app`: enlaza a la documentación de Next.js, no a la app). Que siga siendo plantilla se
  anota como hueco anterior al delta (K-S5-5), no se reescribe en este sprint.
- 🟢 Barrido `git grep -nE "vercel[.]app|workers[.]dev|pages[.]dev" -- ':!pnpm-lock.yaml'` → vacío.
- 🔴 **Rojo:** carnada temporal en el COMENTARIO de un spec e2e (`tests/e2e/zz-carnada-enlaces.spec.ts`,
  en stage) → el barrido la encontró (exit 0 = hallazgo); retirada → vacío.

**Declarados «no aplica»** (orden § Delta del kit): matriz de envejecimiento (regla 23 — la app no
tiene datos con fecha de cambio de estado) · 7-S (regla 21) · perfiles escritorio / estático /
python, `/release-check`, `verify-ephemeral` · controladores de maqueta (regla 22: la app es
anterior a v1.14 y no tiene maqueta; el test pasaría vacío, que no es un gate) · ADR código-primero e
`ia-embebida` §9 (cero IA nueva) · banco del brochure y ⭐⭐ corto (cierre H2, S7) · LCP 3,0 s por
ADR (aquí el budget es 3.500 ms, documentado en `ci.yml` desde el S4 — mediana local medida hoy:
2.613 ms) · `/deploy-check` §12 (disco en runtime): aplica poco — todo derivado (`.probeta.json`,
CSV puntuado, model card) nace en el navegador como descarga del usuario; se declara su inventario
en el `/deploy-check` del cierre.

### Primer push (PR #13) — `quality` rojo por el calendario, no por el diff

2026-10-02 — `gh pr checks 13` tras el primer push: **`quality` fail** y `e2e` / `integration` /
`lighthouse` **`skipping`** (saltados no son verdes — regla 11, hermana). El único paso rojo fue
`pnpm audit --audit-level high`: 29 avisos (13 altos, 3 críticos) publicados DESPUÉS del merge del
S4, ninguno introducido por este diff (el «corolario del calendario» del patrón
`un-gate-saltado-se-ve-igual-que-uno-verde`). Pagado con la receta de menor a mayor intrusión:

1. **Parche directo que pide el aviso crítico:** `next` y `eslint-config-next` 16.2.11 → **16.3.8**
   (el aviso exige ≥16.3.6; misma major).
2. **`pnpm update`** dentro de los rangos declarados → de 29 avisos a 6 (resolvió undici, sharp,
   js-yaml y brace-expansion transitivos).
3. **Override existente reajustado, ninguno nuevo:** `fast-uri@<3.1.4: ^3.1.4` (S4) → `fast-uri@<3.1.8:
^3.1.8` en `pnpm-workspace.yaml` (los 5 altos + 1 moderado restantes eran fast-uri 3.1.5).

Resultado local: `pnpm audit` → «No known vulnerabilities found» · `pnpm peers check` limpio ·
`verificar-dependencias` → 675 paquetes, ninguno por debajo de `origin/main` · typecheck + lint +
unit (248/248) verdes con next 16.3.8. El build, la integración, el e2e y Lighthouse con la nueva
minor de Next los valida la CI de este push (`gh pr checks` a continuación).

`gh pr checks 13` tras el segundo push (`f11171f`): **`quality` pass (1m15s) · `integration` pass
(1m3s) · `e2e` pass (3m40s) · `lighthouse` pass (1m42s)** — cada uno con conclusión PROPIA, ninguno
saltado. **Primeras corridas en CI** (sin histórico: no se afirma regresión ni no-regresión):
`pnpm peers check`, `verificar-dependencias` (regla 18), `verificar-peso-pyodide`, Lighthouse con
mediana de 3, e2e sin `--pass-with-no-tests` y con `upload-artifact`.

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

### Tercer push (`8ba4d9a`) — `quality` rojo otra vez por el calendario: un aviso SIN parche

`gh pr checks 13`: **`quality` fail** · `e2e` / `integration` / `lighthouse` **skipping**. Único paso
rojo: `pnpm audit`. Aviso nuevo en la base de la auditoría entre el push anterior (verde) y este:
**GHSA-vfj7-8cjw-p6xm / CVE-2026-93687** — `braces` ≤3.0.3, DoS por desbordamiento de pila con
patrones de llaves anidados. **No hay versión parcheada** (`first_patched_version: null`; la última
en npm es 3.0.3), así que la receta del wiki (parche → `pnpm update` → override) no tiene a dónde ir:
`pnpm update braces` no cambia nada.

- **Alcance verificado:** solo la cadena de DESARROLLO `eslint-config-next → @next/eslint-plugin-next
→ fast-glob → micromatch → braces` (corre en el lint, sobre los globs fijos del repo, jamás con
  entrada del usuario). `pnpm audit --prod` → «No known vulnerabilities found»: no llega al bundle.
- **Decisión (reversible, para veto del usuario en el STOP):** `auditConfig.ignoreGhsas` con ESE
  único GHSA en `pnpm-workspace.yaml`, comentado con su razón y su condición de retiro (en cuanto se
  publique `braces` ≥3.0.4). Se descartó `--ignore-unfixable` (taparía en silencio cualquier aviso
  futuro sin parche) y `--prod` en CI (dejaría sin auditar todo el árbol de desarrollo).
- 🔴 **El gate sigue vivo para todo lo demás:** con `lodash@4.17.20` agregado temporalmente →
  «Command Injection in lodash», exit 1; restaurado → exit 0. (Un primer intento de demo —quitar el
  override de fast-uri— NO demostró nada: el lockfile ya tenía 3.1.8 resuelto y el aviso no volvió;
  se descartó y se repitió con un paquete vulnerable real.)
- Deuda explícita para el summary: aviso aceptado con nombre, sin parche publicado; revisar en cada
  sprint hasta que exista `braces` ≥3.0.4.

### Spike del roster EN EL NAVEGADOR — informe completo en `sprints/SPRINT_005-spike-costos.md`

Arnés en `scripts/spike-liga/` (evidencia, no se despliega): payloads por el `prepareRun` REAL →
Playwright sobre el build de producción → module worker que carga `/pyodide/` como el runner y corre
el `pipeline.py` real. Chromium 151 (referencia) + WebKit 26.6. 8 datasets: los 4 del kit (200
filas) + sintéticos con categóricas y nulos (2.000 · ancho 2.000 · 5.000 · 20.000).

**Incidentes del arnés (registrados, no del producto):**

1. **Cuelgue silencioso de 10 min (primer intento).** La app sirve CSP `worker-src 'self'`, que
   bloquea (bien) los workers desde Blob; el arnés no escuchaba `onerror` ni tenía timeout, así que
   esperó para siempre sin imprimir nada. Diagnóstico con un script mínimo («violates the following
   Content Security Policy directive: worker-src 'self'»). Arreglo SIN tocar la CSP del producto:
   Playwright intercepta una página y un worker del mismo origen; todo mensaje con timeout y todo
   error reportado. Lección: un arnés que puede colgarse en silencio es un gate que no ejecutó.
2. **Doble corrida de las variantes del MLP.** El primer intento falló (el paso de explicabilidad
   buscaba al ganador en el roster equivocado) pero su proceso siguió vivo con los datasets restantes
   y el `spike.py` viejo en memoria, compitiendo por CPU con el relanzamiento y escribiendo en el
   mismo log. Detectado por un `KeyError` imposible para el código nuevo; ambos procesos detenidos y
   relanzados en UNA cadena secuencial. Al revisar la línea de tiempo apareció otra posible
   contaminación (la suite unit corrió en paralelo con dos puntos de Chromium): **se repitieron solos
   y la sospecha no se confirmó** (+5–7 %, variación natural, puntajes idénticos).

**Resultados que cambian el plan** (detalle y tablas en el informe):

- La liga completa (14) tarda **3,4–4,5 s** con los datasets del kit (Chromium) → cabe en el techo
  propuesto de ~5 s. 20.000 filas: 140–170 s (k=5); heap 557 MB.
- **KNN no es caro** (1,5 s de CV con 20.000 filas) y **NB con categóricas gana en rotación** → las
  reglas «fuera» del plan para ellos no tienen respaldo medido (propuesta F0-3 / desviación D9).
- **MLP (`max_iter=300`) no converge en ningún dataset**; con `early_stopping` converge, cuesta ~8×
  menos y es el mejor en 20.000 filas (propuesta F0-4).
- ⚠ **El máximo de la CV elige mal con muestras chicas** (rotación y clientes-sucio pasan de
  «supera» a «NO supera»); la **regla de un error estándar** lo corrige y nunca empeora en la muestra
  (propuesta F0-2 / desviación D8).
- Chromium y WebKit dan **puntajes idénticos** (determinismo entre motores); los tiempos varían
  ~±40 % → calibración del Nivel 2 con el Nivel 1 del propio equipo.

**CI del cierre de la F0:** `03b1c17` — `quality`, `integration`, `e2e` y `lighthouse` con
conclusión propia `success` (primera corrida en CI de: peers check, regla 18, gate de peso de
Pyodide, Lighthouse mediana de 3 y e2e sin `--pass-with-no-tests`).

**STOP de la Fase 0 — decisiones del usuario (2026-10-02, «De acuerdo con tus recomendaciones
continúa»):**

| #    | Decisión                     | Fijado                                                                                                                                 |
| ---- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| F0-1 | Techo del Nivel 1            | **5 s** (`LEVEL1_CEILING_S = 5`): la liga completa cabe en los 4 datasets del kit; con 20.000 filas entran 7 y el resto va al Nivel 2. |
| F0-2 | Regla de selección           | **Un error estándar** (ESL §7.10): entre los que quedan a < 1 EE del mejor, el primero del orden de prioridad (D8).                    |
| F0-3 | Reglas «fuera»               | Solo las medidas: **MLP con < 500 filas** y **balanceadas con minoritaria ≥ 0,40**. KNN y NB compiten siempre, con advertencia (D9).   |
| F0-4 | MLP                          | `early_stopping=True`, `max_iter=500`, `n_iter_no_change=10`.                                                                          |
| F0-5 | Test de los perdedores       | **Eager**: en la misma corrida (13–20 % de la CV).                                                                                     |
| F0-6 | k de la CV                   | Como el plan: **5** hasta 20.000 filas, **3** por encima; acotado a la minoritaria de train (mínimo 2).                                |
| 7    | Aviso de `braces` sin parche | **Se mantiene** aceptado por nombre (`auditConfig.ignoreGhsas`), solo desarrollo, deuda explícita en el summary.                       |

## Fase 1 — motor (Python + contrato)

«continúa» recibido el 2026-10-02 con las decisiones F0-1…F0-6 y la 7 (ver STOP de la F0).

### Qué se construyó

- **`src/lib/ds/pipeline.py`:**
  - `_FACTORIES`: los 14 del roster, con hiperparámetros fijos, semilla y `n_jobs=1`. Los boosters
    se importan en su fábrica y el MLP lleva parada temprana (F0-4).
  - `_validate_payload` es el lector TS → Python y lanza `contract:<campo>`.
  - `run_experiment(payload, on_progress)`: CV dentro de train con el preprocesador DENTRO del
    Pipeline validado → `select_one_se` → recién entonces baselines y test de todos (eager, F0-5).
    Solo el ganador queda en `_MODEL`.
  - `fit_member` (U1), `roster_ids` (paridad) y `_runtime_versions` con xgboost y lightgbm.
  - La puntuación devuelve `null` para los que no dan probabilidad (D12).
  - Se silencia un solo aviso benigno de LightGBM que llenaba la consola.
- **Motores TS puros en `src/engine/`:**
  - `roster.ts`: `MEMBER_IDS` en orden de prioridad, `MEMBERS` y `selectOneSe`, espejo de Python.
  - `tarea.ts` (E1): binaria · multiclase · numérica · sin objetivo · ambigua, con su razón.
  - `costos.ts`: coeficientes de la F0 + `calibrationFactor`.
  - `encarrilador.ts` (E2): las constantes fijadas en la F0, `routeModels` por costo contra el
    techo (D3), «fuera» solo con respaldo medido (D9), forzados al Nivel 2 (U3), `rosterFor`
    con la unión (D5) y `chooseCvK`.
- **Contrato:**
  - `src/lib/validate.ts`: validadores a mano que nombran la ruta del campo.
  - `src/workers/contract.ts`: el lector Python → TS en producción. Valida train, fit-member,
    progreso, export y score, y recalcula la selección (D15).
  - `useExperiment` valida cada resultado antes de tocar el estado. Error nuevo `contract` con
    copy ES/EN; a Sentry va solo `contract:<campo>`, sin valores.
- **App:**
  - `experiment.ts`:
    - `summarizeDataset` da la tarea de cada columna.
    - `prepareRun` manda `roster` + `cv_k`, `routing`, `profile` y `smallSample`, con el error
      honesto `too-few-rows`.
    - `estimateEncodedWidth`, `assembleResult` con `league`/`selection` y `applyMemberFit` (U1).
  - Runner: comando `fit-member` y el callback de progreso Python → JS → `postMessage`.
  - Manifiesto con `league`, `selection` y `versions.{xgboost,lightgbm}` (aditivos-opcionales).
    `model_name` ahora se valida contra el roster (R9) y hay aviso si la versión de un booster no
    coincide (R10).
  - Model card con la sección «Selección del modelo» («◆ Elegido por ti», muestra pequeña).
  - Nombres de los 14 modelos en ES/EN.
- **Interino hasta la F2:**
  - `ExperimentResult.candidates` se deriva de la liga, así la tabla H1 sigue funcionando (14
    columnas desplazables).
  - La nota de esa tabla se corrigió para que no mienta: «se eligió con validación cruzada…
    estos puntajes son del conjunto de prueba».

### Gates nuevos — cada uno visto en ROJO (2026-10-02)

| #   | Gate                                                            | Demo (cambio deliberado)                                            | Rojo → verde                                                                                                                                                        |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | Anti-fuga de la CV (espía en el preprocesador, `liga.test.ts`)  | El preprocesador se ajusta una vez sobre todo train, FUERA de la CV | «expected [ …(8) ] to have a length of 15 but got 8» → restaurado: verde                                                                                            |
| G2  | La selección no mira el test (etiquetas de test permutadas)     | El ganador se elige por la métrica de test                          | «expected 'hgb' to be 'forest'» + el cruce de punta a punta falla porque `contract.ts` rechaza el ganador (D15 visto en rojo también) → restaurado: verde           |
| G3  | Paridad del roster TS ↔ Python (texto en unit + runtime real)   | `"knn"` renombrado a `"kneighbors"` en `_FACTORIES`                 | Fallan los dos: `roster.test.ts` y la paridad en Pyodide → restaurado: verde                                                                                        |
| G4  | Forma de los fixtures del contrato (el emisor real los escribe) | Python agrega `campo_nuevo_sin_avisar` al resultado                 | «la forma de train-result cambió: regenera con CONTRATO_ACTUALIZAR=1…» → restaurado: verde                                                                          |
| G5  | Carnadas TS → Python (`_validate_payload`)                      | Las 16 carnadas SON la demo                                         | 16 de 16 rechazadas nombrando su campo; el payload real pasa                                                                                                        |
| G6  | Carnadas Python → TS (`contract.ts`) y del manifiesto           | Las carnadas SON la demo                                            | train 26/26 · fit-member 6/6 · progreso 5/5 · export 6/6 · score 5/5 · manifiesto 16/16                                                                             |
| G7  | El hook rechaza una liga que no es el roster enviado            | `use-hooks.test.tsx`: FakeWorker devuelve la liga invertida         | Error `contract` con campo `league`; el resultado no llega al estado                                                                                                |
| G8  | `fit_member` reproduce exactamente su fila de la liga           | `fit_member` con la semilla + 1                                     | ⚠ **La primera demo NO se puso roja**: KNN, LightGBM y XGBoost (por defecto) no usan azar. «¿Puede fallar?» = no. Se sumaron los bosques (bootstrap) → rojo → verde |

**Carnadas — detectó k de n:**

| Dirección                 | Lector                       | Resultado | Campos                                                                                                                                                                                                                                                |
| ------------------------- | ---------------------------- | --------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TS → Python               | `_validate_payload`          |  16 de 16 | `roster` (desconocido · vacío · repetido · ausente) · `cv_k` (1 · > minoritaria · texto · ausente) · `primary_metric` (×2) · `seed` · `target` · `train_idx` · `member` (desconocido · ausente) · `primary_metric` de fit-member                      |
| Python → TS: liga         | `validateTrainResult`        |  26 de 26 | `league` (×3) · `league[].{name,status,cv,cv.mean,cv.std,cv.folds,test,test.auc,elapsed_ms,error_type}` · `cv.{k,scoring,rule,best,se}` · `winner` · `model_name` · `model` · `elapsed_ms` · `confusion_matrix` · `preprocessing.rare_categories` · … |
| Python → TS: elección     | `validateMemberFit`          |    6 de 6 | `model_name` · `model.f1` · `elapsed_ms` · `confusion_matrix` · `explainability.method` · `preprocessing.numeric_medians`                                                                                                                             |
| worker → UI: progreso     | `validateProgressDetail`     |    5 de 5 | `phase` · `member` · `index` (≥ total · ausente) · `total`                                                                                                                                                                                            |
| Python → TS: export/score | `validateExport/ScoreResult` |     6 + 5 | `versions.{xgboost,lightgbm,sklearn}` · `payload_b64` · `schema.classes` · `training_profile.categorical` · `probabilities` (×2) · `predictions[0]` · `novelty.affected_rows` · `positive_class`                                                      |
| archivo → import          | `validateModelFile`          |  16 de 16 | `league` (×2) · `league[0].{name,status,cv_mean,cv_std,test}` · `selection` · `selection.{by,cv_winner,k,metric,rule}` · `versions.{xgboost,lightgbm}` · `model_name`                                                                                 |

**Cruces de punta a punta (integración, Pyodide real):** `prepareRun` real → `run_experiment` →
`validateTrainResult` → `assembleResult` → `fit_member` → `validateMemberFit` → `applyMemberFit` ·
callback de progreso Python → JS validado paso a paso · export → import → puntuar con XGBoost y
con LightGBM (predicciones y probabilidades idénticas).

### Cambios esperados en tests heredados (R4)

- **Integración (S1–S4):** los payloads armados a mano pasan por `withLeague` (liga chica, k = 2).
  El runtime carga los 4 paquetes como el navegador (`tests/integration/runtime.ts`).
  - `sanitation-pipeline`: «el ganador es el argmax del test» pasa a «el ganador es la regla de un
    error estándar sobre la CV».
  - `scoring`: `RUNTIME_VERSIONS` suma xgboost y lightgbm.
- **Unit:**
  - Los fixtures de `ExperimentResult` se arman con `tests/unit/factories.ts`, con formas que
    `contract.ts` acepta.
  - `prepareRun` con 2 positivos en 10 filas ahora da `too-few-rows` (R7); el test usa 20 filas.
  - El rechazo del manifiesto ahora nombra el campo.
  - El texto de carga nombra los 4 paquetes.
- **e2e:** `saneamiento-sucio` ya no exige `/^(forest|hgb)$/`. Ahora exige que sea un miembro de la
  liga, y que el manifiesto traiga la liga y `selection.by = cv`.

### Corridas locales (2026-10-02)

- `pnpm typecheck` y `pnpm lint` limpios.
- `pnpm test`: 37 archivos, 310 pruebas. Cobertura total 90 % de líneas; `engine/` 98 % de líneas
  y 95 % de ramas.
- `pnpm test:integration`: 6 archivos, 46 pruebas, Pyodide real con los 4 paquetes.
- `CI=1 pnpm test:e2e`: 24 de 24, build de producción, móvil y escritorio.

## Fase 2 — UI, fichas, honestidad explícita

«continúa» recibido el 2026-10-02 tras el STOP de la F1; D10–D15 aceptadas sin cambios.

### Antes de la parada de mirada de FORMA (lo que la mirada juzga)

- **`ConfigScreen`:**
  - El selector ofrece TODAS las columnas, cada una con su tarea (E1).
  - `TaskCard`: la razón («2 valores distintos → clasificación binaria»); si la tarea aún no se
    entrena, lo dice, sin esconder la columna.
  - `RosterCard` (E2): Nivel 1 con estimación, Nivel 2 con el costo de cada uno, y «fuera» con su
    razón y la nota «nada se esconde».
  - «Entrenar modelos» con la estimación debajo.
  - **Cambio de forma:** la acción sube antes de la vista previa. En 360 px el botón quedaba a
    varias pantallas del objetivo; lo juzga la mirada.
- **`LeagueTable` (reemplaza a la tabla de H1):**
  - Filas = modelos, ordenadas por validación cruzada (media y ± desviación).
  - Marcas con texto:
    - ★ rellena + «Ganador (validación cruzada)»
    - ◆ + «Elegido por ti»
    - ▲ «mejor puntaje»
    - ≈ «empata con el mejor» (la banda del error estándar)
    - ⚠ «no convergió»
    - ✕ «no concluyó (tipo)»
  - Pendientes del Nivel 2 y «fuera» como filas, con su razón.
  - Prueba a pedido («Ver puntajes de prueba (no sirven para elegir)»), con advertencia; en móvil
    va como una línea propia en ámbar y desde `sm` como columna.
  - «Elegir» / «Volver al ganador» / «En uso».
- **Veredicto:**
  - Con elección manual lleva «◆ Elegido por ti, no por la validación cruzada…» (U1).
  - Si gana la logística: «La liga no encontró nada mejor que la regresión de referencia» (R2).
  - «Usar el modelo» y «Exportar» esperan mientras el worker ajusta el elegido.
- **`TrainingScreen`:** progreso modelo a modelo, «Validación cruzada · modelo 8 de 10:
  HistGradientBoosting», con barra accesible.
- **Hook:** `plan` (E1 + E2 al elegir el objetivo), `routing`, `chooseMember` → `fit-member` →
  `validateMemberFit` → `applyMemberFit`.
- **Kit de prueba (D6):** `docs/kit-de-prueba/liga-mediana.csv`, 5.000 filas y determinista
  (`scripts/kit-de-prueba-liga-mediana.mjs`). En Chromium, Nivel 1 = 10 modelos y 4 pendientes.

**Pasada de capturas previa a la mirada:**

- Build de producción, 360 px claro/oscuro y 1280 px, `scrollWidth ≤ clientWidth` medido en cada
  encuadre, leídas como imagen.
- Hallazgos pagados antes de presentar:
  1. **La página desbordaba a 403 px** con la prueba abierta: un `sr-only` absoluto escapaba de la
     región desplazable sin posición. Se arregló con `relative`, diagnosticado midiendo cada
     elemento.
  2. En 360 px la columna de prueba y los botones quedaban fuera de la vista. La acción va bajo
     el nombre en móvil y la prueba como línea propia.
  3. En escritorio las filas eran altas; la acción pasa a su columna desde `sm`.
  4. Pendientes y «fuera» comprimidos en la columna angosta; ahora ocupan la fila entera.
  5. «Volver al ganador» sin poder partirse fijaba el ancho; ahora se parte en móvil.
  6. Los círculos de las etapas se deformaban con textos largos (`shrink-0`).
  7. El copy «con pocos datos…» no valía para 5.000 filas; ahora es genérico.
- Un aparente botón pálido era la transición de opacidad a medio camino: el arnés ahora espera
  400 ms antes de cada captura.

**Tests:** `tests/unit/league-ui.test.tsx` (19). Cambios esperados en e2e (R4): `happy-path` y
`saneamiento-sucio` afirman la liga en vez de «Modelos que compitieron / elegido». Local: unit 329
de 329, e2e 24 de 24 en build de producción.

**CI de `92f366a`:** `quality`, `integration`, `e2e`, `lighthouse`, Vercel y Vercel Preview Comments,
cada uno con conclusión propia `success` (`gh pr checks 13`).

### Parada de mirada de FORMA — presentada y APROBADA el 2026-10-02

Sobre la preview del commit `92f366a` (la URL va solo en la conversación — regla de cero enlaces).

| #   | Archivo / lugar                                                                                  | Botón / estado                                                                                   | Qué mirar                                                                                                | Respuesta esperada              |
| --- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------- |
| M1  | Preview → «Rotación de empleados» → objetivo `renuncio`, luego `edad`                            | tarjeta de tarea + «Quién compite» + «Entrenar modelos» (ahora arriba de la vista previa)        | ¿se entiende qué tarea detectó y por qué compite o no cada modelo? ¿sirve el botón arriba?               | «lo abrí y apruebo» o el ajuste |
| M2  | Preview → entrenar `renuncio`; luego «Nuevo experimento» → `docs/kit-de-prueba/liga-mediana.csv` | tabla de la liga · «Ver puntajes de prueba» · «Elegir» · «Volver al ganador» · filas del Nivel 2 | ¿el ganador se distingue sin color (★ + texto)? ¿se entiende la etiqueta de prueba? ¿y «elegido por ti»? | «lo abrí y apruebo» o el ajuste |

**Veredicto (evidencia de que se vio, literal del usuario):** «M1 lo abrí y apruebo M2 lo abrí y
apruebo, excelente muy buen trabajo cambia muchisimo ahora si es super funcional». Sin ajustes. Con
esto se construye encima: ficha de cada modelo, Nivel 2 (estimación, «incluir de todos modos»,
correr la unión) y cancelar. Son segundas vueltas: no abren otra parada.

### Después de la mirada: ficha, Nivel 2 y cancelar (segundas vueltas, sin parada)

- **Ficha de lectura (E3):**
  - `src/content/modelos.ts`: 12 fichas base + la de clase mayoritaria, cada una con cinco
    apartados (qué es · cuándo sirve · cuándo no · qué mirar · cuánto cuesta) como dato `{es, en}`
    redactado en cada idioma; las dos balanceadas suman un párrafo propio (D4).
  - `FichaModelo`: `<dialog>` nativo (foco atrapado, Esc, clic en el fondo) con la línea de estado
    de ESA liga: ★ ganador · ◆ elegido · puesto k de n · no concluyó · pendiente · fuera porque… ·
    baseline. El foco vuelve a quien la abrió.
  - `FichaButton`: el nombre del modelo es el botón (icono `info` a la izquierda, 44 px). Llega por
    `next/dynamic`: ficha y contenido viajan en su propio chunk (R12).
  - También los dos baselines del resultado abren su ficha.
- **Nivel 2 (D5 + U3 + ADR-010):**
  - `planLevel2()` (motor puro): la unión que correría, lo que se suma, los «fuera» que se pueden
    incluir y la estimación EN ESTE EQUIPO, calibrada con lo que tardó la corrida anterior frente a
    lo que se estimó para lo que corrió.
  - `Level2Card`: qué suma (con nombres), «Incluir de todos modos» con la razón del encarrilador
    por modelo, la estimación calibrada y «Correr el Nivel 2 (+n)». Si elegiste a mano, avisa que
    la liga completa vuelve a elegir por validación cruzada.
  - En la tabla, lo incluido por el usuario lleva «lo incluiste tú (el encarrilador lo dejaba
    fuera)».
- **Cancelar (R1) y R15:**
  - Antes de arrancar el Nivel 2 se exporta una instantánea del modelo vigente. Cancelar termina el
    worker, crea otro y la restaura con `import-model`; usar y exportar esperan a `modelReady`.
  - Si la instantánea aún no llegó, no se termina nada: el pedido se olvida y el worker conserva el
    modelo.
  - Si el Nivel 2 falla (error de Python, contrato o worker muerto), vuelve el resultado anterior
    con su aviso, no la pantalla de error. Si el worker muere antes de la instantánea, se dice que
    el modelo no se pudo recuperar.
  - `reset()` con cómputo en vuelo corta el worker (R15).
- **Observabilidad:** `recordLeagueRun` deja un breadcrumb de Sentry por corrida o cancelación con
  filas, columnas, cuántos compitieron, nivel, tiempo y si se canceló. Nada más: el test fija la
  forma cerrada.
- **Plural mínimo:** `<clave>_one` con `count === 1` («Compitió 1 modelo»). Se pagó «Compitieron 1
  modelos» (el test de la model card lo tenía fijado: cambio esperado).
- **Reduced-motion:** `motion-reduce:transition-none` en botones, zonas de carga y tarjetas de
  ejemplo.
- **Hallazgo anterior al sprint, pagado:** el `<pre>` de la vista previa de la model card era una
  región desplazable sin foco de teclado (axe `scrollable-region-focusable`). Lo cazó el e2e nuevo
  al abrir «Ver el contenido»; ahora es una región enfocable con nombre propio.
- **Detalle de forma (segunda vuelta):** el botón deshabilitado decía «Correr el Nivel 2 (+0)»;
  ahora, sin nada que sumar, dice «Correr el Nivel 2».

**Tests nuevos:**

- Unit:
  - `modelos.test.ts` (5): paridad de fichas con el roster y de idiomas.
  - `ficha-level2.test.tsx` (15).
  - `use-hooks.test.tsx` (+9: Nivel 2, cancelar, restaurar, fallar, morir, R15).
  - `encarrilador.test.ts` (+5, `planLevel2`).
  - `observability.test.ts` (+3).
  - `i18n-parity.test.ts` (+2, plural).
- e2e, en móvil y escritorio sobre el build de producción:
  - `liga.spec.ts`: ficha (foco, Esc, axe del diálogo en ambos temas), prueba, elegir, model card,
    volver; axe de la página en ambos temas.
  - `liga-cancelar.spec.ts`: `liga-mediana.csv` → estimar → arrancar → cancelar → exporta el
    Nivel 1.
  - `liga-booster-export.spec.ts`: LightGBM → exportar → recargar → importar → puntuar.
  - `reduced-motion-app.spec.ts`: opacidad efectiva 1 contando ancestros, sin transiciones ni
    animaciones en curso.

**Rojos demostrados (2026-10-02):**

| Gate                                     | Cambio deliberado                          | Rojo (quién lo nombró)                       | Verde al revertir |
| ---------------------------------------- | ------------------------------------------ | -------------------------------------------- | ----------------- |
| Paridad de fichas                        | renombrar `knn` y copiar un texto ES en EN | `knn_x` vs `knn`; `logistic.cost` copiado    | 5/5               |
| R1 en el hook                            | no re-importar la instantánea              | 4 tests: cancelar, fallar, morir, restaurar  | 26/26             |
| e2e reduced-motion (build de producción) | quitar `motion-reduce` del botón           | «Entrenar modelos» a opacidad efectiva 0,588 | 2/2               |
| e2e cancelar (build de producción)       | no postear el import de la instantánea     | «Exportar modelo» deshabilitado para siempre | 2/2               |

**Falso rojo de axe (aprendido):** con la ficha abierta, axe mide el contenido inerte detrás del
modal; ahora se audita el diálogo con el modal abierto y la página entera al cerrarlo. Después de
«Volver al ganador», axe medía los botones a mitad del fundido de 0,5 a 1. `getAnimations()` todavía
no lo veía, porque la transición arranca en el cuadro siguiente. El test ahora espera a que todo
botón habilitado tenga opacidad 1.

**Corridas locales:** unit 368/368 (41 archivos, líneas 90,9 %); e2e 32/32 en build de producción.

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
- **K-S5-7 — Fricción del constructor (no del kit):** un heredoc SIN comillas (`<<EOF`) al armar el
  informe dejó que zsh interpretara los backticks del texto como comandos (`engine/costos.ts`,
  `scripts/spike-liga/tabla.mjs`…). No hubo daño (comandos inexistentes o sin permiso), pero el
  informe salió mutilado; regenerado con `<<'EOF'` y la ruta por variable de entorno. Regla para el
  resto del sprint: todo heredoc con texto markdown va entre comillas.
- **K-S5-6 — «Una carnada por campo» no está en el wiki**: `gate-de-contrato-entre-lenguajes.md`
  prescribe fixture del emisor + tipo del lector + un test de punta a punta, pero no carnadas. La
  mecánica «detectó k de n» se toma de `reusables/diagramador/CONTRATO.md`.
- **K-S5-8 — Fricción del constructor: una demo en rojo que no se puso roja.** El test de
  determinismo de `fit_member` probaba solo miembros que no usan azar; con otra semilla seguía
  verde. La tercera pregunta de la regla 15 («¿puede fallar siquiera?») lo cazó en el acto. Se
  reforzó con los bosques. Lección: un test de determinismo tiene que incluir algo aleatorio.
