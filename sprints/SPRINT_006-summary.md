---
sprint: 006
app: ds
status: closed
opened: 2026-10-03
closed: 2026-10-04
branch: sprint-006/estimar
pr: https://github.com/mauriciorincon-ai/app-ds/pull/17
---

# Sprint 006 Summary — Probeta DS («Estimar» · ciclo H2, sprint 2 de 3)

## Outcome

**Sí.** Con un CSV cuyo objetivo es numérico, la app entrena **la liga de regresión** (11 modelos)
con la mecánica del S5:

- validación cruzada dentro de train;
- regla de un error estándar;
- la prueba se abre una vez.

El veredicto se lee **en las unidades del objetivo**: «en promedio se equivoca por ±33.5 kWh; una
regresión lineal se equivoca por ±43.8 kWh». **La liga binaria no se rompió:** sus pruebas y
carnadas siguieron en verde sin tocar su lógica. Un archivo real del S5 importa y puntúa exactamente
igual. Cero IA nueva.

| Outcome                                   | Estado | Evidencia                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------- | :----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O1 · Estimar, de punta a punta            |   ✓    | `pipeline.py` con los 11 regresores, `KFold` y MAE en unidades; baselines **mediana + lineal** (decisión del usuario en el STOP de la F0: la mediana tuvo MAE ≤ la media en 9 de 9 datasets). Exportar → importar → puntuar con ganador lineal y con LightGBM (integración). `task` en el manifiesto; el archivo del S5 sigue importando (ADR 014) |
| O2 · Los guardarraíles aprenden a estimar |   ✓    | Fuga continua (\|Spearman\| y η² ≥ 0,98, con soporte ≥ 5 y ≥ 10 pares), sobre train. Avisos de EDA «objetivo muy sesgado» y «atípicos extremos», que informan sin bloquear. E1: `numerica` entrena y `ambigua` pregunta (D2). E2 con costos de regresión medidos en el navegador. E3: párrafo de regresión en cada ficha compartida                |
| O3 · Se lee sin ser estadístico           |   ✓    | MAE · RMSE · R² · MedAE con la línea «cuál mirar»; `PredichoVsReal.tsx` (SVG sin librería, forma además de color) con la descripción en texto; la model card con «Estimación» y «Narración con IA: no aplica»; manual, guía v3, dos datasets de regresión en el kit (uno con fuga plantada)                                                        |

## Qué se construyó

- **Motor (Python + contrato):**
  - `task` obligatoria en el payload y en el resultado (P1);
  - `_REGRESSORS` con los hiperparámetros del spike y `KFold`;
  - `select_one_se` con dirección;
  - métricas de regresión y MAPE `null` si hay ceros;
  - `pred_vs_real` (muestra determinista, tope 200) y residuos sobre TODA la prueba;
  - `target_stats` de train;
  - `score_new_data` numérico.

  Del lado de TS, `contract.ts` lee cada tarea con su forma y recalcula la selección con la
  dirección de la métrica.

- **TypeScript (motores puros):**
  - `METRIC_RULES` (dirección + tolerancia en un solo sitio);
  - un roster por tarea sobre un solo espacio de ids;
  - `quantileSplit` (la prueba cubre todo el rango del objetivo);
  - `detectLeakageContinuous`;
  - la EDA por tarea;
  - `prepareRun` por tarea;
  - `inferUnit` (tabla cerrada de sufijos);
  - el manifiesto por tarea con `unsupported-task`.
- **UI:**
  - `TaskCard` («Vas a estimar una cantidad, en kWh»; la pregunta de la ambigua, con teclado
    completo y foco gestionado);
  - `RegressionResults` (veredicto en unidades, métricas, cuantiles del error);
  - `PredichoVsReal`;
  - `LeagueTable` con «menor es mejor»;
  - `Level2Card` para las dos tareas;
  - `ScoreScreen` con `<objetivo>_estimado` y el resumen mín · mediana · máx;
  - el resumen del import por tarea;
  - el botón de ejemplo «Consumo de energía».
- **Datos:** `consumo-energia.csv` (200 filas, con la columna ambigua `ocupantes`) ·
  `consumo-energia-mediano.csv` (5.000 filas, para el Nivel 2) · `precio-fuga-plantada.csv` ·
  `casas-nuevas.csv` (puntuar con novedad plantada).
- **Kit v1.33 → v1.35 (F0):**
  - el ADR de la excepción de `braces`;
  - `scripts/demo-rojo.sh`, endurecido después en la auditoría (AU-S6-12);
  - `verificar-dependencias.mjs` que falla cerrado;
  - el hook de gitleaks con aviso;
  - comandos re-estampados;
  - la deuda del S5 pagada: `lighthouse-categorias.json`.
- **Documentos:**
  - ADR 012, 013 y 014;
  - el manual («Estimar una cantidad · desde Sprint 006», diccionario, tres preguntas frecuentes);
  - la guía v3 acumulativa (49 pruebas);
  - `design-system.md` y el bundle `design-sync/` (`estimar.html`, `tarea-ambigua.html`);
  - el brochure y su export (D7, de 33 a 35 funcionalidades);
  - el informe del spike (`sprints/SPRINT_006-spike-regresores.md`).

## DoD — checklist

| Estándar                | Estado | Evidencia                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | :----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Testing                 |   ✓    | `pnpm test` 47 archivos · **523/523**; cobertura 94,54 % de líneas, `engine/` 99,45 %, `contract.ts` medido desde este sprint (AU-S6-30). `pnpm test:integration` (Pyodide real) **66/66**: anti-fuga de la CV con espía, selección sin mirar la prueba, cada regresor, `fit_member` reproduce su fila. `pnpm test:e2e` sobre el build de producción **44/44**, cero flaky. Carnadas: ver «Auditoría» |
| CI/CD                   |   ✓    | `quality`, `integration`, `e2e`, `lighthouse`, Vercel y Vercel Preview Comments con conclusión propia `success` en `gh pr checks 17` tras cada push. Ningún job nuevo: la ruleset no cambia                                                                                                                                                                                                           |
| Observabilidad          |   ✓    | El breadcrumb `probeta.league` suma `task`, de una lista cerrada. **AU-S6-01 (Crítico) pagado:** Sentry ya no deja pasar sus breadcrumbs automáticos de la UI, que copiaban un `aria-label` con el MAE en unidades y nombres de columna; solo pasan los `probeta.*` (rojo #30)                                                                                                                        |
| Seguridad               |   ✓    | `pnpm audit --audit-level high` exit 0: un alto ignorado por el ADR 012 (`braces`, sin parche al 2026-10-04). El hook de gitleaks avisa si falta el binario (rojo demostrado). En la CI, gitleaks con checksum y `@lhci/cli` con versión fija (AU-S6-34). El CSV puntuado neutraliza fórmulas (AU-S6-33). Cero secrets                                                                                |
| Performance             |   ✓    | Sin wheels nuevos: 11 wheels, 39,58 MiB, tope 40,18 MiB. JS +7,6 % frente a `origin/main` (bajo el 10 %). Job `lighthouse` con el budget y las categorías ≥ 0,9, mediana de 3 corridas, en verde en cada push. El gráfico vive en Resultados, fuera de la landing                                                                                                                                     |
| UX + A11y               |   ✓    | El gráfico tiene descripción en texto (cuantiles del error sobre toda la prueba) y no comunica solo con color: disco dentro de la franja, anillo fuera, bordes punteados con contraste ≥ 3:1 (AU-S6-20). Foco con teclado en la pregunta de la ambigua (AU-S6-04, e2e). axe en ambos temas en cada pantalla tocada (AU-S6-17). e2e de reduced-motion al estimar                                       |
| IA embebida responsable |  N/A   | Cero IA nueva. La narración no narra regresión, con doble cerrojo y una prueba de cada lado: el route devuelve 400 sin llegar al proveedor; el cliente no llama a `fetch` (espía). La model card dice «Narración con IA: no aplica»                                                                                                                                                                   |
| Manual de uso           |   ✓    | `docs/MANUAL-DE-USO.md` § «Estimar una cantidad · desde Sprint 006», diccionario (MAE · RMSE · R² · la mediana como baseline) y FAQ (R² negativo, por qué pregunta, por qué la mediana)                                                                                                                                                                                                               |
| Revisión de diseño      |   ✓    | Miradas de FORMA M1 y M2 en matriz de una fila. El usuario las aprobó el 2026-10-04: «… ambos los abrí y apruebo», con comentario del gráfico y de la pregunta. Las segundas vueltas quedan «maquetado, no visto» para el gate ⭐                                                                                                                                                                     |

**Checks del PR y primeras corridas.** Corrieron por primera vez en este PR, así que no hay histórico
con el que afirmar regresión ni no-regresión:

- los specs e2e nuevos: `regresion`, `tarea-ambigua`, `regresion-score` y la prueba de
  reduced-motion al estimar;
- la integración `regresion.test.ts`;
- en `quality`, gitleaks con checksum, y en `lighthouse`, LHCI 0.15.1 fijado (los dos desde
  `f609d05`).

El paso de categorías de Lighthouse corrió por primera vez en el #16 (`34c39d6`), el PR de la F0
(D3).

## Métricas técnicas

| Criterio de aceptación (SPRINT_006.md)                                         | Resultado                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~200 filas: la liga de regresión en el Nivel 1, dentro del techo, en unidades  | ✓ Consumo de energía: Nivel 1 con 10 modelos, unos 3 s (techo 5 s). «▲ Extra Trees supera · ±33.5 kWh frente a ±43.8 kWh de la lineal · 23 % menos error». Los dos baselines son mediana + lineal                       |
| La fuga plantada se bloquea antes de entrenar; sin esa columna, entrena        | ✓ con D10: avisa y etiqueta, no bloquea (regla dura 3 y ADR 002). Configuración nombra la columna antes de entrenar; si se entrena igual, «⚠ Métricas casi perfectas — sospechoso». «Sin ella, entrena» tiene su prueba |
| Columna con pocos valores: pregunta con sugerida; las dos respuestas enrutan   | ✓ con D2: «Una cantidad» entrena la regresión y «Categorías» lleva a la tarjeta de multiclase (llega en el S7). e2e `tarea-ambigua.spec` con las dos respuestas                                                         |
| Export con ganador lineal y LightGBM → importar → puntuar; archivo del S5      | ✓ integración: predicciones idénticas en los dos casos. El archivo real del S5 (emitido por el código del S5 antes de tocar `pipeline.py`) importa y puntúa igual: predicciones, probabilidades y novedad               |
| El gráfico existe, tiene descripción textual y no cambia el LCP                | ✓ La descripción va en texto y en tabla. El gráfico vive en Resultados, y el budget de LCP del job `lighthouse` (landing) siguió en verde en cada push                                                                  |
| La model card dice la tarea, las métricas, los baselines y que la IA no aplica | ✓ sección «Estimación» (rojo #24)                                                                                                                                                                                       |
| `lighthouse-categorias.json`: existe, corre en CI, visto en rojo               | ✓ F0. Su primera medición encontró un defecto real: tres `<input type="file">` sin nombre accesible (auditoría `label` en 0)                                                                                            |
| Ningún umbral nuevo sin su medición y su constante exportada                   | ✓ Los cuatro del STOP de la F0 (fijados por el usuario) y los dos delegados en la auditoría (D8 `LEAKAGE_MIN_PAIRS`, D9 `RESIDUAL_LEAN_ALPHA`), todos medidos y exportados                                              |

**Lo que midió el spike en el navegador (F0)** está completo en `sprints/SPRINT_006-spike-regresores.md`:

- costos por regresor en Chromium y WebKit;
- convergencia del MLP con el objetivo estandarizado;
- la regla de un error estándar con MAE;
- la distribución de \|Spearman\| y η² en columnas legítimas frente a la plantada;
- la forma del objetivo para los avisos de EDA;
- media frente a mediana como baseline.

**Un valor fijo que no es umbral.** `quantity.ts` toma su piso de cero del último decimal que se
puede mostrar (medio sexto decimal, `ZERO_BELOW`), con su prueba (rojo #73). Es una regla de
formato derivada de `TARGET_DECIMALS_MAX`, no un umbral del modelo.

## Decisiones no anticipadas

- **ADR 012 — Excepción de auditoría para `braces`:** id, razón, fecha y condición de retiro. Un
  gate (`audit-exceptions.test.ts`) exige un ADR por cada id ignorado.
- **ADR 013 — Regresión como segunda tarea:**
  - baselines mediana + lineal;
  - MAE como métrica primaria con tolerancia relativa del 1 %;
  - veredicto en unidades;
  - fuga continua;
  - la entrada del gráfico en el design system.
- **ADR 014 — Manifiesto por tarea:** `task` aditivo (si falta, es binaria) y `unsupported-task`
  que nombra la tarea. Distingue lo que el import lee de lo que es documental.
- **Umbrales.** Los fijó el usuario en el STOP de la F0:
  - MAE;
  - empate con 1 % relativo;
  - fuga 0,98 con soporte ≥ 5;
  - sesgo ≥ 1;
  - atípicos ≥ 1 % fuera de 3·IQR;
  - mediana + lineal.

  En la auditoría delegó dos más, decididos midiendo: D8 (≥ 10 pares para evaluar la fuga
  continua; con 10, la probabilidad exacta de una falsa alarma es 1/181.440) y D9 (prueba de signo
  exacta, α = 5 %, para «tiende a estimar de más/de menos»).

- **Desviaciones D1–D11** en la bitácora. Las de mayor peso:
  - D2 (la respuesta «Categorías» enruta a multiclase, que llega en el S7);
  - D3 (el PR de la F0 se mergeó al empezar; el sprint sigue en el #17);
  - D4 (la regresión se habilitó en la UI en la F2);
  - D7 (brochure y export en este sprint);
  - D10 (la fuga continua etiqueta, no bloquea).

## Bugs + resoluciones

- **AU-S6-01 (Crítico, privacidad):** el breadcrumb automático `ui.click` de Sentry copiaba el
  `aria-label` del gráfico, con el MAE en unidades y nombres de columna, y `scrubSentryEvent` lo
  dejaba pasar. Ahora solo pasan los breadcrumbs `probeta.*` (rojo #30).
- **AU-S6-09:** el lector aceptaba una CV de MAE con el signo sin invertir, y con ella daba al peor
  modelo como ganador. Ahora la rechaza nombrándola (rojo #34).
- **AU-S6-11 y AU-S6-15:** dos reglas leían ruido como señal.
  - Una columna casi vacía daba falsa alarma de fuga: con 3 pares, 1 de cada 3 veces. Ahora se
    exigen 10 pares (D8).
  - El 5 % del MAE decía «se inclina» en el 74–83 % de los modelos sin sesgo con 50 filas de
    prueba. Ahora decide una prueba de signo (D9).
- **F0, Lighthouse por categorías:** tres inputs de archivo sin nombre accesible eran una parada
  muda del teclado. Se pagaron, y un axe nuevo sobre Inicio vacío lo vigila.
- **F0, Dependabot #15:** el lote habría movido Pyodide de 314.0.2 a 314.0.7, una versión que
  viaja dentro de cada modelo exportado. Lo atrapó la integración. El usuario eligió retener
  Pyodide, y `runtime-pin.test.ts` lo vigila ahora en `quality`.
- **Pasada de capturas de la F2:** la ficha de Ridge al estimar hablaba de «la clase» y del AUC. El
  número se separaba de su unidad a 360 px. El gráfico tenía 2 marcas por eje.
- **Pasada de capturas del cierre** (segunda vuelta visual, «maquetado, no visto»):
  - con cifras de seis dígitos, los rótulos del gráfico se pisaban;
  - con la fuga plantada, toda la liga salía con seis decimales («72,918.000000 USD»).

  Se pagaron con márgenes calculados desde el rótulo más largo, ejes rotulados salteados cuando
  hace falta y un piso de cero para los decimales (rojos #73–76).

- **Heredado del S3:** «1 valores fuera del rango» ahora tiene su singular, en los dos idiomas.
- **Observación sin causa encontrada:** una corrida completa de vitest con la máquina cargada dio 2
  fallas por tiempo. Aisladas pasaron 3 de 3, la suite completa 3 de 3 seguidas, y la CI pasó en
  cada push.

## Qué salió bien / qué generó fricción

**Bien:**

- **La liga binaria quedó intacta, y eso se demostró, no se supuso:**
  - las 49 carnadas binarias Python → TS y las 16 del manifiesto siguieron detectándose sin tocar
    su lógica;
  - el archivo del S5 lo emitió el propio código del S5 antes de cambiar `pipeline.py`.
- **El spike en el navegador decidió con números:** la mediana como baseline (9 de 9), el roster,
  los costos y que el techo de 5 s alcanza en regresión.
- **La auditoría independiente** (tres auditores, 43 hallazgos) encontró un Crítico de privacidad
  que las suites en verde no veían.
- **Las capturas leídas como imagen encontraron defectos reales dos veces** (la ficha de Ridge; los
  rótulos y los decimales del gráfico de precios).
- **`demo-rojo.sh` atrapó demos que no eran rojos de verdad:**
  - una mutación que no podía romper nada (#10);
  - un filtro que no corría pruebas (#11);
  - una mutación que no compilaba (#23).

**Fricción del kit** (separada en la bitácora):

- K-S6-1: el `README.md` de `.claude/commands/` aparece como comando.
- K-S6-2: `--buscar` de varias líneas debilita la verificación.
- K-S6-3: ninguna regla pide máquina quieta durante un spike de costos.
- K-S6-4: un `-t` que no coincide sale con 0.
- K-S6-5: un gate que no llegó a correr cuenta como rojo.

**Fricción del constructor:**

- El mínimo de pruebas mal puesto en cuatro demos (#57, #73–75). El script las rechazó y se
  rehicieron.
- Tres afirmaciones de evidencia se escribieron antes de que fueran ciertas, y se corrigieron antes
  del cierre:
  - «leído como imagen» sobre la ficha, antes de leerla;
  - «36 de 36», que mezclaba anchos con altos;
  - «93,24 % de líneas», que era la cifra de sentencias.
- La primera comparación del bundle se hizo contra el `main` local viejo y con otro entorno. Se
  descartó y se repitió contra la base real del PR.

## Sugerencias de mejora al método

1. **La pasada de capturas cubre los extremos de magnitud de cada dataset de ejemplo**, no solo el
   dataset principal. Los dos defectos del cierre vivían en el gráfico de precios (seis dígitos y un
   MAE de ~1e-11), que ninguna pasada encuadraba hasta el final.
2. **Una afirmación de evidencia se escribe después de la acción que la sostiene** («leído como
   imagen», «N de N», «% de líneas»), nunca como plan en pasado. Hubo tres casos este sprint; se
   corrigieron, pero solo porque se releyó.
3. **`/deploy-check` §4: el bundle se compara contra la base del PR (`merge-base`) y con el mismo
   entorno de build.** Comparar contra un `main` local viejo o sin `.env.local` da otra cifra.
4. **Llevar al kit lo que este repo endureció en `demo-rojo.sh`** (AU-S6-12: exit 127, SIGTERM,
   `--debe-nombrar`, `--minimo-tests`, restauración ante una interrupción), junto con K-S6-2, K-S6-4
   y K-S6-5.

## Deuda técnica aceptada

| Qué                                                                                               | Por qué                                                                                                                                                              | Pago                                                                       |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **D8 en la binaria:** la fuga binaria no exige soporte mínimo por clase (`src/engine/leakage.ts`) | Su falsa alarma depende de cuántas filas de CADA clase tienen valor; cambiarla tocaba la detección binaria validada S1–S5, que la condición dura del sprint protegía | S7, junto con la fuga de multiclase, que necesita la misma regla por clase |
| «Categorías» en la pregunta de la ambigua no entrena todavía (D2)                                 | Multiclase es alcance del S7                                                                                                                                         | S7                                                                         |
| Pyodide retenido en 314.0.2 (`package.json`, `ignore` en `dependabot.yml`)                        | La versión viaja dentro de cada modelo exportado; se mueve por decisión, con el runtime re-medido                                                                    | Cierre del ciclo H2 (S7)                                                   |
| Aviso alto de `braces` ignorado (ADR 012)                                                         | Sin versión parcheada (`first_patched_version: null` al 2026-10-04); solo ruta de desarrollo                                                                         | Se retira cuando haya parche (condición en el ADR)                         |
| Brochure sin re-armar: las funcionalidades del S5 y del S6 son líneas en la tarjeta del veredicto | Criterio del S5 (U2) y D7: corregir lo falso y sumar el conteo, sin tocar el storyboard                                                                              | Re-armado en el cierre del ciclo H2 (S7, según el plan)                    |
| WebKit solo en los spikes, no en la CI                                                            | Los proyectos de Playwright son Chromium móvil y escritorio                                                                                                          | Sin sprint asignado; se reporta                                            |

Deuda del S5 pagada aquí: `lighthouse-categorias.json` (F0). «Solo se entrena la tarea binaria»
pasa a binaria + estimar.

**Tabla de mapeo del brochure (regla 12).** El conteo pasa de 33 a 35 en el pie, en el export
(`funcionalidades.total`) y en el e2e del brochure.

| Funcionalidad del S6                               | En el brochure                                                                                                                    |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Estimar una cantidad, con el error en sus unidades | Línea 10 de la tarjeta del veredicto (`BROCHURE.html:807`), «Etapa 6» del historial (:1174) y «o una cantidad» en V1 (:798)       |
| ¿Categorías o una cantidad? Te lo pregunta         | Línea 11 de la tarjeta del veredicto (`BROCHURE.html:808`)                                                                        |
| Frases que el S6 volvió falsas                     | Corregidas: «ni un número continuo», «tres ejemplos» → cinco, alertas, baselines, métricas, CSV puntuado y diccionario (AU-S6-07) |

## Auditoría

- **Artefacto:** `sprints/SPRINT_006-auditoria.md`. Tres auditores independientes: alcance y
  textos · motor, contrato, gates y dependencias · UI, hook, i18n, a11y y privacidad del cliente. Cada hallazgo tiene `archivo:línea` y su ajuste ejecutable.
  Recomendación de la Fase 1: **requiere ajustes**.
- **Hallazgos:** 49 en bruto → **43 consolidados: 1 Crítico · 6 Altos · 15 Medios · 21 Bajos.**
- **Aprobación de la Fase 1:** el usuario, el 2026-10-04, con los dos umbrales nuevos delegados
  (D8 y D9).
- **Todos pagados** (`da01ea2` a `0e970fc`), con 48 demos en rojo (#29–#76, todas con
  `demo-rojo.sh` y `--debe-nombrar`). Se pagaron primero los hallazgos que crean gates, y los gates
  nuevos se corrieron al final sobre el árbol completo.
- **Además, los 2 defectos de la pasada de capturas del cierre**, pagados con rojo (#73–76).

| Hallazgo | Sev.    | Pago (rojo)                                                                                                  |
| -------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| AU-S6-01 | Crítico | Sentry: solo breadcrumbs `probeta.*` (#30)                                                                   |
| AU-S6-02 | Alto    | El import nombra la tarea desconocida, `unsupported-task` (#33)                                              |
| AU-S6-03 | Alto    | Despacho exhaustivo por tarea en TS y Python: una tercera tarea no compila (#31, #32)                        |
| AU-S6-04 | Alto    | Foco a lo que aparece al responder o cambiar la respuesta (#44, #45, e2e #70)                                |
| AU-S6-05 | Alto    | Una columna que no sirve como objetivo no promete versión futura (#46)                                       |
| AU-S6-06 | Alto    | Export con cifras re-medidas y recuento desde el repo (#62)                                                  |
| AU-S6-07 | Alto    | Brochure y export dicen la verdad del S6 (`837d1fc`)                                                         |
| AU-S6-08 | Medio   | `too-few-rows-quantity` honesto en TS y en Python (#36, #37)                                                 |
| AU-S6-09 | Medio   | El lector rechaza una CV de MAE con signo sin invertir (#34)                                                 |
| AU-S6-10 | Medio   | `n_total` atado a la prueba y largo exacto (#35)                                                             |
| AU-S6-11 | Medio   | D8: `LEAKAGE_MIN_PAIRS = 10` (#60)                                                                           |
| AU-S6-12 | Medio   | `demo-rojo.sh` endurecido: 127, SIGTERM, sin nombrar, 0 pruebas (#29)                                        |
| AU-S6-13 | Medio   | `verificar-dependencias` falla con un lockfile ilegible (#42)                                                |
| AU-S6-14 | Medio   | Texto para cada falla del motor y `Record` exhaustivo (#48, #49)                                             |
| AU-S6-15 | Medio   | D9: prueba de signo y «0.0» sin signo (#50, #51)                                                             |
| AU-S6-16 | Medio   | Pruebas del Nivel 2 al estimar (#52, #53)                                                                    |
| AU-S6-17 | Medio   | axe en los dos temas en puntuar, importar, ficha, liga y fuga (e2e #71, #72)                                 |
| AU-S6-18 | Medio   | El empate de la lineal solo si decide la lineal, y su hermana binaria (#54, #55)                             |
| AU-S6-19 | Medio   | Las fichas al estimar no hablan de votos ni clases (#56)                                                     |
| AU-S6-20 | Medio   | Bordes de la franja en `accent` pleno, ≥ 3:1 (#57)                                                           |
| AU-S6-21 | Medio   | Importancias en unidades, en pantalla y en la model card (#58, #59)                                          |
| AU-S6-22 | Medio   | D10 declarada y la prueba de «sin ella, entrena» (#61)                                                       |
| AU-S6-23 | Bajo    | Manual: quién compite en el Nivel 1 y el baseline de las dos tareas (`f20f1ee`)                              |
| AU-S6-24 | Bajo    | Frases caducadas internas: guía, D4 y JSDoc de `eda.ts` (`f20f1ee`)                                          |
| AU-S6-25 | Bajo    | D11 registrada (`f20f1ee`)                                                                                   |
| AU-S6-26 | Bajo    | Días con su símbolo «d»; meses y años no se inventan como unidad (prueba en `regresion-motor.test.ts`)       |
| AU-S6-27 | Bajo    | ADR 013 y 014 precisos (`f20f1ee`)                                                                           |
| AU-S6-28 | Bajo    | `TargetUnit` sin el `suffix` huérfano; `BASELINE_IDS_BY_TASK` como fuente; campos documentales en el ADR 014 |
| AU-S6-29 | Bajo    | ADR 014: claves extra toleradas, métricas de clase rechazadas (`f20f1ee`)                                    |
| AU-S6-30 | Bajo    | `contract.ts` medido en la cobertura (#40)                                                                   |
| AU-S6-31 | Bajo    | Decimales en notación científica (#38)                                                                       |
| AU-S6-32 | Bajo    | MAPE `null` con ceros, probado en el emisor (#39)                                                            |
| AU-S6-33 | Bajo    | Fórmulas neutralizadas en el CSV puntuado (#41)                                                              |
| AU-S6-34 | Bajo    | Checksum de gitleaks y `@lhci/cli` con versión fija (#43)                                                    |
| AU-S6-35 | Bajo    | Sin «Por ahora» en la línea de IA, la model card y el manual (`c7a6e50`, `f20f1ee`)                          |
| AU-S6-36 | Bajo    | Plurales «1 decimal» y «1 fila» (#63, #64)                                                                   |
| AU-S6-37 | Bajo    | Espacio no separable antes de % (#65)                                                                        |
| AU-S6-38 | Bajo    | La descripción de cada respuesta se lee una vez (#47)                                                        |
| AU-S6-39 | Bajo    | Miembro lineal = baseline lineal, y el lector lo comprueba (#66)                                             |
| AU-S6-40 | Bajo    | Identificadores en una sola frase (#67)                                                                      |
| AU-S6-41 | Bajo    | `estimateSummary` fuera del componente (#68)                                                                 |
| AU-S6-42 | Bajo    | Banner de fuga en un solo sitio (#69)                                                                        |
| AU-S6-43 | Bajo    | Marcas del gráfico a 12 px, en `design-system.md` y `design-sync/` (`f20f1ee`)                               |

**Carnadas al cierre («detectó k de n»):**

| Contrato                     | Regresión | Binaria (intacta) |
| ---------------------------- | --------- | ----------------- |
| TS → Python                  | 9/9       | 16/16             |
| Python → TS, liga            | 36/36     | 27/27             |
| Python → TS, elección manual | 6/6       | 6/6               |
| Python → TS, export          | 4/4       | 6/6               |
| Python → TS, puntuación      | 4/4       | 5/5               |
| Manifiesto                   | 12/12     | 16/16             |

La binaria suma además 5/5 de progreso, que la regresión comparte.

- **Casilla 4 (frases caducadas):** corrida en la Fase 1 y repetida después del último ajuste,
  sobre el diff de la Fase 2, sus frases hermanas y este summary. Encontró y corrigió una frase
  nueva: la prueba G7 de la guía citaba «Por ahora, la narración con IA…». Las promesas aplazadas
  que quedan son verdad hoy y están inventariadas en la bitácora:
  - `task.notYet`: la multiclase llega en el S7;
  - «por ahora 8» ⭐ en la guía: es la cuenta acumulada.

  En este summary, las menciones del S7 nombran deuda con sprint de pago, no promesas de la app.

- **`/deploy-check`:** MERGE OK, casilla por casilla en la bitácora («`/deploy-check`»).

## Gate ⭐ — diferimiento y contrapesos

| Contrapeso                     | Evidencia (archivo, cuenta medida, corrida)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pasada de capturas del builder | `scripts/capturas-s6.mjs` sobre el build de producción, 2026-10-04: **54 encuadres** (360 y 1280 px × claro y oscuro, la app y la guía v3) **+ 2 del gráfico de precios** (cierre). `scrollWidth ≤ clientWidth` medido en 32 de 32 páginas; la ficha de Ridge cabe en la ventana 4 de 4. Pasada de interacción: la ambigua sin responder y respondida, Resultados, la ficha, la model card, puntuar con novedad, la fuga y el Nivel 2 con 5.000 filas. Leídos como imagen: Resultados completos, veredicto, gráfico (dos temas y precios), liga con la prueba a 360, ficha oscura, model card, puntuar, fuga, Inicio y guía v3. Rótulos del gráfico medidos con `getBoundingClientRect`: sin solapes ni cortes |
| e2e de `reduced-motion`        | `tests/e2e/reduced-motion-app.spec.ts:103`, «estimar una cantidad, veredicto y gráfico visibles y quietos»: 1 prueba × 2 proyectos, **nueva del S6, primera corrida en este PR**, con opacidad efectiva y transiciones apagadas. Más la del S5 (:43) y la del brochure. En verde en la CI de `0e970fc` (e2e 44/44)                                                                                                                                                                                                                                                                                                                                                                                             |

**⭐ diferido: 8 pruebas al acumulado del ciclo H2 (S5: 4 — F3, F4, F6, F8 · S6: 4 — G2, G4, G5,
G10).** Van al gate del cierre del ciclo H2 (S7) sobre `docs/GUIA-DE-PRUEBA.html` v3. Las 11 ⭐ del
H1 ya se corrieron y quedan como regresión. Al mismo gate viajan las segundas vueltas visuales
«maquetado, no visto»:

- las marcas del gráfico a 12 px;
- los márgenes y los rótulos salteados;
- el piso de cero de los decimales;
- la línea «cuál mirar»;
- la FAQ de R² negativo.

## Archivos clave

1. `src/lib/ds/pipeline.py` — regresores, `KFold`, selección con dirección, métricas, `pred_vs_real`, `_validate_payload`
2. `src/workers/contract.ts` — el lado que lee Python → TS, por tarea, con la selección recalculada
3. `src/engine/verdict.ts` · `leakage.ts` · `split.ts` · `tarea.ts` — `METRIC_RULES`, fuga continua, `quantileSplit`, E1
4. `src/lib/experiment.ts` — `prepareRun` por tarea, `inferUnit`, el ensamblado de regresión
5. `src/lib/model-file.ts` — el manifiesto por tarea (ADR 014)
6. `src/components/RegressionResults.tsx` · `PredichoVsReal.tsx` · `TaskCard.tsx`
7. `src/lib/regression-text.ts` · `quantity.ts` · `scatter.ts` — veredicto en texto, cifras y geometría del gráfico
8. `tests/integration/regresion.test.ts` — anti-fuga, selección sin la prueba, cruces de punta a punta
9. `decisions/012-audit-exception-braces.md` · `013-regression-as-second-task.md` · `014-model-manifest-per-task.md`
10. `sprints/SPRINT_006-auditoria.md` · `SPRINT_006-implementation-log.md` · `SPRINT_006-spike-regresores.md`

## Cómo probar

1. `pnpm install && pnpm build && pnpm start`. Otra opción es la preview del PR (la URL va en la
   conversación, nunca en el repo).
2. Inicio → «Consumo de energía» → objetivo `consumo_kwh` («Vas a estimar una cantidad, en kWh») →
   «Entrenar modelos». En Resultados:
   - el veredicto en kWh contra la mediana y la lineal;
   - el gráfico estimado frente a real y la descripción del error;
   - la liga «menor es mejor», con «Ver puntajes de prueba»;
   - la ficha de un modelo;
   - la model card con «Estimación».
3. El mismo ejemplo → objetivo `ocupantes` → la pregunta con «Categorías» sugerida. «Una cantidad»
   entrena; «Categorías» muestra la tarjeta de multiclase; «Cambiar la respuesta» vuelve a
   preguntar.
4. Sube `docs/kit-de-prueba/precio-fuga-plantada.csv`, con objetivo `precio_usd`. Configuración
   nombra `impuesto_transferencia_usd`. Si entrenas igual: «⚠ Métricas casi perfectas —
   sospechoso».
5. Exporta el modelo de consumo → recarga → impórtalo → puntúa `docs/kit-de-prueba/casas-nuevas.csv`.
   Resultado: columna `consumo_kwh_estimado` y novedad en 2 de 8 filas.
6. Nivel 2: `docs/kit-de-prueba/consumo-energia-mediano.csv` (5.000 filas).
7. Guía completa: `docs/GUIA-DE-PRUEBA.html` (49 pruebas; filtro «⭐ Solo el gate H2»). Suites:
   `pnpm test` · `pnpm test:integration` · `pnpm test:e2e`.
