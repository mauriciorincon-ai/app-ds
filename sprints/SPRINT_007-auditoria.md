# Sprint 007 — Auditoría final, Fase 1 («Agrupar y multiclase» · Probeta DS)

- **Fecha:** 2026-10-06.
- **Auditores:** tres subagentes independientes, que no construyeron el sprint, en solo lectura. Su
  fuente primaria es el diff; la bitácora solo sirvió para contrastar lo que el constructor cree que
  hizo.
  - **A · alcance y textos.** Casillas 1, 4, 6 y 7 en los documentos, coherencia documental y cero
    enlaces. Corrió el 2026-10-06 sobre el brochure ya construido: 16 hallazgos (sección «Auditor A» y
    su anexo).
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

| Id       | Sev.  | Hallazgo                                                                                                                                                             | Origen           | Dónde (principal)                                                                                                        |
| -------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| AU-S7-01 | Alto  | El saneamiento muta la tabla original. «Tus filas con su grupo» pierde las celdas basura y, con un duplicado, desalinea los grupos o los deja en «NaN»               | AU-B-01          | `src/engine/sanitize.ts:71`, `:176`; `src/lib/useExperiment.ts:1190`                                                     |
| AU-S7-02 | Alto  | HDBSCAN con más de 2.000 filas: la referencia nula aplica el `min_cluster_size` del total a la muestra y vale 0, así que la lectura «existen» no se compara con nada | AU-B-02          | `src/lib/ds/pipeline.py:718-722`, `:765-785`                                                                             |
| AU-S7-03 | Alto  | Cardinalidades cableadas: «hasta 20», «cuatro tareas» y «los otros tres» en ES y EN, y `classes.length < 3`                                                          | AU-B-03          | `messages/{es,en}.json:107,586,730,851`; `src/engine/eda.ts:196`                                                         |
| AU-S7-04 | Alto  | La model card de agrupar describe a los cuatro agrupadores aunque compitan dos                                                                                       | AU-B-04          | `src/lib/modelcard.ts:659-664`; `messages/{es,en}.json:626`                                                              |
| AU-S7-05 | Alto  | Regla 18: no hay gate que diga si venció la condición de retiro del ADR 012                                                                                          | AC-2 (código)    | `tests/unit/audit-exceptions.test.ts`; falta `scripts/verificar-retiros.mjs`                                             |
| AU-S7-06 | Medio | El lector de agrupar lanza un `TypeError` (reduce sin valor inicial) en vez de nombrar el campo, y la UI queda entrenando                                            | AU-B-05          | `src/workers/contract.ts:985-991`                                                                                        |
| AU-S7-07 | Medio | El manifiesto de agrupar muestra campos que no coteja: método, filas de muestra, gap, k, `ari_min` y corridas                                                        | AU-B-06          | `src/lib/model-file.ts:500-518`                                                                                          |
| AU-S7-08 | Medio | El export de agrupar no coteja el ancho de los centroides                                                                                                            | AU-B-07          | `src/workers/contract.ts:1200-1206`                                                                                      |
| AU-S7-09 | Medio | P13 por estructura: el manifiesto copia `reading` y `assignment` enteros, y `labelsField` no es recursivo                                                            | AU-B-08          | `src/lib/model-file.ts:692-693`; `src/workers/contract.ts:948-953`                                                       |
| AU-S7-10 | Medio | `ari_min` sin consumidor. P8 promete «la media y el mínimo», y el `{ariMin}` del copy es el umbral                                                                   | AU-B-09, AU-C-13 | `protocol.ts:487`; `ClusterResults.tsx:201`; `modelcard.ts:559`                                                          |
| AU-S7-11 | Medio | La prueba «la fuga se mide SOLO en train» no puede fallar por lo que promete                                                                                         | AU-B-10          | `tests/unit/multiclase-motor.test.ts:246-251`                                                                            |
| AU-S7-12 | Medio | `demo-rojo.sh` cuenta como rojo un gate muerto por una señal                                                                                                         | AU-B-11, AC-12   | `scripts/demo-rojo.sh:91-99`                                                                                             |
| AU-S7-13 | Medio | La carnada del hook de secretos nunca corre en la CI: gitleaks fuera del `PATH`, «1 skipped»                                                                         | AU-B-12, AC-27   | `.github/workflows/ci.yml:20-27`; `tests/unit/hook-secretos.test.ts:62`; `tests/integration/gitleaks-hook.test.ts:58-61` |
| AU-S7-14 | Medio | Configuración con varias categorías: el desbalance dice «usa AUC», y ni él ni la fuga nombran la categoría                                                           | AU-C-01          | `src/components/ConfigScreen.tsx:406-419`; `messages/{es,en}.json:136,140`                                               |
| AU-S7-15 | Medio | La ficha «Clase mayoritaria» con varias categorías dice «AUC o F1»                                                                                                   | AU-C-02          | `src/content/modelos.ts:364-371`, `:594-596`                                                                             |
| AU-S7-16 | Medio | Tres textos de validación cruzada o «liga» al agrupar: el estado de la ficha, el `aria-label` del progreso y la card con muestra pequeña                             | AU-C-03          | `ClusterResults.tsx:641-655`; `TrainingScreen.tsx:110`; `modelcard.ts:691-696`                                           |
| AU-S7-17 | Medio | «Vuelves a este resultado sin perder nada» es falso al agrupar: tras cancelar el Nivel 2 ya no se pueden descargar las filas con su grupo                            | AU-C-04          | `Level2Card.tsx:156`; `TrainingScreen.tsx:128`; `useExperiment.ts:681-692`                                               |
| AU-S7-18 | Medio | «Agrupar filas parecidas en su lugar» deja el foco en `<body>`                                                                                                       | AU-C-05          | `TaskCard.tsx:268-279`; `ConfigScreen.tsx:69-73`                                                                         |
| AU-S7-19 | Medio | Las pantallas con `next/dynamic` no tienen estado de carga ni límite de error                                                                                        | AU-C-06          | `src/app/page.tsx:16-31`                                                                                                 |
| AU-S7-20 | Medio | **DECISIÓN 2.** «Métricas casi perfectas — sospechoso» aparece cuando la alarma es una columna, aunque las métricas no lo sean (binaria y estimar, heredado)         | AU-C-07          | `VerdictCard.tsx:40-58`; `ResultsScreen.tsx:361`; `RegressionResults.tsx:46`                                             |
| AU-S7-21 | Medio | Nombres de categoría recortados, con `title` como única vía en táctil                                                                                                | AU-C-08          | `MulticlassResults.tsx:247,261-266,364-369`                                                                              |
| AU-S7-22 | Medio | Regla 17: controles nuevos que ninguna pasada activa (dos escondían AU-S7-15 y AU-S7-16)                                                                             | AU-C-09          | `scripts/capturas-s7.mjs`                                                                                                |
| AU-S7-23 | Medio | La model card de agrupar imprime las medias con 2 decimales fijos: ~1e-11 sale «0.00»                                                                                | AU-C-10          | `src/lib/modelcard.ts:584`                                                                                               |
| AU-S7-24 | Medio | `README.md` es la plantilla de create-next-app; SVG de plantilla sin uso; el `CHANGELOG.md` raíz es el del kit                                                       | AC-13            | `README.md`; `public/{file,globe,next,vercel,window}.svg`; `CHANGELOG.md`                                                |
| AU-S7-25 | Medio | «shadcn/ui» nunca se instaló: sin ADR que diga por qué los primitivos son propios, y `design-system.md` lo repite                                                    | AC-4 (código)    | `design-system.md:72`; `.claude/skills/diseno-ui.md:24`                                                                  |
| AU-S7-26 | Bajo  | Carnadas que faltan o que nombran otro campo (`null_score`, `league[].status`, `rare_categories`, `assign.sample_rows`)                                              | AU-B-13          | `tests/unit/contract-agrupar.test.ts:92-229`; `contract.ts:1050-1051`                                                    |
| AU-S7-27 | Bajo  | `CLUSTER_K_BY` y `CLUSTER_ASSIGN` sin exhaustividad por agrupador                                                                                                    | AU-B-14          | `src/workers/contract.ts:920-933`                                                                                        |
| AU-S7-28 | Bajo  | El tripwire del despacho no ve comparaciones contra constantes (`CLUSTER_TASK`)                                                                                      | AU-B-15          | `tests/unit/despacho.test.ts:128-137`                                                                                    |
| AU-S7-29 | Bajo  | El orden de las clases no es el de Python en dos sitios (`.sort()`)                                                                                                  | AU-B-16          | `src/engine/leakage.ts:228`; `src/engine/eda.ts:195`                                                                     |
| AU-S7-30 | Bajo  | HDBSCAN con menos de 5 filas sale como «error» y no como «sin estructura»                                                                                            | AU-B-17          | `src/lib/ds/pipeline.py:713-723`                                                                                         |
| AU-S7-31 | Bajo  | `verificar-dependencias`: una aserción condicional, y acepta entradas sin `razon`                                                                                    | AU-B-18          | `tests/unit/verificar-dependencias.test.ts:67-75`; `scripts/verificar-dependencias.mjs:156-158`                          |
| AU-S7-32 | Bajo  | La prueba del breadcrumb `probeta.league` no se extendió a las tareas nuevas (plan R9)                                                                               | AU-B-20          | `tests/unit/observability.test.ts:35-63`                                                                                 |
| AU-S7-33 | Bajo  | R9: conteos sin separador de miles (matriz, tabla por categoría, model card, puntuar) y espacios antes de unidad                                                     | AU-C-11          | `MulticlassResults.tsx:153,287,374`; `modelcard.ts:114-118,181-200,267-271`; `ScoreScreen.tsx:539,801,807`               |
| AU-S7-34 | Bajo  | Plurales: «1 filas», «fila(s)», `_one` inalcanzables                                                                                                                 | AU-C-12          | `ScoreScreen.tsx:794`; `messages/{es,en}.json:86,418,662,862`                                                            |
| AU-S7-35 | Bajo  | `rareCategories` no llega a la card de agrupar; claves `level2.cluster.descAllRan` y `nothingToAdd` inalcanzables                                                    | AU-C-13          | `experiment.ts:989,1013`; `messages/{es,en}.json:827,831`                                                                |
| AU-S7-36 | Bajo  | Copy heredada que no aplica: «aún no se usan (sin partición temporal)» en la card de agrupar; «ordenar por riesgo» con varias categorías                             | AU-C-14          | `modelcard.ts:743`; `messages/{es,en}.json:400,585`                                                                      |
| AU-S7-37 | Bajo  | Inglés: «Real ↓» y «real category» (el binario dice «Actual»), «the smaller one», comillas «» fijas en copy inglés                                                   | AU-C-15          | `messages/en.json:325-330,514,515,720`; `ConfigScreen.tsx:447`; `ClusterResults.tsx:311`                                 |
| AU-S7-38 | Bajo  | `design-system.md` dice «caja `sunken` con `info`» para la nota de la muestra en configuración; el código la dibuja como línea                                       | AU-C-16          | `design-system.md:324-325`; `RosterCard.tsx:123-130`                                                                     |
| AU-S7-39 | Bajo  | «Elegir» y «Volver al ganador»: el foco cae a `<body>` (heredado de la liga)                                                                                         | AU-C-17          | `ClusterResults.tsx:602-625`; `LeagueTable.tsx`                                                                          |
| AU-S7-40 | Bajo  | Tests que no pueden fallar en lo que dicen cubrir: la columna `_probabilidad` y el botón «agrupar en su lugar»                                                       | AU-C-18          | `tests/e2e/multiclase-score.spec.ts:91`; `tests/unit/agrupar-ui.test.tsx:501`                                            |
| AU-S7-41 | Bajo  | `LeagueTable` fija `balanced_accuracy` fuera de `METRIC_RULES`                                                                                                       | AU-C-19          | `src/components/LeagueTable.tsx:73-79`                                                                                   |
| AU-S7-42 | Bajo  | `CLAUDE.md` dice que la copia de `pipeline.py` está «vigilada por test»: no hay tal prueba (va por texto, D8)                                                        | AU-B-19, AC-18   | `CLAUDE.md` (Estructura); `scripts/copy-pyodide.mjs:61-63`                                                               |

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

Corrió el 2026-10-06 sobre el brochure ya construido (`6f50c43` → `0a0358f`), en solo lectura; informe
completo en el anexo A. **Requiere ajustes: 16 hallazgos, 0 Críticos, 2 Altos, 7 Medios y 7 Bajos.**
Conservan su id `AU-A-nn` (el consolidado B + C no se renumera).

| Id      | Sev.  | Hallazgo                                                                                                                                                  |
| ------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AU-A-01 | Alto  | El ⭐⭐ corto pierde lo prometido: las segundas vueltas del S6, la mirada M3 y el registro de las miradas del S7; el ⭐ completo se ofrece sin las del H1 |
| AU-A-02 | Alto  | Cardinalidades cableadas en manual, brochure, export y design-system, sin gate; «los otros tres» sobrevive al pago de AU-S7-03                            |
| AU-A-03 | Medio | La pasada de capturas ampliada (pago de AU-S7-22) murió en su única corrida, en el aviso de cancelar al agrupar                                           |
| AU-A-04 | Medio | El manual dice «usa AUC» para el desbalance también con varias categorías                                                                                 |
| AU-A-05 | Medio | Brochure y export: «lo único que sale de tu equipo es la narración», con Sentry en el cliente                                                             |
| AU-A-06 | Medio | El README promete «publicar», y el manual «llegará más adelante»                                                                                          |
| AU-A-07 | Medio | Guía v4: un «Esperado» viejo, un «por qué» falso en «Qué deja fuera» y filtros que no cuentan lo mejorado                                                 |
| AU-A-08 | Medio | La decisión 2 toca binaria y regresión sin desviación declarada; tres textos dicen aún «su propio titular»                                                |
| AU-A-09 | Medio | Promesas aplazadas vivas: el bundle de design-sync, `design-system.md` y el aviso de fechas («en esta versión»)                                           |
| AU-A-10 | Bajo  | `design-system.md` y las tarjetas de design-sync no reflejan los pagos de UI de la Fase 2                                                                 |
| AU-A-11 | Bajo  | Export: detalles viejos y secciones del manual sin cotejo                                                                                                 |
| AU-A-12 | Bajo  | BLUEPRINT: falta el gate de la Fase 2, la cifra «al cierre» es anterior a la Fase 2 y dice «cuatro tareas» sumadas por el H2                              |
| AU-A-13 | Bajo  | R9 en documentos (README del kit, BLUEPRINT, dos «Esperado» de la guía)                                                                                   |
| AU-A-14 | Bajo  | El inglés del brochure: tres calcos y «Outside any group» frente a la app                                                                                 |
| AU-A-15 | Bajo  | El manual no dice qué se pierde al cancelar el Nivel 2 al agrupar                                                                                         |
| AU-A-16 | Bajo  | «Cuatro agrupadores prueban de 2 a 10 grupos sobre todas las filas»: HDBSCAN no prueba k                                                                  |

**Lo que el constructor ya sabe de dos de ellos** (no los cierra; se registra):

- **AU-A-03.** La pasada murió porque canceló el Nivel 2 mientras guardaba la instantánea, y en esa
  fase el worker conserva las filas con su grupo: el aviso «hay que volver a agrupar» era absoluto.
  `b7d9a56` lo volvió condicional («si cancelas cuando ya está agrupando…»), sumó la prueba de esa rama
  (F2-49) y hace que el arnés cancele cuando ya está agrupando. Falta la corrida completa que lo muestre.
- **AU-A-05.** La planeadora registra Sentry «operando desde S1» (`SPRINT_002.md:191`), así que la
  frase «si nunca tocas ese botón, no sale nada» es falsa: con un error salen metadatos. Se paga con el
  copy del auditor para el caso «producción tiene DSN».

### Decisión que la Fase 2 de A necesita del usuario

- **El largo del ⭐⭐ corto (AU-A-01).** Cumplir lo prometido —las segundas vueltas del S6 en la parada 2
  y la mirada M3 («agrupar en su lugar») en la parada 5, como decía el plan aprobado— suma unos
  2 minutos: el recorrido pasa de unos 20 a **unos 22**.
  - **A (recomendada):** unos 22 minutos, sin dejar fuera nada de lo prometido; la guía lo dice así.
  - **B:** se queda en unos 20, y M3 sale del corto (queda en I7, del ⭐ completo), declarada en «Qué
    deja fuera» y en `design-system.md`.

### Plan de pago de A (Fase 2)

Se pagan todos. El ajuste ejecutable de cada uno está en el anexo A; cada copy nuevo pasa su casilla 4
antes de entrar, y en el brochure lleva su par EN. Orden:

1. **Gates primero, cada uno en rojo en su commit:**
   - AU-A-02: `tests/unit/cardinalidades-docs.test.ts` (manual, brochure, export, design-system), con
     dos demos (una cifra cambiada a mano; «los otros tres» de vuelta).
   - AU-A-11: cada `seccion_manual` del export existe en el manual, con su demo; antes, el manual
     describe el bloqueo del punto y coma.
2. **Copy y documentos:** AU-A-04, -05, -06, -07 (para la (b), el texto honesto: ninguna e2e corre el
   Nivel 2 entero en pantalla), -08 (D10 en la bitácora, ADR 015 y 017, tarjeta), -09, -10, -12, -13,
   -14, -15 y -16.
3. **AU-A-01** según la decisión, y la matriz de las miradas del S7 en la bitácora, escrita después de
   verificar cada destino en la guía.
4. **Al final, sobre el árbol completo:** la pasada de capturas entera (cierra AU-A-03 y AU-S7-22), la
   suite completa (unit, integración, e2e) y la segunda casilla 4 por otro auditor.

## Anexo · Auditor B — motor, contrato, gates y dependencias

### Auditoría S7, fase 1: auditor B (motor, contrato, gates y dependencias)

Leí el diff `6f50c43..HEAD`: 160 archivos. Durante la auditoría, HEAD avanzó a `fec1a29`, un commit solo de docs con la auditoría de la constitución, y no cambia código.

Encontré 20 hallazgos: **4 Altos, 8 Medios y 8 Bajos**. Ninguno es Crítico: no encontré fuga de datos del usuario fuera del navegador ni un veredicto supervisado equivocado.

Tres de mis hallazgos coinciden con los del auditor de la constitución, que llegó a ellos por otra vía:

| Mío     | Suyo  | Tema                                                          |
| ------- | ----- | ------------------------------------------------------------- |
| AU-B-11 | AC-12 | `demo-rojo.sh` cuenta como rojo un gate muerto por señal      |
| AU-B-12 | AC-27 | la prueba de la carnada del hook se salta en la CI            |
| AU-B-19 | AC-18 | la copia de `pipeline.py` no está vigilada por ninguna prueba |

#### Corridas

| Comando                                                                                                                  | Resultado                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test` (vitest + cobertura)                                                                                         | **675 de 675** en 57 archivos; 10,97 s. Total: 92,78 % sentencias · 86,11 % ramas · 90,83 % funciones · 93,99 % líneas. `engine/`: 97,45 · 94,49 · 97,79 · **98,97 %**. `workers/`: 97,55 · 91,6 · 100 · 98,91. Coincide con la bitácora. |
| `pnpm test:integration` (Pyodide real)                                                                                   | **98 pasan, 1 saltada (99)** en 10 archivos; 2 min 28 s. Pyodide bajó las wheels del CDN y las guardó en `node_modules/pyodide` (está en `.gitignore`).                                                                                   |
| `pnpm typecheck`                                                                                                         | sin errores, 5,2 s. No tocó `next-env.d.ts` (`tsc --noEmit`).                                                                                                                                                                             |
| `pnpm lint`                                                                                                              | sin avisos, 5,1 s                                                                                                                                                                                                                         |
| `vitest run` de las cuatro suites de contrato, con consola                                                               | 86 de 86. Las cuentas «detectó k de n» están en la tabla de carnadas.                                                                                                                                                                     |
| `node scripts/verificar-dependencias.mjs 6f50c43…`                                                                       | ✓ 675 paquetes, ninguno por debajo                                                                                                                                                                                                        |
| comparación de la sección `packages:` del lockfile, base contra HEAD                                                     | **idéntica** (diff vacío)                                                                                                                                                                                                                 |
| `pnpm audit --audit-level high`                                                                                          | 1 alto, 1 ignorado (GHSA-vfj7-8cjw-p6xm), exit 0                                                                                                                                                                                          |
| `npm view braces version`                                                                                                | 3.0.3: sigue sin parche                                                                                                                                                                                                                   |
| `gh pr checks 19`                                                                                                        | 6 de 6 `pass` (run 37402379813). En el log de `quality`: `hook-secretos.test.ts (3 tests \| 1 skipped)`, «674 passed \| 1 skipped».                                                                                                       |
| `cmp` de `src/lib/ds/pipeline.py` contra `public/pyodide/pipeline.py`, y de los 4 CSV de `public/datasets` contra el kit | idénticos                                                                                                                                                                                                                                 |

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

| Gate                                                         | archivo:línea                                                             | ¿Puede fallar?                                                                                        | Rojo declarado en la bitácora (¿plausible?)                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Tipos del despacho (`@ts-expect-error`)                      | `tests/unit/despacho.test.ts:36-48` + `pnpm typecheck`                    | Sí. `tests/` entra al `tsc`.                                                                          | `?: T` → «Unused '@ts-expect-error'»: plausible                                                    |
| Tripwire de fuente TS                                        | `despacho.test.ts:128-137, 226-231`                                       | Sí, pero no ve comparaciones contra constantes (AU-B-15)                                              | `?? "binaria"` en `modelcard` → nombra `:221`: plausible                                           |
| Tripwire Python + `_by_task` completo                        | `despacho.test.ts:138-146, 241-254`                                       | Sí (exige ≥ 10 llamadas)                                                                              | comparación en `:837` y rama faltante en `:640`: plausible                                         |
| `LEAKAGE_CLASS_MIN_SUPPORT` y pureza normalizada             | `tests/unit/leakage.test.ts:151-200`                                      | Sí                                                                                                    | 5→4 (4 de 21 caen) y pureza cruda (1 de 21): plausible                                             |
| Paridad de `SCORER` (patrón con «_») y constantes de agrupar | `tests/unit/roster.test.ts:73-85, 115-164`                                | Sí                                                                                                    | plausibles                                                                                         |
| Carnadas Python→TS                                           | `contract.test.ts:448-571`, `contract-agrupar.test.ts:92-325`             | Sí. Faltan campos (AU-B-07, AU-B-13); un caso hostil lanza en vez de nombrar (AU-B-05).               | plausibles                                                                                         |
| Carnadas TS→Python                                           | `tests/integration/multiclase.test.ts:413-489`, `agrupar.test.ts:334-375` | Sí                                                                                                    | plausibles                                                                                         |
| Manifiestos                                                  | `model-file.test.ts`, `contract-agrupar.test.ts:361-438`                  | Sí en la forma; **no** en la coherencia (AU-B-06)                                                     | plausibles                                                                                         |
| Fixtures del emisor real                                     | `multiclase.test.ts:571-602`, `agrupar.test.ts:414-445`                   | Solo por **forma** (las claves y el primer elemento de cada arreglo), no por valores                  | Mi sonda confirma que los valores de hoy son de Pyodide                                            |
| Hook que falla cerrado                                       | `tests/unit/hook-secretos.test.ts:47-75`                                  | Sí, pero **la carnada nunca corre en la CI** (AU-B-12)                                                | Plausible. El texto pedido a `--debe-nombrar` aparece también en el code frame que imprime vitest. |
| `verificar-dependencias` + degradaciones                     | `tests/unit/verificar-dependencias.test.ts`, `ci.yml:34-38`               | Sí; hay un `expect` condicional (AU-B-18)                                                             | plausibles                                                                                         |
| `lighthouse-margen.mjs`                                      | `ci.yml:130-131`                                                          | Cobertura: solo con la config mutada. Margen: solo avisa, con exit 0. Las dos cosas están declaradas. | `path → /x` nombra `/`: plausible                                                                  |
| `sentry-cliente`                                             | `tests/unit/sentry-cliente.test.ts:30-52`                                 | Sí en la CI (`--frozen-lockfile`)                                                                     | `vitest` directo (pnpm 11 repara el lockfile): plausible                                           |
| `portada-liviana`                                            | `tests/unit/portada-liviana.test.ts:83-103`                               | Sí, y tiene control                                                                                   | plausibles                                                                                         |
| Cerrojo de la narración en el route                          | `tests/unit/narrate-route.test.ts:135-161`                                | Sí (`strict`)                                                                                         | —                                                                                                  |
| `dedupeIndex` cuadra con `sanitizeTable`                     | `tests/unit/sanitize.test.ts:177-198`                                     | Sí, pero **no ve la coerción** de basura (AU-B-01)                                                    | 11 de 11: plausible                                                                                |
| «la fuga se mide SOLO en train»                              | `tests/unit/multiclase-motor.test.ts:246-251`                             | **No** para lo que su nombre promete (AU-B-10)                                                        | —                                                                                                  |
| `demo-rojo.sh` (la herramienta)                              | `scripts/demo-rojo.sh:91-99`                                              | Acepta un gate muerto por señal (AU-B-11)                                                             | —                                                                                                  |

#### Carnadas

| Lista                                                                                                | Declarado |                    Contado | Diferencia                                                |
| ---------------------------------------------------------------------------------------------------- | --------: | -------------------------: | --------------------------------------------------------- |
| TS→Python multiclase                                                                                 |        13 | 13 (fuente; la suite pasa) | 0                                                         |
| TS→Python agrupar                                                                                    |        16 | 16 (fuente; la suite pasa) | 0                                                         |
| train-multiclase                                                                                     |        30 |                         30 | 0                                                         |
| fit-member-multiclase                                                                                |         7 |                          7 | 0                                                         |
| export-multiclase                                                                                    |         4 |                          4 | 0                                                         |
| score-multiclase                                                                                     |         8 |                          8 | 0                                                         |
| manifiesto multiclase                                                                                |        14 |                         14 | 0                                                         |
| train-agrupar                                                                                        |        46 |                         46 | 0                                                         |
| fit-member-agrupar                                                                                   |         8 |                          8 | 0                                                         |
| export-agrupar                                                                                       |         8 |                          8 | 0                                                         |
| score-agrupar · con ruido · etiquetas                                                                | 8 · 2 · 4 |                  8 · 2 · 4 | 0                                                         |
| manifiesto agrupar                                                                                   |        14 |                         14 | 0                                                         |
| Heredadas: train 27, fit 6, progreso 5, export 6, score 5, regresión 36/6/**5**/4, manifiestos 16/12 |     igual |                      igual | 0 (el export de regresión pasa de 4 a 5, como se declaró) |

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

| Campo                                                                                                | Lectores                                                                                                   |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `reading.stability.ari_min`                                                                          | **0: huérfano** (AU-B-09)                                                                                  |
| `league[].silhouette_by_k`, `bic_by_k`                                                               | solo el lector, que recalcula el k; la UI no los muestra                                                   |
| `schema.assign.centroids` / `radii`                                                                  | Python (`import_model` con `expected_schema` y `_assign`)                                                  |
| `nRows`, `silhouetteSample`, `kRange`, `distance`                                                    | `ClusterResults`, `modelcard`, `model-file`, `ConfigScreen` (1 a 3 cada uno)                               |
| `selection.{consensusWinner, k, votes, voters, competitors, elapsedMs}`                              | `ClusterResults`, `modelcard`, `model-file`, `observability`, `verdict.hasConsensus`                       |
| `reading.{level, score, null_score, gap, stability.ari_mean, runs, fraction}`                        | `ClusterResults`, `modelcard`, `model-file`, `StartScreen`                                                 |
| `profiles.{groups, noise, separating.strength}`, `assignment.{method, train_agreement, sample_rows}` | `ClusterResults`, `modelcard`, `StartScreen`, `ScoreScreen`                                                |
| `noise_share`, `sizes`, `score`, `k_by`, `error_type`, `sample_rows`                                 | `ClusterResults`, `modelcard`                                                                              |
| `MulticlassResult.{classes, confusionMatrix, perClass.*}` y las cinco métricas                       | `MulticlassResults`, `LeagueTable`, `ResultsScreen`, `ScoreScreen`, `StartScreen`, `modelcard`, plantillas |
| Fases de progreso `cluster` / `stability` y el comando `cluster-labels`                              | `TrainingScreen`, `useExperiment`                                                                          |

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

  | Datos                                              | Puntaje |   ARI | Nula del pipeline | Lectura hoy | Nula con `mcs` = 40 (la regla aplicada a 2.000 filas) | Lectura así         |
  | -------------------------------------------------- | ------: | ----: | ----------------: | ----------- | ----------------------------------------------------: | ------------------- |
  | 3 nubes, n = 6.000, sep. 1,8 (k = 2, ruido 73,6 %) |   0,133 | 0,834 |               0,0 | «existen»   |                                                 0,145 | «no hay estructura» |
  | n = 10.000                                         |   0,163 |     — |               0,0 | «existen»   |                                                 0,142 | «no hay estructura» |
  | n = 1.500                                          |       — |     — |             0,149 | —           |                                                 0,149 | (coinciden)         |

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

| #   | Comando                                                                                                                                                                        | Resultado                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `git log --oneline 6f50c43..HEAD`; `git diff --stat`                                                                                                                           | 20 commits; 160 archivos, +38.154/−1.439. Mi superficie: 64 archivos, +9.024/−638                                                                                         |
| 2   | `vitest run` (agrupar-ui, multiclase-ui, league-ui, components, portada-liviana, sentry-cliente, use-hooks, start-import, regresion-ui, modelos) `--coverage.enabled=false`    | 10 archivos, **183 de 183**                                                                                                                                               |
| 3   | `vitest run` (i18n-parity, narration-templates, modelcard, observability, sentry-scrub, score-screen, ficha-level2, error-copy, narrate-route, eda) `--coverage.enabled=false` | 10 archivos, **93 de 93**                                                                                                                                                 |
| 4   | `python3 keys.py`: paridad, claves nuevas, claves usadas                                                                                                                       | ES↔EN: 0 faltantes en cada lado. 188 claves nuevas, todas referenciadas. 2 retiradas (`errors.target-not-binary`, `task.notYet`). 0 claves literales de `t()` sin entrada |
| 5   | Script de contraste WCAG sobre los tokens de `globals.css` (combinaciones nuevas)                                                                                              | Mínimo 4,55:1 (`positive` sobre `positive/10`, claro). Todas ≥ AA en los dos temas                                                                                        |
| 6   | `vitest run --config scratchpad/.../vitest.config.ts` (10 sondas)                                                                                                              | **10 de 10 pasan**: cada una confirma la conducta que describe su hallazgo (S1–S10, abajo)                                                                                |
| 7   | `grep` de comparaciones de tarea fuera de `despacho.ts`                                                                                                                        | 10 coincidencias, todas sobre la detección `Task` («ambigua», «sin-objetivo») o guardas genéricas. Ninguna sobre una `TrainTask`                                          |
| 8   | `gh pr checks 19` (dos veces); `gh run list --branch …`                                                                                                                        | Primera: 5 `pass` y e2e `pending`. Segunda: **6 de 6 `pass`** (run 37402379813, e2e en 12 min 43 s). Las 5 corridas anteriores, `success`                                 |
| 9   | `git status --short`                                                                                                                                                           | Ver la última sección                                                                                                                                                     |

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

| Coincidencia                                                          | Archivo:línea (es/en)                                                                                | ¿Cierta hoy?                                                        |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| «esta versión no abre»                                                | es/en.json:93 `start.import.errors.unsupported-task`                                                 | Sí: una tarea desconocida se rechaza                                |
| «En esta versión no se usan para dividir por tiempo»                  | es/en.json:119 `config.warnings.date`                                                                | Sí (heredada)                                                       |
| «No se puede puntuar»                                                 | es.json:356                                                                                          | Sí                                                                  |
| «aún no se usan (sin partición temporal)» / «not used yet»            | es/en.json:585 `modelcard.limits.dates`; **el S7 la suma a la card de agrupar** (`modelcard.ts:743`) | Promesa aplazada, y la partición no aplica al agrupar → **AU-C-14** |
| «Esta versión hace cuatro tareas»                                     | es/en.json:586                                                                                       | Sí                                                                  |
| «no se pueden comparar», «no se puede saber»                          | es.json:683, 692                                                                                     | Sí                                                                  |
| «podrás correr la liga completa»                                      | es.json:714                                                                                          | Sí (Level2Card en Resultados)                                       |
| «podrás incluirlo de todos modos en el Nivel 2»                       | es.json:725                                                                                          | Sí con objetivo; al agrupar no se muestra                           |
| «podrás agrupar con todos»                                            | es.json:736                                                                                          | Sí                                                                  |
| «later, if you want»                                                  | en.json:713, 727, 734, 735                                                                           | Sí                                                                  |
| «vuelves a este resultado sin perder nada»                            | es/en.json:809                                                                                       | **Falso al agrupar** → AU-C-04                                      |
| «usa AUC» con varias categorías                                       | es/en.json:140                                                                                       | **Falso** → AU-C-01                                                 |
| «predice el objetivo casi a la perfección» con fuga por clase         | es/en.json:136                                                                                       | **Exagera** → AU-C-01                                               |
| «el veredicto se mide con AUC o F1» (ficha mayoritaria, multiclase)   | modelos.ts:369-370                                                                                   | **Falso** → AU-C-02                                                 |
| «puesto N de M por validación cruzada» / «no concluyó» al agrupar     | es/en.json:790-791                                                                                   | **Falso** → AU-C-03                                                 |
| «Métricas casi perfectas» con la alarma en una sola columna           | es/en.json (`results.verdict.suspicious`)                                                            | **Engaña** → AU-C-07                                                |
| «decide la clase… ordenar las filas por riesgo» con varias categorías | es/en.json:400                                                                                       | Encuadre binario → AU-C-14                                          |

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

## Anexo · Auditor A — alcance y textos

### Auditoría S7, Fase 1 — Auditor A: alcance y textos

- **Repo / rama:** `~/Code/app-ds`, `sprint-007/agrupar-y-multiclase`, PR #19 (borrador).
- **Base → HEAD auditado:** `6f50c43` (merge-base con `main`) → `0a0358f` (28 commits; 187 archivos,
  +42,190 / −1,921). Durante la auditoría HEAD pasó de `fd37a2c` a `0a0358f`, un commit que solo toca
  la bitácora (filas de CI de `a39525b` y la fricción K-S7-7).
- **Modo:** solo lectura. No escribí en el repo ni en la planeadora. Las sondas viven en el
  scratchpad (`auditor-a/`). `git status --short` al terminar: vacío.
- **Fuentes del alcance:** la orden `portafolio/ds/ordenes/SPRINT_007-orden.md`, el plan
  `portafolio/ds/sprints/SPRINT_007.md`, la VISION v1.1.0, el plan aprobado
  `~/.claude/plans/glittery-drifting-wilkes.md`, `CLAUDE.md`, el storyboard §9 y el diff.
- **No repito hallazgos de B ni de C.** Donde un pago suyo dejó un hermano vivo en mi superficie, lo
  digo con el id que lo originó.

#### Recomendación

**Requiere ajustes.** Hay 16 hallazgos: **0 Críticos, 2 Altos, 7 Medios y 7 Bajos.**

**Lo que resistió:**

- **El alcance de producto está completo.**
  - Multiclase y agrupar funcionan de punta a punta.
  - D8 y D2 están pagadas.
  - Pyodide se decidió en el STOP y se quedó en 314.0.2, con su test de pin.
  - Están los cierres del Acto 1: BLUEPRINT, guía v4 con el ⭐⭐ corto, brochure re-armado con el
    catálogo y auditoría de la constitución.
- **Las cifras «Esperado» de los bloques H e I son las que la app produce hoy.** Lo comprobé con una
  sonda en Pyodide real, por el camino de la app (parse → saneamiento → `prepareRun` /
  `prepareClusterRun` → `pipeline.py`). Lo mismo con el reparto por nivel de F1, F2, G5, H1, H7, I1
  e I8.
- **El brochure, en su estructura:**
  - El conteo cuadra: 13 + 7 + 5 + 9 + 5 en las puertas, más 2 de lo fino, da **41**. Coincide con el
    export y con el pie, en ES y en EN.
  - Las 5 puertas y la escena E04b siguen el §9.3: pregunta → ejemplo → vara, stagger de 70 ms y
    variante reduced-motion con su e2e.
  - El clímax está intacto: el texto español de E06 es idéntico al de `main`.
  - Todo texto tiene su par ES/EN, y la paridad la vigila una e2e.
- **Cero enlaces:** el barrido sale vacío y el homepage del repo es el propio repo.
- **El PR nació en borrador** y su cuerpo empieza con la línea del merge.

**Lo que no está listo:**

- **El ⭐⭐ corto pierde lo que se le prometió** (AU-A-01):
  - las segundas vueltas «maquetado, no visto» del S6 no están en ninguna parada ni se declaran
    fuera;
  - la mirada M3 no llega al ⭐⭐, aunque `design-system.md` dice que sí;
  - las miradas del S7 no están registradas en la bitácora.
- **Cardinalidades cableadas en los documentos, sin gate** (AU-A-02). Una es «los otros tres», la
  misma frase que AU-S7-03 sacó del copy.
- **La pasada de capturas ampliada (pago de AU-S7-22) murió en su única corrida después de la
  Fase 2** (AU-A-03). Murió justo en la promesa nueva del copy de cancelar al agrupar.
- **Frases viejas o falsas en documentos que viajan:**
  - el manual dice «usa AUC» con varias categorías (AU-A-04);
  - el brochure y el export dicen que nada sale del equipo, y hay un Sentry en el cliente (AU-A-05);
  - el README promete «publicar» (AU-A-06);
  - la guía cita textos que la app ya no muestra (AU-A-07);
  - la tarjeta de `design-sync` de la pregunta ambigua sigue diciendo «llega en una próxima versión»
    (AU-A-09).

#### Tabla de cobertura de alcance (casilla 1)

| #       | Ítem (orden / plan aprobado)                                                                 | Estado                                         | Evidencia                                                                                                                                                                                                                                                                                        |
| ------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F0.1    | Constitución sincronizada, con la centinela                                                  | **Completo**                                   | `CLAUDE.md` es idéntico a `CLAUDE-md-para-app.md` hasta su línea 421. La planeadora añadió después (commit `c8d3957`, 2026-10-04 16:30) un «Delta del kit v1.39.0 — se incorpora en la fase 0 del próximo sprint»: es del S8, no es deriva. La centinela está en `CLAUDE.md:6` y en la regla 22. |
| F0.2    | Delta del kit v1.36 → v1.38 por nombre, cada gate en rojo en su commit                       | **Completo**                                   | Tabla de la bitácora `:109-135`. Existen `.claude/COMANDOS.md`, `docs/SPIKE-DE-COSTOS.plantilla.md`, `scripts/{demo-rojo.sh,lighthouse-margen.mjs,degradaciones-permitidas.json}` y `tests/unit/hook-secretos.test.ts`. Los gates los auditó B.                                                  |
| F0.3    | Datasets con semilla y README                                                                | **Completo** (con un detalle R9: AU-A-13)      | `docs/kit-de-prueba/`, con su número de filas: planes 200, mediano 5,000, fuga 200, segmentos 300 y sin-grupos 300. Suma dos extra: tiendas 120 y segmentos-grande 9,000. README `:33-47`.                                                                                                       |
| F0.4    | Spike en el navegador, con el molde de costos                                                | **Completo**                                   | `sprints/SPRINT_007-spike-catalogo.md`; las decisiones del STOP, en la bitácora `:257-288`.                                                                                                                                                                                                      |
| F1      | Motor multiclase, D8 en la binaria y D2                                                      | **Completo** (auditado por B)                  | ADR 015 y 017; `tests/integration/multiclase.test.ts`; `leakage.test.ts`.                                                                                                                                                                                                                        |
| F2      | Motor de agrupar (4 agrupadores, estabilidad, perfiles, puntuar)                             | **Completo** (auditado por B; AU-S7-02 pagado) | ADR 016 §3; `tests/integration/agrupar.test.ts`.                                                                                                                                                                                                                                                 |
| F3.9    | Pantallas 1 a 7                                                                              | **Completo** (auditado por C)                  | e2e `multiclase*`, `agrupar*`, `tarea-ambigua`: 72 de 72 en la corrida local del constructor (`scratchpad/e2e-full.log`).                                                                                                                                                                        |
| F3.10   | Manual: dos secciones, diccionario y FAQ                                                     | **Implementado con desviación**                | Secciones en `MANUAL-DE-USO.md:366-512`, diccionario en `:564-589`, FAQ en `:652-673`. Quedan frases viejas: AU-A-04 y AU-A-06, más cifras cableadas: AU-A-02.                                                                                                                                   |
| F3.10   | Guía v4: hereda las 49, bloques H e I, ⭐ H2 = 12, ⭐⭐ corto ≤ 20 min con lo que deja fuera | **Implementado con desviación**                | 66 pruebas (49 + 8 + 8 + 1); ⭐ = 12; paradas de 3+3+2+3+3+4+2 = 20 min; chips «1 de 7» a «7 de 7» correctos. Hay omisiones y textos viejos: AU-A-01 y AU-A-07.                                                                                                                                  |
| F3.11   | e2e de reduced-motion de las dos pantallas nuevas                                            | **Completo**                                   | `tests/e2e/reduced-motion-app.spec.ts:141` y `:169`.                                                                                                                                                                                                                                             |
| F3.12   | Capturas con extremos de magnitud e interacción (regla 17)                                   | **Parcial**                                    | La corrida completa fue antes de la Fase 2 (`capturas-s7.log`, 20:29). La ampliada (pago de AU-S7-22) murió: AU-A-03.                                                                                                                                                                            |
| F3      | Miradas de FORMA M1 a M3 en matriz de una fila, maquetadas, y las de TEXTO                   | **Parcial**                                    | No están registradas en la bitácora como «maquetado, no visto». M3 no llega al ⭐⭐: AU-A-01.                                                                                                                                                                                                    |
| F3      | ADR 015, 016 y 017                                                                           | **Completo** (con texto viejo: AU-A-08)        | `decisions/015-017`. Suma el 018 (D7) y el 019 (AU-S7-25).                                                                                                                                                                                                                                       |
| F3      | `design-system.md` «Añadidos Sprint 007» y bundle `design-sync/`                             | **Implementado con desviación**                | Hay dos tarjetas nuevas, pero el bundle conserva texto falso (AU-A-09) y desfasado (AU-A-08 y AU-A-10).                                                                                                                                                                                          |
| F4.1    | `docs/BLUEPRINT.html` al día                                                                 | **Implementado con desviación**                | Es el as-built del H2, pero le falta el gate de la Fase 2 y tiene cifras R9 y una cifra de cierre medida antes de la Fase 2: AU-A-12.                                                                                                                                                            |
| F4.2    | Delta del storyboard → parada de DECISIÓN → HTML + export                                    | **Completo**                                   | Storyboard §9. Las decisiones D-A = A y D-B = A están en la bitácora (`:1474-1488`). HTML y export van en `fd37a2c`.                                                                                                                                                                             |
| F4.3    | Auditoría de la constitución                                                                 | **Completo**                                   | `sprints/SPRINT_007-auditoria-constitucion.md`; D8 en la bitácora `:68-89`.                                                                                                                                                                                                                      |
| F4.4    | `/audita-sprint` por superficies, todo pagado                                                | **En curso**                                   | Este informe.                                                                                                                                                                                                                                                                                    |
| F4.5    | `/deploy-check`                                                                              | **Pendiente de cierre**                        | —                                                                                                                                                                                                                                                                                                |
| F4.6    | Summary EN el PR, con la sección del ⭐ y «Para mergear»                                     | **Pendiente de cierre**                        | `sprints/SPRINT_007-summary.md` no existe aún.                                                                                                                                                                                                                                                   |
| F4      | PR en borrador con la línea del merge                                                        | **Completo**                                   | `gh pr view 19`: `isDraft: true`, y la línea 1 del cuerpo es la línea del merge.                                                                                                                                                                                                                 |
| AC1–AC8 | Criterios de aceptación de producto                                                          | **Completos**                                  | Sonda de Pyodide (abajo): H2 0.60 contra 0.54, fuga en 0.78, segmentos con k = 3 y «existen», sin-grupos «no hay estructura», HDBSCAN con 67 % de ruido, I8 con la muestra de 8,000. Pyodide sigue en 314.0.2.                                                                                   |
| AC9     | CI con conclusión propia y summary EN el PR                                                  | **Pendiente de cierre**                        | `gh pr checks 19` sobre `0a0358f`: quality, lighthouse y Vercel en pass; e2e e integration, pending.                                                                                                                                                                                             |
| Desv.   | Desviaciones D1 a D9 declaradas                                                              | **Parcial**                                    | Falta declarar la decisión 2 (el titular de fuga) como desviación de «Qué NO tocar»: AU-A-08.                                                                                                                                                                                                    |

**Pendiente de cierre** (en la cola del constructor; no son hallazgos):

- `/deploy-check`, que incluye re-medir las métricas del export. Hoy dicen, con fecha 2026-10-04:
  589 pruebas, 44 e2e y 94.54 % de cobertura de líneas.
- El summary con la tabla de mapeo (va abajo) y la segunda casilla 4 a cargo de otro auditor.
- La tabla de demos en rojo de la Fase 2: la bitácora dice «se copia aquí al cerrar la fase», y el
  borrador está en `scratchpad/demos-fase2.md`.
- Las filas de CI de `b7d9a56`, `fd37a2c` y `0a0358f`.
- Registrar en la bitácora la pasada de capturas del brochure: existen 28 encuadres en
  `scratchpad/brochure-cap/`, pero no están en la bitácora.
- Lo que la regla 12 deja para el Acto 2 o para después del merge: la sala de proyección y la
  última milla del link sin sesión.
- `/design-sync` en el Acto 2.

#### Índice de hallazgos (de más a menos severo)

| Id      | Sev.  | Hallazgo                                                                                                                                              | Dónde                                                                                                                                                                        |
| ------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AU-A-01 | Alto  | El ⭐⭐ corto pierde lo que se le prometió: las segundas vueltas del S6, la mirada M3 y el registro de las miradas del S7                             | `docs/GUIA-DE-PRUEBA.html:130-140`; `design-system.md:303-305`; `SPRINT_006-summary.md:367-374`; bitácora del S7                                                             |
| AU-A-02 | Alto  | Cardinalidades cableadas en manual, brochure, export y design-system, sin gate; «los otros tres» sobrevive al pago de AU-S7-03                        | `MANUAL-DE-USO.md:375,380,413,445,455-457,479-481,507,573,586-589,662`; `BROCHURE.html:929,962,1070,1222,1227`; `brochure-export.json:45,136,281`; `GUIA-DE-PRUEBA.html:568` |
| AU-A-03 | Medio | La pasada de capturas ampliada (pago de AU-S7-22) murió en su única corrida tras la Fase 2, en la promesa nueva de cancelar al agrupar                | `scripts/capturas-s7.mjs:498-505`; `scratchpad/capturas-f2-report.txt`; `messages/*.json` `level2.cluster.cancelHint`                                                        |
| AU-A-04 | Medio | El manual dice «usa AUC» para el desbalance también con varias categorías, y no respalda lo que el brochure promete (D6)                              | `MANUAL-DE-USO.md:205`, `:596`; `BROCHURE.html:966`; `brochure-export.json:160`                                                                                              |
| AU-A-05 | Medio | Brochure y export: «la única cosa que sale de tu equipo es la narración», con un Sentry en el cliente                                                 | `BROCHURE.html:1207`; `brochure-export.json:387,453`; `instrumentation-client.ts:23-32`; `BLUEPRINT.html:194`                                                                |
| AU-A-06 | Medio | El README promete «publicar», y el manual, «llegará más adelante»                                                                                     | `README.md:10`, `:50`; `MANUAL-DE-USO.md:177-178`                                                                                                                            |
| AU-A-07 | Medio | Guía v4: un «Esperado» que el pago dejó viejo, un «por qué» falso en «Qué deja fuera» y filtros que no cuentan lo mejorado                            | `GUIA-DE-PRUEBA.html:140,222,227,443,470,504,537,568`                                                                                                                        |
| AU-A-08 | Medio | La decisión 2 (titular de fuga unificado) toca binaria y regresión sin desviación declarada, y tres textos dicen aún «su propio titular»              | bitácora `## Desviación del plan`; `decisions/015…:50-52`; `decisions/017…:37-38`; `design-sync/…/varias-categorias.html:43-44`                                              |
| AU-A-09 | Medio | Promesas aplazadas vivas: «llega en una próxima versión» en el bundle, «aún no se entrena» en design-system y «en esta versión» en el aviso de fechas | `design-sync/components/componentes/tarea-ambigua.html:50`; `design-system.md:188`; `messages/{es,en}.json:122`                                                              |
| AU-A-10 | Bajo  | `design-system.md` y la tarjeta de `design-sync` no reflejan los pagos de UI de la Fase 2                                                             | `design-system.md:335-338`; `design-sync/…/varias-categorias.html`, `…/agrupar.html`                                                                                         |
| AU-A-11 | Bajo  | Export: detalles viejos o incompletos y secciones del manual sin cotejo                                                                               | `brochure-export.json:22,281,387,…`; `tests/unit/brochure-export.test.ts:121-131`                                                                                            |
| AU-A-12 | Bajo  | BLUEPRINT: falta el gate de la Fase 2, la cifra «al cierre del H2» es anterior a la Fase 2 y dice «cuatro tareas» sumadas por el H2                   | `docs/BLUEPRINT.html:190,194,218,225,238`                                                                                                                                    |
| AU-A-13 | Bajo  | R9 en documentos: miles con espacio, decimales con coma y «%» sin el espacio de la app                                                                | `docs/kit-de-prueba/README.md:21,28,38,42,46`; `BLUEPRINT.html:87,108,190,218,225,238`; `GUIA-DE-PRUEBA.html:470,504`                                                        |
| AU-A-14 | Bajo  | El inglés del brochure: tres calcos y un nombre que no coincide con la app                                                                            | `BROCHURE.html:920,1249,1299,1320`                                                                                                                                           |
| AU-A-15 | Bajo  | El manual no dice qué se pierde al cancelar el Nivel 2 al agrupar, y la app sí lo dice                                                                | `MANUAL-DE-USO.md:479-489` (frente a `:279-281`)                                                                                                                             |
| AU-A-16 | Bajo  | «Cuatro agrupadores prueban de 2 a 10 grupos sobre todas las filas»: HDBSCAN no prueba k, y con tablas grandes ni son todos ni sobre todas las filas  | `MANUAL-DE-USO.md:445`; `BROCHURE.html:1070`; `brochure-export.json:281`                                                                                                     |

---

#### Hallazgos

##### AU-A-01 · Alto · El ⭐⭐ corto pierde lo que se le prometió

**Dónde:**

- `docs/GUIA-DE-PRUEBA.html:130-140`: las 7 paradas y «Qué deja fuera».
- `:432-433`: G4, la parada 2.
- `design-system.md:303-305`.
- `sprints/SPRINT_006-summary.md:367-374`.
- La bitácora del S7: no tiene registro de miradas.

**Qué pasa:** cuatro cosas, todas sobre lo que el método manda llevar al gate humano del ciclo.

1. **Las segundas vueltas del S6 se pierden en silencio.**
   - El summary del S6 dejó cinco segundas vueltas «maquetado, no visto» para «el gate del cierre
     del ciclo H2»:
     - las marcas del gráfico a 12 px;
     - los márgenes y los rótulos salteados, con cifras de seis dígitos;
     - el piso de cero de los decimales («72,918.000000 USD»);
     - la línea «cuál mirar»;
     - la FAQ del R² negativo.
   - La orden lo repite: «más las segundas vueltas «maquetado, no visto» del S6». El plan aprobado
     las pone en la parada 2: «estimar con el gráfico, más las segundas vueltas del S6».
   - En la guía, la parada 2 (G4, `:432-433`) solo mira el gráfico de `consumo-energia`. Ni G4 ni G6
     (la de `precio-fuga-plantada`) piden ver los rótulos de seis dígitos ni los decimales.
   - «Qué deja fuera» (`:140`) no las nombra.
   - Solo «cuál mirar» aparece, en G2, que es ⭐ pero no ⭐⭐.
2. **M3 no llega al ⭐⭐, aunque `design-system.md` dice que sí.**
   - `design-system.md:303-305` dice: «Miradas de FORMA M1 […], M2 […] y M3 («agrupar en su lugar»):
     maquetadas, no vistas. Su veredicto viaja al gate ⭐⭐ […] (paradas 4 y 5 del ⭐⭐ corto)».
   - El plan aprobado también lleva M3 a la parada 5.
   - Pero la parada 5 es I2 (segmentos → agrupar), que no toca la columna que no sirve. M3 es I7, y
     `:140` la manda fuera del corto.
3. **Las miradas no están registradas.**
   - La regla 10 dice que cada mirada se registra en la bitácora, y que la de TEXTO va como
     «maquetado, no visto».
   - En `SPRINT_007-implementation-log.md` no hay ningún registro de M1 a M3 ni de las tres miradas
     de TEXTO del plan: «cuál mirar», la FAQ de agrupar y la frase de que no hay prueba. `grep
"maquetad|no visto|M1"` solo encuentra la D4.
4. **El «⭐ completo» se ofrece sin las del H1.** La orden dice «el ⭐ completo (12 H2 + 11 H1) se
   OFRECE». La guía ofrece «12 pruebas, unos 45 minutos» (`:126`) y trata las 11 del H1 como
   regresión ya corrida. No existe un filtro que junte las dos.

**Evidencia:**

- `grep -n -i "12 px|saltead|piso de cero|seis decimales|R² negativo|maquetad|no visto|M3"` sobre la
  guía: ninguna coincidencia de esos temas.
- `grep -n "maquetad|M1|M2|M3"` sobre la bitácora: solo `:45` (D4) y `:1175`.

**Ajuste ejecutable:**

- **Parada 2 del ⭐⭐** (`GUIA-DE-PRUEBA.html:133` y G4 en `:432-433`), en ES (la guía es en
  español):
  - Recorrido: «G4 · el gráfico estimado frente a real, y las segundas vueltas del S6: Consumo de
    energía → «consumo_kwh» → Entrenar, en móvil y desktop; después sube `precio-fuga-plantada.csv`
    → «precio_usd» → Entrenar y mira el gráfico y la liga. Unos 4 min.»
  - Se suma al Esperado de G4: «Con precios de seis dígitos, los rótulos de los ejes no se pisan ni
    se cortan (marcas de 12 px, rótulos salteados si hace falta), y la liga muestra las cifras con
    los decimales de tu columna, sin colas de ceros.»
  - La FAQ del R² negativo se suma al Esperado de G2 (⭐): «…y en el manual, «¿Por qué el R² puede
    ser negativo?» se entiende sin saber estadística.»
  - Se recuentan los minutos. Si pasan de unos 20, se declara en `:140` qué parada cede y por qué.
- **M3**, una de dos:
  - (a) **recomendada:** se suma a la parada 5 un paso de 1 min: «antes, sube
    `tiendas-ciudades.csv` → objetivo «ciudad» → pulsa «Agrupar filas parecidas en su lugar»», y I7
    pasa al corto. «Qué deja fuera» pasa a cinco ⭐;
  - (b) se corrige `design-system.md:303-305`: «M1 → parada 4 y M2 → parada 5 del ⭐⭐ corto; M3 →
    prueba I7, del ⭐ completo, fuera del corto y declarada en la guía», y se dice así en el summary.
- **Bitácora,** subsección «Miradas del S7 (FORMA y TEXTO)», en matriz de una fila por mirada
  (archivo · botón o estado · qué mirar · respuesta esperada · «maquetado, no visto» · destino en la
  guía): M1 (H2, parada 4), M2 (I2, parada 5), M3 (I7 o parada 5), T1 «cuál mirar» (H2/G2), T2 la
  FAQ de agrupar (manual) y T3 la frase de que no hay prueba (I2). Se escribe **después** de
  verificar cada destino en la guía (regla 22).
- **El ⭐ completo:** se suma a `:126` «El ⭐ completo que se ofrece son las 12 del H2 más las 11 ⭐
  del H1 como regresión (filtro «⭐ H1»)», y un botón de filtro `data-filtro="h1"` que muestre los
  `.o-h1`, siguiendo el patrón de `filtrar()`.

**Verificado cuando:**

- cada segunda vuelta del S6 aparece en una parada o en «Qué deja fuera», con su razón;
- `design-system.md` y la guía dicen lo mismo del destino de M3;
- la bitácora tiene la matriz;
- el filtro «⭐⭐ corto» cuenta 7 (u 8) paradas y suma ≤ ~20 min.

Es un documento, no un gate: no lleva demo en rojo.

##### AU-A-02 · Alto · Cardinalidades cableadas en los documentos, sin gate (casilla 7)

**Dónde** (cifras que vienen de una constante):

| Cifra                                    | Constante                                                                          | Documentos                                                            |
| ---------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| «3 a 20» / «más de 20»                   | `MULTICLASS_MIN_CLASSES` / `MULTICLASS_MAX_CLASSES` (`tarea.ts:40-43`)             | `MANUAL:368,375,427,686`; `BROCHURE:929,1222`; `export:45`            |
| «cuatro agrupadores» / «Four clusterers» | `CLUSTER_MEMBER_IDS.length`                                                        | `MANUAL:433,445,579,686`; `BROCHURE:1070`; `export:281`               |
| «los otros tres»                         | `CLUSTER_MEMBER_IDS.length − 1`                                                    | `MANUAL:481,662`; cita de la guía `:568`                              |
| «de 2 a 10 grupos»                       | `CLUSTER_K_MIN` / `CLUSTER_K_MAX`                                                  | `MANUAL:445`; `BROCHURE:1070`; `export:281`                           |
| «8,000»                                  | `AGGLO_MAX_ROWS`                                                                   | `MANUAL:479,509,589,658,661`; `BROCHURE:1227`; `design-system.md:325` |
| «2,000»                                  | `SILHOUETTE_SAMPLE`                                                                | `MANUAL:507`                                                          |
| «0.10», «0.7», «80 %», «10 veces»        | `CLUSTER_GAP_MIN`, `CLUSTER_STABILITY_MIN`, `STABILITY_FRACTION`, `STABILITY_RUNS` | `MANUAL:455-457,586-587`                                              |
| «5 filas con valor»                      | `LEAKAGE_CLASS_MIN_SUPPORT`                                                        | `MANUAL:413,573`                                                      |
| «siete ejemplos»                         | `EXAMPLES.length` (`StartScreen.tsx:31`)                                           | `BROCHURE:962`; `export:136`                                          |

**Qué pasa:**

- `tests/unit/cardinalidades.test.ts` solo mira `messages/*.json`.
- Si cambia una constante, el roster o la lista de ejemplos, el manual (que es la fuente del
  conteo), el brochure público y el export que consume la vitrina mienten sin que ninguna prueba lo
  vea.
- Es la misma clase que AU-S7-03 (Alto). La frase exacta que ese pago sacó del copy, «los otros
  tres», sigue dos veces en el manual.

**Evidencia:**

- `grep -noE "otros tres|other three"` → `MANUAL-DE-USO.md:481`, `:662`, más la cita de la guía en
  `:568`.
- `grep -rn "MANUAL|BROCHURE|brochure-export" tests/unit/cardinalidades.test.ts` → 0.

**Ajuste ejecutable:**

1. **El texto.**
   - `MANUAL-DE-USO.md:481-482`: «Los demás agrupadores usan todas tus filas.»
   - `MANUAL-DE-USO.md:661-662`: «Los demás agrupadores usan todas tus filas, y la app te lo dice
     antes de agrupar y donde se lee el resultado.»
   - La cita de la guía en `:568` va en AU-A-07.
2. **El gate,** `tests/unit/cardinalidades-docs.test.ts`.
   - **Qué hace:** lee `docs/MANUAL-DE-USO.md`, `docs/BROCHURE.html`, `docs/brochure-export.json` y
     `design-system.md`, y para cada regla `{ re, esperado }` exige que **cada** coincidencia lleve la
     cifra de su constante, nombrando `archivo:línea`.
   - **Las reglas:**
     - `/(?:[Dd]e|[Ee]ntre|[Ff]rom) (\d+) (?:a|y|to) (\d+)(?: categor| categories)?/` →
       `[MULTICLASS_MIN_CLASSES, MULTICLASS_MAX_CLASSES]`;
     - `/más de (\d+) valores distintos|more than (\d+) distinct/` → `MULTICLASS_MAX_CLASSES`;
     - `/\b(cuatro|tres|cinco|four|three|five) (agrupadores|clusterers)\b/i` →
       `CLUSTER_MEMBER_IDS.length`, con un mapa de palabras a número;
     - `/de (\d+) a (\d+) grupos|(\d+) to (\d+) groups/` → `[CLUSTER_K_MIN, CLUSTER_K_MAX]`;
     - `/más de ([\d,]+) filas, el jerárquico|more than ([\d,]+) rows, hierarchical|sobre ([\d,]+) (?:filas )?al azar/`
       → `thousands(AGGLO_MAX_ROWS)`;
     - `/muestra de hasta ([\d,]+) filas/` → `thousands(SILHOUETTE_SAMPLE)`;
     - `/al menos \**([\d.]+)\** de puntaje|por al menos ([\d.]+) de puntaje/` →
       `CLUSTER_GAP_MIN.toFixed(2)`;
     - `/al menos ([\d.]+) de 1|hace falta al menos ([\d.]+)\./` → `String(CLUSTER_STABILITY_MIN)`;
     - `/el \**(\d+) %\** de tus filas/` → `STABILITY_FRACTION * 100`;
     - `/\**(\d+) veces\**/` → `STABILITY_RUNS`;
     - `/al menos (\d+) filas con valor/` → `LEAKAGE_CLASS_MIN_SUPPORT`;
     - `/(siete|seven) (ejemplos|bundled examples)|[Ss]iete ejemplos/` → el número de entradas
       `{ key:` dentro de `EXAMPLES` en `StartScreen.tsx`, contado por regex para no montar React.
   - **Prohibidas** en los cuatro documentos: `/otros tres|other three/`.
   - **Que pueda fallar siquiera:** cada regla exige al menos 1 coincidencia en el conjunto. Si un
     documento se re-redacta y la cifra se escapa de la regex, la prueba lo nombra.
3. **Verificado cuando:** la prueba pasa en el árbol, y la de AU-S7-03 sigue verde.
4. **Demo en rojo** (en el mismo commit que el gate, regla 11):

   ```
   scripts/demo-rojo.sh \
     --archivo docs/MANUAL-DE-USO.md \
     --buscar 'muestra de hasta 2,000 filas' \
     --reemplazar 'muestra de hasta 3,000 filas' \
     --gate './node_modules/.bin/vitest run tests/unit/cardinalidades-docs.test.ts' \
     --debe-nombrar 'MANUAL-DE-USO.md' \
     --esperar-verde './node_modules/.bin/vitest run tests/unit/cardinalidades-docs.test.ts' \
     --minimo-tests <n>
   ```

   Una segunda demo devuelve «Los otros tres» a `:481`: debe nombrar «otros tres».

##### AU-A-03 · Medio · La pasada de capturas ampliada (pago de AU-S7-22) murió en su única corrida, en la promesa nueva de cancelar al agrupar

**Dónde:**

- `scripts/capturas-s7.mjs:486-505`: la interacción «tras cancelar, «Descargar filas con su grupo»
  dice que ya no se puede».
- El copy de `level2.cluster.cancelHint` (ES): «Si cancelas cuando ya está agrupando, para descargar
  tus filas con su grupo hay que volver a agrupar.»
- `cluster.labels.unavailable`: «El modelo activo ya no guarda el grupo de tus filas…».

**Qué pasa:**

- La única corrida de la pasada después de los pagos de la Fase 2 (`scratchpad/capturas-f2.sh`,
  23:01) salió con `TimeoutError` en `capturas-s7.mjs:503:76`. Esperó 60 s el texto «ya no guarda
  el grupo de tus filas» y no apareció.
- `capturas-s7-f2/` termina en `27b-nivel2-corriendo`: no hay `27c-cancelado` ni nada posterior.
- La última corrida completa (`capturas-s7.log`, 20:29) es anterior a la Fase 2: dice «0/6 con el
  filtro ⭐⭐ corto», cuando hoy son 7.
- El commit `b7d9a56` (23:06) dice que el arnés «activates every control the audit listed
  (…cancelling Level 2 while clustering)», pero no hay corrida que lo muestre terminado.
- **Lo que queda sin demostrar en el modo real** (regla 11, «el modo») es precisamente la frase que
  el pago de AU-S7-17 puso en pantalla. Solo hay dos salidas:
  - si tras cancelar la descarga funciona, el copy exagera la pérdida;
  - si la UI cae en un error genérico, el aviso honesto no llega.

  La prueba de hook (FakeWorker) cubre la rama, pero no el runtime real: worker re-creado, Pyodide
  en frío e import de la instantánea.

**Evidencia:** `scratchpad/capturas-f2-report.txt` («locator.waitFor: Timeout 60000ms exceeded …
waiting for getByText(/ya no guarda el grupo de tus filas/)»). `ls scratchpad/capturas-s7-f2/`.

**Ajuste ejecutable:**

1. **Volver a correr la pasada:** `pnpm build`, luego `NARRATION_PROVIDER=mock pnpm start -p 3000`,
   luego `OUT=<scratchpad> node scripts/capturas-s7.mjs`.
2. **Si el texto no aparece,** mirar la captura en el punto del fallo (sumar un `shot` antes del
   `waitFor`):
   - Si la descarga **funciona** tras cancelar, el copy cambia a lo que pasa. ES: «Puedes cancelar
     mientras corre: vuelves a este resultado, con tus filas y su grupo.» EN: «You can cancel while
     it runs: you come back to this result, rows and groups included.»
   - Si la UI muestra un error genérico, se arregla el camino `cluster-labels` → `unavailable`
     (`useExperiment.ts:841-850`).
   - Si es solo tiempo (Pyodide en frío más el import), el arnés espera a que desaparezca
     «Recuperando el modelo anterior…» antes de pulsar, sin subir el timeout a ciegas.
3. **Registrar la corrida después del hecho:** cuántas `OK interacción`, cuántos encuadres y 0
   hallazgos.

**Verificado cuando:** una corrida completa del arnés, sobre el árbol final, sale con exit 0 y reporta
«OK interacción: tras cancelar, «Descargar filas con su grupo» dice que ya no se puede», o el texto
equivalente si el copy cambia. Se cruza con la superficie de C (regla 17).

##### AU-A-04 · Medio · El manual dice «usa AUC» para el desbalance también con varias categorías, y no respalda la D6 del brochure

**Dónde:**

- `docs/MANUAL-DE-USO.md:205`, en las alertas antes de entrenar, una conducta de hoy: «un **objetivo
  desbalanceado** (una clase es rara) — por eso el veredicto usa AUC.»
- `docs/MANUAL-DE-USO.md:596`, en el diccionario: «Desbalance de clases | Una de las dos respuestas
  es mucho más rara que la otra. Obliga a mirar AUC en vez de aciertos.»

**Qué pasa:**

- Con varias categorías el veredicto usa la exactitud balanceada (`MULTICLASS_PRIMARY_METRIC`), y la
  alerta nombra la categoría más chica (`config.eda.imbalanceMulticlass`, pago de AU-S7-14).
- El brochure ya lo corrigió: «Desbalance» en `:1295` y D6 en `:966` («con varias categorías, la más
  chica, con su nombre»).
- El manual no lo corrigió, y es `fuente_del_conteo`. La sección «Clasificar en varias categorías»
  no menciona las alertas antes de entrenar. La extensión S7 de D6 queda sin respaldo en el manual,
  y el manual la contradice.

**Ajuste ejecutable** (el manual es en español, regla 9):

- `:205`: «un **objetivo desbalanceado** (una respuesta es mucho más rara que las otras): con dos
  categorías, por eso el veredicto usa el AUC; con varias, la alerta nombra la categoría más chica y
  el veredicto usa la exactitud balanceada.»
- `:596`: «Una de las respuestas es mucho más rara que las otras. Obliga a mirar una métrica que no
  se deje engañar: el AUC con dos categorías, la exactitud balanceada con varias.»
- En «Clasificar en varias categorías», después de «La fuga, por categoría» (`:414`), una viñeta
  nueva: «**Antes de entrenar**, la app te avisa si una columna separa casi a la perfección **una**
  categoría del resto (nombra la columna y la categoría) y si una categoría es mucho más rara que las
  demás (la nombra, con su porcentaje).»

**Verificado cuando:** `grep -n "usa AUC\|mirar AUC" docs/MANUAL-DE-USO.md` solo aparece acotado a
dos categorías, y la fila D6 de la tabla de mapeo apunta a una línea del manual que dice lo mismo.

##### AU-A-05 · Medio · Brochure y export: «la única cosa que sale de tu equipo es la narración», con un Sentry en el cliente

**Dónde:**

- `docs/BROCHURE.html:1207`. ES: «La **única** cosa que sale de tu equipo es la narración con IA, y
  solo cuando pulsas su botón. […] Si nunca tocas ese botón, no sale nada.» EN: «The only thing that
  leaves your machine is the AI narration… If you never touch that button, nothing leaves.»
- `docs/brochure-export.json:387`: el detalle de `filas_del_usuario_en_la_red`, «La única salida
  posible es la narración con IA».
- `docs/brochure-export.json:453`: `privacidad.detalle`, «La única salida es la narración con IA».

**Qué pasa:**

- `instrumentation-client.ts:23-32` inicia `@sentry/browser` cuando hay
  `NEXT_PUBLIC_SENTRY_DSN`.
- `src/lib/observability.ts:12-73` manda, desde el navegador, `captureMessage(experiment-error,
scoring-error, …)` y el breadcrumb `probeta.league`, con filas, columnas y tarea: metadatos,
  nunca valores.
- El export cuenta Sentry entre los servicios contratados («Sentry free tier»). La planeadora anota
  «GitHub / Vercel / Sentry · Ya operando desde S1».
- `BLUEPRINT.html:194` dice «inerte sin DSN», pero no dice si producción lo tiene.
- Por lo tanto, una de dos:
  - si producción tiene DSN, la frase pública es falsa: salen informes técnicos sin pulsar nada;
  - si no lo tiene, el export (stack y costo) y el BLUEPRINT deben decir que Sentry está inerte en
    producción.

  La regla dura 2 se cumple en los dos casos (son metadatos). El problema es la honestidad de la
  frase, que el S7 reescribió además en inglés.

**Ajuste ejecutable:**

1. **Verificar** si la variable existe en el entorno de producción de Vercel. Es una acción del
   usuario o del panel; el registro de la URL vive en la planeadora.
2. **Si existe,**
   - `BROCHURE.html:1207`, ES: «Lo único que sale de tu equipo con contenido tuyo es la narración con
     IA, y solo cuando pulsas su botón. […] Además, si algo falla, la app manda un aviso técnico con
     metadatos (cuántas filas y columnas, qué tarea), nunca valores ni nombres de tus columnas.»
   - EN: «The only thing that leaves your machine with anything of yours in it is the AI narration,
     and only when you press its button. […] Also, if something breaks, the app sends a technical
     report with metadata (how many rows and columns, which task), never your values or column
     names.»
   - Se quita «Si nunca tocas ese botón, no sale nada» / «If you never touch that button, nothing
     leaves».
   - Export `:387` y `:453`: «Lo único que sale con contenido del usuario es la narración con IA […];
     los errores mandan a Sentry solo metadatos (filas, columnas, tarea), nunca valores.»
3. **Si no existe,** `BLUEPRINT.html:194`: «En producción no hay DSN: Sentry no envía nada»; en el
   export, el costo y el stack dicen «inerte en producción».

**Verificado cuando:** la frase del brochure, el export y el BLUEPRINT dicen lo mismo que el entorno
de producción, y la e2e de paridad sigue verde.

##### AU-A-06 · Medio · El README promete «publicar», y el manual, «llegará más adelante»

**Dónde:**

- `README.md:10`: «…por el ciclo completo: cargar un CSV, limpiarlo, entenderlo, modelar, comprobar y
  publicar.»
- `README.md:50`: «…load a CSV, clean it, understand it, model, check and publish.» El README es
  nuevo del S7 (pago de AU-S7-24).
- `docs/MANUAL-DE-USO.md:177-178`: «Publicar el modelo para que otros lo usen llegará más adelante.»
  Es una promesa aplazada heredada del S3, y el constructor la dejó para esta auditoría (bitácora,
  decimocuarto commit).

**Qué pasa:**

- Publicar no existe: «Publícalo en un clic» está en la VISION como [MVP], sin construir.
- El plan del S7 deja el H3 sin decidir: «se decide en el F0 que sigue al Acto 2». El README lo
  afirma en presente y el manual lo promete sin un plan comprometido.

**Ajuste ejecutable:**

- `README.md:9-10`, ES: «…por el ciclo: cargar un CSV, limpiarlo, entenderlo, modelar, comprobar el
  resultado y llevarse el modelo en un archivo para puntuar datos nuevos.»
- `README.md:49-50`, EN: «…through the cycle: load a CSV, clean it, understand it, model, check the
  result, and take the model away in a file to score new data.»
- `MANUAL-DE-USO.md:177-178`: «El archivo `.probeta.json` **solo lo entiende Probeta** (no es un
  formato estándar de intercambio): quien quiera usar tu modelo necesita abrirlo en Probeta.»

**Verificado cuando:** `grep -n "publicar\|publish" README.md` → 0, y `grep -n "llegará"
docs/MANUAL-DE-USO.md` → 0.

##### AU-A-07 · Medio · Guía v4: un «Esperado» que el pago dejó viejo, un «por qué» falso y filtros que no cuentan lo mejorado

**Dónde y qué:**

- **(a) I8, `GUIA-DE-PRUEBA.html:568`.** Cita «…asigna el resto al grupo más cercano (los otros
  tres usan todas).» Tras AU-S7-03, la app dice «(los demás agrupadores usan todas)»
  (`roster.clusterSample`). Es una prueba ⭐: el usuario verá otro texto y no sabrá si es un defecto.
- **(b) «Qué deja fuera», `:140`.** Justifica dejar fuera «el Nivel 2 en desktop (F7, H7)» porque
  «la CI ya verifica por otro camino en cada push». No es así:
  - ninguna e2e corre el Nivel 2 con varias categorías (H7);
  - la del Nivel 2 binario (`liga-cancelar.spec.ts:14-60`) arranca y cancela, pero no corre hasta
    «La liga: 14 modelos» (F7);
  - `grep -n "Nivel 2" tests/e2e/*.spec.ts` solo muestra `liga-cancelar` y el de 9,000 filas de
    `agrupar`.
- **(c) B4, `:227`.** «En cualquier resultado, busca la tabla «La liga: N modelos»». Al agrupar, la
  tabla es «Los agrupadores: N».
- **(d) Los filtros.** B3 (`:222`) y G6 (`:443`) llevan el chip «Mejorada en S7», pero su
  `data-origen` es `s1` y `s6`. El filtro «Mejorado en S7» (`data-filtro="mejora"`) muestra 3 de las
  5 que el historial (`:583`) declara mejoradas. Las dos que se pierden son justo la decisión 2 del
  usuario.
- **(e) I2, `:537`.** No menciona la línea nueva de AU-S7-10, «En el re-muestreo más distinto se
  parecen en 0.53 de 1.» Medí 0.53 con la sonda.
- **(f) R9 en dos Esperado.** H5 (`:504`) dice «(1%)» y G11 (`:470`) dice «(25%)», cuando la app
  escribe en español «1 %» y «25 %» con un espacio no separable (`score.novelty.summary`).

**Ajuste ejecutable:**

- **(a)** `:568`: «…asigna el resto al grupo más cercano (los demás agrupadores usan todas).»
- **(b)** Una de dos:
  - un e2e nuevo en `tests/e2e/multiclase.spec.ts`: `planes-suscripcion-mediano.csv` → «plan» →
    Entrenar → «Correr el Nivel 2 (+6)» → «La liga: 14 modelos», con su demo en rojo (forzar
    `level2` vacío y que la prueba caiga nombrando «La liga: 14 modelos»);
  - o el texto honesto en `:140`: «…el Nivel 2 en desktop (F7, H7): la CI lo arranca y lo cancela
    (`liga-cancelar`), y la integración con Pyodide real entrena los 14 miembros de cada tarea;
    correrlo entero en pantalla no lo verifica la CI y queda en las pruebas F7 y H7, fuera del
    corto.»
- **(c)** `:227`: «En cualquier resultado con objetivo, busca la tabla «La liga: N modelos» (al
  agrupar es «Los agrupadores: N», prueba I3).»
- **(d)** `data-origen="mejora"` en los `<li>` de B3 y G6.
  - Verificado cuando: el filtro «Mejorado en S7» cuenta 0/5.
  - Rojo posible (si se suma una prueba al arnés de capturas que lea el contador del filtro):
    devolver `s1` en B3; el contador cae a 0/4.
- **(e)** Al final de la cita de I2: «En el re-muestreo más distinto se parecen en 0.53 de 1.»
- **(f)** `(1 %)` y `(25 %)`, con espacio no separable.

**Verificado cuando:** cada cita entre «» de los bloques H, I y E6 existe, con sus parámetros, en
`messages/es.json`. Una sonda como la mía (`auditor-a/sonda`) lo comprueba.

##### AU-A-08 · Medio · La decisión 2 cambia la binaria y la regresión sin desviación declarada, y tres textos dicen aún «su propio titular»

**Dónde:**

- La orden, en «Qué NO tocar», dice: «La liga binaria y la de regresión salvo lo que la regla por
  clase (D8) exige».
- La decisión 2 del usuario (bitácora `:1474-1488`) unificó el titular de fuga en las tres tareas.
  Es correcta y autorizada, pero `## Desviación del plan` llega solo hasta D9 y ningún ADR la
  registra.
- Tres textos de este PR dicen aún que la fuga con varias categorías tiene un titular propio:
  - `decisions/015-multiclass-as-third-task.md:50-52`: «A per-category leak (ADR 017) gets its own
    headline…»;
  - `decisions/017-per-class-leakage-minimum-support.md:37-38`: «The multiclass headline says
    «possible data leak» instead»;
  - `design-sync/components/componentes/varias-categorias.html:43-44`: «Una fuga que delata una
    categoría tiene su propio titular».

**Qué pasa:** la planeadora lee las desviaciones en la bitácora, y el cambio de conducta en dos
tareas que la orden protegía no le llega por ese canal. Los ADR y el bundle, que se publica en el
Acto 2, describen una regla que ya no existe.

**Ajuste ejecutable:**

- **Bitácora, D10:** «**D10 · El titular de fuga, el mismo en las tres tareas con objetivo**
  (decisión 2 del usuario en la auditoría, 2026-10-06). Toca la binaria y la regresión, que la orden
  dejaba fuera salvo D8: «Métricas casi perfectas — sospechoso» pasa a «Posible fuga de datos —
  sospechoso», con un detalle que dice qué se encontró. Sin umbral nuevo. Pedido a la planeadora:
  ninguno; se declara.»
- **ADR 015 §6**, último punto (es de este sprint, así que se edita): «A leak gets the same headline
  in every task with a target, «Possible data leak — suspicious» (user decision 2 of the S7 audit,
  2026-10-06). With several categories its detail says the column separates one category from the
  rest, so the overall figure can be far from perfect (planted example: 0.78).»
- **ADR 017, consecuencia:** «A per-class flag does not imply near-perfect overall metrics; the
  headline says «possible data leak» in every task with a target (ADR 015).»
- **`varias-categorias.html:43-44`:** «Una fuga lleva el mismo titular en las tres tareas con
  objetivo; con varias categorías, el detalle dice que la columna separa una categoría del resto: la
  cifra global puede quedar lejos de perfecta.»

**Verificado cuando:** `git grep -n "own headline\|propio titular"` sin `sprints/` da 0, y D10 está
en la bitácora.

##### AU-A-09 · Medio · Promesas aplazadas que sobreviven al S7 (casilla 4)

**Dónde y qué:**

- **`design-sync/components/componentes/tarea-ambigua.html:50`.** La respuesta «Categorías» dice
  «Esta versión todavía no entrena varias clases: llega en una próxima versión.» Es falso desde el
  S7, y el bundle se publica en el Acto 2. La app hoy dice (`task.ask.multiclase.desc`): «Cada
  número es una categoría, como una nota del 1 al 5. El veredicto usa la exactitud balanceada, que
  pesa igual cada categoría.»
- **`design-system.md:188`.** «si la tarea aún no se entrena, lo dice en `ink-muted` y deshabilita
  «Entrenar modelos»». Desde el S7 no queda ninguna tarea detectada que «aún no» se entrene: la
  columna que no sirve ofrece «Agrupar filas parecidas en su lugar».
- **`messages/es.json:122` y `en.json:122`, `config.warnings.date`.** «En esta versión no se usan
  para dividir por tiempo; se ignoran como predictores» / «This version doesn't split by time;
  they're ignored as predictors».
  - Es la frase hermana de `modelcard.limits.dates`, que el pago de AU-S7-36 ya corrigió.
  - «En esta versión» promete una versión que no está planeada: las series de tiempo son «roadmap»
    en el plan del S7.
  - «Predictores» no aplica al agrupar.

**Ajuste ejecutable:**

- `tarea-ambigua.html:50`: «Cada número es una categoría, como una nota del 1 al 5. El veredicto usa
  la exactitud balanceada, que pesa igual cada categoría.» Es el texto vigente de la app.
- `design-system.md:188-189`: «…si la columna no sirve como objetivo, ⚠ `caution` y el botón
  secundario «Agrupar filas parecidas en su lugar» (S7); la columna nunca se esconde.»
- `config.warnings.date`:
  - ES: «Detectamos columnas que parecen fecha ({cols}). No entran al análisis: la app no parte los
    datos por tiempo.»
  - EN: «We found columns that look like dates ({cols}). They don't enter the analysis: the app
    doesn't split the data by time.»
  - Estas dos frases pasan la casilla 4: ninguna promete una versión.

**Verificado cuando:** `git grep -nE "todavía no|próxima versión|aún no se entrena|En esta versión|This version doesn't" -- ':!sprints/' ':!tests/'`
solo devuelve historia (el manual `:304` y el historial de la guía) o conducta de hoy
(`unsupported-task`: «un tipo de tarea que esta versión no abre», que es cierto).

##### AU-A-10 · Bajo · `design-system.md` y la tarjeta de `design-sync` no reflejan los pagos de UI de la Fase 2

**Dónde:**

- **`design-system.md:335-338`.** «ConfusionTable: … Nombres recortados (`truncate`, 7–9 rem) con
  el nombre completo en `title`.» Desde AU-S7-21, el código es otro (`MulticlassResults.tsx:252-270`,
  `:373`):
  - las cabeceras de fila y la tabla por categoría usan `break-words`;
  - las columnas llevan delante el número de su fila («2·»).
- **`design-sync/components/componentes/varias-categorias.html`.** La matriz no lleva la numeración
  de las columnas.
- **`design-sync/components/componentes/agrupar.html`.** No muestra la línea del peor re-muestreo
  (AU-S7-10).

**Ajuste ejecutable:**

- `design-system.md:335-338`: «Los nombres de fila se leen enteros (`break-words`, 6–9 rem); cada
  columna lleva delante el número de su fila («2·») y recorta el nombre con el completo en `title`,
  porque arriba un nombre largo no cabe.»
- Actualizar las dos tarjetas: la numeración de las columnas y, en la lectura, la frase «En el
  re-muestreo más distinto se parecen en 0.53 de 1.»

**Verificado cuando:** la tarjeta y el documento describen lo que dibuja el código, leídos como imagen.

##### AU-A-11 · Bajo · Export: detalles viejos o incompletos, y secciones del manual sin cotejo

**Dónde y qué:**

- **`brochure-export.json:387`.** «Cinco pruebas e2e (score-download, export-import-rescore,
  saneamiento-sucio, why-modelcard y, desde el S6, regresion-score) inspeccionan la red». El S7 suma
  dos que también inspeccionan el tráfico: `multiclase-score.spec.ts:49-106` y
  `agrupar-score.spec.ts:55-106`. Hoy son siete.
- **T2.** «…y cada métrica, las de clasificar y las de estimar.» Falta agrupar: silueta,
  estabilidad, «fuera de todo grupo» y exactitud balanceada, todas en el diccionario del manual
  `:564-589`.
- **`app.sprints_cerrados: 6`.** En `main` el PR del S6 ya lo puso en 6 para sí mismo. Al mergear
  este PR deberían ser 7.
- **`tests/unit/brochure-export.test.ts:121-131`.** Solo exige que `seccion_manual` no esté vacía.
  - Dos secciones no son encabezados: «Limitaciones conocidas (Sprint 001)» e «Historial · Sprint
    004».
  - D7 (punto y coma) solo tiene respaldo en una fila del historial. El manual no describe la
    conducta.

**Ajuste ejecutable:**

- `:387`: «Siete pruebas e2e (score-download, export-import-rescore, saneamiento-sucio,
  why-modelcard, regresion-score y, desde el S7, multiclase-score y agrupar-score)…»
- T2: «…y cada métrica: las de clasificar, las de estimar y las de agrupar (silueta, estabilidad,
  «fuera de todo grupo»).»
- `sprints_cerrados: 7`, en el mismo PR, como el S6.
- Una prueba nueva en `brochure-export.test.ts`: cada `seccion_manual` aparece como encabezado o como
  viñeta en negrita de `docs/MANUAL-DE-USO.md`.
  - Rojo: cambiar la de G1 a «Agrupar»; cae nombrando G1.
  - Antes de encender la prueba, un párrafo del manual que describa el bloqueo del punto y coma (la
    sección «Sobrevive datos reales») y D7 apuntando a él.

**Verificado cuando:** la prueba nueva pasa y el detalle dice siete.

##### AU-A-12 · Bajo · BLUEPRINT: falta el gate de la Fase 2, una cifra de cierre es anterior a la Fase 2 y dice «cuatro tareas» sumadas

**Dónde y qué:**

- **`docs/BLUEPRINT.html:194` y la tabla de gates (`:207-230`).** No listan el paso «Regla 18 —
  excepciones de auditoría vencidas (verificar-retiros)» que el pago de AU-S7-05 sumó a `quality`
  (`.github/workflows/ci.yml:54-57`). Tampoco la prueba de cardinalidades del copy.
- **`:225`, «Al cierre del H2: 237,6 KiB y 3.074 ms, sin aviso».** Se midió en `e6cf659`. La Fase 2
  cambió la portada después: los estados de carga de `src/app/page.tsx` y `src/app/error.tsx`
  (AU-S7-19). La cifra «al cierre» se escribió antes del cierre (regla 22).
- **El párrafo de apertura.** «Lo que el H2 sumó vive dentro del navegador (dos librerías de modelos,
  cuatro tareas, la liga)». El H2 sumó tres tareas: la binaria es del H1.

**Ajuste ejecutable:**

- Una fila en la tabla de gates: «Retiro de excepciones (`verificar-retiros.mjs`) · `quality` · Que
  la excepción de `pnpm audit` (ADR 012) siga en pie cuando su advisory ya tiene parche: la condición
  de retiro se lee en cada push (regla 18).»
- Otra fila: «Cardinalidades del copy (`cardinalidades.test.ts`) · `quality` · Una cifra que viene
  de una constante escrita a mano en el copy.» Y la de AU-A-02, si se suma.
- `:225`: la cifra re-leída de la corrida de `lighthouse` del último push, con la fecha y el run.
- La apertura: «…(dos librerías de modelos, tres tareas nuevas —varias categorías, estimar y agrupar—
  y la liga)».

**Verificado cuando:** la tabla nombra cada paso de `ci.yml`, y la cifra de Lighthouse sale de un run
posterior a `b7d9a56`.

##### AU-A-13 · Bajo · R9 en documentos

**Dónde:**

- **`docs/kit-de-prueba/README.md:21,28,38,42,46`:** «5 000 filas», «9 000 filas», «8 000». El pago
  de `b7d9a56` («Manual and guide write thousands as the app does») no llegó al README del kit.
- **`docs/BLUEPRINT.html:87,108,190,218,225,238`:** «237,6 KiB», «39,58 MiB», «40,18 MiB», «3.500
  ms», «3.074 ms», «0,9».
- **`docs/GUIA-DE-PRUEBA.html:470,504`:** «(25%)» y «(1%)». Va también en AU-A-07(f).

**Ajuste ejecutable:**

- Kit: «5,000 filas», «9,000 filas», «8,000».
- BLUEPRINT: «237.6 KiB», «39.58 MiB», «40.18 MiB», «3,500 ms», «3,074 ms», «0.9». Es la regla de
  `design-system.md:351` (punto decimal, miles con coma, en los dos idiomas).
- Opcional: sumar estos tres archivos al barrido R9 de AU-A-02, con
  `/\d,\d{1,2}\s?(KiB|MiB|%)|\d \d{3}\b/` prohibido.

**Verificado cuando:** el barrido no encuentra coincidencias fuera de código.

##### AU-A-14 · Bajo · El inglés del brochure: tres calcos y un nombre que no coincide con la app

**Dónde y qué:**

- **Glosario, `BROCHURE.html:1299`.** Dice «Outside any group», y la app dice «Outside every group»
  (`cluster.noise.title`, en.json).
- **Pie, `:1320`.** «…and Sprint 007 adds six: classifying into several categories and the five of
  grouping.» Es un calco de «las cinco de agrupar».
- **Requisitos, `:1249`.** «after that it runs freely» es un calco de «va suelto».
- **Primera puerta, `:920`.** «Training with the progress in sight.» se lee traducido.

**Ajuste ejecutable (EN):**

- `:1299`: «Outside every group».
- `:1320`: «**41 features**, all on this page. Sprint 005's honest league is summed up as “A league
  of models, picked without looking at the test”; Sprint 006 adds two for estimating a quantity, and
  Sprint 007 adds six: classifying into several categories and five for grouping rows.»
- `:1249`: «…the first time it takes a few seconds to fetch the analysis engine; after that it's
  quick.»
- Puerta 1: «Training, with progress in view.»

**Verificado cuando:** la e2e de paridad sigue verde y la lectura en voz alta no tropieza.

##### AU-A-15 · Bajo · El manual no dice qué se pierde al cancelar el Nivel 2 al agrupar

**Dónde:** `docs/MANUAL-DE-USO.md:479-489`, en el agrupar, frente a `:279-281`, la liga: «vuelves al
resultado anterior sin perder nada».

**Qué pasa:** la app avisa (`level2.cluster.cancelHint` y `cluster.labels.unavailable`) que, si
cancelas cuando ya está agrupando, para descargar las filas con su grupo hay que volver a agrupar. El
manual no lo dice en la sección de agrupar, y la de la liga generaliza «sin perder nada». Es la frase
hermana de AU-S7-17 en el manual.

**Ajuste ejecutable:** después de «Tus filas con su grupo» (`:486-489`): «Si corres el Nivel 2 y lo
cancelas cuando ya está agrupando, vuelves al resultado anterior, pero para descargar tus filas con
su grupo hay que volver a agrupar: la app te lo dice.» Esta frase queda sujeta a lo que muestre
AU-A-03: si la descarga funciona tras cancelar, se omite.

**Verificado cuando:** el manual y la pantalla dicen lo mismo.

##### AU-A-16 · Bajo · «Cuatro agrupadores prueban de 2 a 10 grupos sobre todas las filas»

**Dónde:**

- `docs/MANUAL-DE-USO.md:445`: «cuatro agrupadores que prueban de **2 a 10 grupos** sobre todas tus
  filas».
- `docs/BROCHURE.html:1070`, ES/EN: «Cuatro agrupadores prueban de 2 a 10 grupos» / «Four
  clusterers try 2 to 10 groups».
- `brochure-export.json:281`, G1: «…prueban de 2 a 10 grupos sobre todas las filas».

**Qué pasa:**

- HDBSCAN no prueba k: lo encuentra por densidad (ADR 016 §3).
- El tope de k baja con pocas filas (`clusterKCap`).
- Por encima de 8,000 filas, el jerárquico se ajusta sobre una muestra.
- Con tablas grandes, el Nivel 1 corre menos agrupadores. Con 9,000 filas, 3: mi sonda.

El export viaja solo a la vitrina, sin la aclaración que el manual da más abajo.

**Ajuste ejecutable:**

- ES (manual y brochure): «K-Means, el jerárquico y la mezcla gaussiana prueban de 2 a 10 grupos y
  eligen cuántos (con la silueta o el BIC); HDBSCAN los encuentra por densidad. Cada uno dice cómo
  eligió.»
- EN: «K-Means, hierarchical and the Gaussian mixture try 2 to 10 groups and choose how many (by
  silhouette or BIC); HDBSCAN finds them by density. Each one says how it chose.»
- Export G1: el mismo texto en ES, sin «sobre todas las filas».
- Las cifras quedan bajo el gate de AU-A-02.

**Verificado cuando:** ninguna de las tres superficies dice «sobre todas las filas» ni pone a HDBSCAN
entre los que prueban k.

---

#### Tabla de mapeo del brochure (para el summary, regla 12)

Pie = 41 = 13 + 7 + 5 + 9 + 5 (puertas) + 2 (lo fino).

**Puerta 1 · El veredicto honesto (13)**

| Puerta | Funcionalidad en el brochure (ES)                    | Id del export | Sección del manual                                                             |
| ------ | ---------------------------------------------------- | ------------- | ------------------------------------------------------------------------------ |
| 1      | Eliges qué predecir                                  | V1            | El veredicto honesto                                                           |
| 1      | Entrena con el progreso a la vista                   | V2            | El veredicto honesto                                                           |
| 1      | El veredicto, en grande                              | V3            | El veredicto honesto                                                           |
| 1      | Un resultado demasiado bueno no se celebra           | V4            | El veredicto honesto                                                           |
| 1      | Advertencia de fuga con la columna nombrada          | V5            | El veredicto honesto · Clasificar en varias categorías (la fuga por categoría) |
| 1      | Las métricas, todas sobre datos que el modelo no vio | V6            | El veredicto honesto                                                           |
| 1      | Matriz de confusión                                  | V7            | El veredicto honesto                                                           |
| 1      | Los baselines, a la vista                            | V8            | El veredicto honesto                                                           |
| 1      | Una liga de modelos, elegida sin mirar la prueba     | V9            | La liga honesta                                                                |
| 1      | Estimar una cantidad, con el error en sus unidades   | V11           | Estimar una cantidad                                                           |
| 1      | Clasifica en varias categorías (S7)                  | V13           | Clasificar en varias categorías                                                |
| 1      | ¿Categorías o una cantidad? Te lo pregunta           | V12           | Estimar una cantidad                                                           |
| 1      | Nuevo experimento cuando quieras                     | V10           | El veredicto honesto                                                           |

**Puerta 2 · Datos reales, tratados de frente (7)**

| Puerta | Funcionalidad en el brochure (ES)             | Id del export | Sección del manual                                        |
| ------ | --------------------------------------------- | ------------- | --------------------------------------------------------- |
| 2      | Sube tu propio CSV                            | D1            | El veredicto honesto                                      |
| 2      | O prueba con siete ejemplos incluidos         | D2            | El veredicto honesto                                      |
| 2      | Vista previa con el perfil de cada columna    | D3            | El veredicto honesto                                      |
| 2      | Límites dichos de frente                      | D4            | El veredicto honesto · Limitaciones (S1)                  |
| 2      | Saneamiento con el conteo exacto              | D5            | Sobrevive datos reales                                    |
| 2      | Cinco alertas antes de entrenar               | D6            | Sobrevive datos reales (falta la extensión S7: AU-A-04)   |
| 2      | Si tu CSV separa con punto y coma, se bloquea | D7            | Historial · Sprint 004 (sin sección de conducta: AU-A-11) |

**Puerta 3 · El porqué, contado honesto (5)**

| Puerta | Funcionalidad en el brochure (ES)          | Id del export | Sección del manual         |
| ------ | ------------------------------------------ | ------------- | -------------------------- |
| 3      | Gráfico de importancia con dirección       | P1            | El porqué, contado honesto |
| 3      | Un texto explicativo sin IA y sin internet | P2            | El porqué, contado honesto |
| 3      | Narración con IA, solo si la pides         | P3            | El porqué, contado honesto |
| 3      | Si la narración falla, te dice por qué     | P4            | El porqué, contado honesto |
| 3      | Model card descargable                     | P5            | El porqué, contado honesto |

**Puerta 4 · El modelo se usa (9)**

| Puerta | Funcionalidad en el brochure (ES)               | Id del export | Sección del manual                                 |
| ------ | ----------------------------------------------- | ------------- | -------------------------------------------------- |
| 4      | Puntúa datos nuevos                             | U1            | El modelo se usa                                   |
| 4      | Si falta una columna, se niega a puntuar        | U2            | El modelo se usa                                   |
| 4      | Aviso de novedad con el porcentaje              | U3            | El modelo se usa                                   |
| 4      | Distribución de las predicciones y vista previa | U4            | El modelo se usa                                   |
| 4      | CSV puntuado sin pisar nada tuyo                | U5            | El modelo se usa · Clasificar en varias categorías |
| 4      | Exporta el modelo a un archivo                  | U6            | El modelo se usa                                   |
| 4      | Al importarlo, se valida antes de abrirlo       | U7            | El modelo se usa                                   |
| 4      | Resumen honesto antes de usarlo                 | U8            | El modelo se usa                                   |
| 4      | Puntúa sin volver a entrenar                    | U9            | El modelo se usa                                   |

**Puerta 5 · Agrupar sin objetivo (5, S7)**

| Puerta | Funcionalidad en el brochure (ES)    | Id del export | Sección del manual                    |
| ------ | ------------------------------------ | ------------- | ------------------------------------- |
| 5      | Agrupa filas parecidas, sin objetivo | G1            | Agrupar filas parecidas, sin objetivo |
| 5      | Te dice si los grupos existen        | G2            | ídem                                  |
| 5      | Qué distingue a cada grupo           | G3            | ídem                                  |
| 5      | Tus filas con su grupo               | G4            | ídem                                  |
| 5      | Asigna filas nuevas a un grupo       | G5            | ídem                                  |

**Lo fino (2)**

| Puerta  | Funcionalidad en el brochure (ES)   | Id del export | Sección del manual      |
| ------- | ----------------------------------- | ------------- | ----------------------- |
| Lo fino | Idioma: español e inglés            | T1            | Primeros pasos          |
| Lo fino | Las palabras, en una línea cada una | T2            | Diccionario de términos |

Del manual del S7 no tienen fila propia, y está bien así, porque se agrupan en otras:

- el rechazo por una categoría con muy pocas filas;
- el ganador por consenso y elegir otro agrupador (bajo V9 y G1/G2);
- la muestra del jerárquico (en lo fino).

#### Corridas

| #   | Comando                                                                                                                                                                                      | Resultado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `git log --oneline main..HEAD`; `git rev-list --count main..HEAD`; `git diff main...HEAD --shortstat`; `git merge-base main HEAD`                                                            | 28 commits; 187 archivos, +42,190 / −1,921; base `6f50c43`. HEAD pasó de `fd37a2c` a `0a0358f` (solo la bitácora) durante la auditoría.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2   | `git grep -nE "vercel[.]app\|workers[.]dev\|pages[.]dev" -- ':!pnpm-lock.yaml'`                                                                                                              | vacío (exit 1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 3   | `gh repo view --json homepageUrl,url`                                                                                                                                                        | homepage = la URL del propio repo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 4   | `gh pr view 19 --json isDraft,body`                                                                                                                                                          | `isDraft: true`; la línea 1 es «Para mergear (lo hace el usuario): …squash… /cierre-sprint ds»                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 5   | `gh pr checks 19` y `gh run list`                                                                                                                                                            | Run 37413373868 (`0a0358f`) en curso: quality, lighthouse, Vercel y Vercel Preview Comments en pass; e2e e integration pending. El run anterior (`a39525b`) dio failure (e2e 2 de 68, ya registrado en la bitácora).                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 6   | `diff CLAUDE.md ~/…/ordenes/CLAUDE-md-para-app.md`; `git log` del archivo en la planeadora                                                                                                   | Idénticos salvo el delta v1.39.0 añadido en la planeadora (`c8d3957`, 2026-10-04 16:30), marcado «para el próximo sprint»                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 7   | Extracción de texto (Python) de `BROCHURE.html` y `GUIA-DE-PRUEBA.html`, y barrido de la casilla 4 (ES y EN) sobre docs, ADR 015–019, README, design-system, design-sync y `messages/*.json` | Coincidencias en AU-A-06 y AU-A-09. Las demás son historia o conducta de hoy.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 8   | Script de mapeo brochure ↔ export ↔ manual                                                                                                                                                   | Puertas 13/7/5/9/5; insignias = cantidad de `li`; grupos del export iguales; total 41                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 9   | Comparación del texto ES de `<section class="climax">` entre `main` y HEAD                                                                                                                   | **IGUAL**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 10  | Sonda vitest de rutas (`auditor-a/sonda/rutas.test.ts`: `prepareRun`/`prepareClusterRun` reales, semilla 42)                                                                                 | F1: N1 8 · N2 3 · fuera 3. F2: 13 / fuera 1. H1: 10 · 3 (LightGBM, RF, RF bal.) · fuera 1. H7: 8 · 6 (con la red neuronal). G5 (Categorías): N1 9. I1: 4. I8: N1 3 + N2 1 (jerárquico). **Todo coincide con la guía.**                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 11  | Sonda en Pyodide real (`auditor-a/sonda/cifras.int.ts`, `loadRuntime` de `tests/integration/runtime.ts`; 20.9 s)                                                                             | **H2:** logística balanceada; 0.60 contra 0.54 (+0.06); F1m 0.55, exactitud 0.60, pérdida log. 0.90, AUC 0.89; mayoritaria 0.20; premium→empresa (5); CV 0.648 ± 0.099. **H4:** exactitud balanceada 0.78. **H7:** 0.70 contra 0.64. **I2:** jerárquico, k 3, 3/4 votos, «exist», 0.48 contra 0.23, gap 0.25, ARI 0.88 (mín. 0.53), 120/117/63. **I3:** K-Means k 5 (0.51), HDBSCAN con 0 % de ruido. **I4:** K-Means k 10, «none», 0.20 contra 0.23, −0.03; HDBSCAN con 67 % de ruido. **I8:** N1 sin consenso, gana K-Means (k 6); N2 gana el jerárquico (k 3), `sample_rows` 8000. **Todo coincide con la guía**, salvo los textos de AU-A-07. |
| 12  | Búsqueda en `messages/es.json` de las citas «» de la guía                                                                                                                                    | Todas existen salvo «(los otros tres usan todas)» (I8)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 13  | Lectura de `scratchpad/capturas-f2-report.txt`, `capturas-s7.log` y `ls capturas-s7-f2/`                                                                                                     | La corrida post-Fase-2 murió en `capturas-s7.mjs:503:76` (TimeoutError). La última completa fue a las 20:29 (pre-Fase-2).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 14  | `grep` de «Nivel 2» y del tráfico de red en `tests/e2e/*.spec.ts`                                                                                                                            | No hay e2e del Nivel 2 multiclase. `multiclase-score` y `agrupar-score` inspeccionan el tráfico.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 15  | Lectura de 2 capturas del brochure como imagen (`brochure-cap/b-360-dark-en-US-catalogo.png`, `…-pie.png`)                                                                                   | E04b en una columna a 360 px, sin cortes; el pie con 41 y la Etapa 7. El calco del pie está en AU-A-14.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 16  | `git status --short` al terminar                                                                                                                                                             | vacío                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Las sondas y sus salidas están en
`/private/tmp/claude-501/-Users-henryrincon-Code-app-ds/a3a1a067-2ff2-4cdd-8e29-1f09f53b4bcb/scratchpad/auditor-a/sonda/`
(`rutas.out`, `cifras.out`, `cifras.log`).
