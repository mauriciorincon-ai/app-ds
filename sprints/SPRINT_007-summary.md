---
sprint: 007
app: ds
status: closed
opened: 2026-10-04
closed: 2026-10-10
branch: sprint-007/agrupar-y-multiclase
pr: https://github.com/mauriciorincon-ai/app-ds/pull/19
---

# Sprint 007 Summary — Probeta DS («Agrupar y multiclase» · cierre del ciclo H2, sprint 3 de 3)

## Outcome

**Sí.** La app completa el catálogo de cuatro tareas de la VISION v1.1.0:

- **Clasificar en varias categorías** (de 3 a 20): la liga de 14 miembros en su forma multiclase,
  con la mecánica del S5 (validación cruzada dentro de train, regla de un error estándar, la prueba
  se abre una vez). El veredicto se lee en **exactitud balanceada**: «▲ Logística balanceada supera
  al baseline — por +0.06, 0.60 frente a 0.54 del mejor baseline».
- **Agrupar filas parecidas, sin objetivo:** cuatro agrupadores, ganador por consenso, y una lectura
  que se compara con datos sin estructura: «● Los grupos existen: 3 grupos estables» o «○ No hay
  estructura de grupos», con la tabla siempre a la vista.

**La binaria y la regresión no se rompieron.** Sus pruebas y carnadas siguieron en verde sin tocar
su lógica, salvo dos cambios declarados:

- D8: la fuga por clase con soporte mínimo, que la binaria adopta. En el kit, 0 de 11 objetivos
  binarios cambian de veredicto.
- D10: el titular de fuga es el mismo en las tres tareas con objetivo (decisión 2 del usuario en la
  auditoría).

Los archivos reales del S5 y del S6 importan y puntúan exactamente igual. Cero IA nueva.

Es el último sprint del ciclo H2. **Ocurrió el Acto 1** (de construcción). **El Acto 2** (⭐⭐ parada a
parada, brochure sellado y `/design-sync`) queda para cuando el usuario lo abra, y no retiene el
merge.

| Outcome                                                | Estado | Evidencia                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------ | :----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O1 · Clasificar en varias categorías, de punta a punta |   ✓    | `pipeline.py` con la rama `multiclase` en los 12 `_by_task`, `StratifiedKFold` acotado por la clase más chica y baselines mayoritaria + logística multinomial. Métrica primaria: exactitud balanceada, con empate 0.01 absoluto (decisiones 1 y 2 del STOP de la F0). Fuga por clase con soporte mínimo 5 y pureza normalizada, que la binaria adopta (D8 pagada, ADR 017). «Categorías» en la ambigua entrena (D2 pagada). Puntuar devuelve `<objetivo>_predicho` y `<objetivo>_probabilidad`; el manifiesto suma `task: multiclase` y `classes` (ADR 015) |
| O2 · Agrupar sin objetivo                              |   ✓    | K-Means, Jerárquico (Ward), GMM y HDBSCAN, con k en 2..10. Ganador por consenso (decisión 4). La lectura usa la referencia nula y la estabilidad: gap ≥ 0.10 y ARI ≥ 0.7, con R = 10 y f = 0.8 (decisión 5). Perfiles por grupo con η² y V de Cramér, en las unidades del usuario. «Fuera de todo grupo» con HDBSCAN. El jerárquico con más de 8,000 filas usa una muestra, con su nota (decisión 8). Las etiquetas por fila solo viajan a la descarga (P13). Exportar, importar y asignar filas nuevas (ADR 016)                                           |
| O3 · El ciclo H2 cierra (Acto 1)                       |   ✓    | `docs/BLUEPRINT.html` as-built del H2. Guía v4 con 66 pruebas, ⭐ H2 = 12 y el ⭐⭐ corto de 7 paradas (unos 20 min) con «Qué deja fuera». Brochure re-armado con la escena E04b y la quinta puerta, en ES/EN, con 41 funcionalidades (decisiones D-A y D-B). Auditoría de la constitución: 27 derivas. Manual con dos secciones nuevas. ADR 015–017, más el 018 y el 019, no anticipados                                                                                                                                                                   |

## Qué se construyó

- **Despacho exhaustivo, antes de sumar tareas (P2):**
  - `src/engine/despacho.ts` (`byTask`, `matchTask`, `matchByTask`): los tipos obligan a escribir
    la rama de cada tarea;
  - en Python, `_by_task` exige la rama de todas las tareas registradas (`dispatch-incomplete`);
  - un tripwire de fuente prohíbe `task === "…"` y `?? "binaria"` fuera del despacho.
- **Motor multiclase (Python + contrato):**
  - la rama `multiclase` con las clases en el orden de `sorted()` de Python;
  - métricas sobre prueba: exactitud balanceada, F1 macro, exactitud, pérdida logarítmica y AUC uno
    contra el resto (`null` sin probabilidades);
  - matriz K×K y métricas por clase;
  - `too-few-rows-per-class`, que nombra la categoría solo en pantalla;
  - costos con el factor `(K/5)^d` medido en el spike.

  Del lado de TS, `contract.ts` lee cada campo nuevo con su carnada.

- **Fuga por clase (D8):** `detectLeakageByClass`, uno contra el resto, con
  `LEAKAGE_CLASS_MIN_SUPPORT = 5` y pureza normalizada. La binaria usa la misma regla con K = 2.
- **Motor de agrupar:**
  - `run_clustering` con su propio validador: rechaza objetivo, partición, `cv_k` y clases;
  - el barrido de k, el consenso (`select_consensus`), la referencia nula y la estabilidad;
  - los perfiles y la regla de asignación (centroides, radios o la mezcla gaussiana);
  - el modo muestra del jerárquico.

  En TS: `prepareClusterRun`, `computeClusterReading`, `selectClusterWinner` y `hasConsensus`, en un
  solo sitio. Los costos van en dos partes (D5).

- **UI:**
  - el selector con «Sin objetivo: agrupar filas parecidas» como primera opción;
  - la TaskCard «Vas a clasificar en N categorías»;
  - `MulticlassResults.tsx`: veredicto, «cuál mirar», la matriz como tabla con ✓, la confusión más
    frecuente y la tabla por categoría;
  - `ClusterResults.tsx`: la lectura como h1, los perfiles, la tabla de agrupadores, «Elegir» y
    «Volver al ganador», las filas con su grupo y asignar filas nuevas;
  - la model card por tarea, puntuar por tarea y el resumen del import por tarea;
  - dos botones de ejemplo: «Planes de suscripción» y «Segmentos de clientes»;
  - «Agrupar filas parecidas en su lugar» cuando una columna no sirve como objetivo;
  - las pantallas que la portada no dibuja, cargadas bajo demanda con su «Cargando…» y un límite de
    error (ADR 018, AU-S7-19).
- **Datos** (con semilla, `make-example-datasets.mjs`; los seis heredados salieron idénticos):
  - `planes-suscripcion.csv` (200 filas, 5 categorías);
  - `planes-suscripcion-mediano.csv` (5,000 filas, para el Nivel 2);
  - `planes-fuga-plantada.csv` (la fuga delata solo «empresa»);
  - `segmentos-clientes.csv` (300 filas, 3 grupos plantados);
  - `sin-grupos.csv` (300 filas, una sola nube);
  - `segmentos-grande.csv` (9,000 filas, la muestra del jerárquico);
  - `tiendas-ciudades.csv` (una columna que no sirve como objetivo).

  Y el fixture `modelo-s6.*`, emitido por el código del S6 antes de tocar `pipeline.py` (D1).

- **Kit v1.35 → v1.38 (F0):**
  - `demo-rojo.sh` v1.38, endurecido después con el corte por señal (AU-S7-12);
  - el hook PreToolUse que falla cerrado;
  - `verificar-dependencias` con degradaciones declaradas, conservando el candado AU-S6-13 (D2);
  - `lighthouse-margen.mjs`;
  - comandos re-estampados, `.claude/COMANDOS.md` y el molde del spike de costos.
- **Gates nuevos de la auditoría:**
  - `scripts/verificar-retiros.mjs` en `quality` (regla 18);
  - `cardinalidades.test.ts` y `cardinalidades-docs.test.ts`;
  - `portada-liviana.test.ts` y `sentry-cliente.test.ts`;
  - gitleaks en el `PATH` de la CI, para que la carnada del hook corra.
- **Documentos:**
  - ADR 015, 016, 017, 018 y 019;
  - el manual: «Clasificar en varias categorías · desde Sprint 007», «Agrupar filas parecidas, sin
    objetivo · desde Sprint 007», el diccionario (6 + 11 términos) y cinco preguntas frecuentes;
  - la guía v4 acumulativa (66 pruebas);
  - `docs/BLUEPRINT.html` al día;
  - el brochure y su export re-armados en ES/EN;
  - `design-system.md` («Añadidos Sprint 007») y el bundle `design-sync/` (`varias-categorias.html`,
    `agrupar.html`);
  - el README en ES/EN, sin la plantilla de create-next-app;
  - el informe del spike (`sprints/SPRINT_007-spike-catalogo.md`) y la auditoría de la constitución.

## DoD — checklist

| Estándar                | Estado | Evidencia                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------- | :----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Testing                 |   ✓    | Sobre `2dfe387` (2026-10-10, comandos de la CI): `pnpm test` 62 archivos, **760 de 760**, 94.49 % de líneas y 93.28 % de sentencias, `engine/` 98.98 % de líneas; `pnpm test:integration` (Pyodide real) **101 pasan y 1 se salta** (el emisor del fixture del S6, que solo escribe con su variable); la e2e entera sobre el build de producción **72 de 72** en los dos dispositivos, sin reintentos. Sobre el árbol final (2026-10-10, después de F2-57 y del copy de H-10): `pnpm test` **761 de 761**, con la misma cobertura (94.49 %, 3,053 de 3,231 líneas). En la CI de `cd8358e`: `quality` 760 de 760, `integration` 101 + 1 saltada, `e2e` 72 de 72 (15.0 min). Integración nueva con Pyodide real: anti-fuga de la CV multiclase con espía, selección sin mirar la prueba, los 14 miembros en su forma nativa, baselines, cada agrupador, la referencia nula, HDBSCAN con ruido y el modo muestra. Carnadas: ver «Auditoría» |
| CI/CD                   |   ✓    | `quality`, `integration`, `e2e`, `lighthouse`, Vercel y Vercel Preview Comments con conclusión propia `success` en cada push registrado en la bitácora, salvo dos rojos, pagados y registrados: `6534cc2` (`lighthouse`, script de `/` en 321,841 B contra 307,200 B) y `a39525b` (e2e, 2 de 68, por el «75 %» con espacio no separable). La CI de `cd8358e` (run 38110479449) cerró 6 de 6 en `success`. Los checks del último push (el de este summary) se leen con `gh pr checks 19` después del push y quedan en el cuerpo del PR: este archivo no puede citar la corrida que su propio commit dispara. Ningún job nuevo; pasos nuevos en `quality`, `integration` y `lighthouse` (ver «Primeras corridas»)                                                                                                                                                                                                                          |
| Observabilidad          |   ✓    | El breadcrumb `probeta.league` lleva `task` de una lista cerrada, con su forma probada para cada una de las cuatro tareas (F2-6). Ningún nombre de clase, perfil de grupo ni etiqueta por fila llega a un registro (auditor B). Sentry del navegador con `@sentry/browser` y el mismo `scrubSentryEvent` (ADR 018): solo pasan los `probeta.*`. El límite de error nuevo manda solo el tipo de falla (AU-S7-19)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Seguridad               |   ✓    | `pnpm audit --audit-level high` el 2026-10-10: exit 0, con 1 alto ignorado por el ADR 012 (`braces`, sin parche). El ADR 012 tiene gate: `node scripts/verificar-retiros.mjs` dijo «GHSA-vfj7-8cjw-p6xm sigue sin parche publicado — la excepción sigue vigente» (local el 2026-10-10 y en `quality` en cada push desde `dbdd81f`). El hook falla cerrado (rojo en la F0) y su carnada corre en la CI (AU-S7-13). Overrides en `pnpm-workspace.yaml`; sin variables de entorno nuevas, y el DSN público opcional queda comentado en `.env.example` (K-S7-4). Pyodide decidido en el STOP: se queda en 314.0.2. Cero secrets                                                                                                                                                                                                                                                                                                              |
| Performance             |   ✓    | Sin wheels nuevos: 11 wheels, 39.58 MiB, tope 40.18 MiB (`verificar-peso-pyodide` en la CI de `cd8358e`). **Bundle contra `merge-base`** (`/deploy-check`, copias `git archive` sin `.env.local`, LHCI 0.15.1, mediana de 3): script de `/` **287,637 B → 247,868 B (−13.8 %)**, total 380,332 B → 340,916 B (−10.4 %), LCP simulado 3,095 → 3,075 ms; categorías: performance 0.94, las otras tres en 1. El script queda a 19.3 % del tope de 300 KiB (307,200 B). El rojo de `lighthouse` del sexto commit se pagó con el ADR 018 y la portada liviana. `lighthouse-margen`: sin aviso en la CI de `cd8358e`; desde la portada liviana avisó en 2 de 12 corridas de la CI: `2fae8c2` (LCP 3,215 ms, margen 8.1 %) y `be03c3c`, un commit solo de documentos (3,152 ms, 9.9 %). El margen del LCP ronda el 10 % y bajó hasta el 8.1 %; su variación es del runner                                                                       |
| UX + A11y               |   ✓    | La matriz de confusión es una tabla: los aciertos llevan ✓, negrita y «acierto:» para el lector, en su propia región desplazable, enfocable y con nombre, con la columna de nombres fija y los nombres largos partidos (AU-S7-21). La lectura de agrupar usa ● ⚠ ○; ◆ queda reservado para «Elegido por ti». axe en los dos temas en `multiclase`, `multiclase-score`, `agrupar` y `agrupar-score`. El foco va al título tras «Agrupar filas parecidas en su lugar» y al h1 tras «Elegir» (AU-S7-18, AU-S7-39). Contraste mínimo de los tokens nuevos: 4.55:1 (auditor C). e2e de reduced-motion de las dos pantallas nuevas                                                                                                                                                                                                                                                                                                             |
| IA embebida responsable |  N/A   | Cero IA nueva. La narración no cubre varias categorías ni agrupar, con doble cerrojo: el route devuelve 400 sin llegar al proveedor (`narrate-route.test.ts`) y el cliente no arma payload (rojo en la F1). Las e2e `multiclase` y `agrupar` exigen cero peticiones a `/api/narrate`. La model card dice «Narración con IA: no aplica»                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Manual de uso           |   ✓    | `docs/MANUAL-DE-USO.md` § «Clasificar en varias categorías · desde Sprint 007» y § «Agrupar filas parecidas, sin objetivo · desde Sprint 007», el diccionario de las dos y cinco preguntas frecuentes, entre ellas «¿Por qué no hay veredicto contra un baseline al agrupar?» y la muestra del jerárquico. Ocho frases que el S7 volvió falsas, corregidas. Desde la Fase 2, sus cifras las vigila `cardinalidades-docs.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Revisión de diseño      |   ✓    | Mirada de DECISIÓN: el delta del storyboard del brochure. El usuario la decidió el 2026-10-06: «1. A, 2. A 3. Arreglalo 2 A» (D-A = A, D-B = A). Lo construido se ve en la parada 7 del ⭐⭐. Miradas de FORMA M1–M3 y de TEXTO T1–T3 en matriz de una fila en la bitácora, «maquetado, no visto»: su veredicto viaja al ⭐⭐ (Acto 2). El bundle `design-sync/` se actualizó en este PR; se publica en el Acto 2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

**Primeras corridas.** Estos pasos, specs y suites corrieron por primera vez en este PR. Sin histórico
no se puede afirmar ni regresión ni no-regresión:

- **CI, pasos nuevos:**
  - `lighthouse-margen` en `lighthouse` (desde `e9e084b`; avisó en 2 de las 3 primeras corridas);
  - «Regla 18 — excepciones de auditoría vencidas (verificar-retiros)» en `quality`: su primera
    corrida fue la CI de `dbdd81f` (run 37408832924);
  - gitleaks en el `PATH` de `quality` y un paso de gitleaks en `integration`. Desde `dbdd81f`, la
    carnada del hook corre: `quality` pasó 701 de 701 sin ninguna saltada (716 de 716 en `2fae8c2`).
- **Unitarias nuevas:**
  - `hook-secretos` y `verificar-dependencias` (F0);
  - `despacho` (F1);
  - `multiclase-motor`, `multiclase-ui`, `agrupar-motor`, `agrupar-ui` y `contract-agrupar` (F1–F3);
  - `sentry-cliente` y `portada-liviana` (F3);
  - `demo-rojo`, `verificar-retiros`, `cardinalidades` y `page-error` (Fase 2 de la auditoría).
- **Integración nueva:** `multiclase`, `agrupar` y `modelo-s6`.
- **e2e nuevas:**
  - `multiclase` y `multiclase-score` (desde `ca703ad`);
  - `agrupar` y `agrupar-score` (desde `6534cc2`);
  - R10 en `multiclase` y las dos de reduced-motion de las pantallas nuevas (desde `23dedf1`);
  - `chunks` (desde `a39525b`);
  - en `brochure`: la paridad ES/EN y «con un navegador en inglés abre en inglés» (CI de `0a0358f`).
- **Desde la CI de `cd8358e`** (el push de `9e79332`, `2dfe387` y `cd8358e`):
  `cardinalidades-docs.test.ts` y la prueba nueva de `brochure-export.test.ts`.
- **En la CI del último push:** la prueba «planes SIN la columna plantada» de
  `multiclase-motor.test.ts` (F2-57). Esa CI se lee con `gh pr checks 19` tras el push y queda en el
  cuerpo del PR.

## Métricas técnicas

| Criterio de aceptación (SPRINT_007.md)                                                                              | Resultado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~200 filas, 4–5 clases: la liga multiclase en el Nivel 1, dentro del techo, contra dos baselines, matriz como tabla | ✓ Planes de suscripción (5 categorías): Nivel 1 con 10 modelos, 3 al Nivel 2 y la red neuronal fuera (200 filas; necesita 500). «▲ Logística balanceada supera — por +0.06, 0.60 frente a 0.54 del mejor baseline»; la mayoritaria da 0.20 = 1/K. Matriz 5×5 como tabla con ✓. Techo: la tarjeta «Quién compite» estima «unos 5 s» para los 10 del Nivel 1 (pasada de capturas), y el spike midió Σ 4.5 s en Chromium para `planes-200`. El tiempo real en pantalla no se cronometró                                                    |
| La fuga por clase se marca nombrando columna y clase; sin ella, entrena; sin soporte, no marca                      | ✓ con D10 del S6 (avisa y etiqueta, no bloquea; regla dura 3 y ADR 002). Configuración nombra `cargo_corporativo_usd` y «empresa» antes de entrenar; tras entrenar, «⚠ Posible fuga de datos — sospechoso» con exactitud balanceada 0.78. El borde tiene prueba unitaria: 4 filas no marca, 5 sí. «Sin ella, entrena»: el mismo `planes-fuga-plantada.csv` sin `cargo_corporativo_usd` entrena sin ningún aviso; la prueba faltaba y se sumó al armar este summary (F2-57, rojo con el umbral en 0.6: nombró cuatro columnas legítimas) |
| La binaria aplica el mismo soporte (D8) y sus tests heredados siguen verdes                                         | ✓ 0 de los 11 objetivos binarios del kit cambian de veredicto (spike, anexo C), y `monto_recuperado` sigue marcada. Seis pruebas heredadas con datos de juguete por debajo de 5 filas por clase se agrandaron sin cambiar lo que prueban (declarado). `leakage-datasets.test.ts` quedó en verde sin tocarlo                                                                                                                                                                                                                             |
| «Categorías» en la ambigua entrena multiclase (D2)                                                                  | ✓ integración («D2 pagada en el motor») y e2e `tarea-ambigua`, que corre la liga hasta la matriz                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 3 grupos plantados → k = 3 y perfiles; ruido → «no hay estructura» sin ocultar la tabla                             | ✓ `segmentos-clientes.csv`: el Jerárquico, k = 3 por consenso (3 de 4), puntaje 0.48 frente a 0.23 de la referencia nula (gap 0.25), ARI 0.88 (mínimo 0.53). `sin-grupos.csv`: K-Means, k = 10, gap −0.03, «○ No hay estructura de grupos», con la tabla visible. Integración y e2e `agrupar`                                                                                                                                                                                                                                           |
| HDBSCAN etiqueta ruido como «fuera de todo grupo» y puntuar lo respeta                                              | ✓ En `sin-grupos`, HDBSCAN deja fuera el 67 % de las filas. Al puntuar, una fila más lejos que el miembro más lejano de su grupo queda fuera (rojo en la F2: con radio infinito, la fila lejana dio 1 y no −1)                                                                                                                                                                                                                                                                                                                          |
| Export → import → puntuar en las dos tareas; archivos del S5 y del S6                                               | ✓ e2e `multiclase-score` y `agrupar-score` (sin el payload ni el CSV en la red; el archivo de agrupar sin `labels` ni filas). Integración: `modelo-s5` y `modelo-s6` importan y puntúan exactamente igual                                                                                                                                                                                                                                                                                                                               |
| Pyodide: decisión del STOP aplicada con su test de pin                                                              | ✓ Se queda en 314.0.2 (decisión 6): 314.0.7 trae numpy 2.4.6 y pesa 64.3 KiB más, con resultados idénticos en 5 de 5 datasets. `runtime-pin.test.ts` sin cambios                                                                                                                                                                                                                                                                                                                                                                        |
| BLUEPRINT, brochure y export con conteo medido, guía v4 con ⭐⭐ corto, auditoría de la constitución                | ✓ BLUEPRINT as-built del H2. Brochure y export con 41 funcionalidades (tabla de mapeo abajo). Guía v4: 66 pruebas, 7 paradas, unos 20 min, con «Qué deja fuera». Constitución: 27 derivas, pagadas por tres caminos                                                                                                                                                                                                                                                                                                                     |
| Ningún umbral nuevo sin su medición y su constante exportada                                                        | ✓ Los fijó el usuario en el STOP de la F0, con lo medido en el spike. Cada uno es una constante exportada con su prueba: `MULTICLASS_PRIMARY_METRIC`, empate 0.01, `LEAKAGE_CLASS_MIN_SUPPORT = 5` y 0.98, `CLUSTER_K_MIN`/`MAX` = 2/10, `CLUSTER_GAP_MIN = 0.1`, `CLUSTER_STABILITY_MIN = 0.7`, `STABILITY_RUNS = 10`, `STABILITY_FRACTION = 0.8`, `AGGLO_MAX_ROWS = 8000`, HDBSCAN con max(5, n/50)                                                                                                                                   |

**Lo que midió el spike en el navegador (F0)** está completo en
`sprints/SPRINT_007-spike-catalogo.md`, con la máquina quieta y la carga registrada (molde del kit):

- costos por miembro con K clases, en Chromium y WebKit, y el factor `(K/5)^d`;
- F1 macro frente a exactitud balanceada con la regla de un error estándar (2 ganadores distintos en
  5 particiones con la balanceada, 3 con F1 macro);
- la fuga por clase en columnas legítimas: la pureza normalizada dio 0 de 255; la falsa alarma exacta
  de una numérica con soporte 5 es 0.794 %;
- agrupar: la referencia nula separó grupos de ruido en 8 de 8 (sin estructura, gap ≤ 0.045; con
  grupos, ≥ 0.209). Sin ella, K-Means sobre datos uniformes daba silueta 0.62 y ARI 0.98;
- el consenso recuperó el k plantado en 3 de 3; el mayor puntaje, en 2 de 3;
- Pyodide 314.0.7 frente a 314.0.2.

La carga cambió los tiempos y no los resultados: 17 de 17 datasets de multiclase y 13 de 13 de
agrupar dieron lo mismo en todas sus corridas (`comparar-corridas.mjs`).

**Valores fijos que no son umbrales medidos:**

- el rango de 3 a 20 clases es alcance del plan (`MULTICLASS_MIN_CLASSES`, `MULTICLASS_MAX_CLASSES`);
- `CONSENSUS_MIN_VOTES = 2` es la definición de «consenso»: dos agrupadores coinciden;
- `SILHOUETTE_SAMPLE = 2000` es el tamaño de muestra con el que midió el spike.

## Decisiones no anticipadas

- **ADR 018 — Portada liviana (D7).** Las cuatro pantallas que la portada no dibuja se cargan bajo
  demanda, y el Sentry del cliente arranca con `@sentry/browser`, en la misma versión que trae
  `@sentry/nextjs`. Bajó el script de `/` de 321,841 B a 252,708 B. Un gate vigila que las dos
  versiones sigan a la par.
- **ADR 019 — Primitivos de UI propios en lugar de shadcn/ui** (AU-S7-25, AC-4). Registra una
  decisión del S1 que nunca se escribió.
- **ADR 015, 016 y 017** estaban previstos en el plan. Sus decisiones de fondo salieron del STOP:
  - exactitud balanceada en lugar de F1 macro (decisión 1);
  - el ganador por consenso reemplaza «el de mayor puntaje» de P11 (decisión 4);
  - la lectura de agrupar se compara con una referencia nula; la orden decía «sin baseline»
    (decisión 5);
  - el jerárquico con más de 8,000 filas usa una muestra, con una nota visible (decisión 8).
- **Decisiones del usuario en la auditoría (2026-10-06):**
  - decisión 1: HDBSCAN aplica su regla de tamaño a las filas de cada ajuste (AU-S7-02);
  - decisión 2: el titular «Posible fuga de datos — sospechoso» en las tres tareas con objetivo
    (AU-S7-20, D10).
- **AU-A-01, por la orden «sin cambios» (2026-10-10):** el ⭐⭐ corto se queda en 7 paradas y unos
  20 minutos (opción B).
- **Desviaciones D1–D10** en la bitácora. Las de mayor peso:
  - D3 (la UI de las tareas nuevas se habilitó en la F3);
  - D5 (el modelo de costos de agrupar en dos partes);
  - D7 (ADR 018 y la dependencia nueva `@sentry/browser`);
  - D8 y D9 (pedidos a la planeadora, ver «Deuda técnica»);
  - D10 (el titular de fuga toca la binaria y la regresión, que la orden dejaba fuera).

## Bugs + resoluciones

- **`lighthouse` en rojo en el sexto commit:** el script de `/` midió 321,841 B contra 307,200 B.
  - Causa: las cuatro pantallas viajaban con la portada, y el `init` de `@sentry/nextjs` pesaba
    ≈ 50 KB gzip.
  - Por qué el build local no lo veía: el `.env.local` declara el DSN público vacío, y el minificador
    borra el `init` (K-S7-4).
  - Se pagó con el ADR 018. Como la CI siguió avisando del margen del LCP (3,201 ms, margen 8.5 %),
    el noveno commit sacó las fichas de la portada: `thousands` arrastraba `content/modelos.ts`.
    `portada-liviana.test.ts` lo vigila.
- **AU-S7-01 (Alto):** el saneamiento mutaba la tabla original. «Tus filas con su grupo» podía
  perder celdas o desalinear grupos, y dar «NaN». Ahora se copian las filas (F2-18, F2-19).
- **AU-S7-02 (Alto):** con más de 2,000 filas, la referencia nula de HDBSCAN valía 0, y «los grupos
  existen» no se comparaba con nada (F2-20, decisión 1).
- **Reconocimiento antes de la guía v4 (F3):**
  - el titular de la fuga con varias categorías decía «Métricas casi perfectas» con 0.78;
  - «Los grupos existen» usaba ◆, el símbolo de «Elegido por ti»: pasa a ●;
  - el copy de agrupar tomaba palabras de la liga («validación cruzada», «N modelos»): ahora hay un
    guardián;
  - el CSV de las filas con su grupo salía sin `cliente_id`;
  - «8.000» convivía con «8,000» (R9).
- **Pasada de capturas de la F3:** con 20 categorías, a 360 px la página se desplazaba de lado
  (431 > 360). Se pagó con `overflow-wrap`, la columna de nombres fija, el espacio no separable antes
  de «%» y separador de miles en todos los conteos.
- **e2e en rojo en `a39525b`:** `score-download` esperaba «75%», y el pago de AU-S7-33 puso «75 %».
  Se corrigió en el commit siguiente. Desde ahí, la e2e completa corre en local antes de cada push
  (K-S7-7).
- **AU-A-03:** la pasada de capturas ampliada murió al cancelar el Nivel 2 al agrupar. El aviso
  «hay que volver a agrupar» era absoluto. Mientras guarda la instantánea, el worker conserva las
  filas: el aviso pasó a condicional (`b7d9a56`, F2-49).
- **Gates que no podían fallar, retirados y anotados:** las condiciones de orden de
  `_validate_classes` (las implica `_multiclass_target`) y `pendingSurface` (lo cubre el despacho
  exhaustivo).
- **Punto ciego en `roster.test.ts`:** su patrón no aceptaba «_», así que no veía
  `balanced_accuracy`. Lo descubrió el rojo al sumar la clave.
- **Naive Bayes gaussiano por debajo de adivinar** en el sintético de 5 clases (0.154 frente a 0.2).
  La liga lo muestra tal cual (regla dura 3); el ganador sí supera el azar.

## Qué salió bien / qué generó fricción

**Bien:**

- **La binaria y la regresión quedaron intactas, y se demostró:**
  - sus carnadas siguieron detectándose sin tocar su lógica;
  - el archivo del S6 lo emitió el propio código del S6 antes de cambiar `pipeline.py`;
  - D8 se midió antes de adoptarse: 0 de 11 objetivos cambian.
- **El despacho exhaustivo fue primero.** Una tercera y una cuarta tarea no pudieron caer en
  silencio en la rama binaria, y el gate de fuente cazó tres comparaciones propias en los lectores
  de agrupar.
- **El spike decidió con números**, y cambió el plan: la exactitud balanceada, el consenso, la
  referencia nula (sin ella, el ruido se leía como «grupos estables») y que el one-hot fabrica
  grupos.
- **La auditoría independiente** (tres auditores más la constitución, 58 hallazgos) encontró dos
  Altos de conducta que las suites en verde no veían (AU-S7-01 y AU-S7-02).
- **Las capturas leídas como imagen y los recorridos de reconocimiento encontraron defectos reales:**
  el desborde a 360 px, el titular falso, el símbolo repetido y el CSV sin identificador.
- **`demo-rojo.sh` atrapó demos que no eran rojos de verdad:**
  - una prueba que no podía caer (F2-19);
  - un lockfile que pnpm 11 reparaba antes de la prueba (K-S7-5);
  - una regex que dejaba pasar `import "@sentry/nextjs"`;
  - un rojo predicho mal (el tope de 3 clases).

**Fricción del kit** (separada en la bitácora):

- K-S7-1: `plan-sprint.md` del kit perdió el punto 10 («corre `/audita-sprint`»).
- K-S7-2: `--esperar-verde` de `demo-rojo.sh` exige un comando, pero parece un interruptor.
- K-S7-3: el molde del spike no dice qué hacer si el lote repetido también sale con carga, ni mide
  la memoria.
- K-S7-4: un DSN público vacío en `.env.local` hace que el build local no mida lo que mide la CI.
- K-S7-5: `pnpm <script>` reinstala antes de correr y deshace una mutación del lockfile.
- K-S7-6: `demo-rojo.sh` contaba como rojo un gate muerto por una señal (pagado en este repo; el kit
  tiene el mismo hueco).
- K-S7-7: un cambio de copy rompe una e2e que la suite unitaria no ve.
- K-S7-8: la evidencia que vive en el scratchpad no sobrevive a una pausa larga.

**Fricción del constructor:**

- La decisión 7 se dio por cumplida con la medición local (3,073 ms) y la CI siguió avisando
  (3,201 ms). Se pagó en el noveno commit.
- El lote de copy se empujó sin correr la e2e completa (`a39525b`).
- La tabla de demos de la Fase 2 vivía en el scratchpad; la limpieza de `/tmp` la borró y se
  reconstruyó fila por fila desde el registro de la sesión (K-S7-8).
- La matriz de las miradas del S7 no se registró hasta que el auditor A la pidió (AU-A-01).
- La prueba «sin ella, entrena» de varias categorías, que el plan pedía (P6), faltaba; la encontró el
  borrador de este summary y se sumó con su rojo (F2-57).
- El `--minimo-tests` mal contado en dos demos (el manifiesto y F2-6). El script las rechazó y se
  repitieron.
- La primera comparación de corridas del spike, hecha a mano, dejaba pasar los datasets de una sola
  corrida. La reemplazó `comparar-corridas.mjs`.
- Una prueba con el flag `s` en una regex rompió `next build`.

## Sugerencias de mejora al método

1. **La evidencia de una demo o de una corrida va a la bitácora en cuanto se produce**, no al cierre
   de la fase. El scratchpad queda para lo descartable (K-S7-8).
2. **Todo pago que cambie un texto visible busca el literal viejo en `tests/` (unit y e2e) en el
   mismo paso, y la e2e completa corre en local antes de empujar el lote de copy** (K-S7-7).
3. **`/deploy-check` §4 y §8: peso y Lighthouse se miden sobre una copia `git archive` sin
   `.env.local`**, como la CI, nunca sobre el árbol de trabajo. En el molde de `.env.example`, una
   variable pública opcional se omite, no se deja vacía (K-S7-4).
4. **El molde del spike de costos:** la regla del tercer intento y de elección de corrida (con
   `elegir-intento.mjs`), el swap junto al `uptime`, y un paso «¿la carga cambió los resultados o
   solo los tiempos?» con `comparar-corridas.mjs` (K-S7-3).
5. **Llevar al kit lo que este repo endureció:** el corte por señal de `demo-rojo.sh` (K-S7-6), un
   aviso cuando `--archivo` es el lockfile y el gate empieza por `pnpm ` (K-S7-5), el mensaje de
   `--esperar-verde` (K-S7-2), el punto 10 de `plan-sprint.md` (K-S7-1) y el candado AU-S6-13 en
   `verificar-dependencias` (D2).
6. **La pasada de capturas corre entera después del último pago de la Fase 2**, no antes. Aquí la
   corrida ampliada murió en la promesa nueva del copy, y solo la vio el auditor (AU-A-03).

## Deuda técnica aceptada

| Qué                                                                                                                                                                                               | Por qué                                                                                                                                                                                               | Pago                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **D8 · pedido a la planeadora:** 23 afirmaciones de `CLAUDE.md` quedaron viejas (`sprints/SPRINT_007-auditoria-constitucion.md:36-64`, camino T), entre ellas AU-S7-42 (AC-18, `CLAUDE.md:92-93`) | No es deuda de código: la constitución es una copia literal que regenera la planeadora, y esta app no la escribe. Cada deriva lleva su frase propuesta. Las del lado del código se pagaron en este PR | La planeadora, al regenerar la constitución                      |
| **D9 · pedido a la planeadora:** el inglés de `docs/brochure-export.json` (formato 1.0.0, sin campos en inglés)                                                                                   | Es un contrato del portafolio cuyo dueño es la planeadora, y lo consume la vitrina. Esta app no inventa campos. El export queda al día en español (41 funcionalidades)                                | La planeadora decide el formato (mapa `{es, en}` o campos `_en`) |
| **Regla 12, lo que la CI no ve:** la sala de proyección y la última milla del link sin sesión; el brochure pasa de INICIAL a SELLADO (`docs/BROCHURE.html`)                                       | El brochure se sella después del ⭐⭐, y el link público cambia al mergear                                                                                                                            | Acto 2                                                           |
| **`/design-sync`:** `design-sync/project.json:6` sigue en `lastPublished: 2026-08-15`                                                                                                             | Se publica después del ⭐⭐, nunca antes (regla 10). El bundle ya está al día en este PR                                                                                                              | Acto 2 (el usuario invoca, el constructor ejecuta)               |
| Aviso alto de `braces` ignorado (`decisions/012-…`, `auditConfig.ignoreGhsas`)                                                                                                                    | Sin versión parcheada (3.0.3); solo ruta de desarrollo. Ahora `scripts/verificar-retiros.mjs` lo lee en cada push                                                                                     | Se retira cuando haya parche: el gate se pondrá en rojo          |
| WebKit solo en los spikes, no en la CI (`playwright.config.ts:17-22`: Chromium móvil y escritorio)                                                                                                | Igual que en el S5 y el S6                                                                                                                                                                            | Sin sprint asignado; se reporta                                  |

**Deuda del S6 pagada aquí:**

- D8 en la binaria (ADR 017);
- «Categorías» entrena (D2);
- el pin de Pyodide, decidido en el STOP: se queda en 314.0.2;
- el brochure re-armado, con escena propia y quinta puerta;
- el ADR 012 re-leído, y ahora con gate.

**Tabla de mapeo del brochure (regla 12).** El conteo pasa de 35 a 41 en el pie, en el export
(`funcionalidades.total`) y en el e2e del brochure: 13 + 7 + 5 + 9 + 5 en las cinco puertas, más 2
en «lo fino». Lo vigilan `brochure-export.test.ts` (cada `seccion_manual` existe en el manual,
F2-56) y `cardinalidades-docs.test.ts`.

| Puerta                               | Funcionalidad en el brochure (ES)                    | Id  | Sección del manual                                                                 |
| ------------------------------------ | ---------------------------------------------------- | --- | ---------------------------------------------------------------------------------- |
| 1 · El veredicto honesto (13)        | Eliges qué predecir                                  | V1  | El veredicto honesto                                                               |
| 1                                    | Entrena con el progreso a la vista                   | V2  | El veredicto honesto                                                               |
| 1                                    | El veredicto, en grande                              | V3  | El veredicto honesto                                                               |
| 1                                    | Un resultado demasiado bueno no se celebra           | V4  | El veredicto honesto                                                               |
| 1                                    | Advertencia de fuga con la columna nombrada          | V5  | El veredicto honesto (y la fuga por categoría, en Clasificar en varias categorías) |
| 1                                    | Las métricas, todas sobre datos que el modelo no vio | V6  | El veredicto honesto                                                               |
| 1                                    | Matriz de confusión                                  | V7  | El veredicto honesto                                                               |
| 1                                    | Los baselines, a la vista                            | V8  | El veredicto honesto                                                               |
| 1                                    | Una liga de modelos, elegida sin mirar la prueba     | V9  | La liga honesta                                                                    |
| 1                                    | Estimar una cantidad, con el error en sus unidades   | V11 | Estimar una cantidad                                                               |
| 1                                    | **Clasifica en varias categorías (S7)**              | V13 | Clasificar en varias categorías                                                    |
| 1                                    | ¿Categorías o una cantidad? Te lo pregunta           | V12 | Estimar una cantidad                                                               |
| 1                                    | Nuevo experimento cuando quieras                     | V10 | El veredicto honesto                                                               |
| 2 · Datos reales, de frente (7)      | Sube tu propio CSV                                   | D1  | El veredicto honesto                                                               |
| 2                                    | O prueba con siete ejemplos incluidos                | D2  | El veredicto honesto                                                               |
| 2                                    | Vista previa con el perfil de cada columna           | D3  | El veredicto honesto                                                               |
| 2                                    | Límites dichos de frente                             | D4  | Limitaciones conocidas (Sprint 001)                                                |
| 2                                    | Saneamiento con el conteo exacto                     | D5  | Sobrevive datos reales                                                             |
| 2                                    | Cinco alertas antes de entrenar                      | D6  | Sobrevive datos reales (con la alerta por tarea, AU-A-04)                          |
| 2                                    | Si tu CSV separa con punto y coma, se bloquea        | D7  | Sobrevive datos reales (viñeta nueva, AU-A-11)                                     |
| 3 · El porqué, contado honesto (5)   | Gráfico de importancia con dirección                 | P1  | El porqué, contado honesto                                                         |
| 3                                    | Un texto explicativo sin IA y sin internet           | P2  | El porqué, contado honesto                                                         |
| 3                                    | Narración con IA, solo si la pides                   | P3  | El porqué, contado honesto                                                         |
| 3                                    | Si la narración falla, te dice por qué               | P4  | El porqué, contado honesto                                                         |
| 3                                    | Model card descargable                               | P5  | El porqué, contado honesto                                                         |
| 4 · El modelo se usa (9)             | Puntúa datos nuevos                                  | U1  | El modelo se usa                                                                   |
| 4                                    | Si falta una columna, se niega a puntuar             | U2  | El modelo se usa                                                                   |
| 4                                    | Aviso de novedad con el porcentaje                   | U3  | El modelo se usa                                                                   |
| 4                                    | Distribución de las predicciones y vista previa      | U4  | El modelo se usa                                                                   |
| 4                                    | CSV puntuado sin pisar nada tuyo                     | U5  | El modelo se usa                                                                   |
| 4                                    | Exporta el modelo a un archivo                       | U6  | El modelo se usa                                                                   |
| 4                                    | Al importarlo, se valida antes de abrirlo            | U7  | El modelo se usa                                                                   |
| 4                                    | Resumen honesto antes de usarlo                      | U8  | El modelo se usa                                                                   |
| 4                                    | Puntúa sin volver a entrenar                         | U9  | El modelo se usa                                                                   |
| **5 · Agrupar sin objetivo (5, S7)** | Agrupa filas parecidas, sin objetivo                 | G1  | Agrupar filas parecidas, sin objetivo                                              |
| 5                                    | Te dice si los grupos existen                        | G2  | ídem                                                                               |
| 5                                    | Qué distingue a cada grupo                           | G3  | ídem                                                                               |
| 5                                    | Tus filas con su grupo                               | G4  | ídem                                                                               |
| 5                                    | Asigna filas nuevas a un grupo                       | G5  | ídem                                                                               |
| Lo fino (2)                          | Idioma: español e inglés                             | T1  | Primeros pasos                                                                     |
| Lo fino                              | Las palabras, en una línea cada una                  | T2  | Diccionario de términos                                                            |

Sin fila propia, porque se agrupan en otras: el rechazo por una categoría con muy pocas filas, el
ganador por consenso y elegir otro agrupador (bajo V9, G1 y G2), y la muestra del jerárquico (en lo
fino).

**Frases que el S7 volvió falsas, corregidas en ES y EN:** «la pregunta te lleva a una tarjeta»
(ahora entrena en los dos casos), la fuga que no nombraba la categoría, el titular de fuga
unificado, «cinco ejemplos» → siete, el límite de 50,000 filas, lo que sale del equipo (Sentry con
metadatos, AU-A-05), y ninguna promesa aplazada. El clímax (E06) no cambió: su texto español es
idéntico al de `main` (auditor A). Las métricas del export se re-midieron el 2026-10-10 sobre el árbol final: 862 pruebas (761 + 101), 72 e2e (sobre `2dfe387`; después solo cambió una unitaria y una frase de la model card) y 94.49 % de
líneas.

## Auditoría

- **Artefactos:**
  - `sprints/SPRINT_007-auditoria.md`: Fase 1 por superficies, con tres auditores independientes que
    no construyeron el sprint;
  - `sprints/SPRINT_007-auditoria-constitucion.md`: la constitución contra el código, 27 derivas
    (3 altas, 10 medias, 14 bajas).
- **Superficies:**
  - A · alcance y textos (sobre `0a0358f`, con el brochure ya construido);
  - B · motor, contrato, gates y dependencias (sobre `fec1a29`);
  - C · UI, hooks, i18n, a11y y privacidad del cliente (sobre `fec1a29`).

  Cada hallazgo tiene `archivo:línea` y su ajuste ejecutable. Recomendación de la Fase 1: **requiere
  ajustes**.

- **Hallazgos:**
  - B + C + constitución: **42 consolidados, 0 Críticos · 5 Altos · 20 Medios · 17 Bajos** (cuatro
    duplicados entre auditores, fusionados);
  - A: **16, 0 Críticos · 2 Altos · 7 Medios · 7 Bajos**.
- **Aprobación de la Fase 1:**
  - B, C y la constitución: el usuario, el 2026-10-06, con las decisiones 1 y 2;
  - A: el 2026-10-10 («retoma el plan de pago de los 16 hallazgos»), con AU-A-01 resuelto por la
    orden «sin cambios».
- **Pagos:** de `dbdd81f` al último push, con 57 demos en rojo (F2-1 a F2-57), todas con `demo-rojo.sh`
  y `--debe-nombrar`. Se pagaron primero los hallazgos que crean gates.
- **Casilla 8 (protecciones del sistema): no.** Nada del sprint toca Llavero, permisos, ítems de
  inicio ni certificados (auditor B).

| Hallazgo | Sev.  | Pago                                                                                                                                                                                                                                     |
| -------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AU-S7-01 | Alto  | El saneamiento copia las filas: la tabla del usuario llega entera y sin desalinear (F2-18, F2-19)                                                                                                                                        |
| AU-S7-02 | Alto  | HDBSCAN aplica su regla de tamaño a las filas de cada ajuste; decisión 1 (F2-20)                                                                                                                                                         |
| AU-S7-03 | Alto  | Ninguna cardinalidad ni límite escrito a mano en el copy: `cardinalidades.test.ts` (F2-12, F2-44)                                                                                                                                        |
| AU-S7-04 | Alto  | La model card nombra solo a los agrupadores que compitieron (F2-22)                                                                                                                                                                      |
| AU-S7-05 | Alto  | `scripts/verificar-retiros.mjs` en `quality` y en `/deploy-check` (F2-4)                                                                                                                                                                 |
| AU-S7-06 | Medio | El lector nombra el campo en vez de lanzar con una liga sin siluetas (F2-13)                                                                                                                                                             |
| AU-S7-07 | Medio | 7 carnadas de coherencia del manifiesto de agrupar, de 14 a 21 (F2-16)                                                                                                                                                                   |
| AU-S7-08 | Medio | El export coteja el ancho de los centroides (F2-14)                                                                                                                                                                                      |
| AU-S7-09 | Medio | P13 por estructura: lector de etiquetas recursivo y manifiesto armado campo a campo (F2-15, F2-17)                                                                                                                                       |
| AU-S7-10 | Medio | La peor repetición (`ari_min`) en pantalla y en la card, junto a la media (F2-26)                                                                                                                                                        |
| AU-S7-11 | Medio | La prueba «la fuga se mide solo en train» ahora puede caer (F2-5)                                                                                                                                                                        |
| AU-S7-12 | Medio | `demo-rojo.sh` no cuenta como rojo un gate muerto por una señal (F2-1)                                                                                                                                                                   |
| AU-S7-13 | Medio | gitleaks en el `PATH` de la CI; un salto en la CI es rojo (F2-2, F2-3)                                                                                                                                                                   |
| AU-S7-14 | Medio | Las alertas de configuración con varias categorías nombran la categoría y dicen exactitud balanceada (F2-23)                                                                                                                             |
| AU-S7-15 | Medio | Las fichas se buscan por su ficha base; la prueba recorre todas (F2-24, F2-25)                                                                                                                                                           |
| AU-S7-16 | Medio | Al agrupar, ni la ficha, ni el progreso, ni la card hablan de validación cruzada (F2-32, F2-33, F2-34)                                                                                                                                   |
| AU-S7-17 | Medio | Cancelar el Nivel 2 al agrupar dice qué se pierde, y solo si se pierde (F2-35, F2-40, F2-49)                                                                                                                                             |
| AU-S7-18 | Medio | «Agrupar filas parecidas en su lugar» lleva el foco al título (F2-36)                                                                                                                                                                    |
| AU-S7-19 | Medio | «Cargando…» y límite de error para las pantallas bajo demanda (F2-38, F2-39, F2-45, F2-46)                                                                                                                                               |
| AU-S7-20 | Medio | Decisión 2: «Posible fuga de datos — sospechoso» en las tres tareas con objetivo, con el detalle (`2fae8c2`, D10)                                                                                                                        |
| AU-S7-21 | Medio | Los nombres de categoría se parten y se leen enteros, sin depender del `title` (F2-47)                                                                                                                                                   |
| AU-S7-22 | Medio | `capturas-s7.mjs` activa cada control que listó la auditoría (`b7d9a56`); la pasada final sobre `2dfe387` salió con exit 0: 116 encuadres y 66 «OK interacción»                                                                          |
| AU-S7-23 | Medio | La card imprime las medias con los decimales de su columna: 1.20e-11, no 0.00 (F2-27)                                                                                                                                                    |
| AU-S7-24 | Medio | README en ES y EN; SVG de plantilla y `CHANGELOG.md` del kit retirados (`a39525b`)                                                                                                                                                       |
| AU-S7-25 | Medio | ADR 019 y `design-system.md`: primitivos propios (`a39525b`)                                                                                                                                                                             |
| AU-S7-26 | Bajo  | Carnadas de `null_score`, `status`, `rare_categories` y `sample_rows`: train-agrupar de 46 a 51, export de 8 a 10 (`dbdd81f`)                                                                                                            |
| AU-S7-27 | Bajo  | `CLUSTER_K_BY` y `CLUSTER_ASSIGN` con `satisfies` exhaustivo (F2-8)                                                                                                                                                                      |
| AU-S7-28 | Bajo  | El tripwire del despacho ve las comparaciones contra `CLUSTER_TASK` (F2-7)                                                                                                                                                               |
| AU-S7-29 | Bajo  | El orden de las clases es el de Python en la EDA y en la fuga (F2-10, F2-11)                                                                                                                                                             |
| AU-S7-30 | Bajo  | HDBSCAN con menos filas que su mínimo dice «sin estructura» (F2-21)                                                                                                                                                                      |
| AU-S7-31 | Bajo  | `verificar-dependencias`: aserción incondicional; una entrada sin razón es rojo (F2-9)                                                                                                                                                   |
| AU-S7-32 | Bajo  | La forma del breadcrumb, probada por tarea (F2-6)                                                                                                                                                                                        |
| AU-S7-33 | Bajo  | Miles con coma y «%» con espacio no separable en matriz, tabla, cards y mosaicos (F2-28, F2-42, F2-43)                                                                                                                                   |
| AU-S7-34 | Bajo  | Plurales: «1 fila» (F2-41)                                                                                                                                                                                                               |
| AU-S7-35 | Bajo  | Las categorías raras agrupadas llegan a la card de agrupar; dos claves inalcanzables retiradas (F2-30)                                                                                                                                   |
| AU-S7-36 | Bajo  | Sin «ordenar por riesgo» con varias categorías ni la partición temporal en la card de agrupar (F2-29, F2-31)                                                                                                                             |
| AU-S7-37 | Bajo  | Inglés: «actual», «smallest» y comillas inglesas, con `common.quote` (`2fae8c2`)                                                                                                                                                         |
| AU-S7-38 | Bajo  | La nota de la muestra en configuración, en la caja `sunken` que dice `design-system.md` (`a39525b`)                                                                                                                                      |
| AU-S7-39 | Bajo  | Tras «Elegir», el foco va al h1 de la lectura (F2-37)                                                                                                                                                                                    |
| AU-S7-40 | Bajo  | Las dos pruebas débiles ahora pueden caer: el botón «agrupar en su lugar» y la columna `_probabilidad` (F2-36, F2-48)                                                                                                                    |
| AU-S7-41 | Bajo  | `LeagueTable` lee la métrica por nombre, sin fijar `balanced_accuracy` (`a39525b`)                                                                                                                                                       |
| AU-S7-42 | Bajo  | Va por texto: pedido a la planeadora en D8 (AC-18)                                                                                                                                                                                       |
| AU-A-01  | Alto  | Guía v4: la parada 2 lleva cuatro de las cinco segundas vueltas del S6, la FAQ del R² va a G2, M3 queda en I7 (opción B), filtro «⭐ H1»; matriz de las miradas en la bitácora; `design-system.md` con el destino real de M3 (`2dfe387`) |
| AU-A-02  | Alto  | `cardinalidades-docs.test.ts`: 13 reglas sobre manual, brochure, export y `design-system.md`, y «los otros tres» prohibido (F2-54, F2-55)                                                                                                |
| AU-A-03  | Medio | El aviso de cancelar, condicional, con su prueba (`b7d9a56`, F2-49). En la pasada final, «tras cancelar, «Descargar filas con su grupo» dice que ya no se puede», a 360 y 1280 px: el copy queda como está                               |
| AU-A-04  | Medio | El manual dice la alerta de desbalance de cada tarea (`9e79332`)                                                                                                                                                                         |
| AU-A-05  | Medio | Brochure ES/EN, export y BLUEPRINT: con un error, Sentry recibe metadatos; producción tiene DSN, verificado sin sesión el 2026-10-10 (`9e79332`, `2dfe387`)                                                                              |
| AU-A-06  | Medio | Sin «publicar» en el README ni «llegará más adelante» en el manual (`9e79332`, `2dfe387`)                                                                                                                                                |
| AU-A-07  | Medio | Guía v4: I8, B4, I2 y H2 citan lo que la app dice hoy; la razón verdadera de dejar fuera el Nivel 2 en desktop; B3 y G6 cuentan como mejoradas (`2dfe387`)                                                                               |
| AU-A-08  | Medio | D10 declarada; ADR 015 §6, ADR 017 y la tarjeta de `design-sync` con el titular único (`2dfe387`)                                                                                                                                        |
| AU-A-09  | Medio | Sin promesas aplazadas en la tarjeta de la ambigua, `design-system.md` y el aviso de fechas (`2dfe387`)                                                                                                                                  |
| AU-A-10  | Bajo  | `design-system.md` y las tarjetas de `design-sync` con los pagos de UI de la Fase 2 (`2dfe387`)                                                                                                                                          |
| AU-A-11  | Bajo  | Cada `seccion_manual` del export existe en el manual; D7 con su viñeta; detalles del export al día (F2-56)                                                                                                                               |
| AU-A-12  | Bajo  | BLUEPRINT: «tres tareas nuevas» y los gates de retiros y cardinalidades (`2dfe387`); la cifra «al cierre del H2» re-medida en el `/deploy-check` (242.1 KiB y 3,075 ms) con los avisos de `2fae8c2` y `be03c3c` dichos                   |
| AU-A-13  | Bajo  | R9 en el README del kit, el BLUEPRINT y la guía (`b7d9a56`, `2dfe387`)                                                                                                                                                                   |
| AU-A-14  | Bajo  | El inglés del brochure: sin calcos, y «Outside every group» como en la app (`9e79332`)                                                                                                                                                   |
| AU-A-15  | Bajo  | El manual dice qué se pierde al cancelar el Nivel 2 al agrupar (`9e79332`)                                                                                                                                                               |
| AU-A-16  | Bajo  | HDBSCAN encuentra los grupos por densidad, en el manual, el brochure y el export (`9e79332`)                                                                                                                                             |

**Carnadas («detectó k de n»).** Corrida fresca sobre el árbol final el 2026-10-10: `vitest run --reporter=verbose`
(las 23 listas del lado TS) y las cuatro de `_validate_payload` en la integración con Pyodide real.
Todas detectaron todas:

| Contrato                     | Varias categorías | Agrupar                     | Binaria (intacta) | Regresión (intacta)         |
| ---------------------------- | ----------------- | --------------------------- | ----------------- | --------------------------- |
| TS → Python                  | 13/13             | 16/16                       | 16/16             | 9/9                         |
| Python → TS, liga            | 30/30             | 51/51 (46 + 5 de la Fase 2) | 27/27             | 36/36                       |
| Python → TS, elección manual | 7/7               | 8/8                         | 6/6               | 6/6                         |
| Python → TS, export          | 4/4               | 10/10 (8 + 2)               | 6/6               | 5/5 (suma `schema.classes`) |
| Python → TS, puntuación      | 8/8               | 8/8 · con ruido 2/2         | 5/5               | 4/4                         |
| Python → TS, etiquetas       | —                 | 4/4                         | —                 | —                           |
| Manifiesto                   | 14/14             | 21/21 (14 + 7)              | 16/16             | 12/12                       |

La binaria suma además 5/5 de progreso, que las otras tareas comparten. Los fixtures `*-multiclase`
y `*-agrupar` los escribió Pyodide real (`CONTRATO_ACTUALIZAR=1`). El auditor B contó las listas
contra lo declarado y cuadraron exactas, y su sonda confirmó que los fixtures son idénticos a una
corrida fresca.

- **Casilla 4 (frases caducadas y de evidencia):** la Fase 1 la corrió sobre el diff, y cada copy
  nuevo pasó la suya antes de entrar. La segunda pasada la hizo **otro** auditor independiente el 2026-10-10, sobre el diff
  `44a0f31..1cc2fc8` y este summary, con la regla 22 delante. Dio **12 hallazgos: 1 Alto, 3 Medios y 8
  Bajos**, todos pagados en el último commit (detalle en `SPRINT_007-auditoria.md`, «Segunda casilla 4»):
  - **H-1:** este summary decía el PR ya en normal antes de hacerlo; ahora dice cuándo se hace y lo
    confirma el cuerpo del PR.
  - **H-2:** «116 encuadres con `scrollWidth`» mezclaba 74 de página con 42 recortes que no lo miden.
  - **H-3:** `lighthouse-margen` avisó también en `2fae8c2` (8.1 %), no solo en `be03c3c`.
  - **H-4:** el export decía 861 pruebas del árbol de `2dfe387`; con F2-57 son 862.
  - **H-5 a H-9:** el margen de script contra 307,200 B (19.3 %, no 17.4 %); la primera corrida sin
    saltadas fue `dbdd81f`; una prueba aún sin CI; `.env.example` sí cambió; un marcador sin resolver
    en la auditoría.
  - **H-10:** la model card de agrupar decía que todos prueban de 2 a 10 grupos (HDBSCAN no).
  - **H-11:** el manual no decía que un Nivel 2 que no termina también cuesta las filas con su grupo.
  - **H-12:** dos cifras con espacio de miles en `design-sync/`.

  Sin promesas aplazadas en ninguna superficie, y las citas de la guía existen en `messages/es.json`
  con sus parámetros (verificado por el auditor).

- **Cero enlaces:** el barrido salió vacío y el homepage del repo es el propio repo (auditor A, sobre
  `0a0358f`). Sobre el árbol de este último pago: el
  `git grep` salió vacío y `homepageUrl` es el propio repo (2026-10-10). Se repite tras el último
  `git add` antes de cada push, y el del último queda en el cuerpo del PR.
- **`/deploy-check`:** casilla por casilla en la bitácora («`/deploy-check` (2026-10-10)»): §1–§3 por la
  suite completa y la CI; §4 y §8, el bundle y Lighthouse contra `merge-base`; §5, seguridad; §9, cero
  enlaces; §11, los checks de abajo. **Decisión: MERGE OK** si los checks del último push cierran en
  `success`.

## Gate ⭐ — diferimiento y contrapesos

| Contrapeso                     | Evidencia (archivo, cuenta medida, corrida)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pasada de capturas del builder | **Final:** `scripts/capturas-s7.mjs` sobre el build de producción de `2dfe387`, 2026-10-10: exit 0, **116 encuadres** (360 y 1280 px × claro y oscuro, la app y la guía v4): **74 de página con `scrollWidth ≤ clientWidth` (74 de 74)** y 42 recortes de un elemento (veredicto, matriz, ficha, model card, lectura, tabla), que no miden el ancho; y **66 «OK interacción»** (regla 17): fichas, «Ver puntajes de prueba», «Elegir» con el foco al h1, «Volver al ganador», «Incluir de todos modos», las dos model cards, «Elegir» GMM, las filas con su grupo, «Agrupar filas parecidas en su lugar», el cambio a English, y cancelar el Nivel 2 al agrupar con la descarga que dice que ya no se puede (AU-A-03, AU-S7-22). **Extremos de magnitud:** 20 categorías con un nombre de 60 caracteres (la matriz se desplaza en su recuadro: 1,753 > 278 y 1,801 > 686), k = 10 (`sin-grupos`, 10 tarjetas), ~1e-11 («9.52e-11 (promedio de los grupos: 5.53e-11)»), 9,000 filas con el Nivel 2. **Leídos como imagen: 7 de 116** (el aviso tras cancelar, el titular de fuga, la matriz de 20, la lectura oscura con el peor re-muestreo, la guía a 360 con «⭐ H1», las cifras diminutas y la tabla de agrupadores oscura), sin defectos. Antes, en la F3 (2026-10-05): la primera corrida dio 2 defectos reales (431 > 360 a 360 px con 20 categorías), pagados; la segunda, 100 capturas y 126 comprobaciones OK. Brochure (2026-10-06): 4 encuadres con `scrollWidth` = ancho de la ventana; 6 de los 28 encuadres por bloque leídos como imagen. BLUEPRINT: 4 capturas medidas, y el diagrama, la tabla de gates y la cabecera leídos como imagen. Las tarjetas de `design-sync` de varias categorías y de agrupar, leídas como imagen (2026-10-10) |
| e2e de `reduced-motion`        | `tests/e2e/reduced-motion-app.spec.ts:141` («varias categorías, veredicto y matriz visibles y quietos») y `:169` («agrupar, lectura, grupos y tabla visibles y quietos»): 2 pruebas × 2 proyectos, **nuevas del S7, primera corrida en este PR**. Nacieron en rojo con una animación de pulso sin `motion-reduce` («2 failed»). En verde en la CI de `23dedf1` (e2e 64 de 64). La del brochure (`tests/e2e/brochure.spec.ts:67`) se amplió a la escena E04b (F2-51), en verde en la CI de `0a0358f` (e2e 72 de 72). Más las del S5 (`:43`) y el S6 (`:103`). En la CI de `cd8358e` (run 38110479449): e2e 72 de 72 (15.0 min). La del último push, en el cuerpo del PR                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

**⭐⭐ OBLIGATORIO: Acto 1 (declarado en este PR) · Acto 2 (pendiente; lo abre el usuario).**

- **Acto 1:** construcción con CI verde por check, auditoría con todo pagado, contrapesos, BLUEPRINT
  al día, la guía v4 con el ⭐⭐ corto declarado, la auditoría de la constitución, y el brochure y su
  export ajustados en este PR. El ⭐⭐ **no** retiene el merge.
- **El ⭐⭐ corto:** 7 paradas, unos 20 minutos, cada una con su chip «N de 7». Se queda así por la
  orden «sin cambios» (opción B de AU-A-01).

  | Parada | Prueba | Qué                                                                                                                                                                                        |
  | -----: | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  |      1 | F3     | la tabla de la liga (Rotación de empleados), unos 3 min                                                                                                                                    |
  |      2 | G4     | el gráfico estimado frente a real, y cuatro de las cinco segundas vueltas del S6: en el móvil con `precio-fuga-plantada.csv` (seis dígitos), en desktop con Consumo de energía; unos 3 min |
  |      3 | G5     | «¿categorías o una cantidad?», y «Categorías» ya entrena, unos 2 min                                                                                                                       |
  |      4 | H2     | varias categorías: el veredicto y la matriz (mirada M1 y T1), unos 3 min                                                                                                                   |
  |      5 | I2     | agrupar: la lectura y qué distingue a cada grupo (M2, T2 y T3), unos 3 min                                                                                                                 |
  |      6 | F8     | el Nivel 2 en el móvil, y cancelarlo, unos 4 min                                                                                                                                           |
  |      7 | E6     | el brochure re-armado, en español y en inglés (la decisión del storyboard), unos 2 min                                                                                                     |

- **Qué deja fuera, y por qué** (lo dice la guía):
  - lo que la CI verifica por otro camino en cada push: las fugas plantadas, puntuar, exportar e
    importar, y abrir y cerrar las fichas y la model card;
  - el Nivel 2 en desktop (F7, H7): la CI lo arranca y lo cancela, y la integración con Pyodide real
    entrena los 14 miembros de cada tarea, pero ninguna e2e lo corre entero en pantalla;
  - las otras seis ⭐ (F4, F6, G2, G10, I7, I8): son juicio humano, pero no caben en 20 minutos. Entre
    ellas van I7, la mirada M3 («Agrupar filas parecidas en su lugar»), y en G2 la FAQ del R² negativo,
    la quinta segunda vuelta del S6.
- **⭐ acumulado del ciclo H2: 12** (S5: F3, F4, F6, F8 · S6: G2, G4, G5, G10 · S7: H2, I2, I7, I8),
  sobre `docs/GUIA-DE-PRUEBA.html` v4 (66 pruebas). **El ⭐ completo que se ofrece son las 12 del H2
  más las 11 ⭐ del H1** como regresión (filtro «⭐ H1»).
- **Viajan al ⭐⭐ como «maquetado, no visto»:**
  - las miradas de FORMA M1, M2 y M3;
  - las de TEXTO T1, T2 y T3;
  - las segundas vueltas del S6;
  - la escena E04b y la quinta puerta.
- **Acto 2**, cuando el usuario decida: ⭐⭐ parada a parada, registrado en la bitácora → PR de
  correcciones → brochure SELLADO → `/design-sync` (el usuario invoca, el constructor ejecuta;
  `lastPublished` al día) → `/cierre-sprint ds`, el sello del ciclo H2.

## Archivos clave

1. `src/lib/ds/pipeline.py` — la rama multiclase, `run_clustering`, el consenso, la referencia nula, la estabilidad y `_by_task`
2. `src/engine/despacho.ts` — el despacho exhaustivo por tarea
3. `src/engine/leakage.ts` · `verdict.ts` — fuga por clase con soporte mínimo; lectura y ganador de agrupar, en un solo sitio
4. `src/workers/contract.ts` — los lectores de varias categorías y de agrupar, con su carnada por campo
5. `src/lib/experiment.ts` · `model-file.ts` — `prepareMulticlass`, `prepareClusterRun` y los manifiestos por tarea
6. `src/lib/useExperiment.ts` — el flujo de agrupar y las etiquetas que no pasan por el estado (P13)
7. `src/components/MulticlassResults.tsx` · `ClusterResults.tsx` — las dos pantallas de resultados
8. `tests/integration/multiclase.test.ts` · `agrupar.test.ts` — anti-fuga, selección sin la prueba, cruces de punta a punta
9. `decisions/015-…` a `019-…` — varias categorías, agrupar, fuga por clase, portada liviana y primitivos propios
10. `sprints/SPRINT_007-auditoria.md` · `SPRINT_007-auditoria-constitucion.md` · `SPRINT_007-implementation-log.md` · `SPRINT_007-spike-catalogo.md`

## Cómo probar

1. `pnpm install && pnpm build && pnpm start`. Otra opción es la preview del PR (la URL va en la
   conversación, nunca en el repo).
2. Inicio → «Planes de suscripción» → objetivo `plan` («Vas a clasificar en 5 categorías») →
   «Entrenar modelos». En Resultados:
   - el veredicto en exactitud balanceada contra la mayoritaria y la logística;
   - la matriz 5×5 con ✓ y la confusión más frecuente;
   - la tabla por categoría y la liga;
   - la ficha de un modelo y la model card.
3. Sube `docs/kit-de-prueba/planes-fuga-plantada.csv`, con objetivo `plan`. Configuración nombra
   `cargo_corporativo_usd` y «empresa». Si entrenas igual: «⚠ Posible fuga de datos — sospechoso».
4. Inicio → «Segmentos de clientes» → «Sin objetivo: agrupar filas parecidas» → «Agrupar filas». En
   Resultados:
   - «● Los grupos existen: 3 grupos estables», con el puntaje contra datos sin estructura;
   - qué distingue a cada grupo;
   - la tabla de agrupadores: «Elegir» en GMM y «Volver al ganador»;
   - «Descargar filas con su grupo»: tu tabla entera, con `cliente_id` y `grupo`.
5. Sube `docs/kit-de-prueba/sin-grupos.csv` y agrupa: «○ No hay estructura de grupos», con la tabla a
   la vista.
6. Sube `docs/kit-de-prueba/segmentos-grande.csv` (9,000 filas) y agrupa: la nota de la muestra del
   jerárquico antes de correr y, tras el Nivel 2, en su fila.
7. Sube `docs/kit-de-prueba/tiendas-ciudades.csv`, objetivo «ciudad» → «Agrupar filas parecidas en su
   lugar».
8. Exporta el modelo de planes → recarga → impórtalo → puntúa: `plan_predicho` y `plan_probabilidad`.
   Lo mismo con el de segmentos: la columna `grupo`.
9. «Consumo de energía» → objetivo `ocupantes` → «Categorías»: ahora entrena.
10. El brochure: `docs/BROCHURE.html` (doble clic) o `/conoce`, en español y con «English».
11. Guía completa: `docs/GUIA-DE-PRUEBA.html` (66 pruebas; filtros «⭐⭐ corto», «⭐ Solo el gate H2» y
    «⭐ H1»). Suites: `pnpm test` · `pnpm test:integration` · `pnpm test:e2e`; y
    `node scripts/verificar-retiros.mjs`.

## Para mergear

**Lo hace el usuario:** marca el PR listo, mergea con **squash** y borra la rama; después corre
`/cierre-sprint ds`.

El 2026-10-10 el usuario pidió al constructor pasar el PR de borrador a normal. El constructor lo hace
con `gh pr ready 19` cuando los checks del último push cierran en `success`, y lo confirma en el cuerpo
del PR. Mergear con squash, borrar la rama y correr `/cierre-sprint ds` siguen siendo suyos.
