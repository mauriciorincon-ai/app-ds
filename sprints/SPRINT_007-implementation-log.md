# Sprint 007 — Bitácora de implementación («Agrupar y multiclase» · cierre del ciclo H2, sprint 3 de 3)

Branch: `sprint-007/agrupar-y-multiclase` (desde `main` `6f50c43`) · Orden:
`portafolio/ds/ordenes/SPRINT_007-orden.md` · Plan: `portafolio/ds/sprints/SPRINT_007.md`.

El usuario aprobó el plan de ejecución el 2026-10-04 (plan mode) sin ajustes, y dio el «construye»
el mismo día.

El sprint completa el catálogo de cuatro tareas de la VISION v1.1.0:

- **Clasificar en varias categorías:** la liga de 14 miembros en su forma multiclase, con fuga por
  clase y soporte mínimo, que la binaria también adopta (D8 del S6).
- **Agrupar sin objetivo:** K-Means, Agglomerative, GMM y HDBSCAN, con la estabilidad por
  re-muestreo como «sirve para creer».

Además entrega el **Acto 1 del cierre del ciclo H2**:

- el BLUEPRINT;
- la guía v4 con el ⭐⭐ corto;
- el brochure re-armado;
- la auditoría de la constitución.

Cero IA nueva. **Condición dura: la binaria y la regresión no se rompen.**

Regla 22 de la constitución (kit v1.38.0): **toda evidencia de esta bitácora se escribe después de
la corrida que la produce.**

## Desviación del plan

Aprobadas con el plan el 2026-10-04. La planeadora las lee aquí; no se escribe en ella.

- **D1 · Fixture `modelo-s6`.** El plan de la planeadora no lo lista. Sin él, «un archivo del S6
  importa y puntúa igual» no tiene prueba: solo existe `modelo-s5.*`. El código del S6 lo emite antes
  de tocar `pipeline.py`.
- **D2 · `githooks/pre-commit` no se re-estampa:** el del kit retrocede en macOS (dice «lo hace
  estampar-app.ps1» y solo menciona winget).

  Además, `verificar-dependencias.mjs` se porta del kit v1.37.0 **conservando el candado AU-S6-13**
  del repo: un lockfile que no se sabe leer es rojo. El kit no lo trae; queda como propuesta para su
  batch.

- **D3 · La UI de multiclase y agrupar se habilita en la F3** (mismo patrón que la D4 del S6). En la
  F1 y la F2 el motor las entrena de punta a punta, probado por unit e integración, y la preview no
  muestra un resultado nuevo en una pantalla vieja.
- **D4 · Clase de las miradas.** La orden fija Resultados multiclase y Resultados de agrupar como FORMA
  maquetada, sin parada. La regla de tres clases dice «en duda, DECISIÓN». Se sigue la orden (G-Plan
  aprobado). El usuario no pidió convertir la de agrupar en parada al aprobar el plan.

Surgidas en la construcción (2026-10-04, F2), se declaran aquí antes del STOP de la F2:

- **D5 · Modelo de costos de agrupar en dos partes.** P7 decía «costo por número de ajustes». La
  primera medición mostró que contar cada agrupador «como si ganara» sumaba cuatro lecturas cuando
  solo corre una (9,0 s estimados frente a 2,1 s reales). Ahora el barrido de cada agrupador (corre
  siempre) se suma, más la lectura más cara posible entre los que corren (solo la del retenido
  corre). Para las tareas con objetivo la reserva es 0 y su reparto no cambia (probado).
- **D6 · El flujo de agrupar en el hook (`labelsRef` y el comando de etiquetas) pasa a la F3.** El
  motor ya entrega las etiquetas por fila SOLO por `cluster_labels`, con su lector y su prueba de
  que no viajan en el resultado, el esquema ni el archivo (P13). Lo que falta es cablearlo a la
  pantalla, que llega en la F3 (D3).

## Fase 0 — constitución + delta del kit + deuda con sitio + datasets + spike

### Constitución sincronizada (2026-10-04)

`CLAUDE.md` ← `portafolio/ds/ordenes/CLAUDE-md-para-app.md`, regenerada por la planeadora con el kit
v1.38.0.

- `cmp`: copia idéntica.
- `grep`: la frase centinela «la evidencia se escribe DESPUÉS del hecho» aparece 1 vez.

### Delta del kit v1.35.0 → v1.38.0 (por nombre)

| Ítem del kit                                                    | Qué se hizo                                                                                                                                                                                                                                                                                                                                                                                                | Rojo (con `scripts/demo-rojo.sh`, ya corrido)                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v1.38.0 · `demo-rojo.sh` endurecido                             | Reemplazado por el del kit. Es el del S6 más la verificación con Python (`contiene()`) para un `--buscar` de varias líneas. Sigue en 100755                                                                                                                                                                                                                                                                | Demo de la herramienta, con un `--buscar` de dos líneas donde solo existe la primera. El script del S6 lo aceptó: «mutación aplicada», una que no cambió nada, y salió con 1 solo porque el gate `true` pasó; con un gate que fallara por otra razón, lo habría contado como rojo. El v1.38 salió con 1 antes de mutar: «el texto de --buscar no está». En los dos, el archivo quedó intacto |
| v1.37.0 · hook PreToolUse que **falla cerrado**                 | `.claude/settings.json` del kit (sin gitleaks o jq: `BLOQUEADO`, exit 2; `KIT_SIN_GITLEAKS=1` lo salta a sabiendas) + `tests/unit/hook-secretos.test.ts` del kit. El bloque «avisa y deja pasar» del S6 en `tests/integration/gitleaks-hook.test.ts` se retiró (cambio esperado: contradice la regla nueva)                                                                                                | Con el comando del S6 en `settings.json`: «× sin gitleaks ni jq bloquea, y lo dice» — «expected +0 to be 2», 1 de 3 en rojo, nombrando lo esperado. Restaurado (Python + `cmp`): 3 de 3 en verde                                                                                                                                                                                             |
| v1.37.0 · `verificar-dependencias` con degradaciones declaradas | Portado del kit, que exporta `revisar()`, con el candado AU-S6-13 dentro de `revisar()` (D2). `scripts/degradaciones-permitidas.json` = `[]`. Prueba nueva `tests/unit/verificar-dependencias.test.ts` (7) y tipos en `scripts/verificar-dependencias.d.mts`                                                                                                                                               | (a) Una entrada sin uso en el JSON: «tiene entradas que ya no aplican; bórralas: zod 9.9.9 → 9.9.8», exit 1. (b) `zod@4.6.5` → `4.6.4` en el lockfile real: «zod: 4.6.5 (origin/main) → 4.6.4 (este árbol)», exit 1. (c) El candado AU-S6-13 apagado: «× AU-S6-13: otra lockfileVersion no se compara», 1 de 7. En los tres, restaurado y en verde (675 paquetes; 7 de 7)                    |
| v1.37.0 · `scripts/lighthouse-margen.mjs`                       | Estampado. Paso nuevo del job `lighthouse`, después de los dos `lhci assert`                                                                                                                                                                                                                                                                                                                               | **¿Puede fallar siquiera?** Con `perf-budget.json` en `"path": "/*"`, el chequeo de cobertura nunca falla con las URLs de hoy. Su rojo es un presupuesto que deja una URL medida sin cubrir: con `"path": "/x"`, «✗ la URL medida / no cae bajo ningún path», exit 1. Restaurado: «✓ … 1 URL con presupuesto». La parte del margen solo avisa (exit 0), por diseño                           |
| v1.37.0 · regla 26, worktrees prohibidos                        | Adoptada. Esta sesión no usa `git worktree`. La comparación del bundle y la medición de Pyodide 314.0.7 van con `git archive` / `npm pack` en el scratchpad                                                                                                                                                                                                                                                | No es un gate                                                                                                                                                                                                                                                                                                                                                                                |
| v1.36.0 · reglas 24 y 25                                        | Inventario abajo                                                                                                                                                                                                                                                                                                                                                                                           | No es un gate; lo pregunta la casilla 8 de la auditoría                                                                                                                                                                                                                                                                                                                                      |
| v1.38.0 · regla 27, PR en borrador, comandos                    | Re-estampados `audita-sprint.md` (por superficies, casilla 8, decisiones en llano, segunda casilla 4 con otro auditor y frases de evidencia), `deploy-check.md` (§4 contra `merge-base`) y `plan-sprint.md` (tres clases de mirada). `.claude/commands/README.md` → `.claude/COMANDOS.md` (K-S6-1), conservando que `/release-check` no se estampa (perfil WEB). Molde `docs/SPIKE-DE-COSTOS.plantilla.md` | Son comandos y moldes                                                                                                                                                                                                                                                                                                                                                                        |

**Reglas 24 y 25, inventario.** La app es web.

- Nada del sprint toca lo que el sistema operativo protege (Llavero, permisos TCC, ítems de inicio,
  Touch ID, Automatización, cuentas, certificados).
- Los arneses (capturas, spike con Chromium y WebKit de Playwright) abren navegadores headless en
  localhost, sin pedir permisos.
- `pnpm test` no abre hardware: el único proceso que lanza es `bash`, en la prueba del hook.

Si algo pidiera permiso, se enseña antes con su matriz y se espera el «sí».

**ADR 012 re-leído (regla 18 de la constitución, cierre de ciclo).** El aviso de `braces`
(`GHSA-vfj7-8cjw-p6xm`) sigue con `first_patched_version: null`, consultado el 2026-10-04 en el
`/deploy-check` del S6. La excepción sigue vigente.

### Gates en verde después del delta (2026-10-04, corridos antes del primer commit)

- typecheck 0 · lint limpio
- `pnpm test`: 533 de 533 (49 archivos), con 3 del hook y 7 de dependencias nuevos
- `gitleaks-hook.test.ts` (integración): 7 de 7

### El archivo de modelo del S6 (D1), antes de tocar `pipeline.py`

`git diff 6f50c43` estaba vacío en `pipeline.py` (fuente y copia pública), `model-file.ts`,
`src/workers` y `experiment.ts`. Con ese código, `tests/integration/modelo-s6.test.ts` (emisor
con `MODELO_S6_EMITIR=1`) recorrió el camino real de la app sobre `consumo-energia.csv`, con la liga
de un solo miembro (`linear`, como el fixture del S5): prepareRun → liga → contrato →
`assembleRegressionResult` → `export_model` → `packModelFile`.

- `modelo-s6.probeta.json`: 5,8 KB, `task: numerica`, ganador `linear`, Pyodide 314.0.2,
  sklearn 1.8.0.
- `modelo-s6.esperado.json`: las 8 casas nuevas estimadas, con novedad en 2 de 8 filas.

La prueba permanente (valida, restaura y puntúa exactamente igual) pasó 1 de 1.

**Rojo** (`demo-rojo.sh`): las estimaciones de regresión ×1,0001 en `score_new_data` →
«× valida, se restaura y puntúa las casas nuevas EXACTAMENTE como en el S6», con
«expected [278.585…] to deeply equal [278.557…]». Restaurado: 1 de 1.

### Datasets del kit (P13 del plan)

Los genera `make-example-datasets.mjs` con semilla. Los seis heredados salieron **idénticos**: `git`
solo vio archivos nuevos.

| Archivo                          | Filas | Objetivo | Dónde         | Medido al generarlo                                                                                                                                                    |
| -------------------------------- | ----: | -------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `planes-suscripcion.csv`         |   200 | `plan`   | público + kit | 5 clases: básico 77 · estándar 37 · premium 42 · empresa 25 · estudiante 19. El AUC uno-contra-resto más alto de una columna legítima es 0,944 (`uso_gb_mes` → básico) |
| `planes-suscripcion-mediano.csv` | 5.000 | `plan`   | solo kit      | Nivel 2 multiclase                                                                                                                                                     |
| `planes-fuga-plantada.csv`       |   200 | `plan`   | público + kit | `cargo_corporativo_usd` separa «empresa» con AUC 1,0. La legítima más alta: 0,969 (`uso_gb_mes` → empresa)                                                             |
| `segmentos-clientes.csv`         |   300 | —        | público + kit | 3 grupos plantados (gasto y visitas); `cliente_id` es un identificador                                                                                                 |
| `sin-grupos.csv`                 |   300 | —        | público + kit | Una sola nube de 4 numéricas y una categórica al azar                                                                                                                  |

### CI de la Fase 0

| Push      | Contenido                    | Checks                                                                                                                                                                                                                                                                                                                                                                    |
| --------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e9e084b` | constitución + delta del kit | 6 de 6 `success` (`quality`, `integration`, `e2e`, `lighthouse`, Vercel, Vercel Preview Comments). **Primera corrida** de `lighthouse-margen` y de `hook-secretos.test.ts` en `quality`. El margen **avisó**: «/ · largest-contentful-paint mediana 3168 vs presupuesto 3500 (margen 9.5 % < 10 %)». Es un aviso (exit 0), no un rojo, y queda como decisión para el STOP |
| `77f4c0a` | fixture del S6 + datasets    | 6 de 6 `success`. El margen esta vez: «✓ ninguna mediana a menos del 10 %». Es la bimodalidad de Lighthouse sobre localhost que describe el kit                                                                                                                                                                                                                           |
| `74b5168` | spike + informe              | 6 de 6 `success` (`gh pr checks 19` y `statusCheckRollup`, run 37240356889). El margen **avisó otra vez**: «/ · largest-contentful-paint mediana 3250 vs presupuesto 3500 (margen 7.1 % < 10 %)», en un push que no toca la landing (solo scripts y documentos). Avisó en 2 de 3 corridas: va a la decisión del STOP                                                      |

### Spike en el navegador

Arneses nuevos, con el molde `docs/SPIKE-DE-COSTOS.plantilla.md`:

- `scripts/spike-multiclase/` y `scripts/spike-agrupar/`, cada uno con `datos.mjs`,
  `payloads.spike.ts`, `spike.py`, `tabla.mjs` y su config de vitest;
- `scripts/spike-liga/correr.mjs` ampliado:
  - repeticiones por celda (`SPIKE_REPS`, o `reps` por payload);
  - la carga de la máquina (`os.loadavg`) antes y después de cada dataset y del lote;
  - opciones por tarea (`SPIKE_OPTS`);
  - Pyodide servido desde una carpeta local (`SPIKE_PYODIDE_DIR`) para medir otra versión sin
    tocar `public/pyodide/`.

**Corridas de humo (NO son medición: la máquina estaba sobre el umbral, carga 7,2–8,8 con umbral
5).** Sirvieron para validar el código y ya cambiaron qué mide el spike de agrupar:

- **El one-hot de las categóricas fabrica grupos.** En `segmentos` (3 grupos plantados), K-Means
  eligió k = 12 y Agglomerative k = 11 con numéricas + one-hot; con solo numéricas, GMM, HDBSCAN y
  Agglomerative dieron k = 3. El spike mide los dos preprocesamientos.
- **Silueta + estabilidad no separan datos sin estructura.** En un uniforme de 1 dimensión, K-Means
  dio k = 2, silueta 0,62 y ARI 0,98: la lectura «silueta ≥ 0,25 y ARI ≥ 0,8» diría «los grupos
  existen». Con la **referencia nula** (el mismo agrupador sobre datos uniformes en la caja de la
  muestra rotada por PCA, como el estadístico gap) la diferencia fue +0,004. Con los grupos
  plantados fue de +0,22 a +0,35. El spike mide el gap por k y en el k elegido.
- **La pureza cruda de una categórica no sirve uno contra el resto.** En la simulación de azar
  (categoría y clase sin relación), con una clase del 2 % dio ≥ 0,98 en el 56–62 % de los sorteos,
  con 150 o 600 filas: el soporte no lo arregla. La pureza normalizada dio 0 % en todas las celdas.
- **La falsa alarma exacta de una numérica** (|AUC − ½| ≥ 0,48 por azar, sin empates) es de
  1,587 % con soporte 4 y de 0,794 % con soporte 5, en el peor caso sobre el tamaño del otro lado.
  Es matemática, no medición del navegador.

**Pyodide 314.0.7 frente al pin 314.0.2** (`npm pack` en el scratchpad, sin tocar el repo; peso
con la misma lógica de `verificar-peso-pyodide`):

| Paquete / medida                  | 314.0.2 (pin)         | 314.0.7                                             |
| --------------------------------- | --------------------- | --------------------------------------------------- |
| scikit-learn · xgboost · lightgbm | 1.8.0 · 2.1.4 · 4.6.0 | 1.8.0 · 2.1.4 · 4.6.0                               |
| pandas · scipy                    | 3.0.2 · 1.18.0        | 3.0.2 · 1.18.0                                      |
| numpy                             | 2.4.3                 | **2.4.6**                                           |
| Python (según el lock)            | 3.14.0                | 3.14.2                                              |
| Peso (núcleo + 11 wheels)         | 41.497.725 bytes      | 41.563.579 bytes (**+64,3 KiB**, la wheel de numpy) |

**Las corridas medidas (2026-10-04, 15:33–17:15).** Informe completo, con las tablas y los
anexos: `sprints/SPRINT_007-spike-catalogo.md`. Lo que pasó, en orden:

- **8 lotes con el envoltorio del molde** (espera load1 ≤ 5 durante 60 s, repite el lote una vez si
  algún dataset pasó el umbral). Multiclase y agrupar en Chromium salieron con carga en los dos
  intentos (10 de 17 y 10 de 17; 5 de 13 y 6 de 13); multiclase con 314.0.7 salió limpio al
  segundo; los otros cinco lotes, limpios al primero.
- **La carga.** Hasta las ~16:05, el proceso principal de Safari usaba un núcleo entero; el usuario lo
  cerró. La máquina (16 GB) trabajaba con 18.406–20.070 M de swap, con otras ventanas de VS Code del
  usuario trabajando en paralelo, que no se tocan. En Chromium, los datasets más pesados subieron la
  carga durante su propia corrida; en WebKit, no.
- **Tercer intento declarado** (`lotes-extra`, 17:06–17:15) solo para los 8 datasets de Chromium sin
  ninguna corrida bajo el umbral: 6 salieron limpios; las nubes de 5.000 y 20.000 filas, con carga
  otra vez (se marcan «con carga»; su lectura limpia de tiempo es la de WebKit).
- **Qué corrida usa cada dataset:** `scripts/spike-liga/elegir-intento.mjs`, con una regla fijada antes
  de mirar los tiempos (el intento más reciente bajo el umbral; si ninguno, el de menor carga
  máxima, marcado). Nunca el más rápido.
- **La carga no cambió los resultados:** `scripts/spike-liga/comparar-corridas.mjs`, sin los campos de
  tiempo, memoria y carga → multiclase 17 de 17 datasets idénticos en 106 corridas; agrupar 13 de 13
  en 82 (tres intentos de Chromium + WebKit). **Una primera versión de esta comprobación, hecha a
  mano durante los lotes, comparaba solo las repeticiones y dejaba pasar sin comparar los datasets de
  una sola corrida**; el script la reemplaza y es la cifra que vale.
- **Pyodide:** el arnés ahora lee la versión CARGADA en el navegador (`pyodideVersion`, numpy,
  scikit-learn en el `boot` de `correr.mjs`): 314.0.2 · numpy 2.4.3 y 314.0.7 · numpy 2.4.6, los dos
  con scikit-learn 1.8.0. Resultados idénticos en los 5 datasets comparados (39 corridas); medianas
  de tiempo a ≤ 0,3 s.
- **D8 en la binaria** (`scripts/spike-multiclase/d8-binaria.spike.ts`, motor real, sin navegador):
  con soporte 5 y pureza normalizada, 0 de los 11 objetivos binarios del kit cambian de veredicto, y
  `monto_recuperado` sigue marcada.
- `correr.mjs` sumó un `SPIKE_TAG` por intento y `tabla.mjs` de los dos spikes sumó secciones: el
  veredicto con exactitud balanceada (multiclase) y «k en 2..10: el ganador por puntaje, por gap y
  por consenso» (agrupar).

El servidor de producción de la medición se apagó al terminar.

### Decisiones del usuario en el STOP de la F0 (2026-10-04)

Respuesta literal: «1. Exactitud balanceada (sugerida) 2. 0,01 3. umbral 0,98 4. Consenso
(sugerida) 5. comparar cada agrupador con lo que él mismo da sobre datos sin estructura. 6. se queda 7. bajarlo en la F3 8. no entiendo la 8».

| #   | Decisión                                                                                                                                                                                              | Desviación del plan                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1   | Métrica primaria multiclase: **exactitud balanceada** (F1 macro a la vista)                                                                                                                           | El plan sugería F1 macro; el plan preveía el cambio    |
| 2   | Empate contra el baseline: **0,01 absoluto**                                                                                                                                                          | —                                                      |
| 3   | Fuga por clase: **umbral 0,98**, **soporte mínimo 5** de cada lado, **pureza normalizada** en las categóricas, y **la binaria adopta la regla** (D8)                                                  | —                                                      |
| 4   | Ganador entre agrupadores **por consenso** (el k en el que coinciden más agrupadores; entre ellos, el de mayor puntaje)                                                                               | **Sí: reemplaza la regla de P11** (mayor puntaje)      |
| 5   | Lectura de agrupar **con la referencia nula** (el mismo agrupador sobre datos sin estructura): «existen» / «frágiles» / «no hay estructura»                                                           | La orden decía «sin baseline»: decidido por el usuario |
| 6   | Pyodide **se queda en 314.0.2**: sin ADR 018, `runtime-pin.test.ts` sin cambios                                                                                                                       | —                                                      |
| 7   | El margen del LCP **se baja en la F3**, antes de sumar los botones de ejemplo a la portada                                                                                                            | Trabajo nuevo en la F3                                 |
| 8   | `AGGLO_MAX_ROWS = 8.000`: por encima, Agglomerative se ajusta sobre una muestra sembrada de 8.000 filas y asigna el resto al grupo más cercano. **Con una nota clara en la app** (pedido del usuario) | La nota es requisito nuevo de la F3                    |

Segunda respuesta, tras la explicación de la 8 y las dos confirmaciones (3 y 5 leídas con la
sugerencia completa: soporte 5 y pureza normalizada; gap ≥ 0,10 y ARI ≥ 0,7 con R = 10 y f = 0,8):
«Aprobada tu propuesta pero es importante poner una nota en la app para esa decision y que quede
claro». Sin corrección de las lecturas de la 3 y la 5: quedan como arriba.

**La nota de la muestra de Agglomerative (requisito de la F3).** Visible sin abrir nada, en ES/EN,
con símbolo y texto (no solo color), donde se lee el resultado:

- en la fila de Agglomerative de la tabla de agrupadores y, si gana, junto a la lectura: «Ajustado
  sobre una muestra de 8.000 de tus N filas; las demás se asignaron al grupo más cercano»;
- con el porqué en llano (la memoria del navegador, para que la pestaña no se cierre en un teléfono)
  y que los otros tres agrupadores usan todas las filas;
- en la model card y en el archivo exportado (`assign` con el tamaño de la muestra), en el manual
  (limitaciones) y en una pregunta de la FAQ. Un e2e y la pasada de capturas la verifican con un
  dataset de más de 8.000 filas.

## Fase 1 — despacho exhaustivo + motor multiclase + D8

El usuario dijo «continúa» el 2026-10-04 tras las decisiones del STOP de la F0.

### Primer commit: el despacho exhaustivo, sin cambio de conducta (P2, R1)

Hasta el S6, unos 45 sitios de TS y 11 de Python decidían por tarea con «si es numérica, X;
si no, la binaria». Una tarea nueva habría caído en silencio en la rama binaria. Ahora:

- **`src/engine/despacho.ts`** (nuevo): `byTask`, `matchTask` y `matchByTask`, con tipos
  mapeados sobre la unión. Qué ramas se exigen lo dice el TIPO de lo despachado: una
  `TrainTask`, todas; un resultado, las de su unión etiquetada. Cada rama recibe su variante ya
  estrechada, y una tarea sin rama que llega en runtime falla nombrándola. `taskOf` y
  `declaredTask` son el único «sin tarea = binaria» de TS (los datos del S5 no la traían).
- **`src/engine/tarea.ts`**: `SupervisedTask` y `TrainTask` (hoy la misma unión; agrupar llega en
  la F2). `TRAIN_TASKS` sale de un `Record` completo, no de una lista a mano.
- **Sitios convertidos**:
  - motor: `roster.ts` (`memberNameKey`), `eda.ts` (el `switch` pasa a `matchTask`), `experiment.ts`
    (`prepareRun` despacha a `prepareBinary`/`prepareRegression`);
  - contrato: `contract.ts` (validadores por tarea con `byTask`; los chequeos propios de cada
    tarea con `matchByTask`);
  - archivo y lectura: `model-file.ts` (empaquetar por tarea; el esquema exportado de otra tarea
    falla), `modelcard.ts`, `useNarration.ts` (la IA solo arma payload en la rama binaria),
    `useExperiment.ts`;
  - componentes: `ResultsScreen`, `LeagueTable`, `ScoreScreen`, `StartScreen`, `FichaModelo`,
    `TaskCard`.
- **Python** (`pipeline.py`): `_is_regression` se retira. `_by_task(task, ramas)` exige la rama de
  TODAS las tareas de `_FACTORIES_BY_TASK`; la tarea pedida sin rama es `contract:task` (se mira
  primero, como pedía AU-S6-03), y una registrada sin ramas falla con `dispatch-incomplete`
  aunque se pida otra. `_task_of` es el único «sin tarea = binaria» de Python. Las ramas
  largas pasan a funciones propias (`_binary_target`, `_numeric_target`, `_binary_baselines`,
  `_regression_baselines`, `_score_binary`, `_score_numeric`).
- **La binaria conserva su tope de prueba**: `_validate_payload` no tenía mínimo de filas de prueba
  para la binaria y sigue sin tenerlo (`"binaria": 0`).

**Los gates y sus rojos** (`scripts/demo-rojo.sh`, corridos el 2026-10-04 antes del commit):

| Gate                              | Mutación                                                                      | Rojo (lo que nombró)                                                                                                                                                        | Verde al restaurar           |
| --------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 1 · tipos (`ByTask`)              | `despacho.ts`: `readonly [P in K]: T;` → `?: T;`                              | `pnpm typecheck`: «tests/unit/despacho.test.ts(37,7) / (39,7): Unused '@ts-expect-error' directive», más dos sitios de producción que invocan una rama posiblemente ausente | `pnpm typecheck` sin errores |
| 1 · tipos (`TaskBranches`)        | `despacho.ts`: las ramas de `matchByTask` opcionales                          | «tests/unit/despacho.test.ts(41,7): Unused '@ts-expect-error' directive» (solo la prueba lo vio: ningún sitio de producción falla)                                          | `pnpm typecheck` sin errores |
| 2 · fuente TS                     | `modelcard.ts`: `taskOf(result)` → `result.task ?? "binaria"`                 | «src/lib/modelcard.ts:221 («?? binaria»)»                                                                                                                                   | 9 de 9                       |
| 2 · fuente Python (comparación)   | `pipeline.py`: `if k > k_max:` → `if ctx["task"] == "binaria" and k > k_max:` | «src/lib/ds/pipeline.py:837 (comparación)»                                                                                                                                  | 9 de 9                       |
| 2 · fuente Python (rama faltante) | `pipeline.py`: se borra la rama `"numerica"` del `KFold`                      | «src/lib/ds/pipeline.py:640 escribe [binaria], registradas [binaria, numerica]»                                                                                             | 9 de 9                       |
| 3 · conducta Python (runtime)     | `pipeline.py`: se quita el chequeo de despacho completo de `_by_task`         | La integración nueva «…y rompe también las tareas que SÍ tienen ramas»: la corrida fue «aceptada» en vez de `dispatch-incomplete`                                           | 1 prueba (filtrada) en verde |

**¿Puede fallar siquiera?** Sí: los seis rojos de arriba. El de fuente de Python exige además
al menos 10 llamadas a `_by_task`, para no probar nada sobre un archivo vacío.

**La conducta del gate 3 para las tareas nuevas** (resultados, liga, puntuar, ficha y model card de
multiclase y agrupar sin marcas binarias) nace con cada tarea: no hay tarea nueva que probar
en este commit. Se escribe en el commit del motor multiclase (superficies de `lib/`) y en la F3
(componentes).

**Cambio esperado en una prueba heredada:** ninguno. La de AU-S6-03 (`regresion.test.ts`) quedó
en verde sin tocarla, después de mover el chequeo de la tarea pedida antes que el de despacho
completo. Se le sumó una hermana (la de `dispatch-incomplete`).

**Verde del árbol completo** (2026-10-04, después de los rojos, con los comandos del `ci.yml`):

- `pnpm lint`: sin avisos;
- `pnpm typecheck`: sin errores;
- `pnpm test`: 542 de 542 en 50 archivos (533 + las 9 de `despacho.test.ts`);
- `pnpm test:integration`: 67 pasan y 1 se salta, en 8 archivos (la binaria y la regresión
  completas, con Pyodide real).

**CI del primer commit** (`ccb564b`, run 37244716613, `gh pr checks 19`): 6 de 6 `success`
(`quality`, `integration`, `e2e`, `lighthouse`, Vercel, Vercel Preview Comments). El margen de
Lighthouse: «✓ ninguna mediana a menos del 10 % de su presupuesto».

### Segundo commit: fuga por clase con soporte mínimo (D8, P6)

Decisión 3 del STOP de la F0: umbral 0,98, soporte mínimo 5 de cada lado, pureza normalizada en
las categóricas, y la binaria adopta la regla.

- **`src/engine/leakage.ts`**:
  - `LEAKAGE_CLASS_MIN_SUPPORT = 5`, exportada con su prueba;
  - `normalizedPurity`: 0 = lo que da la clase mayoritaria, 1 = cada categoría determina la clase;
  - `detectLeakageByClass` (varias categorías): cada clase contra el resto, y el hallazgo nombra
    la columna y la clase que más delata (`class`, valor del objetivo: solo en el navegador);
  - `detectLeakage` (binaria): la misma regla con K = 2. Las dos clases dan el mismo puntaje,
    así que se evalúa una, y el hallazgo conserva su forma (sin `class`).
- **Cambio esperado en pruebas heredadas (R3: «si algún heredado cambia, se para y se declara»).**
  Seis pruebas usaban datos de juguete con menos de 5 filas por clase, por debajo del soporte que
  decidió el usuario. Se agrandaron a 5 por clase sin cambiar lo que prueba cada una:
  - `tests/unit/leakage.test.ts`: proxy numérico, inversa, categórica proxy y nulos (de 3 a 5
    por clase);
  - `tests/unit/eda.test.ts`: «fuga antes que id-like antes que desbalance» (de 2 de 20 a 5 de
    50; sigue siendo un 10 % de minoría);
  - `tests/unit/experiment.test.ts`: la categórica proxy de `prepareRun` (de 4 a 10 por clase,
    para que en train queden ≥ 5).

  En datos reales no cambia nada: 0 de los 11 objetivos binarios del kit cambian de veredicto
  (spike, anexo C), y `tests/unit/leakage-datasets.test.ts` (credito con `monto_recuperado`
  marcada y los limpios sin marcas) quedó en verde sin tocarlo.

- **Pruebas nuevas** (8): la constante; el borde (4 no marca, 5 sí); los nulos no suman soporte;
  la pureza normalizada frente a la cruda; una categórica al azar con 5 de 300 no se marca (la
  cruda daría 0,983); la multiclase nombra la clase; una clase de 4 filas no se evalúa; y con dos
  clases la regla binaria y la por clase marcan lo mismo.

**Rojos** (`scripts/demo-rojo.sh`, 2026-10-04):

| Mutación                                          | Rojo (lo que nombró)                                                                                                                                                    | Verde    |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `LEAKAGE_CLASS_MIN_SUPPORT = 5` → `4`             | 4 de 21: «el soporte mínimo es 5», «borde: con 4 filas en la clase chica NO se evalúa», «el soporte se cuenta en filas CON valor», «una clase con 4 filas no se evalúa» | 21 de 21 |
| La categórica puntúa con `categoryPurity` (cruda) | 1 de 21: «una categórica al azar con una clase chica (5 de 300) no se marca»                                                                                            | 21 de 21 |

**Verde del árbol completo** (2026-10-04, después de los rojos): `pnpm lint` sin avisos;
`pnpm typecheck` sin errores; `pnpm test` 550 de 550 en 50 archivos; `pnpm test:integration`
67 pasan y 1 se salta, en 8 archivos.

**CI del segundo commit** (`4d65812`, run 37245439053, `gh pr checks 19`): 6 de 6 `success`
(`quality`, `integration`, `e2e`, `lighthouse`, Vercel, Vercel Preview Comments). El margen de
Lighthouse: «✓ ninguna mediana a menos del 10 % de su presupuesto».

### Tercer commit: el motor multiclase (P3, P4, P7, P9, P10; D2 en el motor, D3)

La multiclase entra al **motor** de punta a punta. La UI la recibe en la F3 (D3): `TRAINABLE_TASKS`
sigue sin ella, y el import de un archivo multiclase se rechaza nombrando la tarea.

**Python (`pipeline.py`):**

- **Ramas propias.** La rama `"multiclase"` está en los 12 `_by_task`. El objetivo se codifica
  0..K−1 en el orden que manda TS, y `_multiclass_target` exige que sean exactamente los valores
  distintos ordenados de los datos.
- **Partición y métricas.** `StratifiedKFold`, con k acotado por la clase más chica de train. Las
  métricas sobre la prueba son la exactitud balanceada, F1 macro y la exactitud; la pérdida
  logarítmica y el AUC uno contra el resto quedan en `null` sin probabilidades.
- **Detalles del resultado.** Matriz K×K y métricas por clase.
- **Baselines.** La mayoritaria y la logística, con la misma fábrica que el miembro `logistic`.
- **Puntuar.** Devuelve la clase predicha y la probabilidad de esa clase.

**TypeScript, motor y contrato:**

- **Costos y reparto.** `costos.ts` usa los coeficientes del anexo A con el factor `(K/5)^d`; sin K
  no estima. `encarrilador.ts` deja fuera las balanceadas cuando minoritaria × K ≥ 0,4 × 2, y sin K
  no reparte.
- **EDA (`eda.ts`).** La fuga se mide por clase y nombra la clase. El desbalance mira la clase más
  chica con la frontera re-expresada: cuota × K < 0,15 × 2.
- **Preparar y ensamblar (`experiment.ts`).**
  - `prepareMulticlass` usa la partición estratificada, mide la fuga por clase en train y devuelve
    `too-few-rows-per-class` con la clase más chica, para nombrarla en pantalla.
  - `byCodePoint` ordena las clases como `sorted()` de Python, también fuera del plano básico.
  - `testClassCounts`, `assembleMulticlassResult`, `applyMulticlassMemberFit` y
    `bestMulticlassBaseline` completan la rama.
- **Lector y manifiesto.**
  - El lector (`contract.ts`) suma su rama.
  - Nueva regla: un `n_test` que no coincide con las filas de prueba que TS envió se nombra como
    `n_test`. Antes caía como `confusion_matrix`.
  - El manifiesto (`model-file.ts`) suma `MulticlassManifest` y su validador; su fuga lleva `class`.
- **Hook.** `useExperiment` envía las clases y las filas de prueba por clase al lector. Al puntuar,
  el lector exige la forma del esquema activo.
- **Narración.** Con varias categorías, la narración no arma payload para la IA y usa una plantilla
  local `{es, en}` (P10).
- **Textos ES/EN.** Las cuatro métricas nuevas y `errors.too-few-rows-per-class`.
  `errors.target-mixed-notation` dejaba de ser cierto con K clases («tiene 2 valores»): ahora dice
  «clases escritas de más de una forma».
- **Superficies de la UI (D3).**
  - `pendingSurface(superficie, tarea)` falla nombrando superficie y tarea, en vez de pintar la rama
    binaria.
  - Quedan 13 para la F3: `FichaModelo`, `LeagueTable` ×2, `ResultsScreen`, `ScoreScreen` ×5,
    `ImportSummary` ×2, `TaskCard` y `modelcard`.
  - Una regla de fuente impide que vivan fuera de la UI y de la model card.

**Hallazgos de la construcción:**

- **La paridad `SCORER` / `METRIC_DIRECTION` de `roster.test.ts` tenía un punto ciego.** Su patrón
  (`[a-z0-9]+`) no aceptaba claves con «_», así que no veía `balanced_accuracy`. Lo descubrió el
  rojo al sumar la clave, y el patrón pasa a `[a-z0-9_]+`.
- **«¿Puede fallar siquiera?» sobre `_validate_classes`.** Sus condiciones de orden y unicidad nunca
  podían ponerse rojas solas: `_multiclass_target` las implica. Se retiran y queda anotado qué las
  cubre. El tope de 3 a 20 clases sí es un gate y nace con carnada y rojo.
- **Naive Bayes gaussiano sale por debajo de adivinar** en el sintético de 5 clases y 300 filas: 0,154
  de exactitud balanceada en CV, donde adivinar da 0,2. La liga lo muestra tal cual (regla dura 3) y
  el ganador sí supera el azar. No hay regla medida para dejarlo fuera.
- **Frase caducada para la F3.** `errors.target-not-binary` dice «El objetivo debe tener exactamente
  dos categorías», y ya no es cierto desde el S6. Se reescribe con la UI de la F3, y la casilla 4 la
  barre.

**Cambios esperados en pruebas heredadas (R13; se registran, no son lógica):**

- `experiment.test.ts` · «rechaza un objetivo no binario». Tres categorías ya entrenan. Ese caso
  pasa a «faltan filas POR CLASE» (nombra la clase), y `target-not-binary` se prueba con 21
  categorías.
- `regresion-motor.test.ts` · `ocupantes` respondida como «Categorías» ahora entrena (D2 en el motor).
- `contract.test.ts` · carnada del export de regresión. `schema.task = "multiclase"` se lee ahora
  con la forma multiclase y nombra `schema.classes`. La tarea desconocida pasa a `"serie-tiempo"`,
  que sigue nombrando `schema.task`. Las dos quedan como carnadas.
- `model-file.test.ts` · «una tarea que esta versión NO CONOCE» pasa de `multiclase` a
  `serie-tiempo`.
- `regresion.test.ts` (integración) · la carnada `task` y la prueba AU-S6-03 usan `"serie-tiempo"`.
  Si la prueba hubiera borrado `_FACTORIES_BY_TASK["multiclase"]`, habría roto las siguientes.
- `roster.test.ts` · el patrón de paridad de arriba.

**Contrato «detectó k de n»** (corrida fresca sobre el árbol final, 2026-10-04):

| Dirección                                       | Carnadas nuevas                                                                     | Heredadas, sin cambio                                                                                       |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| TS → Python (`_validate_payload`, Pyodide real) | multiclase **13 de 13**                                                             | binaria 16 de 16 · regresión 9 de 9                                                                         |
| Python → TS (`contract.ts`)                     | train **30 de 30** · fit-member **7 de 7** · export **4 de 4** · puntuar **8 de 8** | train 27/27 · fit-member 6/6 · progreso 5/5 · export 6/6 · puntuar 5/5 · regresión 36/36, 6/6, **5/5**, 4/4 |
| Archivo → import (`validateModelFile`)          | manifiesto multiclase **14 de 14**                                                  | 16 de 16 · regresión 12 de 12                                                                               |

El export de regresión pasa de 4 a 5 carnadas por la que nombra `schema.classes`. Los cinco fixtures
`*-multiclase` los escribió Pyodide real con `CONTRATO_ACTUALIZAR=1`
(`tests/integration/multiclase.test.ts`).

**Rojos** (`scripts/demo-rojo.sh`, 2026-10-04; cada uno restaurado con Python + `cmp` y en verde
después). Las salidas completas quedaron en el scratchpad de la sesión.

| Gate                                                      | Mutación                                           | Rojo (lo que nombró)                                                         | Verde |
| --------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------- | ----- |
| Superficies pendientes solo en la UI (`despacho.test.ts`) | `pendingSurface` en `useExperiment.planTarget`     | `src/lib/useExperiment.ts:` (archivo:línea)                                  | 12/12 |
| La UI no ofrece la multiclase todavía (D3)                | `TRAINABLE_TASKS` con `multiclase`                 | «la UI todavía no ofrece entrenar varias categorías»                         | 12/12 |
| Paridad `SCORER`                                          | `"balanced_accuracy": "accuracy"` en `pipeline.py` | «SCORER de pipeline.py…»                                                     | 13/13 |
| Paridad `MULTICLASS_MIN_CLASSES`                          | `= 4` en `pipeline.py`                             | `MULTICLASS_MIN_CLASSES`                                                     | 13/13 |
| Paridad de la primaria multiclase                         | `TASK_METRICS["multiclase"] = ("f1_macro",)`       | «solo admite la primaria»                                                    | 13/13 |
| Lector: filas de la matriz = filas de prueba              | sin el cotejo con `testCounts`                     | `confusion_matrix →` (la carnada de filas cruzadas)                          | 31/31 |
| Lector: `n_test`                                          | sin el cotejo de `n_test`                          | `n_test →`                                                                   | 31/31 |
| Lector: probabilidad ∈ [1/K, 1]                           | piso 0                                             | `probabilities → aceptada`                                                   | 31/31 |
| Manifiesto: `leakage[].class`                             | sin `class: optional(str)`                         | `manifest.leakage[0].class` (13 de 14)                                       | 26/26 |
| Python: las clases son LAS de los datos                   | sin el cotejo de `_multiclass_target`              | `train:classes →` ×3: `aceptada` (clases al revés), `cv_k` y `null`          | 1/1   |
| Python: k ≤ la clase más chica de train                   | `k_max` = filas de train                           | `train:cv_k → aceptada`                                                      | 1/1   |
| Python: tope de 3 clases                                  | tope en 2                                          | `train:classes → null` (revienta dentro de Python, no se acepta en silencio) | 1/1   |
| Costos: factor `(K/5)^d`                                  | `REFERENCE_CLASSES = 4`                            | «con K = 5 (la referencia) el factor es 1»                                   | 18/18 |
| E2: regla de balanceadas con K                            | la regla vieja (minoritaria ≥ 0,4)                 | «con K clases…»                                                              | 18/18 |
| E2: equivalencia en la binaria                            | `× 3` en lugar de `× 2`                            | «con dos clases la regla es IDÉNTICA…» (y la de K clases)                    | 18/18 |
| EDA: desbalance de la clase más chica                     | `minorityRate < 0,15` sin K                        | «el desbalance mira la clase MÁS CHICA…»                                     | 18/18 |
| Orden de las clases (`byCodePoint`)                       | comparar unidades UTF-16 (`split("")`)             | «…fuera del plano básico»                                                    | 18/18 |
| Cerrojo de la narración (P10)                             | `multiclase: (m) => m as never` (payload no nulo)  | «pedir la narración NO llama al route»                                       | 2/2   |
| Superficie pendiente falla nombrándose                    | `pendingSurface` devuelve en vez de lanzar         | «superficie sin rama todavía» (la model card)                                | 2/2   |

**Dos demos que la herramienta corrigió:**

- La del manifiesto salió con exit 1 la primera vez porque le pedí un mínimo de 29 pruebas en verde
  y el archivo tiene 26. El rojo había sido correcto; se repitió con 26.
- La del tope de 3 clases salió con exit 1 la primera vez porque predije que se aceptaría en
  silencio («→ aceptada»), y en realidad revienta dentro de Python («→ null»). `demo-rojo` lo
  rechazó por no nombrar lo esperado (K-S6-5); se repitió nombrando lo que de verdad dice la
  aserción.

**Verde del árbol completo** (2026-10-04, después de los rojos):

- `pnpm lint`: sin avisos;
- `pnpm typecheck`: sin errores;
- `pnpm test`: 587 de 587 en 52 archivos. El motor (`engine/`) está al 97,57 % de sentencias y al
  99,18 % de líneas;
- `pnpm test:integration`: 83 pasan y 1 se salta, en 9 archivos. Incluye la binaria (`liga`,
  `pipeline`, `scoring`, `sanitation-pipeline`) y la regresión (`regresion`, `modelo-s6`)
  completas; el archivo del S5 y el del S6 importan y puntúan igual.

**CI del tercer commit** (`a38498f`, run 37247919549, `gh pr checks 19`): 6 de 6 `success`
(`quality`, `integration`, `e2e`, `lighthouse`, Vercel, Vercel Preview Comments). El margen de
Lighthouse: «✓ ninguna mediana a menos del 10 % de su presupuesto».

**STOP de la F1** (2026-10-04): el usuario respondió «continúa» (después de «Que falta»).

## Fase 2 — motor de agrupar sin objetivo

### Cuarto commit: el motor de agrupar (P5, P7, P8, P11 con consenso, P12, P13; D3)

Agrupar entra al **motor** de punta a punta. La UI lo recibe en la F3 (D3): las pantallas que
recibirían un resultado de agrupar (`ResultsScreen`, `ScoreScreen` y el resumen del import) lo
despachan a una rama `pendingSurface`, y el import de un archivo de agrupar se rechaza nombrando la
tarea.

**Python (`pipeline.py`):**

- `run_experiment` y `fit_member` despachan por tarea con `_by_task`, así que el runner del
  navegador no cambia. Los caminos supervisados tienen una rama de agrupar que la rechaza nombrando
  la tarea (`_supervised_only`).
- **`run_clustering`:** valida su propio payload. Lo rechaza si trae `target`, `train_idx`,
  `test_idx`, `primary_metric`, `cv_k` o `classes`, nombrándolo. También rechaza un `k_range` fuera
  del tope, una `distance` que contradice las columnas o un roster con un id supervisado.
- **Barrido.** El preprocesador se ajusta sobre TODAS las filas (no hay prueba). Los cuatro
  agrupadores eligen su k:
  - K-Means y Agglomerative por silueta, sobre UNA muestra sembrada compartida;
  - GMM por BIC;
  - HDBSCAN por densidad, con tamaño mínimo max(5, n/50).
- **Ganador y lectura.** El ganador sale por consenso (`select_consensus`). Después vienen la
  lectura contra la referencia nula y la estabilidad (R = 10, f = 0,8), los perfiles en las unidades
  del usuario y la regla de asignación.
- **Agglomerative con más de 8.000 filas:** se ajusta sobre una muestra sembrada de 8.000. El resto
  va al centroide más cercano, y `sample_rows` lo declara en la fila, la regla y el esquema.
- **Exportar e importar.** Viaja la regla de asignación (centroides, radios o la mezcla gaussiana),
  sin filas de entrenamiento. Las etiquetas por fila solo salen por `cluster_labels` (P13); un
  modelo importado no las trae.

**TypeScript:**

- **Tareas y despacho.** `TrainTask` suma `agrupar` (`Task`, lo que E1 detecta, no cambia).
  `taskOf` devuelve la etiqueta del propio valor, así que lo que solo puede ser supervisado no pide
  la rama de agrupar.
- **Roster.** Los cuatro agrupadores van al final de `ALL_MEMBER_IDS`, en un solo espacio de ids.
  Sus fichas `{es, en}` citan las constantes reales.
- **`verdict.ts`:**
  - las constantes de agrupar con paridad Python;
  - `computeClusterReading`;
  - `selectClusterWinner` (consenso, espejo de Python);
  - `clusterKCap`.
- **`prepareClusterRun` (P5)** va aparte de `prepareRun`:
  - excluye las fechas y las columnas tipo identificador, listadas con su razón;
  - usa la distancia numérica con ≥ 2 numéricas;
  - devuelve `too-few-rows-cluster` cuando el tope de k baja de 2.
- **Lectores.** `validateClusterResult`, `validateClusterMemberFit`, `validateClusterScore` y
  `validateClusterLabels` recalculan el k de cada criterio, el puntaje comparable, el consenso y la
  lectura. Rechazan toda etiqueta por fila. `ClusterManifest` rechaza un objetivo o métricas
  supervisadas coladas.
- **Pantallas y hook.** `SupervisedResult` y `SupervisedSchema` separan lo que solo una tarea con
  objetivo tiene. `ResultsScreen`, `ScoreScreen` y el resumen del import despachan por tarea, y
  `useExperiment` valida la elección manual y la puntuación al agrupar.
- **Costos en dos partes (D5),** medidos en el flujo real.

**Medición de costos de agrupar** (`scripts/costos-agrupar/`, Chromium 153 sobre el build de
producción, 12 datasets, 3 corridas por celda salvo 8.000, 12.000 y 20.000 filas).

| Intento | Carga                                                                  | Qué se tomó                                                |
| ------- | ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1       | Los 12 datasets con carga: 17 a 23 con 10 núcleos al empezar, umbral 5 | Nada: se descartó                                          |
| 2       | 11 de 12 bajo el umbral (2,9 a 4,9); `nubes-20000` terminó en 5,21 ⚠   | Por dataset, el intento limpio (regla de `elegir-intento`) |

- **Sin pedirte nada:** la carga venía de las otras ventanas del usuario; no se le pidió cerrar
  nada.
- **Una mancha propia en el intento 2:** al empezar, corrí un `typecheck` de unos segundos (sobre
  los datasets chicos, con carga registrada de 4,4).

| Agrupador     | Barrido (t0 · a · b · c)       | Lectura (t0 · a · b · c)       |
| ------------- | ------------------------------ | ------------------------------ |
| K-Means       | 0,026 · 0,0604 · 0,925 · 0,318 | 0,035 · 0,0138 · 1,373 · 0,398 |
| Agglomerative | 0,008 · 0,0535 · 1,609 · 0,359 | 0,024 · 0,0928 · 1,981 · 0,547 |
| GMM           | 0,047 · 0,042 · 0,997 · 2,482  | 0,047 · 0,0259 · 1,308 · 0,958 |
| HDBSCAN       | 0,002 · 0,0125 · 1,834 · 0,911 | 0,033 · 0,0653 · 2,006 · 0,709 |

- **Error contra el flujo entero medido** (con la lectura del ganador real): de −31 % a +34 %.
- **Reparto con el techo de 5 s:**
  - hasta 5.000 filas entran los cuatro (3,78 s estimados con 5.000);
  - desde 8.000, Agglomerative y HDBSCAN pasan al Nivel 2, porque su lectura crece ~n²;
  - nadie queda «fuera».
- **Contra la previsión del spike:** con 12.000 filas el flujo midió 14,6 s, porque ganó HDBSCAN y
  su lectura tardó 12,6 s. Es justo el caso que el reparto deja para el Nivel 2.

**Prueba de humo con Pyodide real.** Reproduce las celdas del spike:

- `segmentos`: Agglomerative con k = 3 por consenso (3 de 4), gap 0,251 y ARI 0,876, así que la
  lectura es «existen»;
- `sin-grupos`: K-Means con k = 10, gap −0,029, así que la lectura es «no hay estructura».

**Cambios esperados en pruebas heredadas:**

- `regresion-motor.test.ts`: la unión de rosters suma el de agrupar.
- `model-file.test.ts` y `use-hooks.test.tsx`: leen campos supervisados de uniones que ahora
  incluyen agrupar, y se estrechan con su guarda.
- `despacho.test.ts`: las ramas de prueba suman `agrupar` y `TRAIN_TASKS` tiene 4.

**Contrato «detectó k de n»** (corrida fresca sobre el árbol final, 2026-10-04):

| Dirección                                       | Carnadas                                                                                                                                     |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| TS → Python (`_cluster_validate`, Pyodide real) | **16 de 16**                                                                                                                                 |
| Python → TS                                     | liga **46 de 46** · elegido a mano **8 de 8** · export **8 de 8** · puntuar **8 de 8** · puntuar con ruido **2 de 2** · etiquetas **4 de 4** |
| Archivo → import                                | manifiesto de agrupar **14 de 14**                                                                                                           |

Los siete fixtures `*-agrupar` los escribió Pyodide real con `CONTRATO_ACTUALIZAR=1`.

**Hallazgos de la construcción:**

- **El gate de fuente del despacho cazó tres comparaciones `raw.task !== "agrupar"`** que escribí
  en los lectores de agrupar. Pasan a la constante `CLUSTER_TASK`, como los supervisados cotejan
  contra su `task`.
- **Una carnada mal nombrada.** Mover la cuota de ruido de HDBSCAN se nombraba `score`, porque el
  puntaje se recalcula con el ruido. Ahora el ruido se coteja con los tamaños antes que el puntaje.
- **`next build` regeneró `next-env.d.ts`** (las rutas de tipos del modo producción). Ese archivo
  no se edita, y volvió a su versión comiteada.
- **El parser de Turbopack no acepta un `in` dentro de un parámetro por defecto.** `clusterSent`
  quedó con un solo parámetro.

**Rojos** (`scripts/demo-rojo.sh`, 2026-10-04; cada uno restaurado con Python + `cmp` y en verde
después):

| Gate                                          | Mutación                                 | Rojo (lo que nombró)                                | Verde |
| --------------------------------------------- | ---------------------------------------- | --------------------------------------------------- | ----- |
| Lector: ninguna etiqueta por fila (P13)       | sin `"labels" in r`                      | `labels → aceptada`                                 | 11/11 |
| Lector: el consenso recalculado               | sin el cotejo de `winner`                | `winner →`                                          | 11/11 |
| Lector: la lectura recalculada                | sin el cotejo de `reading.level`         | `reading.level → aceptada`                          | 11/11 |
| Lector: el puntaje = silueta × (1 − ruido)    | sin el recálculo                         | `league[0].score → aceptada`                        | 11/11 |
| Manifiesto: sin objetivo colado               | `target` fuera de `SUPERVISED_ONLY`      | `manifest.target`                                   | 11/11 |
| Regla de la lectura (gap)                     | `CLUSTER_GAP_MIN = 0.05`                 | «el borde: justo en el umbral cuenta»               | 18/18 |
| Consenso: a igual votos y puntaje, el k menor | `k` en vez de `-k`                       | «…luego el k menor»                                 | 18/18 |
| Tope de k                                     | sin el `- 1`                             | «…acotado para que cada re-muestreo…»               | 18/18 |
| Distancia numérica con ≥ 2 numéricas          | `>= 1`                                   | «con menos de dos numéricas…»                       | 18/18 |
| Reserva de la lectura al agrupar              | la reserva × 0                           | «…los de lectura cara pasan al Nivel 2»             | 18/18 |
| La reserva no toca a las tareas con objetivo  | reserva 1 s con objetivo                 | 4 pruebas de `planLevel2` de `encarrilador.test.ts` | 19/19 |
| Paridad de constantes                         | `CLUSTER_GAP_MIN = 0.15` en Python       | «las constantes de agrupar…»                        | 15/15 |
| Paridad de constantes                         | `AGGLO_MAX_ROWS = 12000` en Python       | «las constantes de agrupar…»                        | 15/15 |
| Paridad del roster y su orden                 | `agglomerative` antes que `kmeans`       | «…los agrupadores de CLUSTER_MEMBER_IDS»            | 15/15 |
| Despacho de Python con 4 tareas               | sin la rama `agrupar` de `_test_metrics` | `src/lib/ds/pipeline.py:` (archivo:línea)           | 12/12 |
| Python: sin objetivo                          | `target` fuera de la lista prohibida     | `train:target → aceptada`                           | 1/1   |
| Python: tope de k                             | sin `_k_cap`                             | `train:k_range → aceptada`                          | 1/1   |
| Python: el radio de HDBSCAN al puntuar        | radio infinito                           | «fuera de todo grupo» (la fila lejana dio 1, no −1) | 1/1   |
| Python: Agglomerative en modo muestra         | sin el modo muestra                      | «modo muestra» (el lector rechazó la fila)          | 1/1   |
| Python: P13                                   | `"labels"` en el resultado               | «P13» (el resultado contenía `"labels"`)            | 1/1   |

**Verde del árbol completo** (2026-10-04, después de los rojos):

- `pnpm lint`: sin avisos;
- `pnpm typecheck`: sin errores;
- `pnpm test`: 621 de 621 en 54 archivos. El motor (`engine/`) está al 97,16 % de sentencias y al
  98,66 % de líneas;
- `pnpm test:integration`: 98 pasan y 1 se salta, en 10 archivos. Incluye la binaria, la
  regresión, la multiclase y agrupar.

**CI del cuarto commit** (`280954a`, run 37251464861, `gh pr checks 19` y `statusCheckRollup`): 6 de
6 `success` (`quality`, `integration`, `e2e`, `lighthouse`, Vercel, Vercel Preview Comments). El
margen de Lighthouse: «✓ ninguna mediana a menos del 10 % de su presupuesto».

**STOP de la F2** (2026-10-04): el usuario respondió «continúa».

## Fase 3 — UI, lectura y documentos

### Quinto commit: varias categorías en la app (D3 cumplida para la multiclase)

La multiclase llega a la interfaz. Lo que hoy entrena el motor ya se puede elegir, leer, exportar,
importar y puntuar en la app.

**Qué cambia en la app:**

- **Tareas que se entrenan.** `TRAINABLE_TASKS` suma `multiclase`. La tarjeta de tarea dice «Vas a
  clasificar en N categorías» y con qué métrica. La respuesta «Categorías» de la pregunta ambigua
  entrena (paga D2 del S6). El caso «todavía no se entrena» desaparece: una columna que no sirve
  como objetivo lo dice de frente.
- **Resultados** (`MulticlassResults.tsx`):
  - el veredicto en exactitud balanceada; si gana la logística multinomial y empata consigo misma
    como baseline, se dice así (AU-S5-01);
  - «cuál mirar», con el azar de K categorías en el mismo número;
  - la matriz K×K en su propia región desplazable, enfocable y con nombre. Los aciertos llevan ✓,
    negrita y su nombre para el lector, nunca solo color. Los nombres largos se recortan a la
    vista, pero la celda conserva el texto completo;
  - la confusión más frecuente, en palabras;
  - las métricas por categoría y los baselines con su ficha.
- **Fuga por clase.** El aviso nombra la columna Y la categoría que delata.
- **La categoría más chica** se nombra en pantalla cuando bloquea (`too-few-rows-per-class`), nunca
  en un log (P4).
- **La liga** muestra la exactitud balanceada con 3 decimales. La razón de una balanceada «fuera»
  usa la parte de la clase más chica del reparto.
- **«¿Por qué predice así?»:** con varias categorías no hay una sola dirección, y se dice. La IA no
  narra (P10) y lo dice con su propio texto.
- **Puntuar:** `<objetivo>_predicho` + `<objetivo>_probabilidad` (la de la categoría predicha),
  con su nota. Sin probabilidad (Ridge, SVM lineal), se dice.
- **Import:** el resumen dice «Clasifica «plan» en 5 categorías» y la exactitud balanceada.
- **Fichas:** la logística, Ridge y el SVM lineal reemplazan lo que solo vale con dos clases
  («sí»/«no», «las dos clases», el AUC binario) por `MULTICLASS_FICHA_FIELDS`.
- **Model card:** la tarea, la exactitud balanceada con su azar, las métricas por categoría, la
  matriz K×K (las clases sí aparecen, como la clase positiva en la binaria) y «Narración con IA:
  no aplica».

**Copy caducado** (casilla 4 adelantada; se repite al cierre):

- `errors.target-not-binary` («debe tener exactamente dos categorías») pasa a `target-not-usable`,
  que dice lo que de verdad pasa;
- `task.notYet` («llega en una próxima versión») se retira: no queda tarea de columna que no
  entrene;
- se reescriben `task.notUsable`, `task.ask.multiclase.desc`, `config.target.help` y
  `modelcard.limits.tasks`.

**Cambios esperados en pruebas heredadas** (R13; afirmaban «la multiclase todavía no»):

- `despacho`, `regresion-motor` y `tarea`: la lista de tareas entrenables;
- `league-ui`: TaskCard con varias categorías y con la ambigua respondida;
- `regresion-ui` y `use-hooks`: el plan de varias categorías se arma y se envía;
- `model-file` y `start-import`: el archivo multiclase se abre. La tarea desconocida pasa a una
  inventada (`serie-tiempo`);
- `multiclase-ui`: la prueba de «superficie sin rama» de la model card pasa a probar la model card
  real;
- e2e `liga` y `tarea-ambigua`: «departamento» y «Categorías» entrenan. La ambigua corre la liga
  hasta la matriz.

**Pruebas nuevas:**

- unit (`multiclase-ui.test.tsx`, `start-import.test.tsx`, `use-hooks.test.tsx`):
  - resultados sin marcas binarias;
  - la matriz con K aciertos marcados;
  - la fuga con su categoría;
  - la liga a 3 decimales;
  - `topConfusion`;
  - puntuar con su CSV;
  - la ficha de cada reemplazo en ES y EN (y la binaria intacta);
  - la model card en ES y EN;
  - el import del archivo multiclase;
  - la categoría más chica nombrada;
- e2e:
  - `multiclase.spec.ts`: el recorrido con axe en los dos temas, la ficha y cero peticiones a
    `/api/narrate`; y la fuga plantada nombrando `cargo_corporativo_usd` y «empresa»;
  - `multiclase-score.spec.ts`: exportar → recargar → importar → puntuar, sin el payload ni el CSV
    en la red.

**Rojos** (`scripts/demo-rojo.sh`, 2026-10-04; cada uno restaurado con Python + `cmp` y en verde
después):

| Gate | Mutación | Rojo (lo que nombró) | Verde |
| --- | --- | --- | --- |
| Los aciertos de la matriz, nombrados para el lector | sin el `sr-only` «acierto:» | «matriz K×K con ✓ en la diagonal» | 12/12 |
| La fuga por clase nombra la categoría | siempre el texto sin categoría | «la fuga por clase nombra la columna Y la categoría» | 12/12 |
| Ficha del SVM lineal sin «dos clases» | el reemplazo vuelve a decir «las dos clases» | «linear_svc: los apartados de dos clases se reemplazan» | 12/12 |
| Model card: la primaria con su azar | la línea binaria de la métrica | «la exactitud balanceada con su azar, la matriz K×K y las clases» | 12/12 |
| La categoría más chica, nombrada | el plan sin `smallestClass` | «una categoría con muy pocas filas bloquea, y el plan la NOMBRA» | 35/35 |
| Puntuar: la probabilidad de la predicha | la columna binaria `probabilidad_<etiqueta>` | «la probabilidad de ESA categoría, la distribución y el CSV» | 12/12 |

**Verde del árbol completo** (2026-10-04, después de los rojos):

- `pnpm lint`: sin avisos;
- `pnpm typecheck`: sin errores;
- `pnpm test`: 633 de 633 en 54 archivos. El motor (`engine/`) está al 97,29 % de sentencias y al
  98,81 % de líneas;
- `pnpm test:integration`: 98 pasan y 1 se salta, en 10 archivos;
- e2e sobre el build de producción (`pnpm build` + `pnpm start`, Chromium móvil y escritorio):
  `multiclase`, `multiclase-score`, `tarea-ambigua` y `liga`, 10 de 10 al primer intento, con axe
  en los dos temas.

## Fricciones del kit (SEPARADAS del producto)

- **K-S7-1 · `plan-sprint.md` del kit perdió el punto 10** («al concluir la construcción, corre
  `/audita-sprint`»). La edición de v1.36.0 que cambió «dos clases de mirada» por «tres» lo borró
  junto con el bloque. Se re-estampó conservándolo, con una nota. Propuesta: restaurarlo en el kit.
- **K-S7-2 · El `--esperar-verde` de `demo-rojo.sh` exige un comando, pero su nombre parece un
  interruptor.** La primera demo del hook lo pasó sin argumento: `set -u` cortó con «$2: unbound
  variable» antes de mutar nada (exit 1, archivo intacto). Propuesta: que el script diga «falta el
  comando de --esperar-verde», o que lo tome del `--gate` por defecto.
- **K-S7-3 · El molde del spike de costos no dice qué hacer si el lote repetido TAMBIÉN sale con
  carga, ni ve la memoria.** «Se repite el lote; no se promedia con el sucio» deja abierto el segundo
  sucio. Aquí: un tercer intento declarado, solo para los datasets sin ninguna corrida limpia, y una
  regla para elegir la corrida fijada antes de mirar los tiempos (`elegir-intento.mjs`). Y el umbral
  `load1 ≤ núcleos / 2` no mide la presión de memoria: con 16 GB y 18–20 GB de swap, los datasets
  pesados subieron la carga durante su propia corrida, con la máquina quieta al arrancar.
  Propuesta para el molde: (a) la regla del tercer intento y de elección de corrida, con su script;
  (b) registrar el swap junto al `uptime`; (c) un paso «¿la carga cambió los resultados o solo los
  tiempos?» con `comparar-corridas.mjs`, que separa lo que la carga puede tocar de lo que no.
