# Sprint 007 — Auditoría final, Fase 1 («Agrupar y multiclase» · Probeta DS)

- **Fecha:** 2026-10-06.
- **Auditores:** tres subagentes independientes, que no construyeron el sprint, en solo lectura. Su
  fuente primaria es el diff; la bitácora solo sirvió para contrastar lo que el constructor cree que
  hizo.
  - **A · alcance y textos.** Casillas 1, 4 y 6, coherencia documental y cero enlaces. **Pendiente:**
    audita el brochure ya construido, que espera la decisión del usuario sobre su delta (D-A y D-B
    del storyboard, §9).
  - **B · motor, contrato, gates y dependencias.** Casillas 2, 3, 5, 7 y 8, y los gates nuevos:
    ¿pueden fallar?
  - **C · UI, hooks, i18n, a11y y privacidad del cliente.** Casillas 2, 4 (copy de la UI) y 5 (lado
    UI), y la regla 17.
  - Se suman las derivas **del lado del código** de la auditoría de la constitución
    (`sprints/SPRINT_007-auditoria-constitucion.md`, camino C).
- **Base → HEAD:** `6f50c43` (merge-base con `main`) → `fec1a29`, rama `sprint-007/agrupar-y-multiclase`,
  PR #19. El diff tiene 160 archivos, +38.154 / −1.439, en 21 commits.
- **Lo que corrieron los auditores** (al terminar, `git status` sin cambios suyos):
  - **B:**
    - `pnpm test`: 675 de 675. `engine/` al 97,45 % de sentencias y 98,97 % de líneas.
    - `pnpm test:integration`: 98 pasan y 1 se salta (99).
    - `pnpm typecheck` y `pnpm lint`: limpios.
    - `verificar-dependencias`: ✓ 675 paquetes.
    - `pnpm audit`: 1 alto, ignorado por el ADR 012. `braces` sigue en 3.0.3, sin parche.
    - Sondas propias con Pyodide real en el scratchpad: los fixtures del sprint son idénticos a una
      corrida fresca.
  - **C:**
    - 20 archivos de vitest de UI: 276 de 276.
    - Paridad de i18n: 0 diferencias; 188 claves nuevas, todas usadas.
    - Contraste WCAG de los tokens nuevos: mínimo 4,55:1.
    - 10 sondas propias.
  - **Los dos:** `gh pr checks 19` sobre `e6cf659`, 6 de 6 `pass`.
- **Ninguno corrió build ni Playwright local:** para los e2e se cita la CI.

## Recomendación (parcial: auditores B y C, y la constitución)

**Requiere ajustes.** Hay **42 hallazgos consolidados**, sin Crítico. Cuatro venían duplicados entre
auditores y se fusionaron: AU-B-11 = AC-12, AU-B-12 = AC-27, AU-B-09 ≈ AU-C-13 (el `ari_min`) y
AU-B-19 = AC-18, que va por texto (D8).

| Severidad | Cantidad |
| --------- | -------- |
| Crítico   | 0        |
| Alto      | 5        |
| Medio     | 20       |
| Bajo      | 17       |

**Lo que resistió:**

- **Privacidad.**
  - Ningún dato del usuario sale por la red ni llega a un registro.
  - La narración arma payload solo en la binaria.
  - `probeta.league` lleva sus 7 campos.
  - Las etiquetas por fila no entran al estado.
  - El único `localStorage` es el del idioma.
- **El contrato.**
  - Las cuentas de carnadas cuadran exactas con lo declarado en las 17 listas nuevas, y en las
    heredadas.
  - Los fixtures salieron de Pyodide real.
  - La sección `packages:` del lockfile es idéntica a la base.
- **El despacho exhaustivo:** tipos, tripwires TS y Python, y ramas completas.
- **La multiclase:**
  - el orden de las clases es el de Python;
  - las clases de 1 o 2 filas se nombran solo en pantalla;
  - el k de la CV lo acota la clase más chica;
  - la probabilidad predicha cae en [1/K, 1];
  - la logística baseline es la misma que la logística miembro.
- **Agrupar:**
  - el consenso de TS es espejo exacto del de Python;
  - HDBSCAN todo ruido se valida;
  - `fit_member` reproduce su fila.
- **La UI.**
  - AA en los dos temas.
  - Ningún símbolo con dos significados.
  - Botones de al menos 44 px, con icono.
  - Regiones desplazables enfocables y con nombre.
  - La máquina de estados resiste: elegir, volver al ganador, cancelar y el Nivel 2.

**Lo que no está listo:**

- **AU-S7-01.** «Tus filas con su grupo» puede asignar el grupo de la fila vecina, o «NaN», cuando
  una columna numérica trae basura. El saneamiento muta la tabla original.
- **AU-S7-02.** Con más de 2.000 filas, la referencia nula de HDBSCAN vale 0. Su «los grupos
  existen» se da sin comparar contra datos sin estructura, que es lo que pide la decisión 5.
- **Cardinalidades cableadas en el copy** («hasta 20», «cuatro tareas», «los otros tres») y una model
  card que nombra agrupadores que no corrieron.
- **Copy de las tareas nuevas que dice cosas falsas:**
  - «usa AUC» con varias categorías;
  - «el veredicto se mide con AUC o F1» en la ficha de la mayoritaria;
  - «validación cruzada» al agrupar;
  - «sin perder nada» al cancelar.
- **Gates que no corren o no pueden fallar:**
  - la carnada del hook se salta en la CI;
  - `demo-rojo.sh` acepta una señal;
  - la prueba «la fuga se mide solo en train» no puede caer;
  - la regla 18 no tiene gate.

## Índice consolidado (42 hallazgos, de más a menos severo)

Columna «Origen»: el id en el informe de cada auditor (anexos). AC = auditoría de la constitución.

| Id | Sev. | Hallazgo | Origen | Dónde (principal) |
| --- | --- | --- | --- | --- |
| AU-S7-01 | Alto | El saneamiento muta la tabla original. «Tus filas con su grupo» pierde las celdas basura y, con un duplicado, desalinea los grupos o los deja en «NaN» | AU-B-01 | `src/engine/sanitize.ts:71`, `:176`; `src/lib/useExperiment.ts:1190` |
| AU-S7-02 | Alto | HDBSCAN con más de 2.000 filas: la referencia nula aplica el `min_cluster_size` del total a la muestra y vale 0, así que la lectura «existen» no se compara con nada | AU-B-02 | `src/lib/ds/pipeline.py:718-722`, `:765-785` |
| AU-S7-03 | Alto | Cardinalidades cableadas: «hasta 20», «cuatro tareas» y «los otros tres» en ES y EN, y `classes.length < 3` | AU-B-03 | `messages/{es,en}.json:107,586,730,851`; `src/engine/eda.ts:196` |
| AU-S7-04 | Alto | La model card de agrupar describe a los cuatro agrupadores aunque compitan dos | AU-B-04 | `src/lib/modelcard.ts:659-664`; `messages/{es,en}.json:626` |
| AU-S7-05 | Alto | Regla 18: no hay gate que diga si venció la condición de retiro del ADR 012 | AC-2 (código) | `tests/unit/audit-exceptions.test.ts`; falta `scripts/verificar-retiros.mjs` |
| AU-S7-06 | Medio | El lector de agrupar lanza un `TypeError` (reduce sin valor inicial) en vez de nombrar el campo, y la UI queda entrenando | AU-B-05 | `src/workers/contract.ts:985-991` |
| AU-S7-07 | Medio | El manifiesto de agrupar muestra campos que no coteja: método, filas de muestra, gap, k, `ari_min` y corridas | AU-B-06 | `src/lib/model-file.ts:500-518` |
| AU-S7-08 | Medio | El export de agrupar no coteja el ancho de los centroides | AU-B-07 | `src/workers/contract.ts:1200-1206` |
| AU-S7-09 | Medio | P13 por estructura: el manifiesto copia `reading` y `assignment` enteros, y `labelsField` no es recursivo | AU-B-08 | `src/lib/model-file.ts:692-693`; `src/workers/contract.ts:948-953` |
| AU-S7-10 | Medio | `ari_min` sin consumidor. P8 promete «la media y el mínimo», y el `{ariMin}` del copy es el umbral | AU-B-09, AU-C-13 | `protocol.ts:487`; `ClusterResults.tsx:201`; `modelcard.ts:559` |
| AU-S7-11 | Medio | La prueba «la fuga se mide SOLO en train» no puede fallar por lo que promete | AU-B-10 | `tests/unit/multiclase-motor.test.ts:246-251` |
| AU-S7-12 | Medio | `demo-rojo.sh` cuenta como rojo un gate muerto por una señal | AU-B-11, AC-12 | `scripts/demo-rojo.sh:91-99` |
| AU-S7-13 | Medio | La carnada del hook de secretos nunca corre en la CI: gitleaks fuera del `PATH`, «1 skipped» | AU-B-12, AC-27 | `.github/workflows/ci.yml:20-27`; `tests/unit/hook-secretos.test.ts:62`; `tests/integration/gitleaks-hook.test.ts:58-61` |
| AU-S7-14 | Medio | Configuración con varias categorías: el desbalance dice «usa AUC», y ni él ni la fuga nombran la categoría | AU-C-01 | `src/components/ConfigScreen.tsx:406-419`; `messages/{es,en}.json:136,140` |
| AU-S7-15 | Medio | La ficha «Clase mayoritaria» con varias categorías dice «AUC o F1» | AU-C-02 | `src/content/modelos.ts:364-371`, `:594-596` |
| AU-S7-16 | Medio | Tres textos de validación cruzada o «liga» al agrupar: el estado de la ficha, el `aria-label` del progreso y la card con muestra pequeña | AU-C-03 | `ClusterResults.tsx:641-655`; `TrainingScreen.tsx:110`; `modelcard.ts:691-696` |
| AU-S7-17 | Medio | «Vuelves a este resultado sin perder nada» es falso al agrupar: tras cancelar el Nivel 2 ya no se pueden descargar las filas con su grupo | AU-C-04 | `Level2Card.tsx:156`; `TrainingScreen.tsx:128`; `useExperiment.ts:681-692` |
| AU-S7-18 | Medio | «Agrupar filas parecidas en su lugar» deja el foco en `<body>` | AU-C-05 | `TaskCard.tsx:268-279`; `ConfigScreen.tsx:69-73` |
| AU-S7-19 | Medio | Las pantallas con `next/dynamic` no tienen estado de carga ni límite de error | AU-C-06 | `src/app/page.tsx:16-31` |
| AU-S7-20 | Medio | **DECISIÓN 2.** «Métricas casi perfectas — sospechoso» aparece cuando la alarma es una columna, aunque las métricas no lo sean (binaria y estimar, heredado) | AU-C-07 | `VerdictCard.tsx:40-58`; `ResultsScreen.tsx:361`; `RegressionResults.tsx:46` |
| AU-S7-21 | Medio | Nombres de categoría recortados, con `title` como única vía en táctil | AU-C-08 | `MulticlassResults.tsx:247,261-266,364-369` |
| AU-S7-22 | Medio | Regla 17: controles nuevos que ninguna pasada activa (dos escondían AU-S7-15 y AU-S7-16) | AU-C-09 | `scripts/capturas-s7.mjs` |
| AU-S7-23 | Medio | La model card de agrupar imprime las medias con 2 decimales fijos: ~1e-11 sale «0.00» | AU-C-10 | `src/lib/modelcard.ts:584` |
| AU-S7-24 | Medio | `README.md` es la plantilla de create-next-app; SVG de plantilla sin uso; el `CHANGELOG.md` raíz es el del kit | AC-13 | `README.md`; `public/{file,globe,next,vercel,window}.svg`; `CHANGELOG.md` |
| AU-S7-25 | Medio | «shadcn/ui» nunca se instaló: sin ADR que diga por qué los primitivos son propios, y `design-system.md` lo repite | AC-4 (código) | `design-system.md:72`; `.claude/skills/diseno-ui.md:24` |
| AU-S7-26 | Bajo | Carnadas que faltan o que nombran otro campo (`null_score`, `league[].status`, `rare_categories`, `assign.sample_rows`) | AU-B-13 | `tests/unit/contract-agrupar.test.ts:92-229`; `contract.ts:1050-1051` |
| AU-S7-27 | Bajo | `CLUSTER_K_BY` y `CLUSTER_ASSIGN` sin exhaustividad por agrupador | AU-B-14 | `src/workers/contract.ts:920-933` |
| AU-S7-28 | Bajo | El tripwire del despacho no ve comparaciones contra constantes (`CLUSTER_TASK`) | AU-B-15 | `tests/unit/despacho.test.ts:128-137` |
| AU-S7-29 | Bajo | El orden de las clases no es el de Python en dos sitios (`.sort()`) | AU-B-16 | `src/engine/leakage.ts:228`; `src/engine/eda.ts:195` |
| AU-S7-30 | Bajo | HDBSCAN con menos de 5 filas sale como «error» y no como «sin estructura» | AU-B-17 | `src/lib/ds/pipeline.py:713-723` |
| AU-S7-31 | Bajo | `verificar-dependencias`: una aserción condicional, y acepta entradas sin `razon` | AU-B-18 | `tests/unit/verificar-dependencias.test.ts:67-75`; `scripts/verificar-dependencias.mjs:156-158` |
| AU-S7-32 | Bajo | La prueba del breadcrumb `probeta.league` no se extendió a las tareas nuevas (plan R9) | AU-B-20 | `tests/unit/observability.test.ts:35-63` |
| AU-S7-33 | Bajo | R9: conteos sin separador de miles (matriz, tabla por categoría, model card, puntuar) y espacios antes de unidad | AU-C-11 | `MulticlassResults.tsx:153,287,374`; `modelcard.ts:114-118,181-200,267-271`; `ScoreScreen.tsx:539,801,807` |
| AU-S7-34 | Bajo | Plurales: «1 filas», «fila(s)», `_one` inalcanzables | AU-C-12 | `ScoreScreen.tsx:794`; `messages/{es,en}.json:86,418,662,862` |
| AU-S7-35 | Bajo | `rareCategories` no llega a la card de agrupar; claves `level2.cluster.descAllRan` y `nothingToAdd` inalcanzables | AU-C-13 | `experiment.ts:989,1013`; `messages/{es,en}.json:827,831` |
| AU-S7-36 | Bajo | Copy heredada que no aplica: «aún no se usan (sin partición temporal)» en la card de agrupar; «ordenar por riesgo» con varias categorías | AU-C-14 | `modelcard.ts:743`; `messages/{es,en}.json:400,585` |
| AU-S7-37 | Bajo | Inglés: «Real ↓» y «real category» (el binario dice «Actual»), «the smaller one», comillas «» fijas en copy inglés | AU-C-15 | `messages/en.json:325-330,514,515,720`; `ConfigScreen.tsx:447`; `ClusterResults.tsx:311` |
| AU-S7-38 | Bajo | `design-system.md` dice «caja `sunken` con `info`» para la nota de la muestra en configuración; el código la dibuja como línea | AU-C-16 | `design-system.md:324-325`; `RosterCard.tsx:123-130` |
| AU-S7-39 | Bajo | «Elegir» y «Volver al ganador»: el foco cae a `<body>` (heredado de la liga) | AU-C-17 | `ClusterResults.tsx:602-625`; `LeagueTable.tsx` |
| AU-S7-40 | Bajo | Tests que no pueden fallar en lo que dicen cubrir: la columna `_probabilidad` y el botón «agrupar en su lugar» | AU-C-18 | `tests/e2e/multiclase-score.spec.ts:91`; `tests/unit/agrupar-ui.test.tsx:501` |
| AU-S7-41 | Bajo | `LeagueTable` fija `balanced_accuracy` fuera de `METRIC_RULES` | AU-C-19 | `src/components/LeagueTable.tsx:73-79` |
| AU-S7-42 | Bajo | `CLAUDE.md` dice que la copia de `pipeline.py` está «vigilada por test»: no hay tal prueba (va por texto, D8) | AU-B-19, AC-18 | `CLAUDE.md` (Estructura); `scripts/copy-pyodide.mjs:61-63` |

## Decisiones que la Fase 2 necesita del usuario (en llano)

1. **AU-S7-02 · HDBSCAN con tablas grandes.** Arreglarlo aplica tu decisión 5 tal como la tomaste:
   cada agrupador se compara con lo que él mismo encuentra en datos sin forma. La consecuencia, dicha
   de frente: con más de 2.000 filas, algunas lecturas que hoy dicen «los grupos existen» con HDBSCAN
   pasarán a «no hay estructura». En la sonda del auditor, tres nubes con 6.000 filas y 74 % de ruido
   pasan de «existen» a «no hay estructura». **Recomendado: arreglarlo** (no es un umbral nuevo: es la
   misma regla de tamaño, max(5, n/50), aplicada a las filas de cada ajuste).
2. **AU-S7-20 · El titular de fuga heredado de la binaria y de estimar.** Hoy dice «Métricas casi
   perfectas — sospechoso» siempre que una columna se marca, aunque el modelo saque, por ejemplo, un
   AUC de 0,80. La multiclase ya dice «Posible fuga de datos — sospechoso». La orden pide no tocar la
   binaria ni la regresión salvo por D8, así que lo decides tú.
   - **A (recomendada):** el mismo titular en las tres tareas, «Posible fuga de datos — sospechoso»,
     con un detalle que dice qué se encontró: una columna que predice el objetivo casi a la perfección
     en las filas donde tiene valor. Sin umbral nuevo. El brochure ajusta su línea «Aviso de métricas
     casi perfectas» en el mismo PR.
   - **B:** se queda como está, y el summary lo declara.

## Plan de pago (Fase 2)

Se pagan **todos**, hasta los bajos. El ajuste ejecutable de cada uno (archivo, línea, cambio exacto,
«verificado cuando» y demo en rojo) está en el informe de su auditor, en los anexos. Cada demo en rojo
pasa por `scripts/demo-rojo.sh` con `--debe-nombrar`. Orden de pago (kit v1.35.0):

1. **Primero lo que crea o arregla gates.** Cada uno nace en rojo:
   - AU-S7-12: señal en `demo-rojo.sh`. Va primero porque las demás demos dependen de la herramienta.
   - AU-S7-13: gitleaks en el `PATH` de la CI y el comentario corregido.
   - AU-S7-05: `scripts/verificar-retiros.mjs`, comando nombrado y en `/deploy-check`.
   - AU-S7-11: fuga solo en train.
   - AU-S7-32: breadcrumb por tarea.
   - AU-S7-28: tripwire contra constantes.
   - AU-S7-27: `satisfies` exhaustivo.
   - AU-S7-31: `verificar-dependencias`.
   - AU-S7-40: tests débiles.
   - AU-S7-03: prueba de cardinalidades.
   - Las carnadas de AU-S7-06, AU-S7-07, AU-S7-08, AU-S7-09 y AU-S7-26.
2. **Después, la conducta:**
   - AU-S7-01: copia de la fila, más tres pruebas.
   - AU-S7-02: HDBSCAN, con la decisión 1. Fixtures regenerados por Pyodide real.
   - AU-S7-04 y AU-S7-30.
3. **El copy y la UI.** Cada copy nuevo se escribe en ES y EN en el mismo paso y pasa su propia
   casilla 4 antes de entrar:
   - AU-S7-14 a AU-S7-19;
   - AU-S7-20, con la decisión 2;
   - AU-S7-21 a AU-S7-23;
   - AU-S7-29;
   - AU-S7-33 a AU-S7-39;
   - AU-S7-41.
4. **Documentos:**
   - AU-S7-24: un README corto en ES y EN, sin URL de producción, y la decisión sobre el `CHANGELOG.md`
     del kit;
   - AU-S7-25: ADR 019, «Own UI primitives instead of shadcn/ui», y `design-system.md:72`;
   - AU-S7-38;
   - AU-S7-42: va por la desviación D8.
5. **Al final, sobre el árbol completo:**
   - `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm test:integration`;
   - la suite e2e entera sobre el build de producción;
   - la pasada de capturas con la interacción ampliada (AU-S7-22);
   - la segunda casilla 4, sobre el diff de la Fase 2 y el summary, a cargo de **otro** auditor.

## Auditor A — alcance y textos

**Pendiente.** Corre sobre el brochure ya construido, después de la decisión del usuario sobre el delta del storyboard (D-A y D-B). Su informe se suma aquí con su propio índice, y el consolidado se renumera si hace falta.

## Anexo · Auditor B — motor, contrato, gates y dependencias

### Auditoría S7, fase 1: auditor B (motor, contrato, gates y dependencias)

Leí el diff `6f50c43..HEAD`: 160 archivos. Durante la auditoría, HEAD avanzó a `fec1a29`, un commit solo de docs con la auditoría de la constitución, y no cambia código.

Encontré 20 hallazgos: **4 Altos, 8 Medios y 8 Bajos**. Ninguno es Crítico: no encontré fuga de datos del usuario fuera del navegador ni un veredicto supervisado equivocado.

Tres de mis hallazgos coinciden con los del auditor de la constitución, que llegó a ellos por otra vía:

| Mío | Suyo | Tema |
| --- | --- | --- |
| AU-B-11 | AC-12 | `demo-rojo.sh` cuenta como rojo un gate muerto por señal |
| AU-B-12 | AC-27 | la prueba de la carnada del hook se salta en la CI |
| AU-B-19 | AC-18 | la copia de `pipeline.py` no está vigilada por ninguna prueba |

#### Corridas

| Comando | Resultado |
| --- | --- |
| `pnpm test` (vitest + cobertura) | **675 de 675** en 57 archivos; 10,97 s. Total: 92,78 % sentencias · 86,11 % ramas · 90,83 % funciones · 93,99 % líneas. `engine/`: 97,45 · 94,49 · 97,79 · **98,97 %**. `workers/`: 97,55 · 91,6 · 100 · 98,91. Coincide con la bitácora. |
| `pnpm test:integration` (Pyodide real) | **98 pasan, 1 saltada (99)** en 10 archivos; 2 min 28 s. Pyodide bajó las wheels del CDN y las guardó en `node_modules/pyodide` (está en `.gitignore`). |
| `pnpm typecheck` | sin errores, 5,2 s. No tocó `next-env.d.ts` (`tsc --noEmit`). |
| `pnpm lint` | sin avisos, 5,1 s |
| `vitest run` de las cuatro suites de contrato, con consola | 86 de 86. Las cuentas «detectó k de n» están en la tabla de carnadas. |
| `node scripts/verificar-dependencias.mjs 6f50c43…` | ✓ 675 paquetes, ninguno por debajo |
| comparación de la sección `packages:` del lockfile, base contra HEAD | **idéntica** (diff vacío) |
| `pnpm audit --audit-level high` | 1 alto, 1 ignorado (GHSA-vfj7-8cjw-p6xm), exit 0 |
| `npm view braces version` | 3.0.3: sigue sin parche |
| `gh pr checks 19` | 6 de 6 `pass` (run 37402379813). En el log de `quality`: `hook-secretos.test.ts (3 tests \| 1 skipped)`, «674 passed \| 1 skipped». |
| `cmp` de `src/lib/ds/pipeline.py` contra `public/pyodide/pipeline.py`, y de los 4 CSV de `public/datasets` contra el kit | idénticos |

**Sondas** (`/private/tmp/claude-501/-Users-henryrincon-Code-app-ds/a3a1a067-2ff2-4cdd-8e29-1f09f53b4bcb/scratchpad/auditoria-b/`, con su propio config de vitest; ninguna escribe en el repo):

- **Unitarias:** `probe-sanitize`, `probe-sanitize2`, `probe-contract`, `probe-manifest`, `probe-p13` y `probe-card`.
- **Con Pyodide real:**
  - `probeint-pyodide` (6 de 6): `train-result-agrupar`, `fit-member-result-agrupar` y `train-result-multiclase` son **idénticos** a una corrida fresca, salvo `elapsed_ms`. Los fixtures salieron de Pyodide real.
  - `probeint-hdbscan` (2) y `probeint-hdbnull` (6).
- **De la herramienta:** `demo-rojo.sh` corrido sobre `senal.txt` en el scratchpad.

#### Casilla 2 — calidad

**Lo que resistió:**

- **Despacho exhaustivo.** Funcionan los tipos, el tripwire de TS y de Python, la regla de que todo `_by_task` lleve todas las ramas (≥ 10 llamadas) y `dispatch-incomplete` en runtime.
- **Clases en multiclase:**
  - el orden por punto de código coincide con el `sorted()` de Python;
  - «1» y «1.0» en la misma columna dan `target-mixed-notation`;
  - una clase con 1 o 2 filas bloquea con `too-few-rows-per-class` y la nombra solo en pantalla, nunca en un log;
  - 20 clases × 9 filas: el lector acepta, `auc_ovr` sale con valor y Ridge da `log_loss` null.
- **Métricas y baselines multiclase:**
  - k de la CV queda acotado por la clase más chica de train;
  - la probabilidad de la clase predicada cae en [1/K, 1] para los 14 miembros (`predict` es el argmax);
  - la logística baseline es la misma que la logística miembro.
- **Agrupar:**
  - el consenso de TS es espejo exacto del de Python, empates incluidos;
  - `clusterKCap` coincide con `_k_cap`;
  - con 3 puntos distintos y con una rejilla con empates de Ward, el k de la fila es consistente y el lector acepta;
  - HDBSCAN todo ruido (`k=0`, `sizes=[]`) valida;
  - con 6 filas funciona;
  - `fit_member` reproduce su fila.
- **Privacidad:**
  - la narración solo arma payload en la binaria (por tipo, por el literal de Zod y con `strict`), y el mapper descarta `class`;
  - el breadcrumb `probeta.league` lleva sus 7 campos escritos uno por uno;
  - los caminos de error del contrato usan `*` y no nombres de columna;
  - `smallestClass` nunca va a un log;
  - el lockfile tiene un solo `@sentry/core`.
- **CSV:** `neutralizeFormula` cubre también la clase predicha y el grupo.

**Lo que no resistió:** AU-B-01 a AU-B-20.

#### Gates nuevos: ¿pueden fallar?

| Gate | archivo:línea | ¿Puede fallar? | Rojo declarado en la bitácora (¿plausible?) |
| --- | --- | --- | --- |
| Tipos del despacho (`@ts-expect-error`) | `tests/unit/despacho.test.ts:36-48` + `pnpm typecheck` | Sí. `tests/` entra al `tsc`. | `?: T` → «Unused '@ts-expect-error'»: plausible |
| Tripwire de fuente TS | `despacho.test.ts:128-137, 226-231` | Sí, pero no ve comparaciones contra constantes (AU-B-15) | `?? "binaria"` en `modelcard` → nombra `:221`: plausible |
| Tripwire Python + `_by_task` completo | `despacho.test.ts:138-146, 241-254` | Sí (exige ≥ 10 llamadas) | comparación en `:837` y rama faltante en `:640`: plausible |
| `LEAKAGE_CLASS_MIN_SUPPORT` y pureza normalizada | `tests/unit/leakage.test.ts:151-200` | Sí | 5→4 (4 de 21 caen) y pureza cruda (1 de 21): plausible |
| Paridad de `SCORER` (patrón con «_») y constantes de agrupar | `tests/unit/roster.test.ts:73-85, 115-164` | Sí | plausibles |
| Carnadas Python→TS | `contract.test.ts:448-571`, `contract-agrupar.test.ts:92-325` | Sí. Faltan campos (AU-B-07, AU-B-13); un caso hostil lanza en vez de nombrar (AU-B-05). | plausibles |
| Carnadas TS→Python | `tests/integration/multiclase.test.ts:413-489`, `agrupar.test.ts:334-375` | Sí | plausibles |
| Manifiestos | `model-file.test.ts`, `contract-agrupar.test.ts:361-438` | Sí en la forma; **no** en la coherencia (AU-B-06) | plausibles |
| Fixtures del emisor real | `multiclase.test.ts:571-602`, `agrupar.test.ts:414-445` | Solo por **forma** (las claves y el primer elemento de cada arreglo), no por valores | Mi sonda confirma que los valores de hoy son de Pyodide |
| Hook que falla cerrado | `tests/unit/hook-secretos.test.ts:47-75` | Sí, pero **la carnada nunca corre en la CI** (AU-B-12) | Plausible. El texto pedido a `--debe-nombrar` aparece también en el code frame que imprime vitest. |
| `verificar-dependencias` + degradaciones | `tests/unit/verificar-dependencias.test.ts`, `ci.yml:34-38` | Sí; hay un `expect` condicional (AU-B-18) | plausibles |
| `lighthouse-margen.mjs` | `ci.yml:130-131` | Cobertura: solo con la config mutada. Margen: solo avisa, con exit 0. Las dos cosas están declaradas. | `path → /x` nombra `/`: plausible |
| `sentry-cliente` | `tests/unit/sentry-cliente.test.ts:30-52` | Sí en la CI (`--frozen-lockfile`) | `vitest` directo (pnpm 11 repara el lockfile): plausible |
| `portada-liviana` | `tests/unit/portada-liviana.test.ts:83-103` | Sí, y tiene control | plausibles |
| Cerrojo de la narración en el route | `tests/unit/narrate-route.test.ts:135-161` | Sí (`strict`) | — |
| `dedupeIndex` cuadra con `sanitizeTable` | `tests/unit/sanitize.test.ts:177-198` | Sí, pero **no ve la coerción** de basura (AU-B-01) | 11 de 11: plausible |
| «la fuga se mide SOLO en train» | `tests/unit/multiclase-motor.test.ts:246-251` | **No** para lo que su nombre promete (AU-B-10) | — |
| `demo-rojo.sh` (la herramienta) | `scripts/demo-rojo.sh:91-99` | Acepta un gate muerto por señal (AU-B-11) | — |

#### Carnadas

| Lista | Declarado | Contado | Diferencia |
| --- | ---: | ---: | --- |
| TS→Python multiclase | 13 | 13 (fuente; la suite pasa) | 0 |
| TS→Python agrupar | 16 | 16 (fuente; la suite pasa) | 0 |
| train-multiclase | 30 | 30 | 0 |
| fit-member-multiclase | 7 | 7 | 0 |
| export-multiclase | 4 | 4 | 0 |
| score-multiclase | 8 | 8 | 0 |
| manifiesto multiclase | 14 | 14 | 0 |
| train-agrupar | 46 | 46 | 0 |
| fit-member-agrupar | 8 | 8 | 0 |
| export-agrupar | 8 | 8 | 0 |
| score-agrupar · con ruido · etiquetas | 8 · 2 · 4 | 8 · 2 · 4 | 0 |
| manifiesto agrupar | 14 | 14 | 0 |
| Heredadas: train 27, fit 6, progreso 5, export 6, score 5, regresión 36/6/**5**/4, manifiestos 16/12 | igual | igual | 0 (el export de regresión pasa de 4 a 5, como se declaró) |

Campos nuevos que **no tienen carnada que los nombre**:

- `reading.null_score`: su mutación se nombra `reading.gap`;
- `league[i].status`;
- `schema.assign.sample_rows`;
- el ancho p de los centroides (AU-B-07);
- `preprocessing.rare_categories` al agrupar;
- la coherencia del manifiesto de agrupar (AU-B-06).

#### Casilla 3 — dependencias

- **`@sentry/browser` 10.75.3**, dependencia directa (ADR 018):
  - es la misma versión que `@sentry/nextjs`;
  - el lockfile tiene un solo `@sentry/core@10.75.3` y la sección `packages:` es idéntica a la base;
  - las dos van con `^`, así que el lote de dependabot las mueve juntas.
- **`observability.ts` sigue importando `@sentry/nextjs`** en el cliente. Es coherente con ADR 018 (decisión 2: medido, 0 B de ahorro, y la comparte el route), y el peso real lo vigila Lighthouse. No es hallazgo.
- **Excepción de `pnpm audit`** (ADR 012, `braces`): `braces` sigue en 3.0.3 en npm, así que la condición de retiro no se cumple y la excepción sigue válida.
- **Overrides:** siguen en `pnpm-workspace.yaml`.
- **`degradaciones-permitidas.json`:** `[]`.
- Sin hallazgos de dependencias. La validación de la forma de `degradaciones-permitidas.json` va en AU-B-18.

#### Casilla 5 — campos sin consumidor

Lectores fuera del archivo que define el campo, de `contract.ts`, de `experiment.ts` y de las pruebas.

| Campo | Lectores |
| --- | --- |
| `reading.stability.ari_min` | **0: huérfano** (AU-B-09) |
| `league[].silhouette_by_k`, `bic_by_k` | solo el lector, que recalcula el k; la UI no los muestra |
| `schema.assign.centroids` / `radii` | Python (`import_model` con `expected_schema` y `_assign`) |
| `nRows`, `silhouetteSample`, `kRange`, `distance` | `ClusterResults`, `modelcard`, `model-file`, `ConfigScreen` (1 a 3 cada uno) |
| `selection.{consensusWinner, k, votes, voters, competitors, elapsedMs}` | `ClusterResults`, `modelcard`, `model-file`, `observability`, `verdict.hasConsensus` |
| `reading.{level, score, null_score, gap, stability.ari_mean, runs, fraction}` | `ClusterResults`, `modelcard`, `model-file`, `StartScreen` |
| `profiles.{groups, noise, separating.strength}`, `assignment.{method, train_agreement, sample_rows}` | `ClusterResults`, `modelcard`, `StartScreen`, `ScoreScreen` |
| `noise_share`, `sizes`, `score`, `k_by`, `error_type`, `sample_rows` | `ClusterResults`, `modelcard` |
| `MulticlassResult.{classes, confusionMatrix, perClass.*}` y las cinco métricas | `MulticlassResults`, `LeagueTable`, `ResultsScreen`, `ScoreScreen`, `StartScreen`, `modelcard`, plantillas |
| Fases de progreso `cluster` / `stability` y el comando `cluster-labels` | `TrainingScreen`, `useExperiment` |

#### Casilla 7 — cardinalidades cableadas

Lo que viene de datos está bien: `TRAIN_TASKS` sale de un `Record`, `COST_COEFFICIENTS_BY_TASK` se cierra con `satisfies`, `MANIFEST_V_BY_TASK` y `SCHEMA_V_BY_TASK` son `ByTask`, y `CLUSTER_MEMBER_IDS` alimenta el roster y los costos.

Literales donde el dato dice N:

- en el copy: «hasta 20», «cuatro tareas» y «los otros tres» (AU-B-03, Alto);
- la lista fija de los cuatro agrupadores en la model card (AU-B-04, Alto);
- `eda.ts:196`, `classes.length < 3` (AU-B-03);
- las tablas `CLUSTER_K_BY` y `CLUSTER_ASSIGN`, sin chequeo de exhaustividad (AU-B-14).

#### Casilla 8 — protecciones del sistema

**No.** Busqué en los scripts y pruebas del sprint `security`, `osascript`, `tccutil`, `launchctl`, `defaults write`, Llavero, cámara, micrófono, `getUserMedia`, `permissions`, `codesign` y certificados: sin coincidencias.

- Playwright WebKit (`scripts/spike-liga/correr.mjs:81`) no pide permisos.
- `demo-rojo.sh` usa `lsof` y `kill` sobre un puerto: no está protegido.
- `pnpm test` solo lanza `/bin/bash` (prueba del hook) y lee archivos: sin red ni hardware (regla 20 ✓).
- `pnpm test:integration` sí usa red, pero a un CDN público, no a la red local, y escribe en `node_modules`.

#### Hallazgos

##### AU-B-01 · Alto · «Tus filas con su grupo»: el saneamiento muta la tabla original y `dedupeIndex` se desalinea

- **Dónde:**
  - `src/engine/sanitize.ts:71`: `kept.push(row)` guarda el mismo arreglo, no una copia;
  - `src/engine/sanitize.ts:176`: `raw[index] = ""` muta las filas de entrada;
  - `src/engine/sanitize.ts:83-91`: `dedupeIndex` se calcula sobre filas ya mutadas;
  - `src/lib/useExperiment.ts:1190`, `:1203`: `rawTableRef.current = parsed.table` es el mismo objeto que se saneó;
  - `src/lib/useExperiment.ts:1614` y `:1049-1058`: `label(labels[i]!)` da «NaN» si `i` está fuera de rango.
- **Qué pasa:** basta una columna ≥ 90 % numérica con basura («?», «n/d»). Hay tres efectos:
  - **Celdas perdidas.** El CSV devuelve «» donde el usuario tenía «?». Eso contradice el ADR 016 §8: «la tabla del usuario tal como llegó».
  - **Grupos «NaN».** Basta un duplicado exacto de una fila con basura. La copia que queda se muta y la descartada no, así que la descartada recibe un índice nuevo. Todas las filas siguientes se corren +1 y las últimas salen con grupo «NaN».
  - **Grupos corridos en silencio.** Si dos filas solo difieren en la basura, la coerción las vuelve iguales. Cada fila posterior recibe el grupo de su vecina, sin aviso.
- **Evidencia:**
  - `probe-sanitize`: «filas originales mutadas: [3, 7]» y «filas saneadas 30 · índice de la repetida 30» (las válidas van de 0 a 29).
  - `probe-sanitize2`: «18 de 30 filas originales apuntan a OTRA fila saneada». La fila 12 `["2","36","tienda"]` apunta al índice 11, que es `["1","","web"]`.
- **Ajuste ejecutable:**
  - `src/engine/sanitize.ts:71`: `kept.push(row);` → `kept.push([...row]);`.
  - `tests/unit/sanitize.test.ts`, prueba nueva «sanitizeTable no muta la tabla de entrada»: una columna numérica con «?» en 2 de 30 filas. Clonar `rows`, sanear y comparar `parsed.rows` con el clon (`toEqual`).
  - Misma ubicación, prueba nueva «dedupeIndex cuadra con sanitizeTable también con basura coaccionada»: una fila con «?» y su duplicado exacto, más dos filas que solo difieren en «?» frente a «n/d». Exigir que `Math.max(...idx) + 1 === report.rowsAfter`, que el duplicado comparta el índice de su gemela y que las dos filas distintas tengan índices distintos.
  - `tests/unit/agrupar-ui.test.tsx` (flujo de `:617-682`): poner «?» en una numérica de la fila repetida y exigir que el CSV conserve «?» y que ninguna celda de `grupo` sea «NaN».
- **Verificado cuando:** las tres pruebas pasan y las dos sondas dan 0 filas mutadas y 0 desalineadas.
- **Demo en rojo:** `scripts/demo-rojo.sh --archivo src/engine/sanitize.ts --buscar 'kept.push([...row]);' --reemplazar 'kept.push(row);' --gate './node_modules/.bin/vitest run tests/unit/sanitize.test.ts' --debe-nombrar 'no muta la tabla de entrada' --esperar-verde './node_modules/.bin/vitest run tests/unit/sanitize.test.ts' --minimo-tests <pruebas del archivo>`.

##### AU-B-02 · Alto · HDBSCAN: con más de 2.000 filas la referencia nula vale 0 y la lectura «existen» se da sin comparar contra datos sin estructura

- **Dónde:**
  - `src/lib/ds/pipeline.py:718`: `mcs = _hdbscan_min_size(ctx["n"])`;
  - `pipeline.py:722`: el `refit` fija ese `mcs`;
  - `pipeline.py:765-785`: `_null_score` ajusta conjuntos uniformes del tamaño de la muestra (`SILHOUETTE_SAMPLE` = 2.000, `:512`);
  - `decisions/016-grouping-without-a-target.md` §5.
- **Qué pasa:** con n = 6.000 la referencia nula aplica `min_cluster_size` = 120 a 2.000 filas uniformes. HDBSCAN no encuentra ningún grupo, la nula da 0,0 y el gap queda igual al puntaje. La decisión 5 del usuario («comparar cada agrupador con lo que él mismo da sobre datos sin estructura») deja de aplicar a HDBSCAN. La bitácora (F2) registra que HDBSCAN **ganó** con 12.000 filas.
- **Evidencia** (`probeint-hdbnull.out`):

  | Datos | Puntaje | ARI | Nula del pipeline | Lectura hoy | Nula con `mcs` = 40 (la regla aplicada a 2.000 filas) | Lectura así |
  | --- | ---: | ---: | ---: | --- | ---: | --- |
  | 3 nubes, n = 6.000, sep. 1,8 (k = 2, ruido 73,6 %) | 0,133 | 0,834 | 0,0 | «existen» | 0,145 | «no hay estructura» |
  | n = 10.000 | 0,163 | — | 0,0 | «existen» | 0,142 | «no hay estructura» |
  | n = 1.500 | — | — | 0,149 | — | 0,149 | (coinciden) |

  En `probeint-hdbscan.out`, sobre 2.000 filas uniformes: con `mcs` 120 la nula da [0, 0, 0]; con 40, [0,166 · 0,174 · 0,145].
- **Ajuste ejecutable:**
  - `pipeline.py:722`: `lambda Z, seed: HDBSCAN(min_cluster_size=_hdbscan_min_size(len(Z))).fit(Z).labels_`. Así la regla max(5, n/50) se aplica a las filas que ajusta cada uso: la nula y la estabilidad. El barrido conserva el `mcs` del total.
  - ADR 016 §5 (es de este sprint): agregar «HDBSCAN aplica max(5, n/50) a las filas de cada ajuste: el barrido, la referencia nula y cada re-muestreo».
  - Regenerar fixtures con `CONTRATO_ACTUALIZAR=1` (la forma no cambia).
  - Volver a correr el e2e `agrupar` con 9.000 filas.
  - Prueba nueva en `tests/integration/agrupar.test.ts`: 3 nubes sembradas con n = 6.000 (el generador de `probeint-hdbnull.test.ts`), luego `fit_member` con `hdbscan`, y exigir `reading.null_score > 0` y que `reading.level === computeClusterReading(gap, ari)`.
  - **Decisión en llano para el usuario:** con tablas de más de 2.000 filas, HDBSCAN dejará de decir «los grupos existen» cuando no supere lo que él mismo encuentra en datos sin forma. Puede que algunas lecturas grandes pasen a «no hay estructura».
- **Verificado cuando:** la sonda da nula del pipeline ≈ nula escalada (≈ 0,14) con n = 6.000, y la prueba nueva pasa.
- **Demo en rojo:** `--archivo src/lib/ds/pipeline.py --buscar 'HDBSCAN(min_cluster_size=_hdbscan_min_size(len(Z)))' --reemplazar 'HDBSCAN(min_cluster_size=mcs)' --gate 'pnpm vitest run --config vitest.integration.config.ts tests/integration/agrupar.test.ts -t "referencia nula de HDBSCAN"' --debe-nombrar 'null_score'`.

##### AU-B-03 · Alto · Cardinalidades cableadas en el copy ES/EN y en el motor

- **Dónde:**
  - `messages/es.json` y `en.json`, línea 107, `config.target.help`: «hasta 20» / «up to 20» (es `MULTICLASS_MAX_CLASSES`);
  - línea 586, `modelcard.limits.tasks`: «cuatro tareas… hasta 20» / «four tasks… up to 20» (es `TRAIN_TASKS.length`);
  - línea 730, `roster.clusterSample`, y línea 851, `cluster.sample.why`: «los otros tres» / «the other three» (es `CLUSTER_MEMBER_IDS.length − 1`);
  - `src/engine/eda.ts:196`: `classes.length < 3` (es `MULTICLASS_MIN_CLASSES`).
- **Qué pasa:** si cambia la constante o el roster, el texto miente sin que ninguna prueba lo vea (`grep` en `tests/`: 0 coincidencias).
- **Ajuste ejecutable:**
  - `eda.ts:196`: `if (classes.length < MULTICLASS_MIN_CLASSES) return [];`, importado de `@/engine/tarea`.
  - `config.target.help`: «…varias categorías (hasta {max}, como un plan o una región)…» / «…several-category columns (up to {max}, like a plan or a region)…». En `ConfigScreen.tsx:131`, pasar `{ max: MULTICLASS_MAX_CLASSES }`.
  - `modelcard.limits.tasks`: «Esta versión hace estas tareas: la clasificación en dos categorías, la clasificación en varias categorías (hasta {max}), la estimación de una cantidad y el agrupamiento de filas sin objetivo.» / «This version does these tasks: classification into two categories, classification into several categories (up to {max}), estimating a quantity and grouping rows with no target.» En `modelcard.ts:499`, pasar `{ max }`.
  - `roster.clusterSample`: «…(los demás agrupadores usan todas).» / «…(the other clusterers use all of them).»
  - `cluster.sample.why`: «…Los demás agrupadores usan todas tus filas.» / «…The other clusterers use all your rows.»
  - Prueba nueva `tests/unit/cardinalidades.test.ts`:
    - `messages/{es,en}.json` no contienen `/\b(hasta|up to) \d+\b|cuatro tareas|four tasks|otros tres|other three/`;
    - `translate(locale, "config.target.help", { max })` contiene `String(MULTICLASS_MAX_CLASSES)`.
- **Verificado cuando:** la prueba nueva y la de paridad i18n pasan.
- **Demo en rojo:** `--archivo messages/es.json --buscar '(hasta {max}' --reemplazar '(hasta 20' --gate './node_modules/.bin/vitest run tests/unit/cardinalidades.test.ts' --debe-nombrar 'hasta 20'`.

##### AU-B-04 · Alto · La model card de agrupar nombra a los cuatro agrupadores aunque compitan menos

- **Dónde:** `src/lib/modelcard.ts:659-664`; `messages/{es,en}.json:626` (`modelcard.cluster.members`).
- **Qué pasa:** con 20.000 filas el Nivel 1 corre solo K-Means y GMM: `tests/unit/agrupar-motor.test.ts` lo exige (`big.level1 = ["kmeans","gmm"]`). La card dice «Compitieron 2 agrupadores…» y describe cuatro, entre ellos el jerárquico y HDBSCAN, que no corrieron.
- **Evidencia** (`probe-card.out`): «es - Compitieron 2 agrupadores probando de 2 a 10 grupos: K-Means y el jerárquico eligen por silueta…, GMM por BIC y HDBSCAN por densidad.» En inglés dice lo mismo.
- **Ajuste ejecutable:**
  - `members` pasa a «Compitieron {count} agrupadores probando de {min} a {max} grupos: {how}.» / «{count} clusterers competed, trying {min} to {max} groups: {how}.»
  - Claves nuevas `modelcard.cluster.kBy.silhouette` «{model} elige por silueta (sobre una muestra de {sample} filas)» / «{model} chooses by silhouette (on a sample of {sample} rows)», `.bic` «{model}, por BIC» / «{model}, by BIC», `.density` «{model}, por densidad» / «{model}, by density».
  - En `modelcard.ts:659`: `how: result.league.map((r) => t(`modelcard.cluster.kBy.${r.k_by}`, { model: short(r.name), sample: n(result.silhouetteSample) })).join("; ")`.
  - Prueba: con la liga reducida a K-Means y GMM, la línea no menciona HDBSCAN ni el jerárquico, en ES y EN.
- **Verificado cuando:** la sonda muestra solo los que compitieron.
- **Demo en rojo:** devolver el texto fijo a `members` en `es.json`; la prueba nueva cae nombrando «HDBSCAN».

##### AU-B-05 · Medio · El lector de agrupar lanza un `TypeError` en vez de nombrar el campo

- **Dónde:** `src/workers/contract.ts:985-991`. `scored.reduce` no tiene valor inicial. La llamada está en `useExperiment.ts:440`, sin `try`, dentro de `handleMessage` (`:1153`).
- **Qué pasa:** una fila de silueta que vota con todas las siluetas en null hace que el lector lance «Reduce of empty array with no initial value». La UI se queda entrenando.
- **Evidencia:** `probe-contract`: «LANZA: TypeError: Reduce of empty array…».
- **Ajuste ejecutable:**
  - `contract.ts:988`: antes del `reduce`, `if (scored.length === 0) return at("silhouette_by_k");`.
  - En `contract-agrupar.test.ts`, carnada `[`league[${km}].silhouette_by_k`, (t) => t.league[km].silhouette_by_k.forEach((x: Json) => (x.silhouette = null))]`. La lista pasa de 46 a 47.
- **Verificado cuando:** «detectó 47 de 47».
- **Demo en rojo:** quitar el guard; `--debe-nombrar 'Reduce of empty array'`.

##### AU-B-06 · Medio · El manifiesto de agrupar muestra campos que no coteja

- **Dónde:** `src/lib/model-file.ts:500-518`. Hoy solo coteja `groups`, el nivel y `selection.by`. Esos campos se muestran en `src/components/StartScreen.tsx:366-390`.
- **Qué pasa:** el resumen del import puede mostrar una regla o una cifra que no corresponden al modelo que de verdad puntúa. El esquema sí se coteja con el pickle; el manifiesto no.
- **Evidencia** (`probe-manifest.out`): el validador **ACEPTA** cada una de estas mutaciones:
  - `assignment.method` distinto de `schema.assign.method`;
  - `assignment.sample_rows` distinto del del esquema;
  - `reading.gap` + 0,01, y también `reading.score` o `reading.null_score` cambiados;
  - `selection.k = 99`;
  - `ari_min` mayor que `ari_mean`;
  - `runs = 3`.
- **Ajuste ejecutable:** tras `model-file.ts:509`, con `close` como en `contract.ts:955`, nombrar cada campo incoherente:
  - `assignment.method` y `assignment.sample_rows` contra los del esquema;
  - `reading.gap` contra `reading.score − reading.null_score`;
  - `reading.stability` si `ari_min > ari_mean`;
  - `reading.stability.runs` contra `STABILITY_RUNS` y `reading.stability.fraction` contra `STABILITY_FRACTION`;
  - `selection.consensus_winner` debe estar en la liga;
  - `selection.k` debe ser el k de alguna fila `ok`.

  Sumar 8 carnadas coherentes a la lista del manifiesto de agrupar (14 → 22).
- **Verificado cuando:** «detectó 22 de 22» y la sonda las rechaza todas.
- **Demo en rojo:** quitar el cotejo de `assignment.method`; la carnada correspondiente sale «aceptada».

##### AU-B-07 · Medio · El export de agrupar no coteja el ancho p de los centroides

- **Dónde:** `src/workers/contract.ts:1200-1206`.
- **Qué pasa:** un esquema k × (p + 1) pasa el lector. El plan pedía la forma «k × p».
- **Evidencia:** `probe-manifest.out`: «p 5, 5 numéricas, 0 categóricas; centroides k × (p+1): ACEPTADO».
- **Ajuste ejecutable:**
  - Tras `:1206`: `const p = centroids[0]!.length; if (s.categorical.length === 0 ? p !== s.numeric.length : p < s.numeric.length + s.categorical.length) return at("assign.centroids");`.
  - Carnada `["schema.assign.centroids", (e) => e.schema.assign.centroids.forEach((c: number[]) => c.push(0))]` en `export-agrupar`.
- **Verificado cuando:** «detectó 9 de 9»; serán 10 con la carnada de AU-B-13.
- **Demo en rojo:** quitar la condición; la carnada sale «aceptada».

##### AU-B-08 · Medio · La garantía P13 («las etiquetas no llegan al manifiesto por estructura») no se sostiene

- **Dónde:**
  - `src/workers/contract.ts:948-953`: `labelsField` solo mira arriba y en `league[i]`;
  - `src/lib/validate.ts:55-64`: `obj` ignora claves desconocidas;
  - `src/lib/experiment.ts:986-988`: el resultado copia `reading`, `profiles` y `assignment` enteros;
  - `src/lib/model-file.ts:692-693`: el manifiesto copia `reading` y `assignment` enteros. Es el mismo patrón que `metrics.model` en la rama multiclase.
- **Qué pasa:** hoy Python no emite nada de esto; la integración lo confirma. Pero una lista por fila con otro nombre, o un `labels` anidado, pasaría el lector y llegaría al archivo exportado.
- **Evidencia:** `probe-p13.out`:
  - `assignment.row_groups` con 300 valores: ACEPTADO y presente en el manifiesto;
  - `reading.labels`: ACEPTADO y presente.
- **Ajuste ejecutable:**
  - En `model-file.ts:692-693`, armar campo por campo: `reading: { level, score, null_score, gap, stability: { ari_mean, ari_min, runs, fraction } }` y `assignment: { method, train_agreement, sample_rows }`.
  - `labelsField` pasa a ser recursivo: devuelve la ruta de cualquier clave `labels` a cualquier profundidad.
  - Pruebas:
    - carnada `["reading.labels", (t) => (t.reading.labels = [0, 1])]`;
    - `packModelFile` con claves extra en `reading` y `assignment`: el JSON del manifiesto no las contiene.
- **Verificado cuando:** la sonda da «rechazado: reading.labels» y «row_groups» no aparece en el manifiesto.
- **Demo en rojo:** volver a `reading: cluster.reading`; la prueba de `packModelFile` cae.

##### AU-B-09 · Medio · `ari_min` no tiene consumidor, y el plan P8 promete reportar «la media y el mínimo»

- **Dónde:**
  - el tipo en `src/workers/protocol.ts:487`;
  - lo emite `pipeline.py:800`;
  - el único lector es `contract.ts:1056`;
  - el `{ariMin}` de `ClusterResults.tsx:201` y `modelcard.ts:559` es **el umbral** `CLUSTER_STABILITY_MIN`, no el mínimo medido.
- **Evidencia:** `grep ari_min|ariMin` en `src/`: solo esas líneas.
- **Ajuste ejecutable:**
  - Renombrar el parámetro del umbral a `{ariNeeded}` en `cluster.reading.existDetail` y `fragileDetail` (ES y EN) y en sus llamadas.
  - Clave nueva `cluster.reading.worst`: «En el re-muestreo más distinto se parecen en {ariWorst} de 1.» / «In the most different resample they match {ariWorst} out of 1.»
  - Mostrarla en `ClusterResults` junto a la lectura y en la model card, con `two(reading.stability.ari_min)`.
  - Prueba en `agrupar-ui` que la exija.
- **Verificado cuando:** la cifra aparece en pantalla y en la card, en los dos idiomas.
- **Demo en rojo:** quitar la línea; la prueba nueva cae.

##### AU-B-10 · Medio · La prueba «la fuga se mide SOLO en train» no puede fallar por lo que su nombre promete

- **Dónde:** `tests/unit/multiclase-motor.test.ts:246-251`.
- **Qué pasa:** si `experiment.ts:399-402` midiera la fuga con todas las filas, la prueba seguiría verde: la columna plantada delata en todas. Ninguna prueba del repo cubre que la fuga se mida solo en train (`experiment.test.ts:181` solo mira presencia).
- **Ajuste ejecutable:** prueba nueva.
  1. Correr `prepareRun` una vez para obtener `train_idx` y `test_idx` con la semilla 42.
  2. Armar la tabla con una columna `x` que vale el código de la clase en las filas de train y es azar en las de prueba.
  3. Exigir que la fuga marque `x`.
  4. Una columna `y` perfecta solo en prueba no se marca.

  Renombrar la prueba vieja a «nombra la columna y la clase».
- **Verificado cuando:** la prueba nueva pasa.
- **Demo en rojo:** `--archivo src/lib/experiment.ts --buscar 'leakageColumns(table, rows, numeric, categorical, trainIdx),\n    trainLabels' --reemplazar 'leakageColumns(table, rows, numeric, categorical, rows.map((_, i) => i)),\n    trainLabels'` (dos líneas; el script lo admite).

##### AU-B-11 · Medio · `demo-rojo.sh` cuenta como rojo un gate muerto por una señal

Coincide con AC-12.

- **Dónde:** `scripts/demo-rojo.sh:91-99`. Solo descarta los exit 126 y 127. La regla 11 de `CLAUDE.md` dice que una señal no cuenta como rojo.
- **Evidencia:** un gate `echo GATE-NOMBRA-ESTO; kill -9 $$` sale con «✓ el gate falló… y nombró», con exit 0.
- **Observación:** `--debe-nombrar` también encuentra su texto en el code frame que imprime vitest.
- **Ajuste ejecutable:**
  - Tras `:99`: `if [ "$rc" -ge 128 ]; then echo "demo-rojo: ✗ el gate murió por una señal ($((rc - 128))) — eso no es un rojo" >&2; restaurar; exit 1; fi`.
  - Actualizar el encabezado del script.
- **Verificado / demo:** el mismo comando de la sonda sale con exit 1.

##### AU-B-12 · Medio · La prueba del hook que bloquea la carnada nunca corre en la CI

Coincide con AC-27.

- **Dónde:** `tests/unit/hook-secretos.test.ts:62` (`it.runIf(hayHerramientas)`) y `.github/workflows/ci.yml:20-27`: gitleaks queda en `$RUNNER_TEMP`, fuera del `PATH`.
- **Evidencia:** en el log de `quality` del run 37402379813: «3 tests | 1 skipped».
- **Ajuste ejecutable:** tras el `tar` de `ci.yml:25`, agregar `echo "$RUNNER_TEMP" >> "$GITHUB_PATH"` (`jq` ya viene en ubuntu-latest).
- **Verificado cuando:** `quality` dice «675 passed», sin «skipped».
- **Demo en rojo:** en el hook, cambiar el `exit 2` de «SECRET DETECTADO en el contenido» por `exit 0`; la prueba cae, también en la CI.

##### AU-B-13 · Bajo · Faltan carnadas, o la carnada nombra otro campo (regla 15)

- **Dónde:** `tests/unit/contract-agrupar.test.ts:92-229`; `contract.ts:1050-1051` (una mutación de `null_score` se nombra `reading.gap`).
- **Ajuste ejecutable:** agregar estas carnadas. La de la liga pasa de 46 a 49 y la del export suma una.
  - `["reading.null_score", (t) => (t.reading.null_score = 2)]`;
  - `[`league[${km}].status`, (t) => (t.league[km].status = "zzz")]`;
  - `["preprocessing.rare_categories", (t) => (t.preprocessing.rare_categories = [])]`;
  - en el export, `["schema.assign.sample_rows", (e) => (e.schema.assign.sample_rows = 0)]`.
- **Verificado cuando:** las cuentas nuevas en «detectó k de n».

##### AU-B-14 · Bajo · `CLUSTER_K_BY` y `CLUSTER_ASSIGN` no exigen un valor por agrupador, y `clusterId` hace un cast sin chequeo

- **Dónde:** `src/workers/contract.ts:920-933`.
- **Ajuste ejecutable:** `as const satisfies Record<ClusterMemberId, ClusterKBy>`, y lo mismo con `ClusterAssignMethod`. `type ClusterId = ClusterMemberId`.
- **Demo en rojo:** agregar `"spectral"` a `CLUSTER_MEMBER_IDS` (`roster.ts:54`); `pnpm typecheck` cae nombrando `contract.ts`.

##### AU-B-15 · Bajo · El tripwire del despacho no ve comparaciones contra constantes

- **Dónde:** `tests/unit/despacho.test.ts:128-137`. Los sitios `raw.task !== CLUSTER_TASK` de `contract.ts:1110`, `:1167` y `:1230` se movieron a la constante para esquivarlo, según la bitácora de la F2.
- **Ajuste ejecutable:** regla `{ rule: "comparación con constante", re: /[!=]==\s*CLUSTER_TASK\b/ }`, y los tres sitios en `ALLOWED` con la razón «coteja la etiqueta de un resultado de agrupar».
- **Demo en rojo:** agregar `if (r.task === CLUSTER_TASK)` en `modelcard.ts`; la prueba cae nombrando el archivo y la línea.

##### AU-B-16 · Bajo · El orden de las clases no es el de Python en dos sitios

- **Dónde:** `src/engine/leakage.ts:228` (`.sort()`) y `src/engine/eda.ts:195`. El resto de la app usa `byCodePoint` (`experiment.ts:345`).
- **Qué pasa:** cuando hay empate, la clase que se nombra puede ser otra para nombres fuera del plano básico.
- **Ajuste ejecutable:** mover `byCodePoint` a `src/engine/` y usarlo en los dos sitios. Prueba: un empate entre un emoji y «ﬀ».

##### AU-B-17 · Bajo · HDBSCAN con menos de 5 filas sale como «error» y no como «sin estructura»

- **Dónde:** `pipeline.py:713-723`. `clusterKCap` admite n = 4.
- **Evidencia:** `probeint-hdbscan.out`: «4 filas: hdbscan error ValueError».
- **Ajuste ejecutable:** al inicio de `_sweep_hdbscan`: `if ctx["n"] < mcs:` poner `status="no-structure"`, `k=0`, `sizes=[]` y `noise_share=1.0`, y devolver `{"row": row}`. Prueba de integración con 4 filas.

##### AU-B-18 · Bajo · `verificar-dependencias`: una aserción condicional y entradas sin `razon` aceptadas

- **Dónde:** `tests/unit/verificar-dependencias.test.ts:67-75` y `scripts/verificar-dependencias.mjs:156-158`.
- **Ajuste ejecutable:**
  - En la prueba, `expect(r.ilegible).toBeUndefined();` antes del `if`.
  - En `principal()`, rechazar con exit 1, nombrando el índice, toda entrada sin `nombre`, `de`, `a` o `razon` de tipo texto.

##### AU-B-19 · Bajo · La constitución dice que la copia de `pipeline.py` está «vigilada por test», y no hay tal prueba

Coincide con AC-18.

- **Dónde:** la estructura de `CLAUDE.md`. La copia la regenera `scripts/copy-pyodide.mjs:61-63`; `public/pyodide/` está en `.gitignore`.
- **Ajuste ejecutable:** registrarlo como deriva en el summary y en la bitácora (`## Desviación del plan`), con la redacción propuesta para la planeadora: «copia generada en predev/prebuild desde la fuente única». `CLAUDE.md` no se edita.

##### AU-B-20 · Bajo · El plan (R9) pedía extender la prueba del breadcrumb `probeta.league` a las tareas nuevas, y no se tocó

- **Dónde:** `tests/unit/observability.test.ts:35-63`. Sin cambios en el diff.
- **Ajuste ejecutable:** `it.each(["multiclase", "agrupar"])`, exigiendo que `Object.keys(data).sort()` sean exactamente los 7 campos.
- **Demo en rojo:** agregar `classes: 0` a `data` en `observability.ts:85`.

#### git status final

```
 M sprints/SPRINT_007-implementation-log.md
```

Esa modificación **no es mía**: son 3 líneas de la CI de `e6cf659`, escritas por otra sesión. La misma sesión comiteó `fec1a29` durante la auditoría.

- No escribí ni moví nada en el repo ni en la planeadora.
- `next-env.d.ts` no cambió.
- No quedó `.demo-rojo/` en el repo: la demo corrió en el scratchpad.

Todas las sondas y sus salidas están en `/private/tmp/claude-501/-Users-henryrincon-Code-app-ds/a3a1a067-2ff2-4cdd-8e29-1f09f53b4bcb/scratchpad/auditoria-b/`.


## Anexo · Auditor C — UI, hooks, i18n, a11y y privacidad del cliente

### Auditoría S7 · Auditor C: UI, hooks, i18n, accesibilidad y privacidad del cliente

No toqué ningún archivo del repo. Las sondas viven solo en `/private/tmp/claude-501/-Users-henryrincon-Code-app-ds/a3a1a067-2ff2-4cdd-8e29-1f09f53b4bcb/scratchpad/auditoria-c/`: `sondas.test.tsx`, `vitest.config.ts`, `keys.py` y un enlace `node_modules` hacia el repo.

#### Corridas

| # | Comando | Resultado |
|---|---|---|
| 1 | `git log --oneline 6f50c43..HEAD`; `git diff --stat` | 20 commits; 160 archivos, +38.154/−1.439. Mi superficie: 64 archivos, +9.024/−638 |
| 2 | `vitest run` (agrupar-ui, multiclase-ui, league-ui, components, portada-liviana, sentry-cliente, use-hooks, start-import, regresion-ui, modelos) `--coverage.enabled=false` | 10 archivos, **183 de 183** |
| 3 | `vitest run` (i18n-parity, narration-templates, modelcard, observability, sentry-scrub, score-screen, ficha-level2, error-copy, narrate-route, eda) `--coverage.enabled=false` | 10 archivos, **93 de 93** |
| 4 | `python3 keys.py`: paridad, claves nuevas, claves usadas | ES↔EN: 0 faltantes en cada lado. 188 claves nuevas, todas referenciadas. 2 retiradas (`errors.target-not-binary`, `task.notYet`). 0 claves literales de `t()` sin entrada |
| 5 | Script de contraste WCAG sobre los tokens de `globals.css` (combinaciones nuevas) | Mínimo 4,55:1 (`positive` sobre `positive/10`, claro). Todas ≥ AA en los dos temas |
| 6 | `vitest run --config scratchpad/.../vitest.config.ts` (10 sondas) | **10 de 10 pasan**: cada una confirma la conducta que describe su hallazgo (S1–S10, abajo) |
| 7 | `grep` de comparaciones de tarea fuera de `despacho.ts` | 10 coincidencias, todas sobre la detección `Task` («ambigua», «sin-objetivo») o guardas genéricas. Ninguna sobre una `TrainTask` |
| 8 | `gh pr checks 19` (dos veces); `gh run list --branch …` | Primera: 5 `pass` y e2e `pending`. Segunda: **6 de 6 `pass`** (run 37402379813, e2e en 12 min 43 s). Las 5 corridas anteriores, `success` |
| 9 | `git status --short` | Ver la última sección |

No corrí Playwright, `pnpm build` ni `pnpm <script>`.

#### Casilla 2 — calidad

**Lo que resistió:**
- **Privacidad.**
  - Ningún campo del contrato que va a Sentry lleva un valor del usuario: `dict()` nombra `*` y no la clave (`validate.ts:72`); el campo que manda Python pasa por `[A-Za-z_]+` (`contract.ts:1275`).
  - `probeta.league` mantiene sus 7 campos.
  - Las etiquetas por fila nunca entran al estado: hay un test que lo afirma, y `cluster-labels` no reporta nada.
  - El único `localStorage` es el idioma. Los `title`/`aria-label` con nombres de clase quedan fuera de Sentry porque `scrubSentryEvent` solo deja pasar breadcrumbs `probeta.*`.
  - La narración hace 0 peticiones: en varias categorías hay un espía de `fetch` y la rama devuelve `null`; agrupar ni monta `useNarration`; el e2e lo verifica en las dos.
- **Máquina de estados.**
  - «Volver al ganador» devuelve `by: "consensus"`, y «por puntaje» se decide por `votes`, así que no se pierde.
  - `dedupeIndex` sigue la firma y el orden de `dedupeRows`, y el dedup ocurre antes de apartar columnas: el CSV con la tabla original cuadra.
  - `clusterScoringSchema` no exige las categóricas que solo describen.
  - El esquema se actualiza tras elegir y tras el Nivel 2.
  - Cancelar con la instantánea pendiente no reinicia el worker y conserva el modelo.
  - El valor de la opción «agrupar» no choca con una columna llamada igual.
- **Accesibilidad.** Botones ≥ 44 px con icono; regiones desplazables enfocables y con nombre; el diálogo es nativo y devuelve el foco; ◆ solo para «elegido por ti».

**Lo que no resistió** (detalle en Hallazgos):
- Copy falso en tareas nuevas: AU-C-01 a AU-C-04 y AU-C-07.
- Foco perdido: AU-C-05 y AU-C-17.
- Pantallas dinámicas sin carga ni límite de error: AU-C-06.
- Recorte de nombres en móvil: AU-C-08.
- Controles sin pasada de interacción: AU-C-09.
- Tests débiles: AU-C-18.

#### a11y y color

- **Símbolos.** ● existen, ⚠ frágiles, ○ sin estructura o «fuera de todo grupo» (mismo sentido, «sin grupo»), ★ ganador, ◆ elegido, ✓ acierto en la diagonal con «acierto:» en `sr-only`. No hay dos significados sobre el mismo símbolo. Color nunca solo.
- **Contraste.** AA en los dos temas (corrida 5). La columna fija de la matriz tiene fondo `surface` opaco: 6,24:1 (claro) y 6,92:1 (oscuro).
- **Títulos.** Un solo `h1` por pantalla; h2 y h3 en orden. `aria-live` correcto en entrenamiento y puntuar.
- **Fallas:**
  - Foco tras «agrupar en su lugar» (AU-C-05) y tras «Elegir» (AU-C-17).
  - Nombre accesible falso de la barra de progreso al agrupar (AU-C-03).
  - Nombres de clase disponibles solo en `title`, inaccesible en táctil (AU-C-08).

#### i18n y cifras

- **Paridad:** 0 diferencias; las 188 claves nuevas están en los dos idiomas.
- **Inglés:** escrito, no traducido literal, salvo «Real ↓» y «the real category» (el binario dice «Actual»), «the smaller one» con K clases y comillas mezcladas (AU-C-15).
- **Cifras R9:**
  - En español, el NBSP antes de «%» se cumple en las claves nuevas; el inglés va sin espacio, que es la convención de la casa.
  - Fallas: ` %` fijo también en inglés en la tabla, espacio normal en la model card, conteos sin miles en la matriz, la tabla por categoría, la model card y los mosaicos de puntuar (AU-C-11).
- **Plurales:** AU-C-12.
- **Literales fuera de i18n:** solo el formato de los mosaicos (`${count} (${pct}%)`) y las comillas `«»` fijas.

#### Casilla 4 — copy de la UI

| Coincidencia | Archivo:línea (es/en) | ¿Cierta hoy? |
|---|---|---|
| «esta versión no abre» | es/en.json:93 `start.import.errors.unsupported-task` | Sí: una tarea desconocida se rechaza |
| «En esta versión no se usan para dividir por tiempo» | es/en.json:119 `config.warnings.date` | Sí (heredada) |
| «No se puede puntuar» | es.json:356 | Sí |
| «aún no se usan (sin partición temporal)» / «not used yet» | es/en.json:585 `modelcard.limits.dates`; **el S7 la suma a la card de agrupar** (`modelcard.ts:743`) | Promesa aplazada, y la partición no aplica al agrupar → **AU-C-14** |
| «Esta versión hace cuatro tareas» | es/en.json:586 | Sí |
| «no se pueden comparar», «no se puede saber» | es.json:683, 692 | Sí |
| «podrás correr la liga completa» | es.json:714 | Sí (Level2Card en Resultados) |
| «podrás incluirlo de todos modos en el Nivel 2» | es.json:725 | Sí con objetivo; al agrupar no se muestra |
| «podrás agrupar con todos» | es.json:736 | Sí |
| «later, if you want» | en.json:713, 727, 734, 735 | Sí |
| «vuelves a este resultado sin perder nada» | es/en.json:809 | **Falso al agrupar** → AU-C-04 |
| «usa AUC» con varias categorías | es/en.json:140 | **Falso** → AU-C-01 |
| «predice el objetivo casi a la perfección» con fuga por clase | es/en.json:136 | **Exagera** → AU-C-01 |
| «el veredicto se mide con AUC o F1» (ficha mayoritaria, multiclase) | modelos.ts:369-370 | **Falso** → AU-C-02 |
| «puesto N de M por validación cruzada» / «no concluyó» al agrupar | es/en.json:790-791 | **Falso** → AU-C-03 |
| «Métricas casi perfectas» con la alarma en una sola columna | es/en.json (`results.verdict.suspicious`) | **Engaña** → AU-C-07 |
| «decide la clase… ordenar las filas por riesgo» con varias categorías | es/en.json:400 | Encuadre binario → AU-C-14 |

En los literales de componentes no hay promesas aplazadas.

#### Casilla 5 — lado UI

- **Calculado y nunca dibujado:**
  - `reading.stability.ari_min` (`protocol.ts:487`; el plan P8 pide la media y el mínimo).
  - `ClusterResult.rareCategories` (`experiment.ts:989`, `:1013`) no llega a `buildClusterCard`.
  - `EdaAlert.class` del aviso de fuga con varias categorías no se muestra en ningún lado; el de desbalance solo en «En palabras».
- **Claves inalcanzables:**
  - `level2.cluster.descAllRan` y `level2.cluster.nothingToAdd` (es.json:827, 831): al agrupar nadie queda «fuera» (`encarrilador.ts:120-131`), así que la tarjeta nunca las muestra. Además prometen «incluir los que el encarrilador dejó fuera».
  - `score.groups.title_one` (es.json:418): falta `count` en `ScoreScreen.tsx:794`.
- **Claves usadas sin entrada:** 0.

#### Regla 17 — controles e interacción

`capturas-s7.mjs` activa:
- la ficha de la logística balanceada;
- «Ver las otras columnas»;
- «Elegir» GMM y «Volver al ganador» al agrupar;
- la ficha del ganador por consenso;
- la descarga de filas con su grupo;
- el Nivel 2 al agrupar (9.000 filas);
- English;
- «Agrupar filas parecidas en su lugar».

Los e2e suman exportar, importar y puntuar en las dos tareas, y «Cambiar la respuesta».

**Sin activar en ningún lado** (AU-C-09):
- «Elegir» y «Volver al ganador» con varias categorías.
- El Nivel 2 con varias categorías y sus casillas «Incluir de todos modos».
- «Cancelar el Nivel 2» al agrupar.
- La ficha de un agrupador que no ganó: escondía AU-C-03.
- Las fichas de los baselines en `MulticlassDetail`: escondían AU-C-02.
- «Descargar la model card» de las dos tareas nuevas.
- «Ver puntajes de prueba» con varias categorías.
- Los estados `error` y `unavailable` de la descarga de etiquetas (solo se prueban por prop).

#### Hallazgos

##### AU-C-01 · Medio · Configuración con varias categorías: el desbalance dice «usa AUC» y ni el desbalance ni la fuga nombran la categoría
- **Dónde:** `src/components/ConfigScreen.tsx:406-419` (EdaBlock); `messages/es.json:136,140`, `messages/en.json:136,140`; la clase se calcula en `src/engine/eda.ts:205-223`.
- **Qué pasa:**
  - Ejemplo de la portada «Clientes (sucio)», objetivo `canal` (varias categorías, la más chica × K < 0,30): el aviso dice «El veredicto lo tiene en cuenta (usa AUC)». El veredicto usa la exactitud balanceada.
  - Con `planes-fuga-plantada.csv`, el aviso previo dice «predice el objetivo casi a la perfección» sin nombrar la categoría. Resultados ya lo corrigió con `findingClass`.
- **Evidencia:** sondas S1 y S2 en verde: el texto contiene «usa AUC» y no contiene `alert.class`.
- **Ajuste:**
  - En EdaBlock, si `alert.class !== undefined`, usar dos claves nuevas.
  - `config.eda.imbalanceMulticlass`
    - ES: «La categoría más chica, «{class}», es el {rate} % de las filas. El veredicto usa la exactitud balanceada, que pesa igual cada categoría.»
    - EN: «The smallest category, “{class}”, is {rate}% of the rows. The verdict uses balanced accuracy, which weighs every category equally.»
  - `config.eda.possible-leak-class`
    - ES: «La columna «{column}» separa casi a la perfección la categoría «{class}» del resto: podría ser una fuga (un dato que no tendrías al predecir de verdad). Si es el caso, quítala de tu CSV y vuelve a cargarlo.»
    - EN: «The column “{column}” separates the category “{class}” from the rest almost perfectly: it could be a leak (data you wouldn't have at real prediction time). If so, remove it from your CSV and load it again.»
- **Verificado cuando:** un test en `multiclase-ui.test.tsx` monta ConfigScreen con `computeEdaAlerts` real (clientes-sucio→`canal` y planes-fuga-plantada→`plan`) y exige el nombre de la clase y la ausencia de `/AUC/`.
- **Demo en rojo:** devolver la rama de clase a `t("config.eda.imbalance", …)` → el test cae nombrando «usa AUC».

##### AU-C-02 · Medio · La ficha «Clase mayoritaria» con varias categorías dice «el veredicto se mide con AUC o F1»
- **Dónde:** `src/content/modelos.ts:364-371` (`notFor`/`watch` de `majority`), `:594-596` (`MULTICLASS_FICHA_FIELDS` tipado por `BinaryMemberId`, que no admite `majority`); `src/components/FichaModelo.tsx:99-108`; el botón está en `src/components/MulticlassResults.tsx:166-183`; el test `multiclase-ui.test.tsx:324` solo recorre esas claves.
- **Qué pasa:** en Resultados con varias categorías, «Clase mayoritaria» abre una ficha con un método falso («AUC o F1») y un ejemplo binario («si el 90 % es «no»»).
- **Evidencia:** sonda S10 en verde.
- **Ajuste:** tipar como `BinaryMemberId | "majority"` y sumar la entrada `majority`.
  - `watch`
    - ES: «Con categorías desequilibradas su exactitud parece alta (si el 60 % es «básico», acierta el 60 %). Por eso el veredicto se mide con la exactitud balanceada, que con K categorías le da 1/K.»
    - EN: «With imbalanced categories its accuracy looks high (if 60% are “basic”, it is right 60% of the time). That is why the verdict uses balanced accuracy, which gives it 1/K with K categories.»
  - `notFor`
    - ES: «Usarlo como modelo: solo predice la categoría más frecuente y nunca acierta ninguna otra.»
    - EN: «Actual use: it only predicts the most common category and never gets any other right.»
  - Extender el `it.each` con `majority` y `status: baseline`, y la regex con `/AUC o F1|AUC or F1/`.
- **Verificado cuando:** la ficha multiclase de `majority` no contiene AUC, en ES y en EN.
- **Demo en rojo:** quitar la entrada `majority` → el test cae nombrando «AUC o F1».

##### AU-C-03 · Medio · Al agrupar sobreviven tres textos de validación cruzada o «liga»
- **Dónde:**
  - (a) `src/components/ClusterResults.tsx:641-655`: pasa `competitor`/`failed` → `messages/es.json:790-791` («puesto N de M por validación cruzada»; «no concluyó» incluso para «no encontró dos grupos»).
  - (b) `src/components/TrainingScreen.tsx:110`: `aria-label={t("training.training")}` = «Compitiendo con validación cruzada; al final se abre el conjunto de prueba…».
  - (c) `src/lib/modelcard.ts:691-696`: la card de agrupar usa `modelcard.selection.smallSample` («los puntajes de validación cruzada varían…») y `selection.time` («Tiempo de la liga»).
- **Qué pasa:** el gate existente (`agrupar-ui.test.tsx:727-815`) no abre la ficha de un no ganador, lee `textContent` y no el nombre accesible, y no arma la card con muestra pequeña. Su regex ya contiene «puntajes de validación cruzada».
- **Evidencia:** sondas S3, S4 y S6 en verde.
- **Ajuste:**
  - (a) Dos estados nuevos `clusterCompetitor` y `clusterNoGroups`.
    - ES: «En esta comparación: puesto {rank} de {total} por puntaje.» / «En esta comparación: no encontró dos grupos, así que no tiene puntaje.»
    - EN: «In this comparison: ranked {rank} of {total} by score.» / «In this comparison: it did not find two groups, so it has no score.»
  - (b) `aria-label={t(cluster ? "training.clustering" : "training.training")}`.
  - (c) Usar `roster.cluster.smallSample` con `rows: result.nRows` y `cluster.league.time`.
- **Verificado cuando:** el `describe` de `:727` arma la card con `smallSample: true`, monta TrainingScreen con `detail` (fase `cluster`) y FichaModelo con un competidor y uno sin grupos, y exige `not.toMatch` sobre `FALSE_FOR_CLUSTER` + `/por validación cruzada|conjunto de prueba|no concluyó/`.
- **Demo en rojo:** restaurar `modelcard.selection.smallSample` en `modelcard.ts:695` → cae nombrando «puntajes de validación cruzada».

##### AU-C-04 · Medio · «Vuelves a este resultado sin perder nada» es falso al agrupar
- **Dónde:** `src/components/Level2Card.tsx:156` y `TrainingScreen.tsx:128` (`level2.cancelHint`, es/en.json:809); `src/lib/useExperiment.ts:681-692` (restaura importando la instantánea) y `:841-850`; `src/lib/ds/pipeline.py:2069` (`_CLUSTER_LABELS = None` al importar); `messages/es.json:915` (`unavailable` solo menciona cancelar).
- **Qué pasa:** al cancelar el Nivel 2 al agrupar (o si falla, o si el worker muere), «Descargar filas con su grupo» responde `unavailable`. Se perdió algo, y el aviso culpa solo a «cancelar».
- **Evidencia:** la cadena del código citado; la copy `unavailable` lo admite.
- **Ajuste:**
  - `level2.cluster.cancelHint`, usada en Level2Card (`key("cancelHint")`) y en TrainingScreen cuando `cluster`:
    - ES: «Puedes cancelar mientras corre: vuelves a este resultado. Para descargar tus filas con su grupo después de cancelar, hay que volver a agrupar.»
    - EN: «You can cancel while it runs: you come back to this result. To download your rows with their group after cancelling, you need to group again.»
  - `cluster.labels.unavailable`:
    - ES: «El modelo activo ya no guarda el grupo de tus filas: se recuperó del Nivel 2 que se canceló o no terminó. Vuelve a agrupar para descargarlas.»
    - EN: «The active model no longer keeps your rows' groups: it was recovered from a Level 2 that was cancelled or didn't finish. Group again to download them.»
- **Verificado cuando:** un test de hook con FakeWorker hace agrupar → Nivel 2 → cancelar → descargar y queda en `unavailable`; y ni Level2Card ni TrainingScreen al agrupar contienen «sin perder nada».
- **Demo en rojo:** sumar «sin perder nada» a `FALSE_FOR_CLUSTER` y revertir la clave → cae.

##### AU-C-05 · Medio · «Agrupar filas parecidas en su lugar» deja el foco en `<body>`
- **Dónde:** `src/components/TaskCard.tsx:268-279`; `src/components/ConfigScreen.tsx:69-73,150-152`. El test `agrupar-ui.test.tsx:501` dice cubrirlo en su título, pero no pulsa el botón.
- **Qué pasa:** el botón desmonta la TaskCard y el foco cae a `<body>`. Es lo mismo que AU-S6-04 corrigió para «responder».
- **Evidencia:** sonda S8 en verde: `document.activeElement === document.body`.
- **Ajuste:** un estado `focusPlan` que se activa solo por esa vía; el `h2` de ClusterPlanCard recibe `ref` + `tabIndex={-1}` y `.focus()` en un efecto. Renombrar o completar el test de `:501`.
- **Verificado cuando:** tras el clic, el foco está en el título «Agrupar filas parecidas, sin objetivo».
- **Demo en rojo:** quitar el `.focus()` → el test cae nombrando el título.

##### AU-C-06 · Medio · Pantallas con `next/dynamic` sin estado de carga ni límite de error
- **Dónde:** `src/app/page.tsx:16-31`; no hay `src/app/error.tsx`.
- **Qué pasa:** entre fases (al elegir un ejemplo, al terminar de entrenar, al importar) `<main>` queda vacío hasta que llega el chunk, sin aviso para el lector. Si el chunk falla (sin red, o un despliegue nuevo invalida los hashes) la app cae sin mensaje. Antes del S7 estas pantallas no eran dinámicas.
- **Ajuste:**
  - `loading` con `<p role="status">` y la clave `common.loading`: ES «Cargando…», EN «Loading…».
  - `src/app/error.tsx` (cliente) con `errors.chunk` y botón `retry`:
    - ES: «No se pudo cargar esta parte de la app. Revisa tu conexión y vuelve a intentarlo; tus datos siguen solo en este navegador.»
    - EN: «This part of the app couldn't load. Check your connection and try again; your data stays only in this browser.»
- **Verificado cuando:** un test mockea `@/components/ResultsScreen` con un `import()` que rechaza y ve el texto de error; otro ve `role=status` mientras el `import()` está pendiente.
- **Demo en rojo:** quitar `loading` → cae el test del estado pendiente.

##### AU-C-07 · Medio · «Métricas casi perfectas — sospechoso» cuando la alarma es una columna medida solo donde tiene valor
- **Dónde:** `src/components/VerdictCard.tsx:40-58`; `src/components/ResultsScreen.tsx:360-361`; `src/components/RegressionResults.tsx:45-46`; `src/engine/leakage.ts:166-181` (solo filas con valor).
- **Qué pasa:** binaria con una columna que solo tiene valor en el 20 % de las filas y separa perfecto ahí: `detectLeakage` la marca y el titular dice «Métricas casi perfectas», con AUC 0,80. El S7 lo corrigió solo para varias categorías. Es heredado y afecta también a la regresión (|Spearman|).
- **Evidencia:** sonda S9 en verde.
- **Ajuste:** clave nueva `results.verdict.suspiciousColumn` (+ `Detail`) para todas las tareas, y «Métricas casi perfectas» solo si la métrica primaria del modelo es ≥ 0,98 (AUC en la binaria, R² en la regresión).
  - ES: «Posible fuga de datos — sospechoso» / «Una columna predice el objetivo casi a la perfección en las filas donde tiene valor. Las cifras de abajo pueden estar infladas aunque no parezcan perfectas.»
  - EN: «Possible data leak — suspicious» / «A column predicts the target almost perfectly on the rows where it has a value. The figures below may be inflated even if they don't look perfect.»
- **Verificado cuando:** la sonda S9 pasa a exigir el titular de columna, y el caso de `credito-fuga-plantada` conserva «Métricas casi perfectas».
- **Demo en rojo:** forzar `kind = "metrics"` → cae.

##### AU-C-08 · Medio · Nombres de categoría recortados con `title` como única vía en táctil
- **Dónde:** `src/components/MulticlassResults.tsx:247` (7 rem), `:261-266` (6 rem en móvil), `:364-369` (10 rem); `design-system.md:335`. El e2e R10 solo comprueba que exista `title`.
- **Qué pasa:** en un teléfono no hay hover. «suscripcion_premium_mensual» y «suscripcion_premium_anual» se ven iguales («suscripcion_p…») en filas, columnas y la tabla por categoría.
- **Ajuste:** en las cabeceras de fila y en PerClassTable, `break-words` en lugar de `truncate` (manteniendo `max-w`). En las cabeceras de columna, anteponer el número de fila (`1·`, `2·`…) en ambas cabeceras.
- **Verificado cuando:** el e2e R10 en móvil exige que el span del nombre largo no recorte (`scrollWidth ≤ clientWidth`) y que la página siga sin desplazarse de lado.
- **Demo en rojo:** devolver `truncate` → cae.

##### AU-C-09 · Medio · Regla 17: controles nuevos que ninguna pasada activa
- **Dónde:** `scripts/capturas-s7.mjs` (lista en la sección «Regla 17»).
- **Qué pasa:** dos de esos controles escondían AU-C-02 y AU-C-03.
- **Ajuste:** sumar `interact()` para cada control de la lista y un e2e de «Elegir» con varias categorías.
- **Verificado cuando:** el reporte del arnés lista cada control con «OK interacción».

##### AU-C-10 · Medio · La model card de agrupar imprime las medias con 2 decimales fijos: ~1e-11 sale «0.00»
- **Dónde:** `src/lib/modelcard.ts:584`; contradice `design-system.md:349-351`. La pantalla usa `profileNumber` (`ClusterResults.tsx:50-55`).
- **Evidencia:** sonda S6, la línea «Grupo 1» contiene `«col» 0.00`.
- **Ajuste:** mover `profileNumber` a `src/lib/quantity.ts` y usarlo en la card con `quantityDecimals` por columna.
- **Verificado cuando:** la card con 1.2e-11 muestra «1.20e-11».
- **Demo en rojo:** volver a `formatQuantity(value, 2)` → cae.

##### AU-C-11 · Bajo · R9: conteos sin separador de miles y espacios antes de unidad
- **Dónde:**
  - Sin miles: `MulticlassResults.tsx:153,287,374`; `modelcard.ts:114-118,181,188,196-200,267-271`; `ScoreScreen.tsx:539,801,807`.
  - Espacios: `ClusterResults.tsx:495` (NBSP también en inglés, mientras la prosa en inglés dice «12%»); `modelcard.ts:575,587` (espacio normal); es/en.json:905 `cluster.league.time` (espacio normal); es.json:515 `{rate}%` sin NBSP.
- **Evidencia:** sonda S7 (`1800` en la matriz). La bitácora afirma «separador de miles en toda la app».
- **Ajuste:** `thousands()` en cada conteo citado; `pct` + `%` según el idioma (una clave `common.percent`: ES `{n} %` con NBSP, EN `{n}%`); NBSP en `cluster.league.time` y en `narration.template.multiclass.imbalance` (ES).
- **Verificado cuando:** un test de ConfusionTable y de la model card con 1.800 filas lee «1,800».

##### AU-C-12 · Bajo · Plurales
- **Dónde:** `ScoreScreen.tsx:794` sin `count` (y es.json:418 `_one` inalcanzable); es/en.json:662 «fila(s)» / «row(s)»; es/en.json:862 `cluster.profiles.size` («1 filas»); es/en.json:86 `clusterWinner` sin `_one`.
- **Evidencia:** sonda S5 («Grupos asignados (1 filas)»).
- **Ajuste:** pasar `count: total`; sumar `_one`:
  - ES: «La categoría «{class}» tiene solo 1 fila…» / «{size} fila · {share} %» / «Ganador entre 1 agrupador ({k} grupos).»
  - EN: «…has only 1 row…» / «{size} row · {share}%» / «Winner among 1 clusterer ({k} groups).»
- **Verificado cuando:** los tests con 1 fila leen el singular.

##### AU-C-13 · Bajo · Calculado y no dibujado; copy muerta
- **Dónde:** `protocol.ts:487` (`ari_min`); `experiment.ts:989,1013` → `buildClusterCard` sin `rareCategories`; es/en.json:827,831.
- **Ajuste:**
  - Sumar el mínimo al detalle de la lectura: ES «… (la peor repetición: {ariMinRun})», EN «… (the worst repeat: {ariMinRun})».
  - Sumar `modelcard.method.rareCategories` a la card de agrupar.
  - Borrar `level2.cluster.descAllRan` y `nothingToAdd`, o un test que pruebe que son alcanzables.
- **Verificado cuando:** la card y la lectura muestran las dos cifras.

##### AU-C-14 · Bajo · Copy heredada que no aplica a las tareas nuevas
- **Dónde:** `modelcard.ts:743` (`limits.dates` en la card de agrupar: «aún no se usan (sin partición temporal)»); es/en.json:400 `score.noProbabilities` con varias categorías («ordenar las filas por riesgo»).
- **Ajuste:**
  - `modelcard.cluster.limits.dates`:
    - ES: «Las columnas de fecha no entran al parecido: se listan arriba con su razón.»
    - EN: «Date columns don't enter the similarity: they're listed above with their reason.»
  - `score.noProbabilitiesMulticlass`:
    - ES: «Este modelo decide la categoría pero no da una probabilidad, así que esa columna no se incluye.»
    - EN: «This model picks the category but gives no probability, so that column is left out.»
- **Verificado cuando:** la card de agrupar no contiene «aún no» y puntuar con varias categorías no dice «riesgo».

##### AU-C-15 · Bajo · Inglés: calcos y comillas mezcladas
- **Dónde:** en.json:326, 329, 330 («real category», «Real ↓»; el binario dice «Actual»); en.json:720 «the smaller one»; comillas `«»` fijas en `ConfigScreen.tsx:447` y `ClusterResults.tsx:311` junto a copy en inglés con “”; en.json:325, 514, 515.
- **Ajuste:**
  - EN: «Actual ↓ · Predicted →» / «Each row is the actual category…» / «rows of actual “{real}”…» / «the smallest one».
  - Las comillas, por clave i18n: `common.quote` = ES «{text}» / EN “{text}”.
- **Verificado cuando:** un test de EN no encuentra «Real ↓».

##### AU-C-16 · Bajo · `design-system.md` no coincide con el código
- **Dónde:** `design-system.md:324-325` («caja `sunken` con `info`» en Configuración); `RosterCard.tsx:123-130` la dibuja como una línea de texto.
- **Ajuste:** usar la caja de `AggloSampleNote` en RosterCard, o corregir el documento.
- **Verificado cuando:** las capturas `26-grande-plan` muestran la caja.

##### AU-C-17 · Bajo · «Elegir» / «Volver al ganador»: el foco cae a `<body>` (heredado de la liga)
- **Dónde:** `ClusterResults.tsx:602-625` (y `LeagueTable.tsx`).
- **Ajuste:** tras `fit-member`, enfocar el `h1` de la lectura o del veredicto (`tabIndex={-1}`).
- **Verificado cuando:** un test de hook y UI ve el foco en el `h1`.

##### AU-C-18 · Bajo · Tests que no pueden fallar en lo que dicen cubrir
- **Dónde:** `tests/e2e/multiclase-score.spec.ts:91` (no exige `plan_probabilidad`); `tests/unit/agrupar-ui.test.tsx:501` (el título promete el botón «agrupar en su lugar» y no lo prueba).
- **Ajuste:** `expect(header.slice(-2)).toEqual(["plan_predicho","plan_probabilidad"])` y validar que la probabilidad esté entre 1/K y 1; completar o renombrar el test.
- **Demo en rojo:** quitar la columna de probabilidad en `ScoreScreen` → el e2e cae.

##### AU-C-19 · Bajo · `LeagueTable` fija `balanced_accuracy` fuera de `METRIC_RULES`
- **Dónde:** `src/components/LeagueTable.tsx:73-79`.
- **Ajuste:** `m[metric]` tipado sobre `MetricName | MulticlassMetricName`.
- **Verificado cuando:** `tsc` y `league-ui.test.tsx` en verde.

#### git status final

`git -C /Users/henryrincon/Code/app-ds status --short` →
```
 M sprints/SPRINT_007-implementation-log.md
```
Ese cambio **no es mío**: son 3 líneas de la fila de CI de `e6cf659` (run 37402379813) que escribió otra sesión mientras yo auditaba. No modifiqué, creé ni borré nada en el repo ni en la planeadora.

