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

**STOP de la Fase 0 — decisiones del usuario pendientes:** F0-1 techo del Nivel 1 · F0-2 regla de
selección · F0-3 reglas «fuera» · F0-4 MLP · F0-5 test de los perdedores · F0-6 k.

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
