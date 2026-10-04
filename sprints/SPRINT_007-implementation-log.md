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
