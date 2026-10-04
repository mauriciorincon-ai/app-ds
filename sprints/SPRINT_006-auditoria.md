# Sprint 006 — Auditoría final, Fase 1 («Estimar» · Probeta DS)

- **Fecha:** 2026-10-04
- **Auditores:** tres subagentes independientes, que no construyeron el sprint, en paralelo y en
  solo lectura. Fuente primaria: el diff. La bitácora solo sirvió para contrastar lo que el
  constructor cree que hizo.
  - **A:** alcance y textos. Casillas 1, 4 y 6, coherencia documental y cero enlaces.
  - **B:** motor, contrato, gates y dependencias. Casillas 2, 3, 5 y 7.
  - **C:** UI, hook, i18n, a11y y privacidad del cliente. Casillas 2 y 5.
- **Base → HEAD:** `6bf5e08` (merge-base con `main`) → `c4cbfd1`, rama `sprint-006/estimar`, PR #17.
- **Diff:** 110 archivos, +16 436 / −955 líneas, 17 commits.
- **Lo que corrieron los auditores, en solo lectura** (al terminar, `git status --short` vacío en
  los tres):
  - `pnpm typecheck` ✓ y `pnpm lint` ✓.
  - `pnpm test` con cobertura: 45 archivos, 475/475 ✓. Total: 93,91 % de líneas y 92,57 % de
    sentencias. `src/engine/`: 99,81 % de líneas y 96,79 % de ramas.
  - `pnpm test:integration` con Pyodide real, en local: 7 archivos, 63/63 ✓.
  - 6 archivos de vitest de UI: 108/108 ✓.
  - Sondas propias fuera del repo: 4 de A, 9 de B y 4 de C, con su config de vitest en el
    scratchpad.
  - `gh pr checks 17` sobre `fdac870`: 6 de 6 `pass`. El HEAD local `c4cbfd1` solo suma bitácora y
    todavía no está empujado.
  - Barrido de cero enlaces: vacío. `homepageUrl` es la URL del propio repo.
  - Nadie corrió build ni Playwright local: para los e2e se cita la CI.

## Recomendación

**Requiere ajustes.** Los auditores reportaron **49 hallazgos**. Seis se repiten entre auditores y
se fusionan, así que quedan **43**:

| Severidad | Cantidad |
| --------- | -------- |
| Crítico   | 1        |
| Alto      | 6        |
| Medio     | 15       |
| Bajo      | 21       |

Todos están en el índice de abajo con su `archivo:línea`. El texto completo de cada uno, con su
ajuste ejecutable y su criterio de «verificado cuando», está en el informe de su auditor (anexos).

**Lo que resistió:**

- **La liga binaria está intacta.** Sus fixtures cambian solo por `task` y por tiempos o bytes del
  pickle, y las 49 carnadas Python → TS y las 16 del manifiesto binario siguen igual.
- **Ningún dato sale por la red.**
  - La selección no mira la prueba: la permutación del test y el espía anti-fuga de la CV pasan.
  - La fuga continua se calcula solo sobre train.
  - Ningún camino de la UI llama a `/api/narrate` con una regresión, y el route lo rechaza con 400.
- **Los conteos de carnadas cuadran exactos con los ADR y la bitácora:** 8 · 30 · 5 · 4 · 4 · 12 ·
  16 · 49.
- **La guía v3 cuenta bien** (49 pruebas, 8 ⭐), y las 38 heredadas siguen valiendo con la
  arquitectura de hoy.
- **El split por bandas, el MAE = 0, los objetivos negativos, NaN e infinito** resisten.
- **La máquina de estados del hook** resiste: la respuesta de la ambigua no queda pegada, y el Nivel
  2 y cancelar funcionan con regresión.

**Lo que no está listo:**

- **El Crítico (AU-S6-01):** el breadcrumb de clic de Sentry copia el `aria-label` del gráfico (el
  MAE en unidades) y el de las barras de importancia (nombre de columna). La limpieza no lo
  descarta.
- **El contrato y la extensibilidad:**
  - un archivo de una tarea desconocida se rechaza con «no parece un modelo de Probeta», cuando el
    ADR 014 promete nombrarla (AU-S6-02);
  - la tarea se despacha con ternarios que dejarían a multiclase en la rama binaria sin que el
    compilador avise (AU-S6-03).
- **El foco cae al `body`** al responder la pregunta ambigua (AU-S6-04).
- **Textos que el S6 dejó falsos** en la tarjeta de tarea, el brochure y el export (AU-S6-05 a
  AU-S6-07).

## Índice consolidado (43 hallazgos, de más a menos severo)

Columna «Origen»: el id en el informe de cada auditor. Cuando hay varios ids, es un hallazgo fusionado.

| Id       | Sev.    | Hallazgo                                                                                                                                       | Origen                      | Dónde (principal)                                                                                                               |
| -------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| AU-S6-01 | Crítico | El breadcrumb `ui.click` de Sentry copia `aria-label` con el MAE en unidades y nombres de columna; `scrubSentryEvent` lo deja pasar            | AU-C-01                     | `src/lib/sentry-scrub.ts:20-28` · `PredichoVsReal.tsx:59-64` · `WhySection.tsx:92-96`                                           |
| AU-S6-02 | Alto    | Un manifiesto de tarea desconocida da `invalid-format` («no parece un modelo»); el ADR 014 §3 promete `unsupported-task` nombrándola           | AU-B-01                     | `src/lib/model-file.ts:311-314, 471-472, 525-533` · `model-file.test.ts:431` · `StartScreen.tsx:162-163`                        |
| AU-S6-03 | Alto    | Casilla 7: la tarea se despacha con «numerica ? … : binaria»; una tercera tarea compila y cae en la rama binaria (también en Python)           | AU-B-02                     | `costos.ts:63-68` · `eda.ts:71,82-86` · `model-file.ts:151-160` · `useExperiment.ts:293-295,355-357` · `pipeline.py` (7 sitios) |
| AU-S6-04 | Alto    | Al responder la ambigua, o cambiar la respuesta, el foco cae al `body` y la tarjeta nueva no se anuncia                                        | AU-C-02                     | `src/components/TaskCard.tsx:43-62, 104-108, 164, 211-218`                                                                      |
| AU-S6-05 | Alto    | La tarjeta de tarea promete «llega en una próxima versión» a una columna que no sirve como objetivo (`sin-objetivo`)                           | AU-A-01                     | `src/components/TaskCard.tsx:198-207` · `messages/{es,en}.json:570`                                                             |
| AU-S6-06 | Alto    | El export publica como «medidas» cifras viejas (8 ADR son 14; peso del brochure; specs; «Cuatro pruebas e2e»; `sprints_cerrados`)              | AU-A-02                     | `docs/brochure-export.json:15,22,306-376`                                                                                       |
| AU-S6-07 | Alto    | Brochure y export: «Tres alertas», baselines solo de clasificar, «Cinco métricas», «predicción y probabilidad», «vive dentro de la app»        | AU-A-03                     | `docs/BROCHURE.html:803,805,807,846,920,1134,1145` · `docs/brochure-export.json:74-75,87,154-155,237,281`                       |
| AU-S6-08 | Medio   | Regresión de 3 a 6 filas: la prueba queda vacía o con una fila → error genérico «Intenta de nuevo»                                             | AU-B-03                     | `src/lib/experiment.ts:307-315` · `split.ts:104-124` · `pipeline.py:468-498,167`                                                |
| AU-S6-09 | Medio   | El lector acepta una CV de MAE con el signo sin invertir y, con ella, al peor modelo como ganador                                              | AU-B-04                     | `src/workers/contract.ts:86-100,224`                                                                                            |
| AU-S6-10 | Medio   | `pred_vs_real`: el lector no ata `n_total` a `n_test` ni exige el largo exacto; falta la carnada de valores finitos                            | AU-B-05                     | `contract.ts:184-197` · `tests/integration/regresion.test.ts:557-561`                                                           |
| AU-S6-11 | Medio   | Fuga continua: una columna casi vacía (3–5 pares) da falsa alarma (30 % / 10 % / 2 %) y cambia el veredicto a «sospechoso»                     | AU-B-06                     | `src/engine/leakage.ts:205-226, 277-294`                                                                                        |
| AU-S6-12 | Medio   | `demo-rojo.sh` da por rojo un gate que no corrió (127, servidor caído) y deja la mutación viva si se interrumpe                                | AU-B-07                     | `scripts/demo-rojo.sh:36-48, 66-78`                                                                                             |
| AU-S6-13 | Medio   | `verificar-dependencias.mjs` da verde si no reconoce el formato del lockfile del PR                                                            | AU-B-08                     | `scripts/verificar-dependencias.mjs:29-62`                                                                                      |
| AU-S6-14 | Medio   | `errors.target-not-numeric` y `errors.target-ambiguous` sin texto (la UI pintaría la clave cruda) y sin gate de exhaustividad                  | AU-C-07 · AU-B-09 · AU-A-11 | `src/workers/protocol.ts:34-37` · `messages/{es,en}.json` (`errors`) · `ErrorScreen.tsx:21`                                     |
| AU-S6-15 | Medio   | El 5 % del MAE que elige «tiende a estimar de más/de menos» vive en el componente, sin medir ni exportar; dos ramas sin test; «-0.0 kWh»       | AU-C-08 · AU-A-05           | `src/components/RegressionResults.tsx:114-127` · `src/lib/quantity.ts:42-43`                                                    |
| AU-S6-16 | Medio   | El Nivel 2 y cancelar al estimar no tienen ninguna prueba automática                                                                           | AU-C-09 · AU-A-07           | `src/lib/useExperiment.ts:1000-1020` · `encarrilador.ts:37-38,125`                                                              |
| AU-S6-17 | Medio   | axe en los dos temas no cubre puntuar ni importar al estimar, la ficha, la liga con la prueba abierta ni el veredicto con fuga                 | AU-C-10 · AU-A-06           | `tests/e2e/regresion-score.spec.ts:2,56-59,97-98` · `tests/e2e/regresion.spec.ts`                                               |
| AU-S6-18 | Medio   | El titular de empate de la lineal sale también cuando la lineal empata con la MEDIANA (no nombra al rival real); hermana binaria               | AU-C-03                     | `src/lib/regression-text.ts:42-55` · `src/components/ResultsScreen.tsx:264-267`                                                 |
| AU-S6-19 | Medio   | Al estimar, las fichas de kNN y Random Forest dicen que «votan»                                                                                | AU-C-04                     | `src/content/modelos.ts:194-197, 304-307, 455-475`                                                                              |
| AU-S6-20 | Medio   | Los bordes de la franja ±MAE (`accent/60`) dan 2.68:1 / 2.93:1, bajo 3:1                                                                       | AU-C-05                     | `src/components/PredichoVsReal.tsx:134,217,225` · `design-system.md:275` · ADR 013:84                                           |
| AU-S6-21 | Medio   | Al estimar, las importancias se muestran sin unidad y con `toFixed(3)`/`toFixed(4)` (R9 a medio pagar)                                         | AU-C-06                     | `src/components/WhySection.tsx:87,95` · `src/lib/modelcard.ts:233`                                                              |
| AU-S6-22 | Medio   | AC2 («la fuga se bloquea; sin ella, entrena») cumplido como etiqueta sin D declarada; el «sin ella» no tiene prueba; README engañoso           | AU-A-04                     | `tests/e2e/regresion.spec.ts:73-101` · `docs/kit-de-prueba/README.md:28` · bitácora:20-72                                       |
| AU-S6-23 | Bajo    | Manual: «Compiten 11 modelos» (en el ejemplo, 10) y el Baseline del diccionario solo nombra los de clasificar                                  | AU-A-08                     | `docs/MANUAL-DE-USO.md:310-312, 363`                                                                                            |
| AU-S6-24 | Bajo    | Frases caducadas internas: guía «el único con Nivel 2», D4 «Hoy rechaza los de regresión», JSDoc de `eda.ts`                                   | AU-A-09                     | `docs/GUIA-DE-PRUEBA.html:127` · bitácora:55 · `src/engine/eda.ts:63-65`                                                        |
| AU-S6-25 | Bajo    | Desviaciones menores sin registrar en la lista D (⭐ «ficha de regresor» → G10; `_FACTORIES`; `validate.ts`; `chosenTask`; spike; tests)       | AU-A-10                     | bitácora `## Desviación del plan` · `GUIA:433,438`                                                                              |
| AU-S6-26 | Bajo    | Con la UI en inglés, «días», «meses» y «años» salen en español                                                                                 | AU-A-12                     | `src/lib/experiment.ts:471-473`                                                                                                 |
| AU-S6-27 | Bajo    | Tres afirmaciones imprecisas en los ADR 013 y 014 (red en `liga-booster-export`, `_estimado` en EN, «the fichas say so») + comillas            | AU-A-13                     | `decisions/014-…:49,61-63` · `decisions/013-…:45,106`                                                                           |
| AU-S6-28 | Bajo    | Casilla 5: sin lector `TargetUnit.suffix` ni `BASELINE_IDS_BY_TASK` (el par se nombra a mano); campos documentales del manifiesto sin declarar | AU-B-10 · AU-C-15           | `src/workers/protocol.ts:315` · `src/engine/roster.ts:80-83` · `experiment.ts:376-379,422-425,492-497`                          |
| AU-S6-29 | Bajo    | El ADR 014 dice formas «cerradas» y que la regresión «rechaza las métricas de clase»: el lector tolera claves extra                            | AU-B-11                     | `decisions/014-…:27,29` · `src/lib/validate.ts:9-10`                                                                            |
| AU-S6-30 | Bajo    | `src/workers/contract.ts` queda fuera de la medición de cobertura                                                                              | AU-B-12                     | `vitest.config.ts:19-58`                                                                                                        |
| AU-S6-31 | Bajo    | Una celda del objetivo en notación científica fija 6 decimales para todas las estimaciones                                                     | AU-B-13                     | `src/lib/ds/pipeline.py:501-509, 524`                                                                                           |
| AU-S6-32 | Bajo    | «MAPE null si hay ceros» no tiene prueba del emisor                                                                                            | AU-B-14                     | `src/lib/ds/pipeline.py:169-173`                                                                                                |
| AU-S6-33 | Bajo    | El CSV puntuado no neutraliza fórmulas (`=`, `+`, `-`, `@`); backlog del S4 nunca pagado ni declarado                                          | AU-B-15                     | `src/lib/scored-csv.ts:41-43, 77-87`                                                                                            |
| AU-S6-34 | Bajo    | La CI instala `@lhci/cli` sin versión y baja gitleaks sin checksum                                                                             | AU-B-16                     | `.github/workflows/ci.yml:19-21, 110`                                                                                           |
| AU-S6-35 | Bajo    | «Por ahora» / «For now» en la línea de IA y en la model card al estimar                                                                        | AU-C-11                     | `messages/{es,en}.json:382, 527` · `docs/MANUAL-DE-USO.md:333`                                                                  |
| AU-S6-36 | Bajo    | Plurales: «escrito con 1 decimales» (un test lo fija) y «Estimaciones (1 filas)»                                                               | AU-C-12                     | `messages/{es,en}.json:348, 525` · `modelcard.ts:187` · `ScoreScreen.tsx:562`                                                   |
| AU-S6-37 | Bajo    | «{pct} %» con espacio normal (puede partir la línea) e inconsistente con «{share}%»                                                            | AU-C-13                     | `messages/es.json:243, 428, 438` · `config.eda.target-outliers`                                                                 |
| AU-S6-38 | Bajo    | Cada botón de respuesta de la ambigua lee su descripción dos veces (nombre + `aria-describedby`)                                               | AU-C-14                     | `src/components/TaskCard.tsx:104-131`                                                                                           |
| AU-S6-39 | Bajo    | Un fixture imposible fija que «Lineal» supera a «una regresión lineal» (son el mismo ajuste)                                                   | AU-C-16                     | `tests/unit/factories.ts:174-262` · `regresion-ui.test.tsx:131-136, 625-627`                                                    |
| AU-S6-40 | Bajo    | La plantilla de regresión escribe una frase por cada columna con pinta de identificador                                                        | AU-C-17                     | `src/lib/narration/templates.ts:152-154`                                                                                        |
| AU-S6-41 | Bajo    | Lógica en `ScoreScreen`: la mediana se calcula en el componente y el conteo por etiqueta corre también al estimar                              | AU-C-18                     | `src/components/ScoreScreen.tsx:343-348, 538-560`                                                                               |
| AU-S6-42 | Bajo    | El banner de fuga está duplicado en `BinaryVerdict` y `RegressionVerdict`                                                                      | AU-C-19                     | `ResultsScreen.tsx:268-274` · `RegressionResults.tsx:39-45`                                                                     |
| AU-S6-43 | Bajo    | Las marcas del gráfico se ven a ~8 px en un móvil de 360                                                                                       | AU-C-20                     | `src/components/PredichoVsReal.tsx:58,98,106,174,181`                                                                           |

**Diferencias entre auditores:**

- **Fusiones.** Los seis duplicados se fusionan en un solo pago: AU-S6-14, 15, 16, 17 y 28.
- **AU-S6-35 («Por ahora»).**
  - El auditor A la juzgó «sigue cierta», porque la VISION respalda la narración general.
  - El auditor C la marcó como promesa aplazada.
  - Se paga: quitar «por ahora» deja la frase cierta hoy sin prometer fecha.

## Decisiones que la Fase 2 necesita del usuario (umbrales nuevos)

Los umbrales los fija el usuario, así que estos dos no se deciden en la auditoría.

1. **AU-S6-11 · `LEAKAGE_MIN_PAIRS`.** Es el mínimo de pares no nulos en train para evaluar la fuga
   de una columna.
   - **Sugerida: 10.** Con 10 pares independientes, P(|ρ| ≥ 0,98) es menor que 1e-5. Con 3, 4 y 5
     pares la falsa alarma medida es de 30 %, 10 % y 2 %.
   - **Sugerida también: aplicarlo a las dos tareas.** La binaria (`rankAuc`) tiene el mismo
     patrón, heredado. Sus tests no tienen columnas casi vacías, así que el cambio no debería tocar
     la liga binaria, y lo confirman sus tests heredados.
2. **AU-S6-15 · `RESIDUAL_LEAN_SHARE`.** Es la fracción del MAE desde la cual el texto del gráfico
   dice que el modelo «tiende a estimar de más/de menos».
   - **Sugerida: ratificar el 5 %.** Es de presentación: elige una frase y no decide el veredicto.
   - Queda como constante exportada y como D9.

## Plan de pago (Fase 2)

Orden de pago del kit v1.35.0: primero los hallazgos que crean o amplían gates. Cada gate nuevo se
demuestra en rojo con `scripts/demo-rojo.sh` en su mismo commit. Después va el resto, y al final
todos los gates corren sobre el árbol completo.

1. **El instrumento, primero: AU-S6-12** (`demo-rojo.sh` con `trap`, rechazo de 126/127,
   `--debe-nombrar` y `--minimo-tests`). Todas las demos que siguen lo usan con `--debe-nombrar`,
   para que un rojo que no vino de la aserción no cuente.
2. **Gates de privacidad y contrato:**
   - AU-S6-01 (lista de permitidos `probeta.*`);
   - AU-S6-02 (`unsupported-task` nombrando la tarea);
   - AU-S6-03 (despacho exhaustivo: `switch` con `never` en TS, `else: _contract("task")` en Python
     y un test de integración nuevo);
   - AU-S6-09 y AU-S6-10 (carnadas de dominio y de largo);
   - AU-S6-08 (`too-few-rows-quantity`, con su carnada TS → Python);
   - AU-S6-30 (cobertura de `contract.ts`);
   - AU-S6-31 y AU-S6-32 (tests del emisor);
   - AU-S6-33 (neutralizar fórmulas, con test y línea del manual);
   - AU-S6-13 (`verificar-dependencias.mjs`);
   - AU-S6-34 (CI fijada y con checksum: primera corrida, declarada).
3. **Gates de la UI:**
   - AU-S6-04 (foco: unit + e2e);
   - AU-S6-05 (`task.notUsable`);
   - AU-S6-14 (`Record` exhaustivo de fallas + copy);
   - AU-S6-15 (`residualLean` + «-0.0»);
   - AU-S6-16 (Nivel 2 y cancelar al estimar: unit del hook + `planLevel2` numérico);
   - AU-S6-17 (axe en los dos temas en cada pantalla tocada);
   - AU-S6-18 (empate con la mediana + su hermana binaria);
   - AU-S6-19 (regex de clasificación sobre las fichas al estimar);
   - AU-S6-20 (contraste de la franja);
   - AU-S6-21 (importancias en unidades);
   - AU-S6-22 (prueba del «sin ella» + D8);
   - AU-S6-11 (con el umbral que fijes);
   - AU-S6-06 (recuento de ADR y peso del brochure en `brochure-export.test.ts`).
4. **El resto** (textos, documentos y refactores):
   - AU-S6-07 (brochure y export; después se re-mide el peso de AU-S6-06);
   - AU-S6-23 a AU-S6-29;
   - AU-S6-35 a AU-S6-43, cada uno con la prueba que propone su informe.
   - Los cambios visuales (AU-S6-20 y AU-S6-43) son segunda vuelta: no abren parada. Se regeneran
     las capturas del gráfico con `scripts/capturas-s6.mjs`, se leen como imagen y se registran como
     «maquetado, no visto» para el gate ⭐ del ciclo.
5. **Cierre de la Fase 2:**
   - typecheck, lint, unit con cobertura, integración con Pyodide real y e2e sobre el build de
     producción, todo sobre el árbol completo;
   - **segunda pasada de la casilla 4** sobre el diff de la Fase 2, siguiendo cada ajuste hasta sus
     frases hermanas e incluyendo el summary;
   - barrido de cero enlaces después del último `git add`;
   - `gh pr checks 17` con conclusión propia `success` por check.

---

# Anexos — informe textual de cada auditor

Lo que sigue es el informe de cada auditor tal como lo entregó, sin filtrar. Los ids AU-A-NN, AU-B-NN y AU-C-NN remiten al índice consolidado de arriba.

## Auditor A — alcance y textos

Rama `sprint-006/estimar`, HEAD `c4cbfd1`, base `6bf5e08` (merge-base con `origin/main`). Fuente
primaria: `git diff 6bf5e08...HEAD` (110 archivos). Las piezas de la Fase 0 del kit (ADR 012,
`demo-rojo.sh`, `lighthouse-categorias.json`, `verificar-dependencias.mjs`, hook B-8) entraron a `main`
con el #16 antes de la base (D3), así que se verificaron sobre HEAD y no en el diff.

Resumen: **13 hallazgos — 3 Altos, 4 Medios, 6 Bajos. Ningún Crítico.** La cobertura del plan es
alta: la regresión está completa de punta a punta, las carnadas cuadran una por una con lo que dicen
los ADR y la guía v3 cuenta bien (49 pruebas, 8 ⭐). Lo que falla está sobre todo en los textos: lo que
el S6 dejó falso en la tarjeta de tarea, en el brochure y en el export.

### Corridas (qué corriste y qué salió)

| Corrida                                                                                                                                                                                                                                                                                   | Resultado                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git diff --stat 6bf5e08...HEAD` + `git log 6bf5e08..HEAD`                                                                                                                                                                                                                                | 110 archivos, 17 commits                                                                                                                                                                                                                                                                                                           |
| Barrido por promesa aplazada (ES y EN). Las claves de `messages/*.json` se aplanaron con `sondas/A/flat.mjs` (clave + ES + EN). Superficies: `src/content`, `src/components`, manual, README, guía, brochure, export, `design-system.md`, `design-sync/**`, README del kit, ADR 013 y 014 | Inventario completo en la casilla 4                                                                                                                                                                                                                                                                                                |
| Barrido de afirmaciones de alcance: «dos categorías», «sí/no», «binaria», «de 0 a 1», «cinco», «tres», «solo», «único»                                                                                                                                                                    | Ídem                                                                                                                                                                                                                                                                                                                               |
| `sondas/A/datos.mjs` sobre los CSV del kit                                                                                                                                                                                                                                                | `consumo_kwh`: 195 valores distintos. `ocupantes`: 1–6. `superficie_m2`: 42–220. `departamento`: 4. `edad`: 39. Sesgo de `precio_usd`: 1,077. `casas-nuevas`: 8 filas, con 900 m² y «geotermia». Los CSV de `public/datasets` y del kit son idénticos                                                                              |
| `sondas/A/sonda-taskcard.test.tsx` (vitest, 1 archivo y 2 pruebas, config propia en `sondas/A/`)                                                                                                                                                                                          | (1) Una columna de texto con 25 categorías → la tarjeta dice «parece un identificador o texto libre, no algo que predecir. Esta versión todavía no entrena este tipo de predicción: llega en una próxima versión…» (AU-A-01). (2) `prepareRun` con 3 filas como «cantidad» da `ok`: el `too-few-rows` de regresión no se reprodujo |
| Conteo de carnadas en `tests/` (a mano, línea por línea)                                                                                                                                                                                                                                  | TS→Python 8 · liga 30 · elección 5 · export 4 · puntuar 4 · manifiesto de regresión 12 · manifiesto binario 16 · Python→TS binarias 27+6+5+6+5 = 49. **Todo cuadra con los ADR y la bitácora**                                                                                                                                     |
| Conteo de la guía: `li[data-origen]`, chips `o-clave` y orígenes                                                                                                                                                                                                                          | 49 pruebas (s1 7 · s2 5 · s3 5 · s4 9 · s5 10 · s6 11 · mejora 2). ⭐ H2 = F3, F4, F6, F8, G2, G4, G5, G10 = 8. `CLAVE = "guia-ds:s6:"`                                                                                                                                                                                            |
| Medición de las métricas del export                                                                                                                                                                                                                                                       | `wc -c docs/BROCHURE.html` = 63 353 (el export dice 61 572). `decisions/*.md` = 14 (dice 8). Specs e2e = 14 (dice 7). Archivos unit = 45 e integración = 7 (dice 29 y 5)                                                                                                                                                           |
| `git grep -nE "vercel[.]app\|workers[.]dev\|pages[.]dev" -- ':!pnpm-lock.yaml'`                                                                                                                                                                                                           | Vacío (exit 1)                                                                                                                                                                                                                                                                                                                     |
| `gh repo view --json homepageUrl`                                                                                                                                                                                                                                                         | `https://github.com/mauriciorincon-ai/app-ds`, la URL del propio repo                                                                                                                                                                                                                                                              |
| URLs nuevas en el diff (`^\+.*https?://`)                                                                                                                                                                                                                                                 | Solo `localhost:3000` en `scripts/capturas-s6.mjs:22`                                                                                                                                                                                                                                                                              |
| `git status --short` al terminar                                                                                                                                                                                                                                                          | Vacío                                                                                                                                                                                                                                                                                                                              |

No corrí build, Playwright ni la suite completa.

### Casilla 1 — cobertura de alcance

C = completo · P = parcial · N = no implementado · D = implementado con desviación.

**Fase 0 (delta del kit, datasets y spike)**

| #   | Ítem                                                                                                                                                          | Estado      | Evidencia                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | ADR 012 de `braces` (id, razón, fecha, retiro) + comentario en `pnpm-workspace.yaml`                                                                          | C           | `decisions/012-audit-exception-braces.md:1-12`; `pnpm-workspace.yaml:20` (entró con el #16, D3)                                                                                                                      |
| 2   | `scripts/demo-rojo.sh` en 100755 + `.demo-rojo/` ignorado                                                                                                     | C           | `-rwxr-xr-x scripts/demo-rojo.sh`; `.gitignore:26-27`                                                                                                                                                                |
| 3   | `verificar-dependencias.mjs` que falla cerrado                                                                                                                | C           | archivo del kit en HEAD; demo en la bitácora:82                                                                                                                                                                      |
| 4   | PreToolUse de gitleaks que avisa + su test                                                                                                                    | C           | `.claude/settings.json:12`; `tests/integration/gitleaks-hook.test.ts:157`                                                                                                                                            |
| 5   | Comandos re-estampados (`audita-sprint`, `deploy-check`, README)                                                                                              | C           | `.claude/commands/`                                                                                                                                                                                                  |
| 6   | `lighthouse-categorias.json` + segundo paso del job                                                                                                           | C           | `lighthouse-categorias.json:16-19`; `.github/workflows/ci.yml:117-118`                                                                                                                                               |
| 7   | Tres datasets de regresión con semilla + README + botón «Consumo de energía»                                                                                  | C           | `scripts/make-example-datasets.mjs:226`; `docs/kit-de-prueba/README.md:24-32`; `src/components/StartScreen.tsx:21`                                                                                                   |
| 8   | Spike en el navegador (Chromium + WebKit; 3 datasets + sintéticos de 2k/5k/20k + uno ancho; costos, MLP, 1 EE, Spearman/η², sesgo/atípicos, media vs mediana) | C (arnés D) | `sprints/SPRINT_006-spike-regresores.md:18-48, 138-146, 303-494`. El arnés vive en `scripts/spike-regresion/` y reusa `spike-liga/correr.mjs`; está declarado en el texto de la bitácora, no en la lista D (AU-A-10) |
| 9   | STOP de la F0 con las 4 preguntas; umbrales fijados por el usuario                                                                                            | C           | bitácora:192-202                                                                                                                                                                                                     |

**Fase 1 — Python**

| #   | Ítem                                                    | Estado | Evidencia                                                                                    |
| --- | ------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------- |
| 10  | `task` obligatoria en el payload, validada              | C      | `src/lib/ds/pipeline.py:480-483`                                                             |
| 11  | `_FACTORIES[task][id]` (P2)                             | D      | `pipeline.py:412-441`: `_REGRESSORS` + `_FACTORIES_BY_TASK`. No está en la lista D (AU-A-10) |
| 12  | `KFold` barajado en regresión                           | C      | `pipeline.py:590-596`                                                                        |
| 13  | `select_one_se` con dirección                           | C      | `pipeline.py:615-640`                                                                        |
| 14  | MAE · RMSE · R² · MedAE, y MAPE `null` si hay ceros     | C      | `pipeline.py:161-174`                                                                        |
| 15  | Baselines mediana + lineal                              | C      | `pipeline.py:801-802`                                                                        |
| 16  | Explicabilidad con MAE y dirección por Spearman         | C      | `pipeline.py:220-228`                                                                        |
| 17  | `pred_vs_real` (tope 200) + residuos sobre TODO el test | C      | `pipeline.py:642-665`                                                                        |
| 18  | `_retain` con `task` y `target_stats`                   | C      | `pipeline.py:515-525, 711-722`                                                               |
| 19  | `score_new_data` numérico, sin probabilidad             | C      | `pipeline.py:956-961`                                                                        |
| 20  | Export/import con `task`                                | C      | `pipeline.py:844-846, 1009-1033`                                                             |
| 21  | Los detalles se calculan antes de retener (AU-S5-07)    | C      | `pipeline.py:841-842, 898-899`                                                               |

**Fase 1 — TypeScript**

| #   | Ítem                                                                                                      | Estado       | Evidencia                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| 22  | `TRAINABLE_TASKS += numerica`; la ambigua → decisión del usuario                                          | C (nombre D) | `src/engine/tarea.ts:44-51, 109-118`; `useExperiment.ts:129-136`. El plan decía `chosenTask` y quedó `choice` + `resolved` (AU-A-10) |
| 23  | `detectLeakageContinuous` con constante exportada y soporte mínimo                                        | C (D6)       | `src/engine/leakage.ts:33-37, 271-321`                                                                                               |
| 24  | EDA: id-like en las dos tareas, `target-skewed` y `target-outliers`, desbalance solo en binaria           | C            | `src/engine/eda.ts:56-60, 83, 122-128`                                                                                               |
| 25  | `METRIC_RULES` en un solo sitio                                                                           | C            | `src/engine/verdict.ts:56-77, 94, 120`                                                                                               |
| 26  | Roster, costos y E2 por tarea; `minorityShare` solo en binaria; MLP «fuera»                               | C            | `src/engine/roster.ts:33-83`; `costos.ts:45-74`; `encarrilador.ts:36-48, 97-108, 125-130`                                            |
| 27  | Split por bandas de cuantiles (P4)                                                                        | C            | `src/engine/split.ts:94-130`                                                                                                         |
| 28  | `prepareRun` por tarea, `target-not-numeric`, k por `n_train`, ensamblar y aplicar por tarea, `inferUnit` | C            | `src/lib/experiment.ts:166-170, 289-316, 448-484, 504, 544`. Los mensajes de los kinds nuevos faltan (AU-A-11)                       |
| 29  | `ExperimentResult` como unión discriminada                                                                | C            | `src/workers/protocol.ts` (`task` discrimina)                                                                                        |
| 30  | Validadores por tarea + un combinador de unión en `validate.ts`                                           | D            | `src/workers/contract.ts:250-339` despacha por `sent.task`; `validate.ts` no cambió (AU-A-10)                                        |
| 31  | Manifiesto por tarea (P8) + `unsupported-task`                                                            | C            | `src/lib/model-file.ts:91-160, 184-312, 503-532`                                                                                     |
| 32  | `scored-csv` con `<objetivo>_estimado`                                                                    | C            | `src/lib/scored-csv.ts:4`; `ScoreScreen.tsx:334` (en inglés escribe `_estimate`, AU-A-13)                                            |

**Carnadas y pruebas de la Fase 1**

| #   | Ítem                                                                                                                                                            | Estado  | Evidencia                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------ |
| 33  | Carnadas TS→Python (task ×3, roster, métrica, cv_k, member, task en fit)                                                                                        | C 8/8   | `tests/integration/regresion.test.ts:408-417`                                              |
| 34  | Python→TS, liga de regresión                                                                                                                                    | C 30/30 | `tests/unit/contract.test.ts:290-320`                                                      |
| 35  | Elección manual                                                                                                                                                 | C 5/5   | `contract.test.ts:342-354`                                                                 |
| 36  | Puntuar                                                                                                                                                         | C 4/4   | `contract.test.ts:379-389`                                                                 |
| 37  | Export                                                                                                                                                          | C 4/4   | `contract.test.ts:367-376`                                                                 |
| 38  | Manifiesto de regresión                                                                                                                                         | C 12/12 | `tests/unit/model-file.test.ts:430-447`                                                    |
| 39  | Cruces de punta a punta: `prepareRun` real → Pyodide → contrato → ensamblar → `fit_member`; export → import → puntuar con `linear` y `lightgbm`; archivo del S5 | C       | `regresion.test.ts:440-485, 306-341, 360-397`                                              |
| 40  | Integración: espía anti-fuga, la selección no mira el test, cada regresor, un regresor roto, `fit_member` reproduce su fila                                     | C       | `regresion.test.ts:134-272, 280-304`                                                       |
| 41  | Unit: E1, bordes de la fuga continua (×1,01, categoría, independiente), veredicto, split, paridades, costos, `inferUnit`, archivo del S5                        | C       | `tests/unit/regresion-motor.test.ts:67-327`; `roster.test.ts:57`; `model-file.test.ts:400` |

**Fase 2 — UI, lectura y documentos**

| #   | Ítem                                                                                                          | Estado       | Evidencia                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------- |
| 42  | TaskCard: la cantidad con su unidad; la ambigua con dos botones con icono, la sugerida con ★ + texto, teclado | C            | `src/components/TaskCard.tsx:42-139, 198-207` (copy de `sin-objetivo`: AU-A-01)                                       |
| 43  | RosterCard de regresión                                                                                       | C            | `ConfigScreen.tsx:143-151`; `RosterCard.tsx`                                                                          |
| 44  | Veredicto en unidades, MAE · RMSE · R² · MedAE, «cuál mirar», baselines con ficha                             | C            | `RegressionResults.tsx:25-95`; `src/lib/regression-text.ts:33`                                                        |
| 45  | `PredichoVsReal`: SVG, diagonal, franja ±MAE, forma y no solo color, texto equivalente, fuera del LCP         | C            | `PredichoVsReal.tsx:56-257` (umbral de la frase: AU-A-05)                                                             |
| 46  | LeagueTable en unidades, prueba etiquetada, «Elegir», ficha                                                   | C            | `LeagueTable.tsx:62-77, 376-395`                                                                                      |
| 47  | Nivel 2 y cancelar, iguales al S5                                                                             | P            | Cableado en `useExperiment.ts:1000-1020` y `Level2Card.tsx:42-50`. **No tiene prueba automática** (AU-A-07)           |
| 48  | Miradas de FORMA M1 y M2 en matriz, con evidencia de que se vieron; TEXTO «maquetado, no visto»               | C            | bitácora:309-323                                                                                                      |
| 49  | Model card con la sección «Estimación»                                                                        | C            | `src/lib/modelcard.ts:150-180`                                                                                        |
| 50  | ScoreScreen con `_estimado` y resumen mín · mediana · máx                                                     | C            | `ScoreScreen.tsx:84-93, 334, 558-568`                                                                                 |
| 51  | Resumen del import por tarea                                                                                  | C            | `StartScreen.tsx:280`                                                                                                 |
| 52  | Breadcrumb `probeta.league` + `task`                                                                          | C            | `src/lib/observability.ts:62-78`; `tests/unit/observability.test.ts`                                                  |
| 53  | Fichas: párrafo de regresión + `linear` y `lasso`, `{es,en}`                                                  | C (D5)       | `src/content/modelos.ts:405-480`                                                                                      |
| 54  | Manual «Estimar · desde S6», diccionario, FAQ de R² negativo                                                  | C            | `docs/MANUAL-DE-USO.md:291-352, 392-402, 453-463` (frases: AU-A-08)                                                   |
| 55  | Guía v3: hereda 38, bloque G, `.o-s6`, filtros, 8 ⭐, `guia-ds:s6:`                                           | C            | `docs/GUIA-DE-PRUEBA.html:103-140, 385-448, 477` (AU-A-09, AU-A-10)                                                   |
| 56  | Entrada de `design-system.md` (por ADR)                                                                       | C            | `design-system.md:241-292`                                                                                            |
| 57  | Tarjetas de `design-sync/` + README                                                                           | C            | `design-sync/components/componentes/{estimar,tarea-ambigua}.html`; `design-sync/README.md:59-64`                      |
| 58  | ADR 013 y 014                                                                                                 | C            | `decisions/013-*`, `decisions/014-*` (afirmaciones: AU-A-13)                                                          |
| 59  | e2e `regresion.spec`: happy path + «fuga plantada bloqueada» + cero `/api/narrate`                            | D            | `tests/e2e/regresion.spec.ts:12-101`: la fuga se nombra y se etiqueta, no se bloquea (AU-A-04)                        |
| 60  | Unit del route: `problem: "regression"` da 400                                                                | C            | `tests/unit/narrate-route.test.ts:131-141`                                                                            |
| 61  | e2e `tarea-ambigua.spec`: las dos respuestas                                                                  | C            | `tests/e2e/tarea-ambigua.spec.ts:10-45`                                                                               |
| 62  | e2e `regresion-score.spec` con axe en ambos temas                                                             | P            | `tests/e2e/regresion-score.spec.ts:97-98`: axe en un solo tema y sin pasar por el resumen del import (AU-A-06)        |
| 63  | reduced-motion ampliado a estimar                                                                             | C            | `tests/e2e/reduced-motion-app.spec.ts:100-131`                                                                        |
| 64  | Los e2e binarios del S5 intactos                                                                              | D (esperado) | `liga.spec.ts:18-24` (R19), `score-download.spec.ts:80` (`_one`), `brochure.spec.ts:101` (33 → 35). Todos registrados |
| 65  | Capturas a 360 y 1280 px en los dos temas, `scrollWidth`, pasada de interacción, leídas como imagen           | C            | `scripts/capturas-s6.mjs:3-4, 58-65, 84-87`; bitácora:450-462                                                         |
| 66  | Brochure + export (D7, regla 12)                                                                              | P            | Se sumaron las dos funcionalidades, pero quedaron frases y métricas falsas (AU-A-02, AU-A-03)                         |

**Criterios de aceptación** (`SPRINT_006.md:168-179`)

| AC                                                                                              | Estado           | Evidencia                                                                                |
| ----------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------- |
| 1 · ~200 filas entrenan en el Nivel 1 dentro del techo; veredicto en unidades con dos baselines | C                | guía G1/G2; `regresion.test.ts:441-466`; `regresion-motor.test.ts:290-306`               |
| 2 · La fuga plantada se bloquea antes de entrenar nombrando la columna; sin ella, entrena       | D                | Avisa antes y etiqueta «sospechoso» después; no hay D ni prueba del «sin ella» (AU-A-04) |
| 3 · Las dos respuestas de la ambigua entrenan                                                   | D (D2 declarada) | `TaskCard.tsx:198-202`; `tarea-ambigua.spec.ts`                                          |
| 4 · Export → import → puntuar con `linear` y LightGBM; un archivo del S5 importa                | C                | `regresion.test.ts:306-341, 360-397`                                                     |
| 5 · Gráfico con descripción textual, fuera del LCP                                              | C                | `PredichoVsReal.tsx:56-64`; vive en Resultados                                           |
| 6 · Model card con tarea, métricas, baselines y «IA no aplica» con su gate                      | C                | `modelcard.ts:150-180`; `regresion-ui.test.tsx:294-345`                                  |
| 7 · `lighthouse-categorias.json` en CI, visto en rojo                                           | C                | bitácora:85                                                                              |
| 8 · Ningún umbral sin medición del STOP ni constante exportada                                  | P                | `RegressionResults.tsx:121-127`: el 5 % del MAE no está medido ni exportado (AU-A-05)    |
| 9 · CI verde + summary en el PR                                                                 | fuera de alcance | pasos de cierre                                                                          |

**Riesgos R1–R20**

| R   | Estado | Evidencia                                                                                                                |
| --- | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| R1  | C      | `contract.test.ts:404-420`: payload binario = S5 + `task`; fixtures binarios solo con `task` y tiempos (diff verificado) |
| R2  | C      | `regresion-motor.test.ts:86-104`                                                                                         |
| R3  | C      | `verdict.ts:69-77`                                                                                                       |
| R4  | C      | `Record` tipados por tarea; `modelos.test.ts`                                                                            |
| R5  | C      | `eda.ts:83, 122-128`                                                                                                     |
| R6  | C      | `src/lib/ia/schemas.ts:50`; `useNarration.ts:123`                                                                        |
| R7  | C      | `model-file.ts:154-159`                                                                                                  |
| R8  | —      | fuera de mi alcance (casilla 5)                                                                                          |
| R9  | C      | `src/lib/quantity.ts`                                                                                                    |
| R10 | C      | `regression-text.ts`; demo #15                                                                                           |
| R11 | C      | `roster.ts:80-83`                                                                                                        |
| R12 | P      | umbral medido ✓; «se puede entrenar sin ella» sin prueba (AU-A-04)                                                       |
| R13 | C      | demo #4; `regresion-motor.test.ts:136`                                                                                   |
| R14 | C      | `observability.test.ts`                                                                                                  |
| R15 | C      | Lighthouse en verde según la bitácora                                                                                    |
| R16 | C      | declarado en la F0                                                                                                       |
| R17 | C      | sin wheels nuevos (`pyodide-runner.js` no cambió)                                                                        |
| R18 | C      | diff de fixtures verificado                                                                                              |
| R19 | C      | `liga.spec.ts`, `league-ui.test.tsx`, guía F1                                                                            |
| R20 | C      | `quantityNote`, resumen mín·mediana·máx, `aiNotForQuantity`, ficha de la mediana, `FichaTarget.task`                     |

**Orden de la planeadora:** «Qué NO tocar: el brochure (S7)» → D7 declarada ✓. Gate ⭐: la orden
esperaba «veredicto · gráfico · **ficha de regresor** · pregunta», y la guía tiene G2 · G4 · G5 · **G10
(Nivel 2 en el móvil)**. El cambio no está registrado (AU-A-10).

**D1–D7 contra el diff:** D1 ✓ (ADR 012/013/014). D2 ✓ (`TaskCard.tsx:198-202`). D3 ✓ (base
`6bf5e08` = merge del #16). D4 ✓ (`model-file.ts:503-532`), pero su texto «Hoy rechaza los de
regresión» caducó (AU-A-09). D5 ✓ (`modelos.ts`). D6 ✓ (`leakage.ts:37`). D7 ✓ con huecos (AU-A-02/03).

### Casilla 4 — inventario de promesas aplazadas

Se juzga contra lo que la app hace HOY: entrena binaria y cantidad, la multiclase llega en el S7
(planeada) y la narración con IA solo cubre clasificar (la VISION promete narrar la explicación en
general).

| archivo:línea                                                               | Frase                                                                                                                              | Veredicto                                                                                                                                 |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `messages/es.json:76` / `en.json:76` `start.import.errors.unsupported-task` | «esta versión todavía no abre» / «can't open yet»                                                                                  | Sigue cierta (rechaza tareas no entrenables por nombre)                                                                                   |
| `es.json:101` / `en.json:101` `config.warnings.date`                        | «En esta versión no se usan para dividir por tiempo»                                                                               | Sigue cierta                                                                                                                              |
| `es.json:303` `score.blocked.title`                                         | «No se puede puntuar»                                                                                                              | Sigue cierta (no es promesa)                                                                                                              |
| `es.json:382` / `en.json:382` `why.narration.aiNotForQuantity`              | «Por ahora, la narración con IA solo cubre la clasificación en dos categorías»                                                     | Sigue cierta (VISION:100 respalda el «por ahora»)                                                                                         |
| `es.json:500` `modelcard.limits.dates`                                      | «aún no se usan»                                                                                                                   | Sigue cierta                                                                                                                              |
| `es.json:501` `modelcard.limits.tasks`                                      | «Esta versión entrena dos tareas… Varias categorías llegan en una próxima versión»                                                 | Sigue cierta (S7)                                                                                                                         |
| `es.json:527` `modelcard.estimate.noAi`                                     | «por ahora solo cubre la clasificación en dos categorías»                                                                          | Sigue cierta                                                                                                                              |
| `es.json:545` `errors.contract`                                             | «no podemos verificar»                                                                                                             | Sigue cierta                                                                                                                              |
| `es.json:568` `task.blocked`                                                | «no se pueden comparar modelos con honestidad»                                                                                     | Sigue cierta                                                                                                                              |
| `es.json:570` / `en.json:570` `task.notYet`                                 | «todavía no entrena… llega en una próxima versión. Por ahora, elige… dos categorías o… una cantidad»                               | Sigue cierta para la multiclase. **Falsa** para `sin-objetivo` (un identificador o texto libre nunca llegará como objetivo) → **AU-A-01** |
| `es.json:577` `task.ask.help`                                               | «no se puede saber»                                                                                                                | Sigue cierta                                                                                                                              |
| `es.json:585` `task.ask.multiclase.desc`                                    | «todavía no entrena varias clases: llega en una próxima versión»                                                                   | Sigue cierta (S7)                                                                                                                         |
| `es.json:594, 608` `roster.level2*`                                         | «después, si quieres»                                                                                                              | Sigue cierta                                                                                                                              |
| `es.json:595` `roster.level2Hint`                                           | «podrás correr la liga completa»                                                                                                   | Sigue cierta (el Nivel 2 existe al estimar)                                                                                               |
| `es.json:606` `roster.note`                                                 | «podrás incluirlo… en el Nivel 2»                                                                                                  | Sigue cierta (el MLP «fuera» se puede forzar al estimar)                                                                                  |
| `es.json:90` `config.target.help`                                           | «entrena… dos categorías… y las cantidades»                                                                                        | Sigue cierta                                                                                                                              |
| `es.json:462` `modelcard.data.target`                                       | «clasificación binaria; clase positiva»                                                                                            | Sigue cierta (al estimar se usa `targetQuantity`)                                                                                         |
| `es.json:474` `modelcard.method.baselines`                                  | «clase mayoritaria y regresión logística»                                                                                          | Sigue cierta (al estimar, `baselinesQuantity`)                                                                                            |
| `es.json:538` `errors.target-not-binary`                                    | «exactamente dos categorías»                                                                                                       | Sigue cierta (solo se alcanza en flujos binarios)                                                                                         |
| `es.json:544` `errors.too-few-rows`                                         | «una de las dos clases»                                                                                                            | Sigue cierta en la práctica (la sonda con 3 filas «cantidad» da `ok`)                                                                     |
| `es.json:287` `score.subtitle` · `:344` `score.noProbabilities`             | «predicción y su probabilidad» / «decide la clase»                                                                                 | Siguen ciertas (al estimar se usa `subtitleQuantity` / `quantityNote`)                                                                    |
| `es.json:419` y siguientes `narration.template.metricHelp.*`                | «de 0 a 1»                                                                                                                         | Siguen ciertas (solo métricas de clase)                                                                                                   |
| `en.json:333` `score.columns.estimate`                                      | `{target}_estimate`                                                                                                                | Correcta, pero el ADR 014 dice `_estimado` → AU-A-13                                                                                      |
| `src/content/modelos.ts:48, 71, 186, 468` (EN)                              | «cannot see them / cannot memorise / cannot follow it»                                                                             | Siguen ciertas (son capacidades del modelo)                                                                                               |
| `src/components/TaskCard.tsx:14` (comentario)                               | «si su tarea todavía no se entrena»                                                                                                | Sigue cierta                                                                                                                              |
| `src/components/**` copy cableado                                           | ninguno (todo pasa por `t()`)                                                                                                      | —                                                                                                                                         |
| `docs/MANUAL-DE-USO.md:25, 35-37`                                           | «dos opciones (sí/no)» + «desde el S6, las cantidades»                                                                             | Sigue cierta                                                                                                                              |
| `MANUAL:47`                                                                 | «métricas (exactitud… AUC)»                                                                                                        | Sigue cierta (sección binaria del S1)                                                                                                     |
| `MANUAL:60`                                                                 | «no puede inventarla»                                                                                                              | Sigue cierta                                                                                                                              |
| `MANUAL:64-65, 284-285`                                                     | «Solo… dos categorías» + nota «Desde el Sprint 006…»                                                                               | Sigue cierta (anotada)                                                                                                                    |
| `MANUAL:69`                                                                 | «aún no se usan»                                                                                                                   | Sigue cierta                                                                                                                              |
| `MANUAL:170`                                                                | «Publicar el modelo… llegará más adelante»                                                                                         | Sigue cierta (heredada, roadmap)                                                                                                          |
| `MANUAL:172`                                                                | «no puede detectar cambios más sutiles»                                                                                            | Sigue cierta                                                                                                                              |
| `MANUAL:223-224`                                                            | «esta versión todavía no la entrena… desde el S6, las cantidades sí»                                                               | Sigue cierta                                                                                                                              |
| `MANUAL:270, 275`                                                           | «mientras tanto…» / «no se puede comparar»                                                                                         | Siguen ciertas                                                                                                                            |
| `MANUAL:294, 307`                                                           | «ya no te dice «llega en una próxima versión»» / «esta versión todavía no entrena»                                                 | Siguen ciertas                                                                                                                            |
| `MANUAL:310-312`                                                            | «Compiten 11 modelos»                                                                                                              | **Sobredicha:** con menos de 500 filas compiten 10 (el MLP queda «fuera») → **AU-A-08**                                                   |
| `MANUAL:333, 352`                                                           | «por ahora solo cubre…» / «Varias categorías… llegan en una próxima versión»                                                       | Siguen ciertas                                                                                                                            |
| `MANUAL:363`                                                                | Baseline = «clase mayoritaria y una regresión logística»                                                                           | **Incompleta al estimar** → **AU-A-08**                                                                                                   |
| `MANUAL:450`                                                                | «¿no puedo usarlo?»                                                                                                                | Sigue cierta                                                                                                                              |
| `README.md`                                                                 | plantilla de create-next-app, sin afirmaciones del producto                                                                        | —                                                                                                                                         |
| `docs/GUIA-DE-PRUEBA.html:123`                                              | «por ahora 8»                                                                                                                      | Sigue cierta                                                                                                                              |
| `GUIA:127`                                                                  | «liga-mediana.csv (… **el único con Nivel 2** que correr y cancelar)»                                                              | **Caducó:** `consumo-energia-mediano.csv` también tiene Nivel 2 (lo dice la misma línea) → **AU-A-09**                                    |
| `GUIA:328, 414`                                                             | «todavía no la entrena» / «llega en una próxima versión»                                                                           | Siguen ciertas                                                                                                                            |
| `GUIA:424`                                                                  | «Por ahora, la narración con IA solo cubre…»                                                                                       | Sigue cierta                                                                                                                              |
| `GUIA:460`                                                                  | historial «el caso «todavía no» pasa a «departamento»»                                                                             | Sigue cierta                                                                                                                              |
| `docs/BROCHURE.html:803`                                                    | «Cinco métricas… Exactitud, precisión, sensibilidad, F1 y AUC»                                                                     | **Incompleta** (al estimar: MAE · RMSE · R² · MedAE) → **AU-A-03**                                                                        |
| `BROCHURE:805`                                                              | «Los baselines… Clase mayoritaria y regresión logística»                                                                           | **Caducó al estimar** (mediana + lineal) → **AU-A-03**                                                                                    |
| `BROCHURE:807`                                                              | «Se equivoca en promedio ±33.5 kWh; una regresión lineal, ±43.8 kWh» entre comillas                                                | Cita parafraseada; la app dice «En promedio se equivoca por…» → **AU-A-03**                                                               |
| `BROCHURE:846`                                                              | «**Tres alertas** antes de entrenar»                                                                                               | **Caducó:** hay 5 tipos (`eda.ts:41-46`) → **AU-A-03**                                                                                    |
| `BROCHURE:920`                                                              | «Tu tabla completa más predicción y probabilidad»                                                                                  | **Incompleta** (al estimar no hay probabilidad) → **AU-A-03**                                                                             |
| `BROCHURE:1054-1055`                                                        | «Varias categorías, todavía no»                                                                                                    | Sigue cierta                                                                                                                              |
| `BROCHURE:1064`                                                             | «aún no se usan»                                                                                                                   | Sigue cierta                                                                                                                              |
| `BROCHURE:1134`                                                             | Diccionario: Baseline = «lo más frecuente y una regresión logística»                                                               | **Caducó al estimar** → **AU-A-03**                                                                                                       |
| `BROCHURE:1145`                                                             | «con **las cinco métricas** explicadas una a una, **vive dentro de la app**»                                                       | **Falsa doble:** ya no son cinco, y la lista vive en el manual (no hay glosario en la app; es backlog del S4) → **AU-A-03**               |
| `docs/brochure-export.json:6` `_regla_madre`                                | «no puede publicar cifras sueltas»                                                                                                 | Sigue cierta (documenta el esquema)                                                                                                       |
| `export:74-75` V6 · `:87` V8 · `:154-155` D6 · `:237` U5 · `:281` T2        | «Cinco métricas» · «Clase mayoritaria y regresión logística» · «Tres alertas» · «predicción y probabilidad» · «las cinco métricas» | **Caducaron o quedaron incompletas** → **AU-A-03**                                                                                        |
| `export:22, 306-372` métricas                                               | 267 pruebas · 24 e2e (7 specs) · 90,69 % · «Cuatro pruebas e2e» · 61 572 B · 8 ADR · `sprints_cerrados` 5                          | **Caducaron** → **AU-A-02**                                                                                                               |
| `design-system.md:166, 187`                                                 | «no pueden leerse igual» / «si la tarea aún no se entrena, lo dice»                                                                | Siguen ciertas                                                                                                                            |
| `design-sync/components/componentes/tarea-ambigua.html:50`                  | «todavía no entrena varias clases: llega en una próxima versión»                                                                   | Sigue cierta                                                                                                                              |
| `design-sync/components/componentes/encarriladores.html:69`                 | «podrás incluirlo»                                                                                                                 | Sigue cierta                                                                                                                              |
| `docs/kit-de-prueba/README.md:20`                                           | «podrás correrlos (y cancelar)»                                                                                                    | Sigue cierta                                                                                                                              |
| `docs/kit-de-prueba/README.md:28`                                           | «La app debe nombrarla; **sin ella, el ejemplo entrena**»                                                                          | **Engañosa:** sugiere que con ella no entrena; entrena y se etiqueta «sospechoso» → **AU-A-04**                                           |
| `decisions/013-…:12`                                                        | «llega en una próxima versión» (contexto histórico)                                                                                | Sigue cierta                                                                                                                              |
| `decisions/013-…:76`                                                        | «comes in a later version»                                                                                                         | Sigue cierta                                                                                                                              |
| `decisions/014-…:38`                                                        | «a task the UI cannot use»                                                                                                         | Sigue cierta                                                                                                                              |
| `public/datasets/**` README                                                 | no existe                                                                                                                          | —                                                                                                                                         |

### Casilla 6 — guía heredada contra la arquitectura

- **Las 38 heredadas (A1–F11) pasan HOY con el diseño y los ADR vigentes.** Revisé una por una las
  que el S6 podía tocar:
  - **F1:** reescrita bien. `departamento` da 4 categorías → multiclase, «Entrenar» deshabilitado y
    «próxima versión». `edad` da 39 números → cantidad sin unidad. Los datos lo confirman.
  - **F2, F3, F7 y F9 (binarias):** el orden binario de `ALL_MEMBER_IDS` no cambió y
    `COST_COEFFICIENTS` binario tampoco (diff de `roster.ts` y `costos.ts`). «13 modelos · unos 4 s»
    y «Nivel 1 · 10 · Nivel 2 · 4» siguen valiendo.
  - **B2:** `logisticTie` sin cambios.
  - **D1:** `_one` («1 valor») no contradice la guía, que no cita la frase literal.
  - **C1, C2, D3 y F11:** describen el contexto binario (marketing) y siguen siendo verdad.
- **Botones de ejemplo:** 5 en `StartScreen.tsx:21`. La guía dice «los 4 datasets de ejemplo…» y
  aparte «consumo-energia.csv (también botón en la app)»: es coherente.
- **Conteos:** 49 pruebas y 8 ⭐ de H2, verificados contando el HTML. El chip `o-clave` aparece 9
  veces porque la 9.ª es la del texto introductorio (línea 123), que no está dentro de un `li`.
- **Filtros:** «⭐ Solo el gate H2» filtra por `.o-clave` y esconde los bloques vacíos
  (`GUIA:493-504`). «Mejorado en S6» muestra F1 y E4 (`data-origen="mejora"`).
- **`localStorage`:** `CLAVE = "guia-ds:s6:"` (`GUIA:477`).
- **Cifras del bloque G frente a la bitácora (`bitácora:464-470`):** todas coinciden.
- **Única frase heredada que el S6 volvió falsa:** el kit dice que `liga-mediana.csv` es «el único
  con Nivel 2» (`GUIA:127`) → AU-A-09.
- **Gate ⭐:** la guía cambió la «ficha de regresor» de la orden por G10 sin registrarlo → AU-A-10.

### Coherencia documental y cero enlaces

- **Conteo de funcionalidades:** brochure 35 (`BROCHURE:26, 1157`) = export `total` 35 = suma de
  grupos 12+7+5+9+2 (verificado). Cada `seccion_manual` del export existe en el manual. La tabla de
  mapeo «va en el summary» (pendiente, fuera de alcance).
- **Toda métrica del export tiene `fuente`** (11 de 11). Pero cinco valores «medidos» ya no son
  ciertos → AU-A-02.
- **Cifras de la guía frente a la bitácora:** coinciden (tabla de la bitácora:464-470). Nota interna:
  la tabla P9 de la F0 (bitácora:162) dice «entran 8 de 11» en `consumo-energia-mediano`, y la pasada
  de capturas de la F2 y la guía G10 dicen 9 + 2. Lo primero era la simulación del spike
  (`spike:485`) y lo segundo la medición en la app. No es hallazgo: la guía cita lo medido.
- **ADR 013 y 014 contra `tests/`:** los conteos de carnadas cuadran todos (casilla 1, #33–#38).
  - La afirmación «binary fixtures only changed by `task`» es cierta (diff: `task` + `elapsed_ms` +
    bytes del pickle).
  - «9 of 9 datasets» es cierta (`spike:146`).
  - Tres afirmaciones son imprecisas → AU-A-13.
- **`design-system.md` frente a `PredichoVsReal.tsx`:** cuadra punto por punto: diagonal `ink` de
  1,5 px; franja `accent/10` con bordes `accent/60` punteados «4 3»; disco `accent` dentro y anillo
  `caution` sobre `surface` fuera; leyenda HTML con muestra; `role="img"` con nombre y «de cada 100»;
  aviso de muestra con el tope de 200.
- **`design-sync/`:** existen `estimar.html` y `tarea-ambigua.html`, y el README las describe
  (`README.md:59-64`, mismo criterio que el S5: por tema, no por archivo).
- **Regla 9 (el manual documenta toda feature nueva):** sí. Cubre estimar, la pregunta, el gráfico,
  `_estimado`, los avisos de sesgo y atípicos, el diccionario, tres FAQ y el historial.
- **Cero enlaces:** `git grep` vacío; `homepageUrl` = la URL del repo; ninguna URL de preview en el
  diff (solo `localhost`).

**Observación sin hallazgo:** la tabla de unidades incluye sufijos de una letra (`_c` → °C, `_t` → t,
`_m` → m, `_h` → h, `_s` → s, `_g` → g, `_l` → L; `src/lib/experiment.ts:448-478`). Una columna como
`ventas_t` (trimestre) se leería en toneladas. No encontré un caso real en los datasets, así que no lo
elevo; lo dejo para que el constructor lo juzgue.

### Hallazgos

#### AU-A-01 · Alto · La tarjeta de tarea promete «llega en una próxima versión» a una columna que no sirve como objetivo

- **Dónde:**
  - `src/components/TaskCard.tsx:198-207`: la rama `!trainable` siempre usa `t("task.notYet")`.
  - `messages/es.json:570` y `messages/en.json:570` (`task.notYet`).
  - Sin prueba que lo cubra: `tests/unit/league-ui.test.tsx:99-109` solo prueba la multiclase.
- **Qué pasa:** con una columna `sin-objetivo` (más de 20 categorías de texto que no son un ID exacto,
  p. ej. ciudades o un comentario libre), la tarjeta se contradice: «25 valores distintos: parece un
  identificador o texto libre, no algo que predecir.» y justo después «Esta versión todavía no entrena
  este tipo de predicción: llega en una próxima versión.». Ninguna versión entrenará eso como
  objetivo (`MULTICLASS_MAX_CLASSES = 20`; el S7 trae multiclase y agrupar _sin_ objetivo), y el
  selector ya dice «· no sirve como objetivo». El S6 editó esta misma clave (le agregó «o con una
  cantidad») y la dejó falsa para este caso. Viene del S5.
- **Evidencia / escenario:** la sonda `sondas/A/sonda-taskcard.test.tsx` renderiza
  `TaskCard detection={detectTask(50 valores, 25 categorías)}` y su texto real es:
  «⚠Tipo de predicción: 25 valores distintos: parece un identificador o texto libre, no algo que
  predecir.Esta versión todavía no entrena este tipo de predicción: llega en una próxima versión. Por
  ahora, elige una columna con dos categorías o con una cantidad.». Basta un CSV propio con una
  columna de texto de 21+ categorías.
- **Ajuste ejecutable:**
  1. En `messages/es.json`, dentro de `task`, justo después de `"notYet"` (línea 570), agregar:
     `"notUsable": "Esta columna no sirve como objetivo. Elige una columna con dos categorías o con una cantidad.",`
  2. En `messages/en.json`, en el mismo lugar:
     `"notUsable": "This column is not usable as a target. Pick a column with two categories or with a quantity.",`
  3. En `src/components/TaskCard.tsx:201-202`, reemplazar
     ```tsx
            : !trainable
              ? t("task.notYet")
     ```
     por
     ```tsx
            : !trainable
              ? t(detection.task === "sin-objetivo" ? "task.notUsable" : "task.notYet")
     ```
  4. En `tests/unit/league-ui.test.tsx`, después de la línea 109, agregar:
     ```tsx
     it("una columna que no sirve como objetivo no promete una próxima versión", () => {
       ui(
         <TaskCard
           detection={detectTask(
             Array.from({ length: 50 }, (_, i) => `c${i % 25}`),
           )}
         />,
       );
       expect(screen.getByText(/no algo que predecir/)).toBeInTheDocument();
       expect(
         screen.getByText(
           "Esta columna no sirve como objetivo. Elige una columna con dos categorías o con una cantidad.",
         ),
       ).toBeInTheDocument();
       expect(screen.queryByText(/próxima versión/)).toBeNull();
     });
     ```
  5. Demo en rojo con `scripts/demo-rojo.sh`: devolver el ternario a `t("task.notYet")` hace fallar la
     prueba nueva. Se registra en la bitácora.
- **Verificado cuando:** la prueba nueva pasa; la demo en rojo queda registrada; la paridad i18n
  sigue verde; y `grep -n '"notUsable"' messages/es.json messages/en.json` da dos líneas.

#### AU-A-02 · Alto · El export publica como «medidas» cifras que ya no son ciertas

- **Dónde:** `docs/brochure-export.json`:
  - `:15` `actualizado` (2026-10-04) y `:22` `sprints_cerrados: 5`;
  - `:306-312` `pruebas_unitarias` (267, «2026-08-20, 29 + 5 archivos»);
  - `:314-320` `pruebas_e2e` (24, «7 specs»);
  - `:322-328` `cobertura_lineas` (90,69 %, «984 de 1085»);
  - `:343` `filas_del_usuario_en_la_red`, en su detalle («Cuatro pruebas e2e»);
  - `:362-368` `peso_brochure` (61 572);
  - `:370-376` `decisiones_registradas` (8).
- **Qué pasa:** el S6 tocó el export (D7) y subió `actualizado` a 2026-10-04, pero dejó las métricas
  de agosto con `fuente: "medido"`. La vitrina de hoja-de-vida las lee como actuales.
- **Evidencia / escenario:**
  - `ls decisions/*.md | wc -l` = 14 (el export dice 8).
  - `wc -c docs/BROCHURE.html` = 63 353 (dice 61 572; en la base ya era 61 853).
  - `ls tests/e2e/*.spec.ts | wc -l` = 14 (dice 7 specs).
  - 45 archivos unit y 7 de integración (dice 29 y 5).
  - Las specs que fallan si la red lleva valores del dataset ahora son 5: `score-download`,
    `export-import-rescore`, `saneamiento-sucio`, `why-modelcard` y `regresion-score`. El detalle dice
    «Cuatro».
  - Cuando el PR se mergee con el summary en `status: closed`, habrá 6 sprints cerrados.
  - `tests/unit/brochure-export.test.ts` solo verifica que exista la `fuente`, no el valor: el gate
    no puede fallar por esto.
- **Ajuste ejecutable:** hacerlo después de AU-A-03, porque cambia el peso del brochure.
  1. `decisiones_registradas.valor` = `14`; `detalle` = «Archivos de decisions/ (001–014).».
  2. `peso_brochure.valor` = salida de `wc -c < docs/BROCHURE.html` tras el último cambio del
     brochure (hoy 63 353).
  3. `filas_del_usuario_en_la_red.detalle`: reemplazar «Cuatro pruebas e2e inspeccionan cada
     petición de red durante el recorrido completo y fallan si alguna contiene valores del dataset.»
     por «Cinco pruebas e2e (score-download, export-import-rescore, saneamiento-sucio, why-modelcard
     y, desde el S6, regresion-score) inspeccionan la red durante su recorrido y fallan si alguna
     petición contiene valores del dataset.».
  4. En el `/deploy-check`, re-medir con `pnpm test` (tests y archivos + «All files % Lines»),
     `pnpm test:integration` y `pnpm test:e2e`. Escribir en `pruebas_unitarias`, `pruebas_e2e` y
     `cobertura_lineas` los valores y la fecha en `detalle`: «Salida del 2026-10-0X: …».
  5. `app.sprints_cerrados` = `6`, en el mismo commit del summary del S6.
  6. Gate nuevo en `tests/unit/brochure-export.test.ts`. Agregar `readdirSync` al import de
     `node:fs` (línea 1) y, dentro del `describe`, esta prueba:
     ```ts
     it("las métricas que se recuentan desde el repo cuadran (ADR y peso del brochure)", () => {
       const valor = (clave: string) =>
         exportado.metricas.find((m) => m.clave === clave)!.valor;
       const adrs = readdirSync("decisions").filter((f) =>
         /^\d{3}-.+\.md$/.test(f),
       );
       expect(valor("decisiones_registradas")).toBe(adrs.length);
       expect(valor("peso_brochure")).toBe(
         readFileSync("docs/BROCHURE.html").length,
       );
     });
     ```
     Su demo en rojo, con `demo-rojo.sh`, en el mismo commit: `decisiones_registradas` = 13 hace
     fallar la prueba.
- **Verificado cuando:**
  - la prueba nueva pasa y su rojo está en la bitácora;
  - `node -e 'const e=require("./docs/brochure-export.json");console.log(e.metricas.map(m=>m.clave+"="+m.valor).join(" "))'`
    muestra 14 ADR y el peso real;
  - ningún `detalle` dice «2026-08-20» ni «Cuatro pruebas».

#### AU-A-03 · Alto · Brochure y export: frases que el S6 volvió falsas (alertas, baselines, métricas, CSV puntuado y diccionario)

- **Dónde:**
  - `docs/BROCHURE.html`: `:803` (V6), `:805` (V8), `:807` (cita de V11), `:846` (D6), `:920` (U5),
    `:1134` (diccionario: Baseline) y `:1145` (pie del diccionario).
  - `docs/brochure-export.json`: `:74-75` (V6), `:87` (V8), `:154-155` (D6), `:237` (U5) y `:281`
    (T2).
- **Qué pasa:** la regla 12 pide ajustar el brochure y el export en el mismo PR. D7 sumó las dos
  funcionalidades nuevas, pero dejó intactas las líneas que el S6 dejó falsas:
  - «**Tres** alertas antes de entrenar»: hoy hay cinco (`eda.ts:41-46` suma `target-skewed` y
    `target-outliers`).
  - Los baselines y el diccionario dicen «clase mayoritaria y regresión logística»: al estimar son
    la mediana y la lineal.
  - «Cinco métricas… y AUC»: al estimar son MAE · RMSE · R² · MedAE.
  - «predicción y probabilidad»: al estimar no hay probabilidad.
  - «las cinco métricas… **vive dentro de la app**»: el diccionario del manual ya tiene nueve
    métricas, y no hay glosario en la app (es backlog del S4, `SPRINT_006.md:59-60`).
  - V11 pone entre comillas una cita que la app no dice así.
- **Evidencia / escenario:** quien abre `/conoce` y elige «Estimar una cantidad» lee en la misma
  tarjeta que los rivales son «clase mayoritaria y regresión logística». La vitrina publica
  «Tres alertas».
- **Ajuste ejecutable:** texto exacto; el brochure y el export son solo en español; no se tocan
  escenas ni conteo.

  **En `docs/BROCHURE.html`:**
  1. `:803`: reemplazar
     `<b>Cinco métricas, todas sobre datos que el modelo no vio.</b> <em>Exactitud, precisión, sensibilidad, F1 y AUC.</em>`
     por
     `<b>Las métricas, todas sobre datos que el modelo no vio.</b> <em>Al clasificar: exactitud, precisión, sensibilidad, F1 y AUC. Al estimar: MAE, RMSE, R² y MedAE, en las unidades de tu columna.</em>`
  2. `:805`: reemplazar
     `<em>Clase mayoritaria y regresión logística: los rivales que hay que batir.</em>`
     por
     `<em>Al clasificar, la clase mayoritaria y la regresión logística; al estimar, la mediana y la regresión lineal: los rivales que hay que batir.</em>`
  3. `:807`: reemplazar
     `<em>«Se equivoca en promedio ±33.5 kWh; una regresión lineal, ±43.8 kWh». Con el gráfico estimado frente a real.</em>`
     por
     `<em>«En promedio se equivoca por ±33.5 kWh; una regresión lineal se equivoca por ±43.8 kWh». Con el gráfico estimado frente a real.</em>`
  4. `:846`: reemplazar
     `<b>Tres alertas antes de entrenar.</b> <em>Una columna que huele a fuga, una que parece un código de cliente, un objetivo desbalanceado. Con símbolo y texto, nunca solo color.</em>`
     por
     `<b>Cinco alertas antes de entrenar.</b> <em>Una columna que huele a fuga, una que parece un código de cliente, un objetivo desbalanceado y, al estimar, un objetivo muy sesgado o con valores muy lejos del resto. Con símbolo y texto, nunca solo color.</em>`
  5. `:920`: reemplazar
     `<em>Tu tabla completa más predicción y probabilidad. Si ya tenías una columna con ese nombre, la nueva sale con sufijo.</em>`
     por
     `<em>Tu tabla completa más la predicción y, si el modelo la da, su probabilidad; al estimar, la cantidad estimada con los decimales de tu columna. Si ya tenías una columna con ese nombre, la nueva sale con sufijo.</em>`
  6. `:1134`: reemplazar
     `Las reglas simples a batir: responder siempre lo más frecuente y una regresión logística. Si tu modelo no supera a la mejor, no sirve.`
     por
     `Las reglas simples a batir: al clasificar, responder siempre lo más frecuente y una regresión logística; al estimar, adivinar siempre la mediana y una regresión lineal. Si tu modelo no supera a la mejor, no sirve.`
  7. `:1145`: reemplazar
     `La lista completa, con las cinco métricas explicadas una a una, vive dentro de la app.`
     por
     `La lista completa, con cada métrica explicada en una línea, está en el manual de uso.`

  **En `docs/brochure-export.json`:** 8. `:74`: `"nombre": "Las métricas, todas sobre datos no vistos"`. 9. `:75`: `"que_hace": "Al clasificar: exactitud, precisión, sensibilidad, F1 y AUC. Al estimar: MAE, RMSE, R² y MedAE, en las unidades del objetivo. Calculadas siempre sobre el conjunto de prueba."` 10. `:87`: `"que_hace": "Al clasificar, la clase mayoritaria y la regresión logística; al estimar, la mediana y la regresión lineal: los rivales que hay que batir, con sus cifras."` 11. `:154`: `"nombre": "Cinco alertas antes de entrenar"`. 12. `:155`: `"que_hace": "Columna que huele a fuga, columna que parece un identificador, objetivo desbalanceado y, al estimar, objetivo muy sesgado u objetivo con valores muy lejos del resto. Con símbolo y texto, nunca solo color."` 13. `:237`: `"que_hace": "La tabla completa más la predicción y, si el modelo la da, su probabilidad; al estimar, la cantidad estimada (<objetivo>_estimado). Si ya existía una columna con ese nombre, la nueva sale con sufijo."` 14. `:281`: `"que_hace": "Cada palabra de la app explicada en una línea: baseline, veredicto, fuga, desbalance, importancia, novedad, model card y cada métrica, las de clasificar y las de estimar."`

  **Después:** re-medir `peso_brochure` (AU-A-02) y correr `pnpm test` y el e2e `brochure.spec.ts`.

- **Verificado cuando:**
  - `grep -nE "Tres alertas|Cinco métricas|cinco métricas|vive dentro de la app" docs/BROCHURE.html docs/brochure-export.json`
    sale vacío;
  - `grep -c "la mediana y la regresión lineal" docs/BROCHURE.html` ≥ 2;
  - `brochure-export.test.ts` y `brochure.spec.ts` siguen verdes.

#### AU-A-04 · Medio · AC2 dice «la fuga se bloquea antes de entrenar; sin ella, entrena»: la desviación no está declarada y el «sin ella» no tiene prueba

- **Dónde:**
  - `/Users/henryrincon/Code/hr01-develop-ai-apps/portafolio/ds/sprints/SPRINT_006.md:170-171`
    (AC2) y el plan aprobado (línea 237, «fuga plantada bloqueada»).
  - Lo implementado: `tests/e2e/regresion.spec.ts:73-101` (entrena con la fuga y espera
    «sospechoso»).
  - `docs/kit-de-prueba/README.md:28` («sin ella, el ejemplo entrena»).
  - `sprints/SPRINT_006-implementation-log.md:20-72` (no hay D sobre esto).
- **Qué pasa:** la app avisa en Configuración y, si se entrena igual, cambia el veredicto por «⚠
  Métricas casi perfectas — sospechoso» (`RegressionResults.tsx:40-45`). Es lo correcto según la
  regla dura 3 y el ADR 002, e igual que la binaria (guía B3). Pero contradice la letra de AC2
  («se bloquea») y no está en `## Desviación del plan`. Además:
  - Ninguna prueba verifica la segunda mitad («el mismo dataset sin esa columna entrena»).
  - El README del kit sugiere que con la columna no entrena.
- **Evidencia / escenario:** `regresion.spec.ts:91-95` pulsa «Entrenar modelos» con la fuga
  presente y espera el titular «sospechoso». Un `grep -rn "impuesto_transferencia" tests/` no
  encuentra ninguna prueba que la quite.
- **Ajuste ejecutable:**
  1. **Bitácora:** después de la línea 72 (fin de D7), agregar:

     «- **D8 · AC2 («se bloquea antes de entrenar») se cumple como en la binaria: avisa y etiqueta,
     no bloquea.** Mandan la regla dura 3 (la honestidad acompaña: etiqueta, no bloquea) y el ADR
     002 (la fuga es una advertencia, no una garantía).
     - La columna se nombra en Configuración antes de entrenar («predice el objetivo casi a la
       perfección»).
     - Si se entrena igual, el veredicto se reemplaza por «⚠ Métricas casi perfectas — sospechoso»
       con la columna nombrada (`tests/e2e/regresion.spec.ts`).
     - «Sin ella, entrena» lo cubre `tests/unit/regresion-motor.test.ts` (sin la columna: sin
       fuga y regresión).»

  2. **Prueba:** en `tests/unit/regresion-motor.test.ts`, después de la línea 436 (fin de «precio
     con fuga plantada…»), agregar:
     ```ts
     it("precio SIN la columna plantada: entrena sin aviso de fuga (AC2)", () => {
       const table = kit("precio-fuga-plantada.csv");
       const drop = table.headers.indexOf("impuesto_transferencia_usd");
       const sinFuga = {
         headers: table.headers.filter((_, i) => i !== drop),
         rows: table.rows.map((row) => row.filter((_, i) => i !== drop)),
       };
       const run = prepareRun(sinFuga, "precio_usd", 42);
       expect(run.ok).toBe(true);
       expect(run.ok && run.leakage).toEqual([]);
       expect(run.ok && run.payload.task).toBe("numerica");
     });
     ```
  3. **README del kit:** en `docs/kit-de-prueba/README.md:28`, reemplazar
     «La app debe nombrarla; sin ella, el ejemplo entrena.» por «La app la nombra antes de entrenar
     y, si entrenas igual, marca el resultado como «sospechoso». Quítala de tu tabla y vuelve a
     entrenar para un veredicto creíble.».
- **Verificado cuando:**
  - la prueba nueva pasa;
  - `grep -n "D8" sprints/SPRINT_006-implementation-log.md` da una línea;
  - `grep -n "sin ella, el ejemplo entrena" docs/kit-de-prueba/README.md` sale vacío.

#### AU-A-05 · Medio · Un umbral sin medir ni exportar decide una frase dentro de un componente («tiende a estimar de más», 5 % del MAE)

- **Dónde:** `src/components/RegressionResults.tsx:121-127`. Solo hay una prueba, en
  `tests/unit/regresion-ui.test.tsx:251`, y cubre solo la rama «de más».
- **Qué pasa:** `Math.abs(residuals.p50) <= 0.05 * model.mae` elige entre «tiende a estimar de más /
  de menos / no se inclina». Choca con dos cosas:
  - **AC8:** «ningún umbral nuevo en código sin su medición del STOP y su constante exportada».
  - **Regla de desarrollo 3:** la lógica no va en los componentes.

  El 0,05 no está en el STOP (bitácora:197-202), ni en el ADR 013, ni exportado. Las ramas «de
  menos», «no se inclina» y el borde no tienen prueba.

- **Evidencia / escenario:** con `p50 = +1.6 kWh` y `MAE = 33.5`, el 4,8 % dice «no se inclina» y
  con +1.7 kWh (5,1 %) dice «tiende a estimar de más». Ninguna prueba detecta si alguien cambia el
  0,05.
- **Ajuste ejecutable:**
  1. En `src/lib/regression-text.ts`, al final, agregar:
     ```ts
     /** S6: el error mediano «se inclina» si supera esta fracción del MAE. Umbral de
      *  PRESENTACIÓN (elige la frase; no decide el veredicto). Fijado en la F2 sin
      *  medición — D9 de la bitácora; se ratifica en el gate del ciclo. */
     export const RESIDUAL_LEAN_SHARE = 0.05;

     export function residualLean(
       p50: number,
       mae: number,
     ): "none" | "over" | "under" {
       if (Math.abs(p50) <= RESIDUAL_LEAN_SHARE * mae) return "none";
       return p50 > 0 ? "over" : "under";
     }
     ```
  2. En `src/components/RegressionResults.tsx:6-9`, agregar `residualLean` al import de
     `@/lib/regression-text`. Reemplazar las líneas 121-127 (comentario + `const lean = …`) por
     `const lean = residualLean(residuals.p50, model.mae);`.
  3. En `tests/unit/regresion-motor.test.ts`, en un `describe` nuevo:
     ```ts
     describe("hacia dónde se inclina el error (RESIDUAL_LEAN_SHARE)", () => {
       it("de más, de menos y, dentro del 5 % del MAE, sin inclinación (borde incluido)", () => {
         expect(residualLean(5, 33.5)).toBe("over");
         expect(residualLean(-5, 33.5)).toBe("under");
         expect(residualLean(0.05 * 33.5, 33.5)).toBe("none");
         expect(residualLean(-0.05 * 33.5, 33.5)).toBe("none");
         expect(RESIDUAL_LEAN_SHARE).toBe(0.05);
       });
     });
     ```
     Con `import { RESIDUAL_LEAN_SHARE, residualLean } from "@/lib/regression-text";`.
  4. **Bitácora:** después de D8, agregar:

     «- **D9 · Umbral de presentación sin medir: `RESIDUAL_LEAN_SHARE = 0,05`.** Elige si el texto
     del gráfico dice que el modelo «tiende a estimar de más/de menos». No decide el veredicto. No
     estaba entre los umbrales del STOP de la F0: se ratifica con el usuario en el gate del ciclo.»

  5. **ADR 013:** al final del punto 8 (`decisions/013-…:67`, después de «league breadcrumb carries only `task`.»), agregar «The text says the model
     leans over/under only when the median error exceeds 5 % of the MAE (`RESIDUAL_LEAN_SHARE`, a
     presentation threshold set in F2 without measurement, D9).».
  6. Demo en rojo con `demo-rojo.sh`: `RESIDUAL_LEAN_SHARE = 0.5` hace fallar la prueba.
- **Verificado cuando:**
  - `grep -n "0.05 \* model.mae" src/components/RegressionResults.tsx` sale vacío;
  - la prueba nueva pasa y su rojo está registrado;
  - D9 está en la bitácora y la frase en el ADR 013.

#### AU-A-06 · Medio · Al puntuar e importar una cantidad, axe corre en un solo tema

- **Dónde:** `tests/e2e/regresion-score.spec.ts:2, 97-98`: `new AxeBuilder({ page }).analyze()` corre
  solo en tema claro, solo al final, y nunca sobre el resumen del import de regresión
  (`regresion-score.spec.ts:55-59`).
- **Qué pasa:** el plan (Fase 2, punto 6) pide «axe en ambos temas en cada pantalla tocada». El S6
  tocó el ScoreScreen (`subtitleQuantity`, `modelLineQuantity`, mín·mediana·máx, `quantityNote`) y el
  resumen del import (`targetQuantity`). Ninguno se audita en oscuro. Las demás pantallas del S6 sí
  usan `axeBothThemes` (`regresion.spec.ts:31, 69`; `tarea-ambigua.spec.ts:24, 32, 41`).
- **Evidencia / escenario:** `grep -n "axeBothThemes" tests/e2e/regresion-score.spec.ts` no da nada.
- **Ajuste ejecutable:**
  1. En `tests/e2e/regresion-score.spec.ts`, reemplazar
     `import AxeBuilder from "@axe-core/playwright";` por `import { axeBothThemes } from "./axe-temas";`.
  2. Después de la línea 59 (`await expect(page.getByText(/MAE en prueba: …/)).toBeVisible();`),
     agregar `await axeBothThemes(page);`.
  3. Reemplazar las líneas 97-98 (`const axe = …` y `expect(axe.violations)…`) por
     `await axeBothThemes(page);`.
  4. Demo en rojo con `demo-rojo.sh --puerto 3000`: quitar `tabIndex={-1}` + `aria-hidden` del input
     CSV de `ScoreScreen` (violación `label`, igual que la demo de la F0).
- **Verificado cuando:** el spec pasa en móvil y escritorio con dos escaneos por tema, y el rojo
  queda registrado.

#### AU-A-07 · Medio · El Nivel 2 al estimar no tiene ninguna prueba automática

- **Dónde:**
  - Lo implementado: `src/lib/useExperiment.ts:1000-1020` (`prepareRun` + `planLevel2` con el
    perfil numérico), `src/engine/encarrilador.ts:220-245`, `src/components/Level2Card.tsx:42-50`.
  - Las pruebas: `tests/unit/encarrilador.test.ts:133-205` (`planLevel2` solo con perfiles
    binarios); `tests/unit/regresion-ui.test.tsx:432-585` (el hook al estimar sin Nivel 2).
  - En e2e, nada. Solo la prueba manual ⭐ G10.
- **Qué pasa:** el plan dice «Nivel 2 y cancelar, iguales al S5». Está cableado, pero nada verifica
  que al estimar el Nivel 2 sume regresores con costos de regresión. `RouteProfile.task` es opcional
  y por defecto «binaria» (`encarrilador.ts:37-38, 125`): si un camino pierde el `task`, el Nivel 2
  tomaría en silencio el roster binario y ninguna prueba lo vería.
- **Evidencia / escenario:** `grep -rln "planLevel2" tests/ | xargs grep -l numerica` no da nada.
- **Ajuste ejecutable:**
  1. En `tests/unit/encarrilador.test.ts`, cambiar la línea 19 `import { MEMBER_IDS } from "@/engine/roster";` por `import { isMemberOf, MEMBER_IDS } from "@/engine/roster";`.
  2. Dentro de `describe("planLevel2 …")`, antes del `});` de la línea 205 que lo cierra, agregar:
     ```ts
     it("al estimar (S6): suma los regresores pendientes con los costos de regresión", () => {
       const ESTIMAR: RouteProfile = {
         task: "numerica",
         rows: 5000,
         nTrain: 3750,
         width: 33,
         minorityShare: null,
         k: 5,
       };
       const routing = routeModels(ESTIMAR);
       expect(routing.level2.length).toBeGreaterThan(0);
       const plan = planLevel2(
         ESTIMAR,
         routing.level1,
         onlyMembers(routing.level1EstimateS * 1000),
       );
       expect(plan.added).toEqual(routing.level2);
       expect(plan.roster.every((id) => isMemberOf("numerica", id))).toBe(true);
       expect(plan.estimateS).toBeCloseTo(routing.unionEstimateS, 6);
     });
     ```
  3. Demo en rojo con `demo-rojo.sh`: en `encarrilador.ts:125`, `const task = "binaria";` hace
     fallar la prueba (el roster deja de ser de regresión).
- **Verificado cuando:** la prueba pasa y su rojo está registrado.

#### AU-A-08 · Bajo · Manual: «Compiten 11 modelos» y una definición de baseline que no incluye estimar

- **Dónde:** `docs/MANUAL-DE-USO.md:310-312` y `:363`.
- **Qué pasa:**
  - «Compiten 11 modelos» se sobredice: con menos de 500 filas la red neuronal queda «fuera», y en
    el propio ejemplo compiten 10 (guía G1, «La liga: 10 modelos»). Es el mismo patrón que
    AU-S5-17.
  - La fila «Baseline» del diccionario solo nombra la clase mayoritaria y la logística.
- **Evidencia / escenario:** con «Consumo de energía», la pantalla dice «Nivel 1 · ahora · 10
  modelos» y «Fuera · 1».
- **Ajuste ejecutable:**
  1. `:310-312`: reemplazar
     «3. **Pulsa _Entrenar modelos_.** Compiten 11 modelos (los mismos árboles, boosting, vecinos y red neuronal de la liga, más tres rectas: lineal, Ridge y Lasso), con la misma validación cruzada y la misma regla del más simple entre empatados.»
     por
     «3. **Pulsa _Entrenar modelos_.** La liga de estimar reúne 11 modelos (los mismos árboles, boosting, vecinos y red neuronal de la liga, más tres rectas: lineal, Ridge y Lasso). Como al clasificar, primero compiten los que caben en el Nivel 1, y con menos de 500 filas la red neuronal queda «fuera» con su razón (en el ejemplo de consumo compiten 10). Misma validación cruzada y misma regla del más simple entre empatados.»
  2. `:363`, celda «Qué significa» de **Baseline**: «Las reglas simples contra las que se mide tu modelo. Al clasificar: responder siempre lo más frecuente (clase mayoritaria) y una regresión logística. Al estimar: adivinar siempre la mediana y una regresión lineal. Si tu modelo no supera a la mejor de las dos, no sirve.»
- **Verificado cuando:** `grep -n "Compiten 11" docs/MANUAL-DE-USO.md` sale vacío y la fila Baseline
  nombra la mediana.

#### AU-A-09 · Bajo · Frases caducadas en documentos internos: la guía, la bitácora y un JSDoc

- **Dónde:**
  - `docs/GUIA-DE-PRUEBA.html:127`: «liga-mediana.csv (5.000 filas: el único con Nivel 2 que correr
    y cancelar)».
  - `sprints/SPRINT_006-implementation-log.md:55`: D4, «Hoy rechaza los de regresión».
  - `src/engine/eda.ts:63-65`: «Vacío si el objetivo no es binario… Orden: fuga → id-like →
    desbalance».
- **Qué pasa:** el S6 volvió falsas las tres frases.
  - `consumo-energia-mediano.csv` también tiene Nivel 2, y la misma línea lo dice.
  - Desde la F2, los archivos de regresión se aceptan (ADR 014 §3).
  - Con un objetivo numérico, `computeEdaAlerts` devuelve `regressionAlerts` (`eda.ts:83`).
- **Evidencia / escenario:** en la guía, la frase y su contradicción están en la misma línea. El
  ADR 014:41-42 dice «From S6 Phase 2 both tasks are usable».
- **Ajuste ejecutable:**
  1. `GUIA:127`: reemplazar «(5.000 filas: el único con Nivel 2 que correr y cancelar)» por
     «(5.000 filas: el Nivel 2 que correr y cancelar al clasificar)».
  2. Bitácora `:55`: reemplazar «Hoy rechaza los de regresión; el día del S7, uno multiclase abierto
     en una versión vieja.» por «En la F1 rechazaba los de regresión; desde la F2 las dos tareas se
     aceptan. El día del S7, rechazará uno multiclase abierto en una versión vieja.».
  3. `eda.ts:63-65`: reemplazar el JSDoc por
     ```ts
     /**
      * Alertas EDA para un objetivo dado. Binaria: fuga → id-like → desbalance (vacío
      * si el objetivo no tiene dos clases). Numérica (S6): fuga continua → id-like →
      * objetivo muy sesgado → atípicos extremos.
      */
     ```
- **Verificado cuando:** `grep -n "el único con Nivel 2" docs/GUIA-DE-PRUEBA.html` y
  `grep -n "Hoy rechaza los de regresión" sprints/SPRINT_006-implementation-log.md` salen vacíos, y el
  JSDoc nombra la rama numérica.

#### AU-A-10 · Bajo · Desviaciones menores sin registrar en `## Desviación del plan`

- **Dónde:**
  - El ⭐ de la orden (`ordenes/SPRINT_006-orden.md:109-110`: «ficha de regresor») frente a la guía
    (G9 sin ⭐, `GUIA:433`; G10 con ⭐, `GUIA:438`).
  - P2 `_FACTORIES[task][id]` → `pipeline.py:412-441` (`_REGRESSORS` + `_FACTORIES_BY_TASK`).
  - El plan pedía «un combinador de unión discriminada en `validate.ts`» → `contract.ts:250-339`
    despacha por `sent.task`; `validate.ts` no cambió.
  - `TargetPlan.chosenTask` → `choice` + `resolved` (`useExperiment.ts:129-136`).
  - El arnés del spike en `scripts/spike-regresion/` en vez de `scripts/spike-liga/`.
  - Los archivos de prueba esperados `tests/unit/{leakage-continua,verdict-regresion}.test.ts` →
    `tests/unit/regresion-motor.test.ts`.
- **Qué pasa:** son decisiones razonables y parte de ellas aparece en el texto de la bitácora, pero
  no en la lista D que lee la planeadora. El cambio de ⭐ altera lo que el gate del ciclo va a juzgar.
- **Evidencia / escenario:** `grep -n "^- \*\*D" sprints/SPRINT_006-implementation-log.md` lista
  D1–D7 y ninguna de estas.
- **Ajuste ejecutable:** después de D9 (AU-A-05), agregar:

  «- **D10 · Desviaciones menores de implementación (registradas en la auditoría).**
  - El ⭐ «ficha de regresor» de la orden se cambió por G10 (el Nivel 2 al estimar en un móvil
    real): la ficha (G9) se verifica leyendo y la cubre una prueba automática
    (`regresion-ui.test.tsx` «la ficha al estimar»), y el móvil real no lo cubre ninguna
    automatización.
  - P2: `_FACTORIES` sigue siendo el roster binario (un test del S5 lo parchea por nombre), con
    `_REGRESSORS` y `_FACTORIES_BY_TASK` al lado.
  - El combinador de unión no se agregó a `validate.ts`: `contract.ts` despacha por la tarea
    enviada.
  - `chosenTask` quedó como `choice` + `resolved`.
  - El arnés del spike vive en `scripts/spike-regresion/` y reusa `spike-liga/correr.mjs`.
  - Las pruebas de fuga continua y del veredicto viven en `tests/unit/regresion-motor.test.ts`.»

- **Verificado cuando:** `grep -n "D10" sprints/SPRINT_006-implementation-log.md` da una línea.

#### AU-A-11 · Bajo · Dos `WorkerErrorKind` nuevos no tienen mensaje en `errors.*`

- **Dónde:**
  - `src/workers/protocol.ts:34-37` (`target-not-numeric`, `target-ambiguous`).
  - `messages/es.json` y `messages/en.json`: sección `errors` (`es.json:530-547`), sin esas claves.
  - Quienes los consumen: `src/components/ConfigScreen.tsx:138` y `src/components/ErrorScreen.tsx:21`.
- **Qué pasa:** si alguno de los dos llega a la UI, `translate` devuelve la clave cruda
  (`src/i18n/translate.ts:16-18`): el usuario leería «errors.target-not-numeric». Hoy no se alcanzan
  desde la UI, porque `planTarget` no llama a `prepareRun` con una ambigua sin responder y E1 usa el
  mismo `parseNumber`. Es latente, y ningún test exige un mensaje por cada kind.
- **Evidencia / escenario:** `grep -rn "target-not-numeric\|target-ambiguous" messages/` sale vacío.
- **Ajuste ejecutable:**
  1. En `messages/es.json`, dentro de `errors`, después de `"target-not-binary"` (línea 538):
     `"target-not-numeric": "Para estimar una cantidad, todos los valores del objetivo tienen que ser números. Revisa las celdas con texto en tu CSV.",`
     `"target-ambiguous": "Antes de entrenar, responde si el objetivo guarda categorías o una cantidad.",`
  2. En `messages/en.json`, en el mismo lugar:
     `"target-not-numeric": "To estimate a quantity, every value of the target has to be a number. Check the cells with text in your CSV.",`
     `"target-ambiguous": "Before training, answer whether the target holds categories or a quantity.",`
  3. Gate: crear `tests/unit/error-messages.test.ts`:
     ```ts
     import { readFileSync } from "node:fs";
     import { describe, expect, it } from "vitest";
     import en from "../../messages/en.json";
     import es from "../../messages/es.json";

     // Todo WorkerErrorKind tiene su mensaje en los dos idiomas (si no, la UI
     // mostraría la clave cruda: translate.ts devuelve la clave si falta).
     const source = readFileSync("src/workers/protocol.ts", "utf8");
     const union = source.match(/export type WorkerErrorKind =([\s\S]*?);/)![1];
     const kinds = [...union.matchAll(/\|\s*"([a-z-]+)"/g)].map((m) => m[1]);

     describe("errors.* cubre cada WorkerErrorKind", () => {
       it.each(kinds)("%s tiene mensaje en es y en", (kind) => {
         expect(
           (es.errors as Record<string, string>)[kind],
           `es: ${kind}`,
         ).toBeTruthy();
         expect(
           (en.errors as Record<string, string>)[kind],
           `en: ${kind}`,
         ).toBeTruthy();
       });
     });
     ```
     Antes de cerrar, comprobar que `kinds.length` coincide con los literales de la unión. Si algún
     kind no debe mostrarse nunca, se excluye con su razón escrita.
  4. Demo en rojo con `demo-rojo.sh`: borrar `"target-ambiguous"` de `es.json` hace fallar la prueba
     nombrándolo.
- **Verificado cuando:** la prueba pasa con todos los kinds, el rojo queda registrado y la paridad
  i18n sigue verde.

#### AU-A-12 · Bajo · Con la UI en inglés, tres unidades se muestran en español

- **Dónde:** `src/lib/experiment.ts:471-473` (`dias: "días"`, `meses: "meses"`, `anios: "años"`). Se
  muestran en `TaskCard.tsx:205`, `src/lib/quantity.ts:49`, `PredichoVsReal.tsx:47` y
  `modelcard.ts:177-178`.
- **Qué pasa:** con la UI en inglés y un objetivo `duracion_dias`, la tarjeta dice «You are going to
  estimate a quantity, in días» y las cifras «±3.2 días». Rompe la regla de bilingüe estructural. El
  resto de la tabla son símbolos neutros (kWh, USD, m²).
- **Evidencia / escenario:** `tests/unit/regresion-motor.test.ts:314` fija
  `["duracion_dias", "días"]`, y el símbolo no pasa por i18n en ningún punto.
- **Ajuste ejecutable:** es la opción mínima y neutra; no se inventa ninguna unidad.
  1. En `src/lib/experiment.ts:471-473`, reemplazar
     ```ts
       dias: "días",
       meses: "meses",
       anios: "años",
     ```
     por
     ```ts
       // Las unidades que son PALABRAS se leerían en español con la UI en inglés: los
       // días van con su símbolo neutro (d, aceptado junto al SI); meses y años no
       // tienen uno, así que no se inventa: «en las unidades de «columna»».
       dias: "d",
     ```
  2. En `tests/unit/regresion-motor.test.ts:314`, cambiar `["duracion_dias", "días"]` por
     `["duracion_dias", "d"]`, y en la línea 320 agregar `"plazo_meses"` y `"edad_anios"` a la lista
     de «sin unidad».
- **Verificado cuando:** `grep -n '"días"\|"meses"\|"años"' src/lib/experiment.ts` sale vacío y la
  prueba de `inferUnit` pasa.

#### AU-A-13 · Bajo · Tres afirmaciones imprecisas en los ADR 013 y 014

- **Dónde:**
  - `decisions/014-model-manifest-per-task.md:62-63`: «…and for a booster
    (`liga-booster-export.spec.ts`). Neither the payload nor the new CSV appears in network
    traffic.»
  - `decisions/014-model-manifest-per-task.md:49`: «The CSV column is `<target>_estimado`».
  - `decisions/013-regression-as-second-task.md:106`: «Trees, forests and kNN do not extrapolate
    beyond the training range. The fichas say so.»
  - `decisions/013-regression-as-second-task.md:45`: comillas cruzadas («…").
- **Qué pasa:**
  - `liga-booster-export.spec.ts` no inspecciona la red. Lo hacen `regresion-score.spec.ts:94-95`
    y, en binaria, `export-import-rescore.spec.ts:91-93`.
  - Con la UI en inglés, la columna es `<target>_estimate` (`messages/en.json:333`).
  - Solo las fichas de kNN y Random Forest lo dicen (`src/content/modelos.ts:423-425, 443-445`). Las
    de árbol, Extra Trees y los boosters, no.
- **Evidencia / escenario:** `grep -n "request" tests/e2e/liga-booster-export.spec.ts` sale vacío.
- **Ajuste ejecutable:**
  1. ADR 014 `:61-63`: reemplazar la oración por «**Export → reload → import → score** runs end to
     end in the production build, for a regression model (`tests/e2e/regresion-score.spec.ts`, which
     also checks that neither the model payload nor the new CSV appears in network traffic) and for
     a booster (`liga-booster-export.spec.ts`); the binary network check lives in
     `export-import-rescore.spec.ts`.».
  2. ADR 014 `:49`: «The CSV column is `<target>_estimado` (`<target>_estimate` with the English
     UI), written with the target's own decimals.».
  3. ADR 013 `:106`: «Trees, forests and kNN do not extrapolate beyond the training range; the kNN
     and Random Forest fichas say so, and the manual's known limitations say it for all of them.».
  4. ADR 013 `:45`: cerrar la cita con «»» en vez de `"`.
- **Verificado cuando:** las cuatro líneas dicen lo indicado y
  `grep -n 'referencia")' decisions/013-regression-as-second-task.md` sale vacío.

---

## Auditor B — motor, contrato, gates y dependencias

Alcance: `pipeline.py`, `src/engine/*`, `src/lib/{experiment,model-file,scored-csv,validate}.ts`,
`src/workers/{protocol,contract}.ts`, el cerrojo P7 del servidor, los scripts de gates, la CI, el
hook y `pnpm-workspace.yaml`. Fuente primaria: `git diff 6bf5e08...HEAD` (110 archivos) más lo que
entró a `main` con el #16 (`96c8896..6bf5e08`: `demo-rojo.sh`, `verificar-dependencias.mjs`,
`lighthouse-categorias.json`, `ci.yml`, `settings.json`, `pnpm-workspace.yaml`, ADR 012).

### Corridas (qué corriste y qué salió, con cifras)

| Corrida                                                                                                                                             | Resultado                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                                                                                                                                    | exit 0                                                                                                                                                                                                                                                                                                                                                                                                          |
| `pnpm lint`                                                                                                                                         | exit 0                                                                                                                                                                                                                                                                                                                                                                                                          |
| `pnpm vitest run --coverage` (mismo comando que `pnpm test`, con `--coverage.reportsDirectory` en el scratchpad para no chocar con otros auditores) | **45 archivos, 475 pruebas, todas verdes**. Cobertura total: líneas 93,91 · sentencias 92,57 · funciones 91,63 · ramas 88,14. **`src/engine/`: líneas 99,81 · sentencias 98,62 · funciones 98,17 · ramas 96,79** (> 80 %). `experiment.ts` 98,09 / 91,3 · `model-file.ts` 97,4 / 91,83 · `scored-csv.ts` 100 / 100 · `narration/templates.ts` 82,6 / 71,87. **`src/workers/contract.ts` no se mide** (AU-B-12). |
| `pnpm test:integration` (Pyodide real, local)                                                                                                       | **7 archivos, 63 pruebas, todas verdes**, 54,6 s                                                                                                                                                                                                                                                                                                                                                                |
| `gh pr checks 17`                                                                                                                                   | 6 de 6 `pass`: `quality` 1m6s · `integration` 3m27s · `e2e` 5m55s · `lighthouse` 1m52s · Vercel · Vercel Preview Comments. Corrida `37206914713` sobre **`fdac870`**. El HEAD local `c4cbfd1` (solo +14 líneas de bitácora) **no está empujado**: no tiene CI propia todavía                                                                                                                                    |
| `pnpm audit --audit-level high`                                                                                                                     | 1 alto, 1 ignorado (`braces`). `npm view braces version` = 3.0.3; `gh api /advisories/GHSA-vfj7-8cjw-p6xm` → `first_patched_version: null` (hoy, 2026-10-04)                                                                                                                                                                                                                                                    |
| Datasets                                                                                                                                            | `make-example-datasets.mjs` copiado al scratchpad y ejecutado: los 6 CSV de `public/datasets/` y `consumo-energia-mediano.csv` salen **byte a byte iguales** (`cmp`). Las copias del kit son idénticas a las públicas                                                                                                                                                                                           |
| `pipeline.py` servido                                                                                                                               | `public/pyodide/pipeline.py` no está versionado (`.gitignore`); lo copia `scripts/copy-pyodide.mjs:63` en `predev`/`prebuild` desde la fuente única. Local: `cmp` idéntico                                                                                                                                                                                                                                      |

**Sondas** (todas fuera del repo, en `scratchpad/auditoria/sondas/`). Config de vitest propia
`vitest.probe.config.mjs`: `root` = scratchpad, alias `@` → `src/` del repo, `globals`, entorno node;
se corre con `./node_modules/.bin/vitest run --config <scratchpad>/vitest.probe.config.mjs`. Las de
Pyodide reusan `tests/integration/runtime.ts` del repo.

- `contrato.probe.ts` (lector Python → TS y manifiesto) · `mezcla.probe.ts` (tareas mezcladas).
- `diminuto.probe.ts` (regresión de 3 a 8 filas por el camino real parse → sanitize → `prepareRun` → Pyodide; split con empates).
- `fuga.probe.ts` (falsa fuga continua; bordes del veredicto) · `mape.probe.ts` (ceros, negativos, notación científica, en Pyodide).
- `multi.probe.ts` (una tercera tarea en Python) · `tsc7/` (copia de `src/` para un `tsc` con `"multiclase"` en `TrainTask`).
- `demo/` (`demo-rojo.sh` contra un archivo del scratchpad) · `vdep/` (repo git temporal para `verificar-dependencias.mjs`).

Al terminar: `git status --short` vacío; no quedó `.demo-rojo/` en el repo.

### Casilla 2 — calidad (resumen de lo sondeado, incluido lo que resistió)

**Resistió:**

- **Split por bandas (P4).**
  - 200 filas: 50 a prueba, **10 por banda**.
  - Empates masivos (180 de 200 iguales): 50 a prueba, 6 de ellas con valor distinto.
  - Tres valores distintos: 16 · 18 · 16 a prueba.
  - Objetivo constante: E1 lo manda a `sin-objetivo` y nunca llega al split.
- **MAE del mejor baseline = 0.** No divide por cero (`verdict.ts:132-139`): modelo 0 → `ties`, modelo 0,1 → `loses`. `errorReductionPct` devuelve 0. El borde exacto de 1 % (99 frente a 100) da `ties`.
- **Objetivo negativo:** entrena, el MAPE sale finito y el lector acepta.
- **MAPE con ceros:** sale `null` en el modelo y en los baselines, y el lector lo acepta. Funciona, pero no tiene prueba (AU-B-14).
- **NaN e infinito en el objetivo.**
  - `parseNumber` rechaza `Infinity` y `1e400`, y `nan` es token nulo (fila filtrada).
  - Python además verifica `np.isfinite` → `contract:target` (`pipeline.py:543-544`).
- **Fuga continua.**
  - Spearman con columna constante → 0. Los NaN se filtran emparejados.
  - η² con todas las categorías raras → 0; 30 categorías × 5 filas de ruido → 0,175.
  - **Se calcula solo sobre train** (`experiment.ts:308-311`).
- **Paridad de dirección TS ↔ Python.**
  - Tripwire de texto en `roster.test.ts`, y paridad en el runtime real (`regresion.test.ts:118-131`).
  - `selectOneSe` con «menor es mejor»: el umbral suma y, en empate, gana el primero del orden en los dos lados.
- **La selección no mira el test.**
  - Python elige (`pipeline.py:791`) antes de abrir la prueba.
  - La prueba de permutación del test (`regresion.test.ts:201-222`) pasa.
  - El espía anti-fuga de la CV pasa.
- **`chooseCvK(rows, nTrain)`:** 5, o 3 desde 20.001 filas. **Costos y roster por tarea:** `Record` completos por tipo.
- **Manifiesto.**
  - El archivo real del S5 importa y puntúa idéntico (unit + integración).
  - Una regresión con métricas de clase **en lugar de** las suyas se rechaza nombrando `manifest.metrics.model.mae`.
- **CSV puntuado:** `<objetivo>_estimado` con los decimales del objetivo, y sufijo determinista si choca con otra columna.
- **Liga binaria (condición dura).**
  - Sus fixtures cambian solo por `task` y por tiempos/bytes del pickle.
  - Los tests heredados solo cambiaron anotaciones de tipo.
  - Las 49 carnadas Python → TS y las 16 del manifiesto siguen intactas.
- **Cerrojo P7 del servidor.**
  - El route está igual; el cerrojo es `z.literal("binary-classification")` (`src/lib/ia/schemas.ts:50`).
  - Lo prueba `narrate-route.test.ts:131-141`: con el proveedor «caído» daría 200 + `provider-error`, y da **400**.
- **Gates.**
  - `verificar-dependencias.mjs` falla cerrado con base ilegible, y con un degradado real (`next` 16.3.8 → 16.0.0) da exit 1.
  - El hook avisa sin `gitleaks`: test en `gitleaks-hook.test.ts`, que corre en `integration`.
  - El segundo `lhci assert` **puede fallar**: rojo demostrado con `minScore` 1.01, y corre en CI con `success` propio.

**No resistió:** AU-B-01 a AU-B-16, abajo.

### Carnadas: conteo verificado contra lo declarado (tabla)

Las carnadas se contaron una a una en el código de los tests.

| Dirección                                    | Declarado | Contado                     | Dónde                                                         |
| -------------------------------------------- | --------- | --------------------------- | ------------------------------------------------------------- |
| TS → Python (`_validate_payload`, regresión) | 8/8       | **8**                       | `tests/integration/regresion.test.ts:408-417`                 |
| Python → TS, liga de regresión               | 30/30     | **30**                      | `tests/unit/contract.test.ts:291-321`                         |
| Elección manual (regresión)                  | 5/5       | **5**                       | `contract.test.ts:347-351`                                    |
| Export (regresión)                           | 4/4       | **4**                       | `contract.test.ts:368-374`                                    |
| Puntuar (regresión)                          | 4/4       | **4**                       | `contract.test.ts:384-387`                                    |
| Manifiesto de regresión                      | 12/12     | **12**                      | `tests/unit/model-file.test.ts:431-452`                       |
| Manifiesto binario                           | 16/16     | **16**                      | `model-file.test.ts:335-353`                                  |
| Python → TS binarias                         | 49        | **49** = 27 + 6 + 5 + 6 + 5 | `contract.test.ts:79-112, 131-146, 162-166, 186-194, 200-204` |

**Cruce con la tabla de carnadas del plan.** Están todas las planeadas, salvo estas:

- **`pred_vs_real` «valores finitos»:** no hay carnada con `Infinity`/`NaN`; solo la de tipo `"1"`. Y «largo» se vigila con `≤`, no con igualdad (AU-B-05).
- **`league[].cv.mean`:** la única carnada lo borra. Falta la de **dominio**: un MAE negativo, que es lo que emitiría Python si pierde el cambio de signo (AU-B-04).
- **Manifiesto `task` desconocida:** la carnada existe, pero **fija el comportamiento contrario al ADR 014**: espera `invalid-format` donde el ADR promete `unsupported-task` (AU-B-01).
- **`winner` «como si mayor fuera mejor»:** está (`cv.best` y `winner` → el de mayor MAE). Pero solo muta `winner` aislado. La variante coherente, con el signo invertido en toda la liga, pasa (AU-B-04).

### Casilla 3 — dependencias

- **No entra ninguna dependencia nueva en el S6.** `package.json` no cambia en el diff.
- **`braces` (ADR 012):** la excepción sigue vigente. Verificado hoy: 3.0.3 es la última versión y `first_patched_version` es null.
  - La **condición de retiro está escrita** (tabla «Removal condition»).
  - El guardián `tests/unit/audit-exceptions.test.ts` exige que el ADR nombre el id y su condición de retiro.
  - El comentario de `pnpm-workspace.yaml` apunta al ADR.
- **Validadores escritos a mano en lugar de zod:** se mantiene. La razón de presupuesto (300 KB) sigue en pie, y no hay alternativa claramente superior.
- **Única alternativa claramente superior:** fijar la versión de `@lhci/cli` en CI (hoy `npm i -g @lhci/cli` sin versión; la última es 0.15.1) y verificar el checksum del tarball de gitleaks (AU-B-16).

### Casilla 5 — campos sin consumidor (tabla campo · lectores)

Los lectores se buscaron con `grep` en `src/`, fuera de la construcción del campo y de los tests.

| Tipo · campo                                                                                                                                               | Lectores (archivo:línea)                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `RegressionPipelineResult.task`                                                                                                                            | `contract.ts:268` · `useExperiment.ts:597,608`                                                                                              |
| `.target_stats.{mean,std,min,max}`                                                                                                                         | `modelcard.ts:181-187`                                                                                                                      |
| `.target_stats.median`                                                                                                                                     | `regression-text.ts:56` · `modelcard.ts:185`                                                                                                |
| `.target_stats.decimals`                                                                                                                                   | `modelcard.ts:155,187` · `useExperiment.ts:612` → `ScoreScreen.tsx:324`                                                                     |
| `.n_train` / `.n_test`                                                                                                                                     | `experiment.ts:513-514` → `ResultsScreen.tsx:105` · `LeagueTable.tsx:108` · `model-file.ts:368-369`                                         |
| `.baselines.{median,linear}.mae`                                                                                                                           | `experiment.ts:495` · `RegressionResults.tsx:129-130,228`                                                                                   |
| `.baselines.*.{rmse,r2,medae,mape}`                                                                                                                        | `modelcard.ts:149`                                                                                                                          |
| `.model.{mae,rmse,r2,medae}`                                                                                                                               | `RegressionResults.tsx:75-88` · `modelcard.ts:131-141`                                                                                      |
| `.model.mape`                                                                                                                                              | `modelcard.ts:142` (solo la model card)                                                                                                     |
| `.model_name` / `.winner`                                                                                                                                  | `experiment.ts:519,525` · `contract.ts:309-310`                                                                                             |
| `.league[].{name,status,cv.mean,cv.std,test}`                                                                                                              | `LeagueTable.tsx:65-87` y siguientes                                                                                                        |
| `.league[].error_type`                                                                                                                                     | `LeagueTable.tsx:387,399`                                                                                                                   |
| `.league[].elapsed_ms`                                                                                                                                     | `Level2Card.tsx:42` (`measuredRun`)                                                                                                         |
| `.league[].cv.folds`                                                                                                                                       | `contract.ts:296` (solo el lector; precedente aceptado en el S5)                                                                            |
| `.cv.{k,best,se,rule}`                                                                                                                                     | `LeagueTable.tsx:84,87,429-430` · `modelcard.ts`                                                                                            |
| `.cv.scoring`                                                                                                                                              | `contract.ts:285` (cruce)                                                                                                                   |
| `.elapsed_ms`                                                                                                                                              | `LeagueTable.tsx:442` · `Level2Card.tsx:42` · `modelcard.ts:270`                                                                            |
| `.pred_vs_real.{real,predicted}`                                                                                                                           | `PredichoVsReal.tsx`                                                                                                                        |
| `.pred_vs_real.n_total`                                                                                                                                    | `PredichoVsReal.tsx:250-254` · `RegressionResults.tsx:171` · `modelcard.ts:195`                                                             |
| `.residuals.{p05…p95}`                                                                                                                                     | `RegressionResults.tsx:97,196`                                                                                                              |
| `.residuals.{p25,p50,p75,abs_p90}`                                                                                                                         | `RegressionResults.tsx:110-164` · `modelcard.ts:190-193`                                                                                    |
| `.preprocessing.numeric_medians`                                                                                                                           | **solo tests** (heredado del S4, igual que en el S5)                                                                                        |
| `RegressionMemberFitResult.*`                                                                                                                              | `experiment.ts:552-562` (mismos lectores aguas abajo) · `task` → `contract.ts:354`                                                          |
| `RegressionScoreResult.{task,predictions,probabilities,novelty}`                                                                                           | `ScoreScreen.tsx:317,323-328`                                                                                                               |
| `ExportResult.schema.task`                                                                                                                                 | `model-file.ts:402,420` · `useExperiment.ts:294`                                                                                            |
| `ExportResult.schema.target_stats`                                                                                                                         | manifiesto → `ScoreScreen.tsx:324` (decimales); el conjunto entero lo coteja `import_model` (`pipeline.py:1026`)                            |
| Manifiesto de regresión: `task` · `dataset` · `schema.target`                                                                                              | `model-file.ts:159,530` · `StartScreen.tsx:276,297-298,282,309`                                                                             |
| Manifiesto: `verdict.{primaryMetric,modelScore,level}` · `model_name`                                                                                      | `StartScreen.tsx:314-324`                                                                                                                   |
| Manifiesto: `selection.{by,cv_winner,k}` · `league.length`                                                                                                 | `StartScreen.tsx:330-343`                                                                                                                   |
| Manifiesto: **`metrics.model.*` · `metrics.baselines.*` · `league[].{cv_mean,cv_std,test}` · `selection.{metric,rule}` · `verdict.{baselineScore,delta}`** | **ninguno**: solo se escriben y validan. Son documentales (la «cara legible», ADR 007), igual que en el binario. → AU-B-10                  |
| `PipelinePayload.task`                                                                                                                                     | `pipeline.py:480` · `useExperiment.ts:280` → `contract.ts:266` · `observability.ts:78`                                                      |
| `ExperimentResult` (unión, `task`)                                                                                                                         | `ResultsScreen.tsx:92-93` · `LeagueTable.tsx:57` · `useNarration.ts:94` · `modelcard.ts:212` · `model-file.ts:401` · `useExperiment.ts:306` |
| `TargetPlan.choice`                                                                                                                                        | `ConfigScreen.tsx:115`                                                                                                                      |
| `TargetPlan.resolved`                                                                                                                                      | `ConfigScreen.tsx:45,114,125` · `useExperiment.ts:356`                                                                                      |
| `TargetPlan.unit`                                                                                                                                          | `ConfigScreen.tsx:116`                                                                                                                      |
| `TargetUnit.symbol`                                                                                                                                        | `quantity.ts:49` · `TaskCard.tsx:204` · `RegressionResults.tsx:54` · `PredichoVsReal.tsx:47`                                                |
| **`TargetUnit.suffix`**                                                                                                                                    | **ninguno** (solo `experiment.ts:484` y tests). → AU-B-10                                                                                   |
| **`BASELINE_IDS_BY_TASK`** (`roster.ts:80-83`)                                                                                                             | **ninguno**. → AU-B-10                                                                                                                      |

### Casilla 7 — cardinalidad cableada

- **Qué se declara extensible.**
  - La VISION (`VISION.md:51`) declara **cuatro tareas**: binaria, multiclase, regresión y agrupar.
  - El brief (`brief.md:4,191`) agenda multiclase y agrupar para el S7.
  - El roster, las métricas y los idiomas también crecen por datos.
- **Literales: limpio.** No hay `11`, `14` ni `length === 11` en `src/`.
  - Los rosters, `COST_COEFFICIENTS`, `MEMBERS` y `FICHAS` son `Record` completos por tipo.
  - `ROSTER_BY_TASK` y `BASELINE_IDS_BY_TASK` son `Record<TrainTask, …>`.
- **El despacho por tarea no lo es.**
  - Sonda `tsc7/`: con `"multiclase"` agregado a `TrainTask`, `tsc` marca **solo `roster.ts:71` y `roster.ts:83`**.
  - Todo lo demás compila y cae en la rama binaria: costos, EDA, validador y tipo del manifiesto, `schemaTask` y `edaFor`.
  - En Python, registrar una tercera tarea en `_FACTORIES_BY_TASK` la **binariza en silencio** (sonda `multi.probe.ts`: tres clases → `task: "binaria"`, `positive_class: "c"`, matriz 2×2). → AU-B-02.
- **Lo que falla cerrado (no es hallazgo).** Los lectores de `contract.ts:266-272,353-358,471-487` exigen `task: "binaria"` dentro del validador binario, y `experiment.ts:169-179` devuelve `target-not-binary`.
- **«Dos baselines» cableados.** El motor nombra el par a mano: `experiment.ts:376-379,422-425,495-496`, `contract.ts:145,220` y `pipeline.py:800-815`. Mientras tanto, la lista de datos `BASELINE_IDS_BY_TASK` no tiene lectores. El usuario fijó el conjunto de baselines (no es una entidad que la VISION declare extensible), así que va como Bajo dentro de AU-B-10.

### Hallazgos

#### AU-B-01 · Alto · Un archivo de una tarea desconocida se rechaza como «no parece un modelo de Probeta» (el ADR 014 promete `unsupported-task` nombrándola)

- **Dónde:**
  - `src/lib/model-file.ts:311-314` (`manifestV`: todo lo que no sea `"numerica"` va a `binaryManifestV`), `:226` (`task: optional(oneOf(["binaria"]))`), `:471-472` (`task?: TrainTask` no puede llevar una tarea desconocida), `:525-533`.
  - `tests/unit/model-file.test.ts:431`: la carnada fija el comportamiento contrario.
  - `src/components/StartScreen.tsx:162-163,223` y `messages/{es,en}.json:76`: `validation.task` se descarta y el texto no nombra la tarea.
  - `decisions/014-model-manifest-per-task.md:38-43` (§3).
- **Qué pasa:**
  - `unsupported-task` solo se alcanza con una tarea **conocida** que la UI no usa.
  - Una tarea que esta versión no conoce («multiclase», «agrupar») cae en el validador binario y sale `invalid-format` con `field: "manifest.task"`. La UI dice entonces «Ese archivo no parece un modelo exportado por Probeta», y eso es falso.
  - El ADR 014 §3 dice lo opuesto: «the day S7 writes a multiclass file, an older app version rejects it by name, never with a misleading «invalid format»». La D4 de la bitácora repite la promesa.
- **Evidencia / escenario:**
  - Sonda `contrato.probe.ts` S6, con un manifiesto real de regresión y `task` cambiada:
    - `"multiclase"` → `{"ok":false,"error":"invalid-format","field":"manifest.task"}`;
    - `"agrupar"` → igual.
  - La carnada `model-file.test.ts:431` exige exactamente ese `invalid-format`.
- **Ajuste ejecutable:**
  1. `src/lib/model-file.ts`:
     - Cambiar `ModelFileValidation` (línea 472) a `task?: string`.
     - Crear `const MANIFEST_V_BY_TASK: Record<TrainTask, Validator> = { binaria: binaryManifestV, numerica: regressionManifestV };`.
     - Reemplazar `manifestV` (líneas 311-314) por `(v, path) => isRecord(v) ? MANIFEST_V_BY_TASK[(v.task ?? "binaria") as TrainTask](v, path) : path`.
     - En `validateModelFile`, **entre la línea 523 y la 525**, insertar:
       ```ts
       const manifestRaw = isRecord(raw.manifest) ? raw.manifest : null;
       const declared = manifestRaw?.task;
       if (declared !== undefined && typeof declared !== "string") {
         return { ok: false, error: "invalid-format", field: "manifest.task" };
       }
       const declaredTask = (declared as string | undefined) ?? "binaria";
       if (
         !(declaredTask in MANIFEST_V_BY_TASK) ||
         !usable.includes(declaredTask as Task)
       ) {
         return {
           ok: false,
           error: "unsupported-task",
           task: declaredTask.slice(0, 40),
         };
       }
       ```
     - Borrar el chequeo de las líneas 530-533, que queda cubierto.
  2. `tests/unit/model-file.test.ts:431`: cambiar la carnada a `(m) => (m.task = 7)`, que sigue esperando `invalid-format` en `manifest.task` (12 de 12). Agregar un `it` nuevo: `task` = `"multiclase"` y `"agrupar"` → `{ ok: false, error: "unsupported-task", task: <la misma> }`.
  3. `StartScreen.tsx:163`: guardar `task: validation.task` en `status`. En la línea 223, pasarlo a `t(…, { task })`.
  4. `messages/es.json:76`: «Ese archivo es un modelo de Probeta para «{task}», una tarea que esta versión no abre. No se cargó.»
  5. `messages/en.json:76`: «That file is a Probeta model for «{task}», a task this version doesn't open. It was not loaded.»
  6. El texto viene del archivo: React lo escapa, ya se recorta a 40 caracteres y no va a Sentry (`reportImportError` solo lleva el `kind`).
  7. **Demo en rojo** con `scripts/demo-rojo.sh`: quitar el pre-chequeo → el `it` nuevo cae («expected invalid-format to be unsupported-task»).
- **Verificado cuando:**
  - Un manifiesto con `task: "multiclase"` da `unsupported-task` con `task: "multiclase"`, y la pantalla de import nombra la tarea.
  - El ADR 014 §3 es cierto.
  - La bitácora registra la demo.

#### AU-B-02 · Alto · La tarea se despacha con ternarios «numerica ? … : binaria»: una tercera tarea compila y cae en silencio en la rama binaria (casilla 7)

- **Dónde:**
  - **TS:**
    - `src/engine/costos.ts:63-68,99` (default `"binaria"` y ternario a la tabla binaria);
    - `src/engine/eda.ts:71,82-86` (default y `if numerica … else binaria` → una multiclase devuelve `[]` y pierde los avisos id-like, R5);
    - `src/lib/model-file.ts:151-155` (`isBinaryManifest` = `task !== "numerica"`), `:157-160` y `:311-314`;
    - `src/lib/useExperiment.ts:293-295` (`schemaTask`) y `:355-357` (`edaFor`: ambigua, multiclase o sin objetivo → `"binaria"`);
    - `src/engine/roster.ts:264` (`direction = "higher"` por defecto);
    - `src/engine/encarrilador.ts:38,125` (`task?` y `?? "binaria"`).
  - **Python** (`src/lib/ds/pipeline.py`): `_prepare` (539-556), `_selected_details` (673-681), `_retain` (715-731), baselines (797-815), `task_fields` (844-852), `_test_metrics` (877-881) y `score_new_data` (956).
- **Qué pasa:**
  - La VISION declara cuatro tareas (`VISION.md:51`), y el S7 trae multiclase y agrupar.
  - Solo `ROSTER_BY_TASK` y `BASELINE_IDS_BY_TASK` obligan al compilador.
  - El resto despacha con «es numérica, si no es binaria»: una tarea nueva obtiene costos, EDA, validador de manifiesto y tipo binarios sin que nada avise.
  - En Python, la tarea nueva se binariza: la clase minoritaria contra el resto.
- **Evidencia / escenario:**
  - Sonda `tsc7/`: `TrainTask = "binaria" | "numerica" | "multiclase"` → `tsc` da errores **solo** en `src/engine/roster.ts:71` y `:83`.
  - Sonda `multi.probe.ts`: con `_FACTORIES_BY_TASK["multiclase"] = _FACTORIES`, un objetivo con clases a/b/c devuelve `{"task":"binaria","classes":["a","b","c"],"positive_class":"c","confusion":[[16,0],[7,0]]}`.
- **Ajuste ejecutable:**
  1. `costos.ts`:
     - Agregar `export const COST_COEFFICIENTS_BY_TASK = { binaria: COST_COEFFICIENTS, numerica: REGRESSION_COST_COEFFICIENTS } as const satisfies Record<TrainTask, Partial<Record<MemberId, CostCoefficients>>>;`.
     - `costCoefficients(member, task: TrainTask)` sin default. La línea 67 pasa a `const table: Partial<Record<MemberId, CostCoefficients>> = COST_COEFFICIENTS_BY_TASK[task];`.
     - `estimateMemberSeconds(member, input, task: TrainTask)` sin default. Ajustar los tests que omiten `task`.
  2. `src/engine/tarea.ts`: exportar `export function assertNever(x: never): never { throw new Error(\`tarea sin rama: ${String(x)}\`); }`.
  3. `eda.ts`:
     - Quitar el default de la línea 71.
     - Reemplazar las líneas 82-86 por `switch (task) { case "numerica": return regressionAlerts(…); case "binaria": break; default: return assertNever(task); }`.
     - Exportar una `idLikeAlerts(table, target)` (envoltura de `idLikeColumns`).
  4. `useExperiment.ts`:
     - `:294` → `return schema.task ?? "binaria";`.
     - `:356-357` → `if (!plan || !isTrainTask(plan.resolved)) return idLikeAlerts(table, target); return computeEdaAlerts(table, target, plan.resolved);`.
  5. `model-file.ts`:
     - `:154` → `return manifestTask(manifest) === "binaria";`.
     - `:311-314` → `MANIFEST_V_BY_TASK` (ver AU-B-01).
  6. `roster.ts:264`: quitar `= "higher"`.
  7. `encarrilador.ts:38`: `task: TrainTask` obligatorio, y borrar `?? "binaria"` en `:125`. `experiment.ts:218` agrega `task: "binaria"`.
  8. `pipeline.py`: en cada sitio listado, `if task == "numerica": … elif task == "binaria": … else: _contract("task")`. En `score_new_data`, `task = schema.get("task", "binaria")` con la misma forma.
  9. **Gate nuevo** en `tests/integration/regresion.test.ts`:
     - `it("una tarea registrada sin ramas propias se rechaza, no se binariza")`.
     - Dentro: `py.runPython('_FACTORIES_BY_TASK["multiclase"] = _FACTORIES\nTASK_METRICS["multiclase"] = ("accuracy",)')`, enviar un payload de tres clases y esperar `pythonContractField(...) === "task"`.
     - Restaurar en `finally` con `del _FACTORIES_BY_TASK["multiclase"]; del TASK_METRICS["multiclase"]`.
     - **Rojo:** con el código de hoy devuelve un resultado binario (la sonda).
  10. **Demo de exhaustividad TS** (registrar en la bitácora): agregar `"multiclase"` a `TrainTask` en una copia local → `pnpm typecheck` debe marcar `costos.ts`, `eda.ts`, `model-file.ts` y `useExperiment.ts` además de `roster.ts`. Revertir.
- **Verificado cuando:**
  - Ampliar `TrainTask` rompe la compilación en cada sitio de despacho.
  - El test Python nuevo pasa, y su rojo queda registrado.

#### AU-B-03 · Medio · Regresión con muy pocas filas: prueba vacía o de una fila → error genérico «Intenta de nuevo» en vez de un rechazo honesto

- **Dónde:**
  - `src/lib/experiment.ts:307-315` (no exige un mínimo de filas en la prueba);
  - `src/engine/split.ts:104-124` (con n ≤ 5, cada banda tiene una fila y aporta 0 a la prueba);
  - `src/lib/ds/pipeline.py:468-498` (no valida `test_idx`) y `:167` (R² NaN con una fila → `NaN` en el JSON);
  - `messages/{es,en}.json` `errors.too-few-rows`: el texto habla de «las dos clases».
- **Qué pasa:** hay que llegar por la ambigua (≤ 10 valores enteros) con la respuesta «Una cantidad» y un CSV de 3 a 6 filas.
  - Con 3–5 filas la prueba queda vacía y sklearn revienta.
  - Con 6, la prueba tiene una fila: `r2_score` da NaN, Python emite `NaN` y `JSON.parse` del runner falla.
  - En los dos casos la UI muestra `errors.runtime` («Ocurrió un error al procesar. Intenta de nuevo.»), y reintentar no cambia nada. La binaria lo cubre con `too-few-rows`.
- **Evidencia / escenario** (sonda `diminuto.probe.ts`, CSV `x,cat,y` con y = 1..n):
  - n = 3, 4, 5 → `prepareRun ok · test=0` → Python «ValueError: Found array with 0 sample(s) (shape=(0, 1))…».
  - n = 6 → `test=1` → «SyntaxError: Unexpected token 'N', …"r2": NaN…».
  - n = 7 → ok.
- **Ajuste ejecutable:**
  1. `src/workers/protocol.ts:43`: agregar `| "too-few-rows-quantity"`.
  2. `experiment.ts`:
     - Exportar `export const MIN_REGRESSION_TEST_ROWS = 2;`.
     - Después de la línea 307: `if (testIdx.length < MIN_REGRESSION_TEST_ROWS) return { ok: false, error: "too-few-rows-quantity" };`.
     - En la línea 315, devolver también `"too-few-rows-quantity"`.
  3. `messages/es.json` → `errors."too-few-rows-quantity"`: «Hay muy pocas filas para estimar una cantidad con honestidad: la prueba necesita al menos 2 filas que el modelo no vio al entrenar. Prueba con más filas.»
  4. `messages/en.json` → «There are too few rows to estimate a quantity honestly: the test set needs at least 2 rows the model never saw in training. Try with more rows.»
  5. `pipeline.py` `_validate_payload`, después de la línea 485: `if task == "numerica" and len(p["test_idx"]) < 2: _contract("test_idx")`.
  6. Carnada nueva en `regresion.test.ts:408-417`: `["test_idx", "train", (p) => (p.test_idx = (p.test_idx as number[]).slice(0, 1))]` → 9 de 9.
  7. Unit en `regresion-motor.test.ts` («prepareRun por tarea»):
     - 6 filas con y = 1..6 y `ambiguousChoice: "numerica"` → `{ ok: false, error: "too-few-rows-quantity" }`;
     - 7 filas → `ok` con `test_idx.length ≥ 2`.
  8. **Demo en rojo:** comentar la guarda → el unit cae.
- **Verificado cuando:**
  - La sonda con n = 3..6 da el error nuevo, en vez de Python o `runtime`.
  - La carnada `test_idx` se detecta.
  - Existen las claves ES y EN (paridad i18n en verde).

#### AU-B-04 · Medio · El lector acepta una CV de MAE con el signo sin invertir, y con ella al peor modelo como ganador

- **Dónde:**
  - `src/workers/contract.ts:86-90` (`cvScoreV`: `mean: num`, `folds: arr(num, 2)`) y `:92-100,224` (la regresión usa el mismo `cvScoreV`);
  - `tests/unit/contract.test.ts:290-322` (sin carnada de dominio);
  - emisor en `pipeline.py:607-608`.
- **Qué pasa:**
  - Si Python pierde el `sign = -1.0` pero conserva la dirección «menor es mejor», elige el mínimo de los negativos: el peor MAE.
  - TS recalcula la regla de un error estándar sobre esos mismos números, coincide y acepta.
  - El lector de producción no exige que un MAE de CV sea ≥ 0, como sí lo exige para `model.mae` y `test.mae`.
  - Hoy lo atrapa solo el emisor en integración (`regresion.test.ts:239`: `cv.mean > 0`), no la costura.
- **Evidencia / escenario:**
  - Sonda `contrato.probe.ts` S2: negar `mean` y `folds` de cada fila del fixture real, y recalcular `best`, `se`, `winner` y `model` como lo haría Python.
  - Resultado: `{"ok":true,"winner":"forest","realWinner":"linear"}`. Se acepta el modelo de mayor MAE real.
- **Ajuste ejecutable:**
  1. `contract.ts`:
     - Agregar `const errorCvScoreV = obj({ mean: nonNeg, std: refine(num, (v) => (v as number) >= 0), folds: arr(nonNeg, 2) });`.
     - Cambiar `leagueRowOf` (línea 92) a `(memberV, testV, cvV: Validator = cvScoreV)` y usar `cv: nullable(cvV)`.
     - En la línea 224: `leagueRowOf(regressionMember, regressionMetricsV, errorCvScoreV)`.
  2. `contract.test.ts`, después de la línea 302:
     - `["league[0].cv.mean", (t) => (t.league[0].cv.mean = -t.league[0].cv.mean)]`;
     - `["league[0].cv.folds[0]", (t) => (t.league[0].cv.folds[0] = -1)]`.
     - Total: 32 de 32.
  3. **Demo en rojo:** volver a `cvScoreV` → «detectó 30 de 32».
- **Verificado cuando:**
  - La sonda S2 se rechaza nombrando `league[0].cv.mean`.
  - El conteo queda en 32/32 y su demo en la bitácora.

#### AU-B-05 · Medio · `pred_vs_real`: el lector no ata `n_total` a `n_test` ni exige el largo exacto de la muestra (el fixture se recorta después de emitirlo)

- **Dónde:**
  - `src/workers/contract.ts:184-197` (solo exige `real.length ≤ min(n_total, 200)`);
  - `tests/integration/regresion.test.ts:557-561` (recorta la muestra a 5 de 50 antes de escribir el fixture);
  - `tests/fixtures/contrato/{train,fit-member}-result-regresion.json`.
  - El número se **muestra** en `RegressionResults.tsx:171` (pie de la tabla de errores), `PredichoVsReal.tsx:250-254` y `modelcard.ts:195`.
- **Qué pasa:**
  - Como el fixture llega recortado, el lector se ablandó a `≤`.
  - Una muestra truncada por el emisor, o un `n_total` que no es el tamaño de la prueba, pasa y se pinta.
  - Además falta la carnada planeada de «valores finitos».
- **Evidencia / escenario** (sonda `contrato.probe.ts`):
  - S3: `n_total = 999` con `n_test = 50` → «aceptado» (la tabla diría 999 filas de prueba);
  - S4: 3 puntos de 50 → «aceptado»;
  - S5: `fit-member` con `n_total = 12345` → «aceptado».
- **Ajuste ejecutable:**
  1. `regresion.test.ts:557-561`: borrar el recorte (son 50 puntos) y regenerar los fixtures con `CONTRATO_ACTUALIZAR=1 pnpm test:integration`.
  2. `contract.ts:194`: `p.real.length === Math.min(p.n_total, PRED_VS_REAL_MAX)`.
  3. `validateTrainResult`, después de la línea 286: `if (task === "numerica" && (r as RegressionPipelineResult).pred_vs_real.n_total !== r.n_test) return { ok: false, field: "n_test" };`.
  4. `validateMemberFit`:
     - aceptar `sent.nTest?: number`;
     - si viene y `pred_vs_real.n_total !== sent.nTest`, devolver `{ ok: false, field: "pred_vs_real.n_total" }`;
     - pasarlo desde `useExperiment.ts:307` con `current.nTest`.
  5. Carnadas nuevas en `contract.test.ts`:
     - `["n_test", (t) => (t.n_test += 1)]`;
     - `["pred_vs_real", (t) => { t.pred_vs_real.real.pop(); t.pred_vs_real.predicted.pop(); }]`;
     - `["pred_vs_real.real[0]", (t) => (t.pred_vs_real.real[0] = Infinity)]`;
     - en fit-member: `["pred_vs_real.n_total", (f) => (f.pred_vs_real.n_total += 1)]`.
  6. **Demo en rojo:** volver a `≤` → no se detecta la carnada de largo.
- **Verificado cuando:**
  - Las sondas S3, S4 y S5 se rechazan nombrando el campo.
  - Los fixtures llevan la muestra completa.
  - Los conteos se actualizan en la bitácora.

#### AU-B-06 · Medio · Fuga continua: una columna casi vacía da falsa alarma y reemplaza el veredicto por «sospechoso»

- **Dónde:**
  - `src/engine/leakage.ts:205-226` (único piso: 3 pares) y `:277-294`;
  - el titular se reemplaza en `src/components/RegressionResults.tsx:39-45`.
- **Qué pasa:**
  - Con 3 a 5 valores no nulos en train, un |Spearman| = 1 sale por azar con alta probabilidad.
  - `sanitize` no descarta columnas casi vacías.
  - El hallazgo de fuga cambia el titular del veredicto a «sospechoso» y nombra la columna.
  - La binaria (`rankAuc`) tiene el mismo patrón; es heredado, fuera de este alcance.
- **Evidencia / escenario:**
  - Sonda `fuga.probe.ts`: una columna de puro ruido con k celdas no nulas, sobre 150 filas de train y 2.000 repeticiones.
  - Tasa de falsa fuga: k = 3 → **30,3 %** · k = 4 → **9,6 %** · k = 5 → **2,0 %** · k = 8 → 0 %.
- **Ajuste ejecutable:**
  1. `leakage.ts`: `export const LEAKAGE_MIN_PAIRS = 10;`.
     - El valor es un umbral nuevo y **lo confirma el usuario**, como `ETA_MIN_SUPPORT` en la D6.
     - Con 10 pares independientes, P(|ρ| ≥ 0,98) es menor que 1e-5.
  2. En `detectLeakageContinuous`, después de las líneas 286 y 303: `if (values.length < LEAKAGE_MIN_PAIRS) continue;`.
  3. Unit en `regresion-motor.test.ts` («fuga con objetivo continuo»):
     - una columna con 4 valores no nulos, ordenados igual que el objetivo, y el resto nulos → `[]`;
     - una con 10 pares iguales al objetivo → hallazgo.
  4. **Demo en rojo:** `LEAKAGE_MIN_PAIRS = 3` → el primer caso cae.
- **Verificado cuando:**
  - La sonda da 0 % para k = 3..5.
  - El umbral queda aprobado y registrado en la bitácora.

#### AU-B-07 · Medio · `demo-rojo.sh` da por «rojo» un gate que no corrió, y deja la mutación viva si se interrumpe

- **Dónde:** `scripts/demo-rojo.sh`:
  - `:66-70`: cualquier salida ≠ 0 cuenta como rojo, también un 127 «command not found» o un servidor que no arrancó (K-S6-5);
  - `:36-48,72`: sin `trap`; restaura solo por el camino normal;
  - `:75-78`: `--esperar-verde` acepta una corrida de 0 pruebas (K-S6-4).
- **Qué pasa:** el instrumento que certifica las 28 demos del sprint puede certificar un rojo que no vino de la aserción. Si se corta, la mutación queda en el árbol de trabajo.
- **Evidencia / escenario** (sonda en `scratchpad/auditoria/sondas/demo/`, archivo fuera del repo):
  - (a) `--gate 'pnpm vitets run …'` (mal escrito) → «✓ el gate falló con la mutación».
  - (b) SIGTERM a mitad del gate → el archivo queda `const UMBRAL = 0.5;` (mutado), y la copia se queda en `.respaldo/`.
- **Ajuste ejecutable:**
  1. Después de la línea 38: `trap 'restaurar; exit 130' INT TERM`. Después de la línea 72: `trap - INT TERM`.
  2. Flag nuevo `--debe-nombrar '<texto>'` (parseo en las líneas 20-27). Reemplazar las líneas 66-69 por:
     ```bash
     salida=$(bash -c "$gate" 2>&1); rc=$?; printf '%s\n' "$salida"
     if [ $rc -eq 0 ]; then echo "demo-rojo: ✗ EL GATE PASÓ CON LA MUTACIÓN — …" >&2; restaurar; exit 1; fi
     if [ $rc -eq 126 ] || [ $rc -eq 127 ]; then echo "demo-rojo: ✗ el gate no corrió (exit $rc)" >&2; restaurar; exit 1; fi
     if [ -n "$debe" ] && ! printf '%s' "$salida" | grep -qF -- "$debe"; then echo "demo-rojo: ✗ el gate falló, pero no nombró '$debe'" >&2; restaurar; exit 1; fi
     ```
  3. En `--esperar-verde`: si se pasa `--minimo-tests N`, exigir en la salida `Tests +([0-9]+) passed` con valor ≥ N.
  4. **Demo de la demo:** repetir las dos sondas → exit 1 con el archivo intacto (`cmp`). Registrar en la bitácora; ya está propuesto al kit en K-S6-4 y K-S6-5.
- **Verificado cuando:**
  - Las sondas (a) y (b) salen con 1.
  - El archivo queda idéntico al original.

#### AU-B-08 · Medio · `verificar-dependencias.mjs` da verde si no reconoce el formato del lockfile del PR

- **Dónde:** `scripts/verificar-dependencias.mjs`:
  - `:29-43`: el parser depende de la sangría y de una regex;
  - `:50-52`: un paquete que «no aparece» cuenta como quitado a propósito;
  - `:62`.
- **Qué pasa:**
  - Si cambia el formato del lockfile (por ejemplo, un PR que sube pnpm de versión mayor), los nombres dejan de coincidir.
  - Cada paquete de `main` pasa por «quitado a propósito» y el gate sale verde sin haber comparado nada.
  - Falla cerrado ante una base ilegible, pero no ante un lockfile ilegible.
- **Evidencia / escenario** (sonda en un repo git temporal):
  - Base = `pnpm-lock.yaml` real; PR = el mismo con sangría de 4 y **todas** las versiones bajadas a 0.0.1 → «✓ verificar-dependencias: 400 paquetes, ninguno por debajo de base», exit 0.
  - Control: con la sangría original, `next` 16.3.8 → 16.0.0 da exit 1.
- **Ajuste ejecutable:**
  1. Después de la línea 48:
     ```js
     const ver = (t) =>
       (t.match(/^lockfileVersion:\s*'?([^'\n]+)'?/m) ?? [])[1];
     if (ver(lockBase) !== ver(lockPR)) {
       console.error(
         `✗ verificar-dependencias: lockfileVersion ${ver(lockBase)} (${base}) ≠ ${ver(lockPR)} (este árbol). No sé comparar formatos distintos: compara a mano y registra la decisión.`,
       );
       process.exit(1);
     }
     const faltan = [...enBase.keys()].filter((n) => !enPR.has(n));
     if (enPR.size === 0 || faltan.length > Math.max(5, enBase.size * 0.2)) {
       console.error(
         `✗ verificar-dependencias: ${faltan.length} de ${enBase.size} paquetes de ${base} no aparecen en este lockfile. Un gate que no puede comparar no está verde.`,
       );
       process.exit(1);
     }
     ```
  2. **Demo en rojo:** la sonda de la sangría → exit 1.
  3. Proponer el cambio al kit (es su script).
- **Verificado cuando:**
  - La sonda sale con 1.
  - El lockfile real sigue en «675 paquetes, ninguno por debajo».

#### AU-B-09 · Bajo · `target-not-numeric` y `target-ambiguous` no tienen texto en i18n ni prueba

- **Dónde:**
  - `src/workers/protocol.ts:35-37`;
  - `src/lib/experiment.ts:168,298-300`;
  - `messages/{es,en}.json` → `errors` tiene 17 claves y faltan estas dos;
  - se pintan con ``t(`errors.${kind}`)`` en `ErrorScreen.tsx:21` y `ConfigScreen.tsx:138`.
- **Qué pasa:**
  - Hoy no se alcanzan desde la UI: E1 garantiza que el objetivo es numérico, y el botón queda inhabilitado con la ambigua sin responder.
  - Si se alcanzan, la UI pinta la clave cruda `errors.target-not-numeric`.
  - Ninguna prueba pasa por `target-not-numeric`.
- **Evidencia / escenario:** `node -e` sobre `messages/es.json` lista las claves de `errors`, sin estas dos. `grep target-not-numeric tests/` está vacío.
- **Ajuste ejecutable:**
  1. `messages/es.json` → `errors`:
     - `"target-not-numeric"`: «Elegiste estimar una cantidad, pero la columna objetivo trae valores que no son números. Revisa esa columna o elige otra.»
     - `"target-ambiguous"`: «Antes de entrenar, responde si la columna objetivo guarda categorías o una cantidad.»
  2. `messages/en.json`:
     - «You chose to estimate a quantity, but the target column has values that are not numbers. Check that column or pick another.»
     - «Before training, answer whether the target column holds categories or a quantity.»
  3. `tests/unit/i18n-errors.test.ts` nuevo:
     - `const KINDS = [/* todas */] as const satisfies readonly WorkerErrorKind[];`;
     - el chequeo de tipo `type Faltan = Exclude<WorkerErrorKind, (typeof KINDS)[number]>; const exhaustivo: [Faltan] extends [never] ? true : never = true;`;
     - y que cada `kind` tenga texto en ES y en EN.
  4. **Demo en rojo:** borrar una clave → el test la nombra.
- **Verificado cuando:** el test pasa, y sin una de las claves cae nombrándola.

#### AU-B-10 · Bajo · Campos y constantes sin consumidor (casilla 5), y los baselines nombrados a mano

- **Dónde:**
  - `TargetUnit.suffix` (`protocol.ts:315`, se construye en `experiment.ts:484`): sin lector.
  - `BASELINE_IDS_BY_TASK` (`roster.ts:80-83`): sin lector, mientras el par se escribe a mano en `experiment.ts:376-379,422-425,495-496`.
  - Manifiesto de regresión (`model-file.ts:127-147`): `metrics.*`, `league[].{cv_mean,cv_std,test}`, `selection.{metric,rule}` y `verdict.{baselineScore,delta}` se escriben y validan, pero nadie los lee.
- **Qué pasa:** son datos que viajan o se declaran sin lector. Los del manifiesto son documentales («cara legible», ADR 007), pero el ADR 014 no lo dice.
- **Evidencia / escenario:** la tabla de la casilla 5 (`grep` en `src/`).
- **Ajuste ejecutable:**
  1. Quitar `suffix` de `TargetUnit`; `inferUnit` devuelve `{ symbol }`. Ajustar `tests/unit/{regresion-ui,league-ui}.test.tsx`.
  2. `experiment.ts:492-497`:
     ```ts
     const ids = BASELINE_IDS_BY_TASK.numerica;
     const scored = ids.map((id) => baselines[id]);
     return ids[scored.indexOf(pickBestBaseline(scored, "mae"))]!;
     ```
     Mismo patrón en `:376-379` y `:422-425` con `BASELINE_IDS_BY_TASK.binaria`.
  3. ADR 014, Decision §2: agregar «The regression manifest's `metrics`, `league` rows, `selection.metric/rule` and the verdict deltas are documentary (ADR 007's human face); the import reads `task`, `schema`, `dataset`, `verdict.level/modelScore`, `model_name` and `selection.by/cv_winner/k`.»
- **Verificado cuando:**
  - `grep -rn "\.suffix" src` está vacío.
  - `BASELINE_IDS_BY_TASK` tiene lectores.
  - El ADR lo declara.

#### AU-B-11 · Bajo · El ADR 014 dice que cada forma es «cerrada» y que la regresión «rechaza las métricas de clase», pero el lector tolera claves extra

- **Dónde:**
  - `decisions/014-model-manifest-per-task.md:27,29`;
  - la política vive en `src/lib/validate.ts:9-10`;
  - `model-file.ts:267-308`.
- **Qué pasa:** la regresión rechaza las métricas de clase solo si **reemplazan** a las suyas. Si vienen **además**, se aceptan. El ADR afirma más de lo que el código hace.
- **Evidencia / escenario** (sonda `mezcla.probe.ts`):
  - Manifiesto `numerica` con `accuracy` y `auc` en `metrics.model`, `positive_rate` y `schema.classes` → `ok: true`.
  - El resultado de la liga, el export y la puntuación de regresión con campos binarios extra también se aceptan.
  - Una mezcla en `schema` la atrapa después Python (`schema-mismatch`).
- **Ajuste ejecutable:** reescribir el §2 del ADR 014:
  - «The validator dispatches on `task`; each shape requires its own fields. Extra keys are tolerated, as every reader does since S5 (`validate.ts`). Regression requires none of the class fields and never reads them.»
  - Cambiar «rejects class metrics» por «requires the regression metrics (a class-metrics block in their place is rejected)».
- **Verificado cuando:** el texto del ADR coincide con la sonda.

#### AU-B-12 · Bajo · `src/workers/contract.ts` (el lector del contrato) queda fuera de la medición de cobertura

- **Dónde:** `vitest.config.ts:19-23` (`coverage.include` sin `src/workers/`) y `:24-58` (umbrales).
- **Qué pasa:** el lector Python → TS es una garantía del sprint y no se mide. `model-file.ts` y `scored-csv.ts` sí tienen umbral de 80.
- **Evidencia / escenario:** la tabla de cobertura no lista `src/workers/contract.ts` («no medido» en `coverage-summary.json`).
- **Ajuste ejecutable:**
  1. Agregar `"src/workers/**/*.ts"` a `coverage.include`.
  2. Agregar el umbral `"src/workers/contract.ts": { lines: 80, functions: 80, branches: 80, statements: 80 }`.
  3. **Demo en rojo:** umbral de líneas 101 → `pnpm test` cae nombrando `contract.ts`.
- **Verificado cuando:** `contract.ts` aparece en el reporte con su umbral.

#### AU-B-13 · Bajo · Una sola celda del objetivo en notación científica fija 6 decimales para todas las estimaciones

- **Dónde:**
  - `src/lib/ds/pipeline.py:501-509` (`"e" in value → TARGET_DECIMALS_MAX`) y `:524` (el `max` sobre todo train);
  - se ve en `scored-csv.ts:105-111` y `modelcard.ts:155`.
- **Evidencia / escenario:** sonda `mape.probe.ts`, consumo con una celda de train escrita `1.5e2` → `decimals: 6` (antes 1). La columna `consumo_kwh_estimado` saldría con 6 decimales.
- **Ajuste ejecutable:**
  1. En `_decimals` (y `import re` arriba):
     ```python
     m = re.fullmatch(r"[+-]?\d*(?:\.(\d*))?e([+-]?\d+)", value)
     if m:
         return min(max(len(m.group(1) or "") - int(m.group(2)), 0), TARGET_DECIMALS_MAX)
     ```
  2. Test en `regresion.test.ts`, vía `pyFunction(py, "_decimals")` o un `runPython`: `"1.5e2"` → 0 · `"1.5e-3"` → 4 · `"2.25"` → 2.
  3. **Demo en rojo:** volver a la regla actual → `"1.5e2"` da 6.
- **Verificado cuando:** la sonda da `decimals: 1`.

#### AU-B-14 · Bajo · «MAPE null si hay ceros» no tiene prueba del emisor

- **Dónde:**
  - `src/lib/ds/pipeline.py:169-173`;
  - `tests/integration/regresion.test.ts`: ningún caso tiene ceros en el objetivo. `grep mape` solo encuentra literales en unit.
- **Evidencia / escenario:** sonda `mape.probe.ts`, consumo con un 0 cada 3 filas → `mape modelo: null · baselines mape: null · lector: ok`. Hoy funciona, pero nada lo vigila.
- **Ajuste ejecutable:**
  1. Agregar a `regresion.test.ts` el `it("un objetivo con ceros en la prueba ⇒ MAPE null en el modelo y los baselines")`.
     - Usar consumo con `consumo_kwh = "0"` cada 3 filas y roster `["linear","hgb"]`.
     - Afirmar `model.mape === null`, `baselines.median.mape === null` y `validateTrainResult(...).ok`.
  2. **Demo en rojo:** `bool(np.any(y_true == 0))` → `False` hace que sklearn devuelva un MAPE finito enorme, y el test cae.
- **Verificado cuando:** el test existe, pasa y su rojo queda registrado.

#### AU-B-15 · Bajo · El CSV puntuado no tiene protección contra inyección de fórmulas (backlog del S4 nunca pagado ni declarado)

- **Dónde:**
  - `src/lib/scored-csv.ts:41-43` (`escapeField` solo pone comillas) y `:77-87`;
  - el origen está en `sprints/SPRINT_004-implementation-log.md:254` («formula injection en CSV puntuado»), y no aparece como deuda en ningún summary.
- **Qué pasa:**
  - Las celdas del usuario y las etiquetas predichas se copian tal cual. Una celda `=HYPERLINK(…)` o `@SUM(…)` se ejecuta al abrir la descarga en una hoja de cálculo.
  - La columna nueva del S6 es numérica y no suma riesgo; el hueco es heredado.
  - El brief pedía verificar que la protección «siguiera»: no existe.
- **Evidencia / escenario:** `grep -rniE "formula|fórmula|inyecci" src` → nada en `scored-csv.ts`.
- **Ajuste ejecutable:**
  1. `scored-csv.ts`: agregar `const neutralize = (v: string) => (/^[=+\-@\t\r]/.test(v) && parseNumber(v) === null ? \`'${v}\` : v);`(importa`parseNumber`de`@/lib/ds/csv`).
  2. Aplicarla a cada celda y a cada encabezado antes de `escapeField` (líneas 75 y 85). Un número negativo como `-12.5` no se toca.
  3. Test en el unit del CSV puntuado: `"=1+1"` → `"'=1+1"` · `"-12.5"` igual · encabezado `"@x"` → `"'@x"`.
  4. Manual (`docs/MANUAL-DE-USO.md`, sección de puntuar): «Si una celda empieza con =, +, - o @ y no es un número, el archivo descargado la escribe con un apóstrofo delante para que la hoja de cálculo no la ejecute como fórmula.»
  5. **Demo en rojo:** quitar `neutralize` → el test cae.
- **Verificado cuando:** el test pasa, el manual lo dice y la bitácora registra la demo.

#### AU-B-16 · Bajo · La CI instala herramientas sin fijar versión ni checksum (casilla 3)

- **Dónde:** `.github/workflows/ci.yml:110` (`npm i -g @lhci/cli`, sin versión) y `:19-21` (el tarball de gitleaks se baja sin verificar su sha256).
- **Qué pasa:** el job `lighthouse` usa la última versión de LHCI que publique npm ese día. Un cambio de flags rompería o alteraría el gate sin ningún cambio en el repo. El binario de gitleaks no se verifica.
- **Evidencia / escenario:** el log de la corrida `37206914713` muestra `npm i -g @lhci/cli` → «added 330 packages». `npm view @lhci/cli version` = 0.15.1.
- **Ajuste ejecutable:**
  1. `ci.yml:110`: `npm i -g @lhci/cli@0.15.1`.
  2. `ci.yml:19-20`:
     - bajar también `gitleaks_8.30.1_checksums.txt` del mismo release;
     - verificar con `grep linux_x64.tar.gz gitleaks_8.30.1_checksums.txt | sha256sum -c -` antes de `tar -xz`.
  3. Primera corrida en el PR: `gh pr checks` con `quality` y `lighthouse` en `success` propio.
- **Verificado cuando:**
  - Las dos líneas están fijadas.
  - La CI pasa.
  - Un checksum alterado a mano (demo local) hace fallar el paso.

---

## Auditor C — UI, hook, i18n, a11y y privacidad del cliente

Alcance: casillas 2 (calidad) y 5 (campos sin consumidor) sobre la UI, el hook, i18n, a11y, la
privacidad del cliente y los tests de UI del Sprint 006. Fuente primaria: `git diff 6bf5e08...HEAD`
(rama `sprint-006/estimar`, HEAD `c4cbfd1`, PR #17). Solo lectura: árbol limpio al terminar.

### Corridas (qué corriste y qué salió)

- **Vitest, archivos concretos y sin cobertura:** `regresion-ui`, `league-ui`, `score-screen`,
  `modelos`, `observability` y `use-hooks`. Resultado: **6 archivos, 108/108 ✓**.
- **Cuatro sondas propias**, en `scratchpad/auditoria/sondas/`, con una config de vitest fuera del
  repo (`vitest.sonda.config.mjs`) que importa desde el repo:
  1. **`formato.sonda.test.ts`** (`quantity.ts` y `scatter.ts`):
     - `formatQuantity(-0.004, 1)` da **`"-0.0"`**.
     - `quantityDecimals([1e-9])` da 6 (el tope); con `[NaN, Infinity]` da 0.
     - `errorReductionPct(10, 0)` da 0.
     - `scatterDomain` con todos los puntos iguales da `[3.92, 6.08]`; con la lista vacía, `[0, 1]`.
     - `niceTicks(4, 4)` da `[4]`; `niceTicks(-50, -10)` da `[-50 … -10]`.
     - `niceTicks(1e15, 1e15+10)` repite seis veces el mismo valor (límite de 12 cifras; irrelevante).
     - `insideBandShare` con MAE 0 y con la lista vacía: correcto.
  2. **`ui.sonda.test.tsx`** (cuatro comprobaciones):
     - Se pasó el `<svg>` del gráfico por `htmlTreeAsString` de `@sentry/browser-utils@10.75.3`
       (la función con que Sentry arma el breadcrumb `ui.click`). Sale
       `svg.h-auto.w-full.max-w-md[aria-label="Gráfico de dispersión … ±33.5 kWh de su valor real."]`,
       y **`scrubSentryEvent` lo deja pasar intacto**. Con la barra de importancia sale
       `div…[aria-label="Importancia de ocupantes: 61.100"]`.
     - En TaskCard, al responder con el foco en «Una cantidad», `document.activeElement` pasa a
       **`BODY`**. Lo mismo ocurre al pulsar «Cambiar la respuesta».
     - En RegressionDetail, con `p50 = -0.004` se lee **«El error mediano es -0.0 kWh»**.
     - En la model card del ejemplo empaquetado: **«escrito con 1 decimales»** /
       «written with 1 decimals».
  3. **`hook.sonda.test.tsx`** (la máquina de estados):
     - Recorrido: ambigua → «cantidad» → liga → Nivel 2 → cancelar. El Nivel 2 envía
       `task: "numerica"` (conserva la respuesta). Al cancelar, `level2` queda `cancelled` y el
       resultado sigue siendo de regresión.
     - Importar un modelo binario después de uno de regresión: el puntaje se valida como binario
       (`scored`).
     - La lineal gana y queda a menos del 1 % de la **mediana**: `linearTie: true`, con un titular
       que no nombra a la mediana.
  4. **`fichas.sonda.test.ts`** (las fichas al estimar): la regex de clasificación propuesta para
     el gate de AU-C-04 detecta exactamente `knn.what` y `forest.what`, en ES y EN, y nada más.
- **Contraste estimado con los tokens de `src/app/globals.css`** (fórmula WCAG, mezcla alfa sobre
  `surface`; claro / oscuro):
  - **Bordes punteados `accent/60`: 2.68 / 2.93 (bajo 3:1).**
  - Relleno de la franja `accent/10`: 1.16 / 1.15.
  - Disco `accent`: 6.07 / 5.88. Anillo `caution`: 5.92 / 7.18.
  - «★ Sugerida» sobre `accent/5`: 5.65 / 5.51.
  - Línea de IA (`ink-muted` sobre `sunken`): 5.55 / 6.34.
- **i18n por script:**
  - 0 claves que estén solo en ES o solo en EN, y 0 diferencias de placeholders entre idiomas.
  - Las claves nuevas del S6 tienen todas un lector (literal o por prefijo dinámico).
  - La clave retirada (`modelcard.limits.binary`) no tiene usos.
  - Faltan `errors.target-not-numeric` y `errors.target-ambiguous` (AU-C-07).
- **CI:** `gh pr checks 17` en `c4cbfd1`: `quality`, `integration`, `e2e`, `lighthouse`, Vercel y
  Vercel Preview Comments, todos `pass`.
- **No corrí** build, Playwright, cobertura ni la suite completa. Para los e2e cito la CI.
- `git status --short` quedó vacío.

### Lo que resistió (resumen de lo sondeado sin hallazgo)

- **Hook (`useExperiment.ts`):**
  - **La respuesta de la ambigua no queda pegada:** `selectTarget` reinicia `choiceRef` (:883);
    `reset` también (:1197).
  - **`run` y `runLevel2` usan la respuesta** (:919-921, :1007-1011). Sonda: el Nivel 2 de una
    ambigua respondida envía `numerica`.
  - **Cancelar el Nivel 2** restaura el Nivel 1 de regresión y registra `task` (:1076-1084).
  - **Elegir a mano en regresión** pasa por `applyFit` con `current.task` (:301-316), y la selección
    queda `user` (test :497-499).
  - **Un puntaje que no es de la tarea del modelo se rechaza:** se valida con `pending.task`
    (:678-681); hay test con un puntaje binario para un modelo que estima. Importar un binario
    después de uno de regresión valida como binario (sonda).
  - **Exportar al estimar:** lo recorre el e2e `regresion-score` (exporta, recarga, importa y
    puntúa).
- **Cifras y gráfico:**
  - Negativos, 0, valores enormes y diminutos se formatean bien (tope de 6 decimales).
  - **NaN o Infinity no pueden llegar al SVG:** `num` exige valores finitos y `arr(num, 1)` exige al
    menos un punto (`validate.ts:19`, `contract.ts:184-197`).
  - `errorReductionPct(·, 0)` solo se usa en «supera», que es imposible con un baseline de error 0.
  - El dominio degenerado y el gráfico con un solo punto están cubiertos (`scatter.ts:5-17`).
- **Honestidad:**
  - **«NO supera» no se tapa** cuando la lineal pierde contra la mediana (test :166).
  - **La columna de prueba está rotulada** «Prueba · MAE · no sirve para elegir», con su
    advertencia.
  - **La model card registra «◆ Elegido por ti»** en «Selección del modelo», y usa el mismo
    `regressionVerdictText` que la pantalla.
  - **La plantilla de regresión** sale de los mismos números con los mismos decimales.
- **P7 (la IA no narra regresión):**
  - `useNarration` no arma payload, el efecto sale antes (:123) y no hay botón.
  - El único `fetch("/api/narrate")` de `src/` es `useNarration.ts:132`.
  - **No encontré ningún camino** (botón, efecto o reintento) que llame al route con un resultado
    de regresión.
- **Privacidad:**
  - `recordLeagueRun` tiene forma cerrada y solo agrega `task`.
  - Los `report*` llevan rutas de campos de la app: `dict` escribe «*» (`validate.ts:66-76`) y los
    campos de Python son nombres de la app (`pipeline.py:471-498`).
  - Los `console.*` son locales, y la limpieza descarta sus breadcrumbs.
  - La unidad no se registra en ningún sitio.
  - El único escape está en AU-C-01.
- **a11y:**
  - **Disco frente a anillo:** se distinguen por forma, no solo por color.
  - **Marcas con símbolo y texto:** «▼ menor es mejor», «★ Sugerida» y el ★ del ganador.
  - **Objetivos táctiles:** ≥ 44 px (`min-h-11`).
  - **Iconos de trazo** a la izquierda en los botones nuevos (`ruler`, `tag`, `retry`).
  - **Nombres accesibles:** el gráfico es `role="img"` con nombre; la pregunta es un `role="group"`
    con nombre; la tabla de residuos tiene `<caption>` y `th scope`.
  - **Movimiento reducido:** `motion-reduce:transition-none` en las respuestas, medido en el e2e.
- **i18n:**
  - Paridad con test (`i18n-parity.test.ts`).
  - Cero copy cableado en los componentes del diff.
  - Las piezas binarias se reemplazan al estimar: `score.noProbabilities`, la distribución por
    etiqueta, `results.testNote`, la tarjeta de IA y las secciones de la model card.
- **Dos rutas inalcanzables:**
  - `too-few-rows` habla de «dos clases», pero no se alcanza al estimar: `k = min(5, n_train) ≥ 2`
    desde 3 filas.
  - `target-not-numeric` no se alcanza: `parseNumber` es el mismo en E1 y en `prepareRegression`
    (ver AU-C-07).

### Casilla 5 en la UI (tabla campo · lectores)

Lectores de producción fuera de la propia construcción y de los tests, contados con `grep -rnE`.

| Tipo               | Campo nuevo o ampliado en el S6                                                      | Lectores de producción (archivo × apariciones)                                                                                                                          | ¿Huérfano?       |
| ------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `TargetPlan`       | `choice`                                                                             | `ConfigScreen.tsx` ×1 (→ `TaskCard`)                                                                                                                                    | No               |
| `TargetPlan`       | `resolved`                                                                           | `ConfigScreen.tsx` ×3 (entrenable, EdaBlock y TaskCard) · `useExperiment.ts` ×1 (`edaFor`)                                                                              | No               |
| `TargetPlan`       | `unit`                                                                               | `ConfigScreen.tsx` ×1 (→ `TaskCard`, «en kWh»)                                                                                                                          | No               |
| `TargetUnit`       | `symbol`                                                                             | `PredichoVsReal` ×1 · `RegressionResults` ×1 · `TaskCard` ×2 · `modelcard.ts` ×2 · `quantity.ts` ×1                                                                     | No               |
| `TargetUnit`       | **`suffix`**                                                                         | **0** (solo lo escribe `inferUnit`; lo leen solo tests)                                                                                                                 | **Sí → AU-C-15** |
| `ModelMeta`        | `schema.task`                                                                        | `ScoreScreen.tsx` ×5 · `useExperiment.ts` ×1 (`schemaTask`) · `model-file.ts` ×2                                                                                        | No               |
| `ModelMeta`        | `schema.target_stats`                                                                | `ScoreScreen.tsx` ×1 (`.decimals`). Media, desviación, mínimo, máximo y mediana se leen vía `RegressionResult.targetStats` (`modelcard.ts` ×9, `regression-text.ts` ×1) | No               |
| `ScoringState`     | `scored.score` (unión con `task`)                                                    | `ScoreScreen.tsx` (`score.task`, `predictions`) ×5                                                                                                                      | No               |
| `ExperimentState`  | sin campos nuevos; `edaAlerts` suma `target-skewed{skew}` y `target-outliers{share}` | `ConfigScreen.tsx` ×2 · `narration/templates.ts` ×2                                                                                                                     | No               |
| `Pending.score`    | `task`                                                                               | `useExperiment.ts` ×1 (:679)                                                                                                                                            | No               |
| `useNarration`     | `aiAvailable`                                                                        | `ResultsScreen.tsx` ×2 → `WhySection.tsx` ×3                                                                                                                            | No               |
| `RegressionResult` | `predVsReal` · `residuals` · `targetStats` · `unit` · `model.mape`                   | `RegressionResults` ×3/×19 · `modelcard` ×1/×6/×9 · `regression-text` ×1. `mape` solo en `modelcard.ts` ×1 (por diseño: la pantalla muestra MAE, RMSE, R² y MedAE)      | No               |

**Conteo: 1 campo huérfano (`TargetUnit.suffix`) de 13 filas revisadas.**

### Hallazgos

#### AU-C-01 · Crítico · El breadcrumb de clic de Sentry copia el `aria-label` del gráfico (MAE en unidades) y de las barras de importancia (nombre de columna), y la limpieza lo deja pasar

- **Dónde:**
  - `src/lib/sentry-scrub.ts:20-28`: lista de prohibidos `console, fetch, xhr, http`; `ui.click`
    queda fuera de ella.
  - `src/components/PredichoVsReal.tsx:59-64`: `aria-label` con `mae: maeText`.
  - `src/components/WhySection.tsx:92-96`: `aria-label` con `feature.name` y la importancia, que
    al estimar está en unidades del objetivo.
  - `instrumentation-client.ts:8,14-21`: Sentry con las integraciones por defecto (`dom: true`).
  - `tests/unit/sentry-scrub.test.ts:27-41`: no prueba `ui.*`.
- **Qué pasa:**
  - La integración por defecto `breadcrumbsIntegration` registra cada clic como breadcrumb
    `ui.click`. Su mensaje es `htmlTreeAsString(target)`, que copia los atributos
    `aria-label`, `type`, `name`, `title` y `alt` (`@sentry/browser-utils@10.75.3/build/esm/htmlTreeAsString.js`).
  - El gráfico nuevo del S6 lleva en su `aria-label` el MAE del modelo en unidades del objetivo.
    Las barras de importancia llevan el nombre de la columna del usuario y su importancia, que al
    estimar es un aumento de MAE en unidades.
  - `scrubSentryEvent` solo descarta `console`, `fetch`, `xhr` y `http`, así que el breadcrumb viaja
    adjunto al próximo evento que se capture: un `report*Error` o una excepción no capturada.
  - Esto contradice P6/R14 del plan y el ADR 013 §8: «These values derive from the target, so they
    live only in the browser (hard rule 2)». La regla dura 2 dice «nunca contenido ni, idealmente,
    nombres de columnas».
- **Evidencia / escenario:**
  - Probado en la sonda `ui.sonda.test.tsx`: `htmlTreeAsString(svg)` da
    `svg.h-auto.w-full.max-w-md[aria-label="Gráfico de dispersión de 2 filas de prueba: … ±33.5 kWh de su valor real."]`.
  - `scrubSentryEvent({breadcrumbs:[{category:"ui.click", message}]})` lo devuelve intacto.
  - Con la barra: `div.mt-1.h-2.rounded-sm.bg-sunken[aria-label="Importancia de ocupantes: 61.100"]`.
  - **En uso:** el usuario toca el fondo del gráfico (zona sin puntos ni líneas, así que el objetivo
    del clic es el `<svg>`) o el tramo vacío de una barra, y después ocurre cualquier error
    reportado (por ejemplo, `reportScoringError`). Sentry recibe el MAE en kWh, o el nombre de la
    columna y su importancia.
  - Requiere el DSN configurado (producción). No lo pude verificar desde aquí.
- **Ajuste ejecutable:**
  1. **`src/lib/sentry-scrub.ts`.** Reemplaza las líneas 20-28 (la constante y el `if
(event.breadcrumbs)`) por una lista de PERMITIDOS:
     ```ts
     // Solo viajan los breadcrumbs PROPIOS de la app (`probeta.*`, solo metadatos).
     // Todo breadcrumb automático se descarta: consola y red (pueden arrastrar valores)
     // y también los de la UI (`ui.click`, `ui.input`): su mensaje es el selector del
     // elemento CON su `aria-label`, y aquí hay aria-labels con cifras del objetivo (el
     // gráfico estimado frente a real: el MAE en unidades) y nombres de columna (las
     // barras de importancia). Lista de permitidos: una categoría nueva de Sentry nace fuera.
     const APP_BREADCRUMB = /^probeta\./;

     export function scrubSentryEvent<E extends ScrubbableEvent>(event: E): E {
       delete event.request;
       if (event.breadcrumbs) {
         event.breadcrumbs = event.breadcrumbs.filter((b) =>
           APP_BREADCRUMB.test(b.category ?? ""),
         );
       }
     ```
     Deja igual la línea que reemplaza el valor de la excepción. Actualiza el comentario de
     cabecera (:8-9): «breadcrumbs automáticos (consola, red y UI): fuera; solo quedan los
     `probeta.*`».
  2. **`instrumentation-client.ts:8`.** El comentario pasa a: «beforeSend elimina `request`, todo
     breadcrumb que no sea de la app (`probeta.*`: consola, red y clics, cuyo selector copia el
     aria-label) y el mensaje de las excepciones».
  3. **Test nuevo** en `tests/unit/sentry-scrub.test.ts`:
     ```ts
     it("descarta los breadcrumbs de la UI: su selector copia el aria-label (cifras y columnas)", () => {
       const event = scrubSentryEvent({
         breadcrumbs: [
           {
             category: "ui.click",
             message:
               'svg[aria-label="… a menos de ±33.5 kWh de su valor real."]',
           },
           {
             category: "ui.click",
             message:
               'div[aria-label="Importancia de salario_mensual: 61.100"]',
           },
           { category: "ui.input" },
           { category: "navigation" },
           { category: "probeta.league" },
         ],
       });
       expect(event.breadcrumbs).toEqual([{ category: "probeta.league" }]);
       expect(JSON.stringify(event)).not.toMatch(/33\.5|salario_mensual/);
     });
     ```
  4. **Demo en rojo** con `scripts/demo-rojo.sh`: restaura la lista de prohibidos
     `DROPPED_BREADCRUMBS` y el test cae nombrando los `ui.click`. Al revertir, verde. Se registra
     en la bitácora.
- **Verificado cuando:**
  - El test nuevo pasa, y con la lista vieja cae.
  - `grep -n "DROPPED_BREADCRUMBS" src/lib/sentry-scrub.ts` sale vacío.
  - Los tres tests previos de `sentry-scrub.test.ts` siguen verdes.

#### AU-C-02 · Alto · Al responder la pregunta ambigua, o cambiar la respuesta, el foco cae al `body` y la tarjeta nueva no se anuncia

- **Dónde:**
  - `src/components/TaskCard.tsx:43-62`: cambia de `AmbiguousQuestion` a `TaskStatus` sin manejar
    el foco.
  - `:104-108`: el botón que tenía el foco se desmonta.
  - `:164`: `role="status"`, que nace ya con su texto.
  - `:211-218`: «Cambiar la respuesta» también se desmonta.
  - `src/components/ConfigScreen.tsx:110-118`.
  - `tests/e2e/tarea-ambigua.spec.ts:27-36`: no comprueba el foco.
- **Qué pasa:**
  - Al activar «Una cantidad» o «Categorías», React desmonta el grupo y monta `TaskStatus`; el
    botón con foco desaparece y el foco cae al `body`.
  - Lo mismo ocurre al pulsar «Cambiar la respuesta».
  - Un `role="status"` que nace ya con su texto no se anuncia en muchos lectores de pantalla. El
    usuario de lector queda sin foco y sin confirmación en la decisión clave de la tarea, que el
    plan pedía «con teclado completo».
- **Evidencia / escenario:** sonda `ui.sonda.test.tsx`, con `focus()` en «Una cantidad» y luego
  `click`:
  - `document.activeElement.tagName` da `BODY`;
  - tras «Cambiar la respuesta», también `BODY`.
- **Ajuste ejecutable:**
  1. **`src/components/TaskCard.tsx`.** Importa `useEffect, useRef, useState` de `react`. En
     `TaskCard`, antes del `if`:
     ```tsx
     // Responder (o cambiar la respuesta) desmonta el control que tenía el foco: se lleva
     // a lo que aparece en su lugar, para que el teclado y el lector no se pierdan.
     const [moveFocus, setMoveFocus] = useState(false);
     const answer = onAnswer
       ? (next: AmbiguousChoice | null) => {
           setMoveFocus(true);
           onAnswer(next);
         }
       : undefined;
     ```
     Usa `answer` en lugar de `onAnswer` en la condición y en las dos ramas, y pasa
     `autoFocus={moveFocus}` a `AmbiguousQuestion` y a `TaskStatus`.
  2. **`AmbiguousQuestion`.** Suma la prop `autoFocus: boolean` y:
     ```tsx
     const firstRef = useRef<HTMLButtonElement>(null);
     useEffect(() => {
       if (autoFocus) firstRef.current?.focus();
     }, [autoFocus]);
     ```
     y en el `<button>` del map: `ref={id === CHOICES[0]!.id ? firstRef : undefined}`.
  3. **`TaskStatus`.** Suma la prop `autoFocus: boolean` y:
     ```tsx
     const headRef = useRef<HTMLParagraphElement>(null);
     useEffect(() => {
       if (autoFocus && answered) headRef.current?.focus();
     }, [autoFocus, answered]);
     ```
     y en `:180`: `<p ref={headRef} tabIndex={-1} className="font-medium">`.
  4. **`src/components/ConfigScreen.tsx:110`.** `<TaskCard key={plan.target} …>`. Elegir otra
     columna remonta la tarjeta, así que `moveFocus` vuelve a `false` y el `<select>` nunca pierde
     el foco.
  5. **Test nuevo** en `tests/unit/league-ui.test.tsx`, dentro de `describe("TaskCard (E1)")`;
     importa `useState` y `type AmbiguousChoice`:
     ```tsx
     it("responder y cambiar la respuesta: el foco va a lo que aparece", () => {
       const detection = detectTask(["1", "2", "3", "4", "5", "6", "2", "3"]);
       function Harness() {
         const [choice, setChoice] = useState<AmbiguousChoice | null>(null);
         return (
           <TaskCard
             detection={detection}
             target="ocupantes"
             resolved={choice ?? "ambigua"}
             choice={choice}
             unit={{ suffix: null, symbol: null }}
             onAnswer={setChoice}
           />
         );
       }
       ui(<Harness />);
       const answer = screen.getByRole("button", { name: /Una cantidad/ });
       answer.focus();
       fireEvent.click(answer);
       expect(document.activeElement).toHaveTextContent(
         "Respondiste: Una cantidad.",
       );
       fireEvent.click(
         screen.getByRole("button", { name: /Cambiar la respuesta/ }),
       );
       expect(document.activeElement).toBe(
         screen.getByRole("button", { name: /Una cantidad/ }),
       );
     });
     ```
     (Si AU-C-15 quita `suffix`, usa `unit={{ symbol: null }}`.)
  6. **e2e** en `tests/e2e/tarea-ambigua.spec.ts`:
     - después de `:28` suma
       `await expect(page.getByText("Respondiste: Una cantidad.")).toBeFocused();`;
     - reemplaza el `click()` de «Cambiar la respuesta» (`:34`) por
       `await page.keyboard.press("Tab"); await page.keyboard.press("Enter");`;
     - suma `await expect(question.getByRole("button", { name: /Una cantidad/ })).toBeFocused();`.
  7. **Demo en rojo:** quita el `useEffect` de `TaskStatus` y el test unit cae (el foco queda en
     `BODY`). Se registra en la bitácora.
- **Verificado cuando:**
  - Los dos tests pasan.
  - Con teclado en la preview: Enter sobre «Una cantidad» deja el foco (anillo visible) en
    «Respondiste: …».
  - Tab llega a «Cambiar la respuesta», y Enter devuelve el foco a la primera respuesta.

#### AU-C-03 · Medio · El titular de empate de la lineal aparece también cuando la lineal empata con la MEDIANA: el rival real del veredicto no se nombra

- **Dónde:**
  - `src/lib/regression-text.ts:42-45`: `linearTie` no mira cuál es el mejor baseline.
  - `:55`: `baselineId` se calcula después.
  - Lo usan la pantalla (`RegressionResults.tsx:38`) y la model card (`modelcard.ts:152`).
  - Heredado con la misma regla en la rama binaria: `src/components/ResultsScreen.tsx:264-267`
    (`logisticWon`).
- **Qué pasa:**
  - El comentario dice «la lineal … empata consigo misma». Pero la condición solo exige que gane la
    lineal, por CV, y que el nivel sea `ties`.
  - Si el mejor baseline es la **mediana** y la lineal queda a menos del 1 % de ella, sale el
    titular «La liga no encontró nada mejor que la regresión lineal de referencia», con un detalle
    que solo dice ±X de la lineal.
  - Lo que el veredicto midió, que adivinar siempre la mediana rinde igual, no se dice. Es un
    escenario típico de un dataset sin señal y objetivo simétrico: la regla de un error estándar
    elige la lineal (la más simple).
  - No es falso, pero esconde al rival que decidió el veredicto.
- **Evidencia / escenario:** sonda `hook.sonda.test.tsx` con `model_name: "linear"`,
  `model.mae = 40.2` y baselines `median 40`, `linear 40.2`:
  - `verdict.level = "ties"`;
  - `regressionVerdictText` da `linearTie: true` y «Ningún modelo superó … a la regresión lineal,
    que también es el baseline. En promedio se equivoca por ±40.2 kWh. …», sin la mediana.
- **Ajuste ejecutable:**
  1. **`src/lib/regression-text.ts`.** Mueve `const baselineId =
bestRegressionBaseline(result.baselines);` (hoy `:55`) arriba de `linearTie`, y la condición
     queda:
     ```ts
     // R10: la lineal empata CONSIGO MISMA solo si el baseline que decide es la lineal. Si
     // decide la mediana, el empate es con adivinar una constante: titular normal, que la nombra.
     const linearTie =
       result.modelName === "linear" &&
       result.selection.by === "cv" &&
       verdict.level === "ties" &&
       baselineId === "linear";
     ```
  2. **Test nuevo** en `tests/unit/regresion-ui.test.tsx`, dentro de «el veredicto en unidades»:
     ```tsx
     it("la lineal gana y empata con la MEDIANA: titular normal que nombra la mediana", () => {
       const py = regressionPipelineResult({ roster: ["linear"], cv_k: 5 });
       const tie = regressionResult({
         ...py,
         model: regressionMetrics({ mae: 40.2 }),
         baselines: {
           median: regressionMetrics({ mae: 40, r2: 0 }),
           linear: regressionMetrics({ mae: 40.2 }),
         },
       });
       ui(
         <RegressionVerdict
           result={tie}
           target="consumo_kwh"
           hasLeak={false}
         />,
       );
       expect(
         screen.getByRole("heading", {
           name: "«Lineal» empata con el baseline",
         }),
       ).toBeInTheDocument();
       expect(
         screen.getByText(
           /adivinar siempre la mediana \(365 kWh\) se equivoca por ±40\.0 kWh: prácticamente lo mismo/,
         ),
       ).toBeInTheDocument();
     });
     ```
  3. **Demo en rojo:** quita `&& baselineId === "linear"` y el test cae (sale el titular de la
     lineal).
  4. **Hermana binaria, heredada del S5** (misma regla de honestidad). En `ResultsScreen.tsx:264-267`
     suma
     `&& pickBestBaseline([result.baselines.majority, result.baselines.logistic], verdict.primaryMetric) === result.baselines.logistic`,
     con `import { pickBestBaseline } from "@/engine/verdict"`. Agrega un test análogo en
     `tests/unit/league-ui.test.tsx`, junto a los dos R2 (`:483-516`): la logística gana y empata
     con la mayoritaria, y sale el titular normal «empata».
- **Verificado cuando:**
  - El test nuevo pasa.
  - El test existente «la lineal gana y EMPATA consigo misma» (`:155`) sigue verde.
  - La model card de ese caso dice «empata con el baseline» y nombra a la mediana.

#### AU-C-04 · Medio · Al estimar, las fichas de kNN y Random Forest dicen que «votan»

- **Dónde:**
  - `src/content/modelos.ts:194-197` (`knn.what`) y `:304-307` (`forest.what`).
  - `REGRESSION_FICHA_FIELDS` (`:458-475`) solo reemplaza Ridge.
  - El comentario `:455` dice «Hoy solo Ridge los tiene».
  - `FichaModelo.tsx:83-86`.
- **Qué pasa:**
  - En una liga de regresión, la ficha de kNN dice «busca las 5 filas … y **las pone a votar**», y
    la de Random Forest dice «**predice por votación**».
  - Al estimar no hay voto: hay promedio. La nota de regresión de abajo lo contradice («promedia
    …»), así que la ficha dice dos cosas opuestas.
  - Es exactamente lo que el comentario dice querer evitar.
- **Evidencia / escenario:** sonda `fichas.sonda.test.ts`. Sobre las 9 fichas compartidas con sus
  reemplazos de regresión, la regex de clasificación da 4 coincidencias: `knn.what` y
  `forest.what`, en ES y EN.
- **Ajuste ejecutable:**
  1. **`src/content/modelos.ts`.** En `REGRESSION_FICHA_FIELDS`, después de `ridge`, suma:
     ```ts
     knn: {
       what: {
         es: "Para estimar una fila nueva, busca las 5 filas de entrenamiento más parecidas y promedia su valor del objetivo.",
         en: "To estimate a new row it finds the 5 most similar training rows and averages their target values.",
       },
     },
     forest: {
       what: {
         es: "200 árboles, cada uno entrenado con una muestra distinta de filas y columnas; la estimación es el promedio de lo que estiman.",
         en: "200 trees, each trained on a different sample of rows and columns; the estimate is the average of theirs.",
       },
     },
     ```
     El comentario `:455` pasa a «Hoy los tienen Ridge, kNN y Random Forest».
  2. **Gate nuevo** en `tests/unit/modelos.test.ts`. Importa `type FichaId` y `type SharedId`:
     ```ts
     it("S6: al estimar, ninguna ficha compartida habla de clases, votos ni probabilidad", () => {
       const CLASSIFY =
         /\bclases?\b|probabilidad|\bAUC\b|\bvot(a|ar|ación|o|os)\b|frontera|\bclass(es)?\b|probabilit|\bvot(e|es|ing)\b|boundary/i;
       for (const id of Object.keys(REGRESSION_NOTES) as SharedId[]) {
         const ficha = {
           ...FICHAS[MEMBERS[id].base as FichaId],
           ...REGRESSION_FICHA_FIELDS[id],
         };
         for (const [field, value] of Object.entries(ficha))
           for (const text of [value.es, value.en])
             expect(text, `${id}.${field}`).not.toMatch(CLASSIFY);
       }
     });
     ```
  3. **Demo en rojo:** antes del paso 1, el test cae nombrando `knn.what` (verificado por sonda).
- **Verificado cuando:**
  - El test pasa.
  - La ficha de kNN abierta desde una liga de regresión dice «promedia su valor del objetivo».

#### AU-C-05 · Medio · Los bordes de la franja ±MAE (`accent/60`) quedan bajo 3:1 en los dos temas

- **Dónde:**
  - `src/components/PredichoVsReal.tsx:134,217,225` (`stroke-accent/60`).
  - `design-system.md:275`; `decisions/013-regression-as-second-task.md:84`;
    `design-sync/components/componentes/estimar.html:83,84,98` (`rgb(14 110 107 / .6)`).
- **Qué pasa:**
  - La franja ±MAE es un elemento rotulado en la leyenda («Franja: ±MAE»), y su único borde visible
    son las líneas punteadas.
  - Contra `surface` dan **2.68:1 en claro y 2.93:1 en oscuro**, bajo el 3:1 de WCAG 1.4.11
    (objetos gráficos). El relleno `accent/10` da 1.16, así que es casi invisible.
  - La forma de los puntos (disco o anillo) sí transmite dentro/fuera, pero la franja misma es tenue.
    El usuario tiene daltonismo leve, y lo sutil no le comunica.
- **Evidencia / escenario:** cálculo con los tokens de `globals.css`:
  - mezcla `0.6·#0e6e6b + 0.4·#ffffff` = `#6ea8a6` → 2.68:1;
  - en oscuro, `0.6·#2fa6a0 + 0.4·#161a21` → 2.93:1;
  - con `accent` pleno: 6.07:1 en claro y 5.88:1 en oscuro.
- **Ajuste ejecutable:**
  1. `PredichoVsReal.tsx:134,217,225`: `className="stroke-accent/60"` → `className="stroke-accent"`.
     La raya `4 3` / `3 2` sigue distinguiéndola de la diagonal continua `ink`.
  2. `design-system.md:275`: «bordes punteados `accent/60` (4 3)» → «bordes punteados `accent` (4 3),
     ≥ 3:1 en los dos temas».
  3. `decisions/013-…md:84`: «dashed `accent/60` edges» → «dashed `accent` edges (≥ 3:1)».
  4. `design-sync/…/estimar.html:83,84,98`: `stroke="rgb(14 110 107 / .6)"` → `stroke="#0e6e6b"`.
  5. **Test:** en `tests/unit/regresion-ui.test.tsx`, test «dentro de la franja = disco…» (`:212`),
     suma
     `expect(chart.querySelectorAll("line[stroke-dasharray].stroke-accent")).toHaveLength(2);`.
     Demo en rojo: con `/60` cae (0 coincidencias).
  6. Es un cambio visual menor (segunda vuelta, no abre parada). Se registra en la bitácora como
     «maquetado, no visto» para el gate ⭐ del ciclo, con la captura `*-07-grafico` regenerada por
     `capturas-s6.mjs` y leída como imagen.
- **Verificado cuando:**
  - El test pasa.
  - Las capturas 360/1280 claro y oscuro muestran los bordes de la franja nítidos.

#### AU-C-06 · Medio · Al estimar, las importancias se muestran sin unidad y con `toFixed(3)`/`toFixed(4)` (R9 incompleto)

- **Dónde:** `src/components/WhySection.tsx:87,95`; `src/lib/modelcard.ts:233`;
  `src/components/ResultsScreen.tsx:174-182`.
- **Qué pasa:**
  - Al estimar, la importancia por permutación es cuánto crece el MAE, en unidades del objetivo (lo
    dice `why.quantityNote`).
  - La barra muestra `61.100`, y la model card `61.1000`: sin unidad, con decimales fijos pensados
    para métricas de 0 a 1, y sin miles con coma.
  - Es el riesgo R9 del plan («formateador por métrica/unidad»), pagado en el veredicto, la tabla y
    el gráfico, pero no aquí. La pantalla queda inconsistente: «±33.5 kWh» arriba y «61.100» abajo.
- **Evidencia / escenario:** el factory de regresión (`importance: 61.1`) en `ResultsScreen` muestra
  «61.100»; la model card escribe `| ocupantes | … | 61.1000 | … |`.
- **Ajuste ejecutable:**
  1. **`WhySection.tsx`.** Suma la prop `unit?: TargetUnit | null` (por defecto `null`; importa
     `type TargetUnit` de `@/workers/protocol` y `quantityFormatter` de `@/lib/regression-text`).
     Pásala a `ImportanceChart`, y ahí:
     ```tsx
     const fmt = unit
       ? quantityFormatter(
           { unit },
           features.map((f) => f.importance),
         )
       : (v: number) => v.toFixed(3);
     ```
     Usa `fmt(feature.importance)` en `:87` y `:95`.
  2. **`ResultsScreen.tsx`.** En el `<WhySection …>` suma `unit={regression?.unit ?? null}`.
  3. **`modelcard.ts`:**
     - en `TaskBlocks` suma `importance: (v: number) => string`;
     - en `binaryBlocks`, `importance: (v) => v.toFixed(4)`;
     - en `regressionBlocks`,
       `importance: quantityFormatter(result, result.explainability.features.map((f) => f.importance))`;
     - en `:233`, `${blocks.importance(feature.importance)}`.
  4. **Tests** en `tests/unit/regresion-ui.test.tsx`:
     - en «sin botón de IA…» (`:294`), `expect(screen.getByText("61.10 kWh")).toBeInTheDocument();`;
     - en la model card, `expect(md).toContain(`61.10${NBSP}kWh`);`.
     - Demo en rojo: sin el paso 1, «61.10 kWh» no aparece.
- **Verificado cuando:**
  - Al estimar, la barra y la model card dicen «61.10 kWh».
  - En binaria siguen «0.123» y «0.1234» (los tests binarios existentes, verdes).

#### AU-C-07 · Medio · Dos fallas nuevas del motor no tienen texto: `errors.target-not-numeric` y `errors.target-ambiguous`

- **Dónde:**
  - `src/workers/protocol.ts:35,37`: `WorkerErrorKind` suma los dos tipos.
  - `src/lib/experiment.ts:168,299`: los emiten.
  - `messages/es.json:530-548` y `messages/en.json:530-548`: el bloque `errors` no los trae.
  - Los consumidores: `src/components/ErrorScreen.tsx:21` y `src/components/ConfigScreen.tsx:138`
    (`t(`errors.${…}`)`).
- **Qué pasa:**
  - Si alguno de los dos llega a la UI, `translate` devuelve la clave cruda: la pantalla diría
    literalmente «errors.target-not-numeric».
  - Hoy no se alcanzan desde la UI: el botón Entrenar exige un plan entrenable, y E1 y
    `prepareRegression` usan el mismo `parseNumber`. Pero nada impide que el tipo crezca sin copy:
    no hay gate.
  - El plan pedía un «`target-not-numeric` honesto».
- **Evidencia / escenario:** `translate("es", "errors.target-ambiguous")` da
  `"errors.target-ambiguous"`. Por API, `run("ocupantes")` sin responder deja
  `error.kind = "target-ambiguous"`, y `ErrorScreen` mostraría la clave.
- **Ajuste ejecutable:**
  1. **`messages/es.json`**, dentro de `errors`, después de `league-empty`:
     ```json
     "target-not-numeric": "Para estimar una cantidad, el objetivo tiene que ser un número en todas las filas, y esta columna trae valores que no lo son. Revísala en tu CSV (o elige otra) y vuelve a cargarlo.",
     "target-ambiguous": "Esta columna puede guardar categorías o una cantidad, y falta tu respuesta. Responde la pregunta de la tarjeta de tarea y vuelve a entrenar."
     ```
  2. **`messages/en.json`:**
     ```json
     "target-not-numeric": "To estimate a quantity the target has to be a number in every row, and this column has values that are not. Check it in your CSV (or pick another one) and load it again.",
     "target-ambiguous": "This column could hold categories or a quantity, and your answer is missing. Answer the question on the task card and train again."
     ```
  3. **Gate nuevo** `tests/unit/error-copy.test.ts`. El `Record` exhaustivo hace que `pnpm typecheck`
     falle si el tipo crece sin sumarlo:
     ```ts
     import { describe, expect, it } from "vitest";
     import { translate } from "@/i18n/translate";
     import type { WorkerErrorKind } from "@/workers/protocol";

     const KINDS: Record<WorkerErrorKind, true> = {
       "csv-empty": true,
       "csv-too-large": true,
       "csv-too-many-rows": true,
       "csv-ragged": true,
       "csv-semicolon": true,
       "csv-tab": true,
       "target-not-binary": true,
       "target-not-numeric": true,
       "target-ambiguous": true,
       "target-mixed-notation": true,
       "no-features": true,
       "too-few-rows": true,
       contract: true,
       "league-empty": true,
       "csv-unusable": true,
       runtime: true,
       "worker-dead": true,
     };

     describe("toda falla del motor tiene su texto, en ES y EN", () => {
       it.each(Object.keys(KINDS))("%s", (kind) => {
         for (const locale of ["es", "en"] as const)
           expect(translate(locale, `errors.${kind}`)).not.toBe(
             `errors.${kind}`,
           );
       });
     });
     ```
  4. **Demo en rojo:** antes del paso 1, cae nombrando `target-not-numeric` y `target-ambiguous`.
- **Verificado cuando:**
  - El test pasa con las 17 fallas.
  - Quitar una entrada del `Record` rompe `pnpm typecheck`.

#### AU-C-08 · Medio · El sesgo del error mediano es una regla de negocio dentro del componente (0.05 a mano), dos de sus tres ramas no tienen test, y escribe «-0.0 kWh»

- **Dónde:**
  - `src/components/RegressionResults.tsx:114-118`: `err`, con el signo decidido sobre el valor sin
    redondear.
  - `:121-127`: `lean`, con el 5 % a mano.
  - `src/lib/quantity.ts:42-43`: solo normaliza el `-0` exacto.
  - `tests/unit/regresion-ui.test.tsx:251`: solo prueba «over».
- **Qué pasa:**
  - El umbral «sesgo apreciable = 5 % del MAE» es lógica de negocio dentro de un componente
    (regla 3), sin constante con nombre. Las ramas «under» y «none» no tienen test.
  - Un error mediano que redondea a cero sale con signo: `formatQuantity(-0.004, 1)` da «-0.0»
    (Intl muestra el cero negativo). Con la rama «none», la frase dice «El error mediano es -0.0
    kWh: no se inclina hacia un lado», y la tabla muestra «-0.0 kWh» en el percentil 50.
  - En un modelo bien calibrado es plausible, porque p50 ≈ 0.
- **Evidencia / escenario:** sonda `ui.sonda.test.tsx`, `RegressionDetail` con `p50 = -0.004`: sale
  «El error mediano es -0.0 kWh: no se inclina hacia un lado.».
- **Ajuste ejecutable:**
  1. **`src/lib/regression-text.ts`.** Suma:
     ```ts
     /** Un sesgo «apreciable»: el error mediano supera esta fracción del MAE. */
     export const RESIDUAL_LEAN_SHARE = 0.05;
     export type ResidualLean = "over" | "under" | "none";
     export function residualLean(p50: number, mae: number): ResidualLean {
       if (Math.abs(p50) <= RESIDUAL_LEAN_SHARE * mae) return "none";
       return p50 > 0 ? "over" : "under";
     }
     ```
     En `RegressionResults.tsx:121-127`: `const lean = residualLean(residuals.p50, model.mae);`.
  2. **`src/lib/quantity.ts:42-43`:**
     ```ts
     // −0 se escribe 0, también cuando lo produce el redondeo (−0.004 con 1 decimal).
     const rounded = Number(value.toFixed(decimals));
     return formatter.format(rounded === 0 ? 0 : value);
     ```
  3. **`RegressionResults.tsx:114-118`:**
     ```tsx
     const err = (value: number) => {
       const shown = Number(value.toFixed(errDecimals));
       return withUnit(
         `${shown > 0 ? "+" : ""}${formatQuantity(value, errDecimals)}`,
         result.unit,
       );
     };
     ```
  4. **Tests** en `tests/unit/regresion-ui.test.tsx`:
     - `residualLean(5, 33.5) === "over"`, `(-5, 33.5) === "under"`, `(1, 33.5) === "none"` y
       `(1.675, 33.5) === "none"`;
     - `formatQuantity(-0.004, 1) === "0.0"`;
     - `RegressionDetail` con `residuals.p50 = -0.004` muestra «El error mediano es 0.0 kWh: no se
       inclina hacia un lado.».
     - Demo en rojo: sin el paso 2, «-0.0» reaparece.
- **Verificado cuando:**
  - Los tests pasan.
  - `grep -n "0.05" src/components/RegressionResults.tsx` sale vacío.

#### AU-C-09 · Medio · Hueco de pruebas del hook: el Nivel 2 y cancelar al estimar no tienen test, y quitar la respuesta de la ambigua de `runLevel2` dejaría el botón mudo sin que nada caiga

- **Dónde:**
  - `src/lib/useExperiment.ts:1007-1012`: `ambiguousChoice: choiceRef.current`, y
    `if (!next.ok) return;` sale en silencio.
  - `tests/unit/regresion-ui.test.tsx:432-584`: ningún `runLevel2` ni `cancelLevel2`.
  - `tests/unit/use-hooks.test.tsx:730-960`: solo binaria.
  - Ningún e2e de Nivel 2 al estimar (`capturas-s6.mjs` solo captura la configuración del mediano).
- **Qué pasa:**
  - Resiste hoy (lo comprobé por sonda), pero no hay test que lo fije.
  - Si alguien quita `ambiguousChoice: choiceRef.current` de `runLevel2`, `prepareRun` devuelve
    `target-ambiguous`, y el `return` silencioso hace que pulsar «Correr el Nivel 2» no haga nada.
    Ningún test caería.
  - Tampoco está probado que cancelar registre `task: "numerica"` (R14) y restaure un resultado de
    regresión.
- **Evidencia / escenario:** sonda `hook.sonda.test.tsx` (pasa hoy). No hay ningún
  `runLevel2`/`cancelLevel2` en tests con un resultado `numerica`.
- **Ajuste ejecutable:**
  1. **Test nuevo** en `tests/unit/regresion-ui.test.tsx`, dentro de «useExperiment al estimar
     (S6)», reusando `FakeWorker`, `reply` y `CONSUMO`:
     ```tsx
     it("ambigua respondida → Nivel 2 conserva la respuesta; cancelar restaura y registra «numerica»", () => {
       const { result } = renderHook(() => useExperiment());
       act(() => result.current.loadCsv(CONSUMO, "consumo-energia.csv"));
       act(() => result.current.selectTarget("ocupantes"));
       act(() => result.current.answerTask("numerica"));
       act(() => result.current.run("ocupantes"));
       const worker = FakeWorker.last!;
       const sent = worker.posted.at(-1)!.payload as PipelinePayload;
       reply(worker, "train", regressionPipelineResult(sent));
       act(() => result.current.runLevel2([]));
       expect(worker.posted.at(-1)!.type).toBe("export-model");
       reply(worker, "export-model", {
         payload_b64: "QUJD",
         versions: {
           pyodide: "0.27",
           sklearn: "1.5",
           python: "3.12",
           xgboost: "2.1",
           lightgbm: "4.5",
         },
         schema: {
           numeric: sent.numeric,
           categorical: sent.categorical,
           target: "ocupantes",
           task: "numerica",
           target_stats: {
             mean: 3,
             std: 1,
             min: 1,
             max: 6,
             median: 3,
             decimals: 0,
           },
         },
         training_profile: { numeric: {}, categorical: {} },
       });
       expect(worker.posted.at(-1)).toMatchObject({
         type: "train",
         payload: { task: "numerica", target: "ocupantes" },
       });
       act(() => result.current.cancelLevel2());
       expect(result.current.state.level2).toEqual({ status: "cancelled" });
       expect(result.current.state.result?.task).toBe("numerica");
       expect(vi.mocked(recordLeagueRun).mock.lastCall?.[0]).toMatchObject({
         task: "numerica",
         cancelled: true,
       });
     });
     ```
  2. **Demo en rojo:** borra `ambiguousChoice: choiceRef.current,` de `runLevel2`
     (`useExperiment.ts:1010`); el test cae, porque el último mensaje sigue siendo el `train` del
     Nivel 1.
  3. **Opcional, heredado del S5:** cambiar el `return` silencioso de `:1012` por
     `setState((s) => ({ ...s, level2: { status: "failed" } }))`, que ya tiene copy honesto en
     `level2.notice.failed`.
- **Verificado cuando:** el test pasa, y cae con la mutación.

#### AU-C-10 · Medio · axe en ambos temas no cubre todas las pantallas que tocó el S6, como pedía el plan

- **Dónde:**
  - `tests/e2e/regresion-score.spec.ts:97-98`: Puntuar al estimar, solo con el tema claro y
    `AxeBuilder` suelto.
  - El resumen de import de regresión (`:56-59`) no pasa por axe.
  - `tests/e2e/regresion.spec.ts`:
    - la ficha al estimar (diálogo con la nota de regresión) y la liga con «Ver puntajes de
      prueba» abierta no pasan por axe;
    - Resultados con la fuga plantada (`:74-100`) tampoco.
- **Qué pasa:** el plan (Fase 2, punto 6) exige «axe en ambos temas en cada pantalla tocada».
  - **Con axe en los dos temas:** Configurar, la pregunta y Resultados.
  - **Sin axe en los dos temas:** el import de regresión, Puntuar en oscuro, la ficha de
    regresión, la tabla con la prueba abierta y el veredicto con fuga.
  - Es el mismo hueco que AU-S5-08 en el sprint anterior.
- **Evidencia / escenario:** `grep -n "axe" tests/e2e/regresion-score.spec.ts` da solo `:2,97,98`;
  `tests/e2e/regresion.spec.ts` llama `axeBothThemes` solo en `:31` y `:69`.
- **Ajuste ejecutable:**
  1. **`regresion-score.spec.ts`:**
     - cambia `import AxeBuilder …` por `import { axeBothThemes } from "./axe-temas";`;
     - después de `:59` suma `await axeBothThemes(page);`;
     - reemplaza `:97-98` por `await axeBothThemes(page);`.
  2. **`regresion.spec.ts`**, primer test, antes de `expect(narrateRequests)`:
     ```ts
     await page
       .getByRole("button", { name: /Ver puntajes de prueba/i })
       .click();
     await axeBothThemes(page);
     await page.getByRole("button", { name: "Ficha de Mediana" }).click();
     await expect(page.getByRole("dialog")).toBeVisible();
     await axeBothThemes(page, "dialog");
     await page.keyboard.press("Escape");
     ```
     En el segundo test, al final: `await axeBothThemes(page);`.
  3. Si axe encuentra algo, se paga antes de cerrar (orden de pago: primero los gates, y al final
     sobre el árbol completo).
- **Verificado cuando:** el job `e2e` de `gh pr checks 17` corre `success` con los nuevos
  `axeBothThemes`, y la bitácora lo dice.

#### AU-C-11 · Bajo · «Por ahora» / «For now» en la línea de IA al estimar y en la model card (promesa aplazada)

- **Dónde:** `messages/es.json:382` y `messages/en.json:382` (`why.narration.aiNotForQuantity`);
  `messages/es.json:527` y `messages/en.json:527` (`modelcard.estimate.noAi`). Frase hermana en
  `docs/MANUAL-DE-USO.md:333` («por ahora solo cubre la …»).
- **Qué pasa:**
  - El plan (P7, R20) pedía «una línea franca de que la narración con IA solo cubre clasificar» y
    «Narración con IA: no aplica a estimar».
  - El copy suma «Por ahora» / «for now», una promesa aplazada que la app no cumple hoy (casilla 4).
- **Evidencia / escenario:** el texto actual en pantalla: «Por ahora, la narración con IA solo
  cubre…».
- **Ajuste ejecutable:**
  - **`why.narration.aiNotForQuantity`:**
    - ES: «La narración con IA solo cubre la clasificación en dos categorías; al estimar una
      cantidad, la lectura es el texto estándar de arriba, que sale de los mismos números.»
    - EN: «AI narration only covers classification into two categories; when estimating a
      quantity, the reading is the standard text above, built from the same numbers.»
  - **`modelcard.estimate.noAi`:**
    - ES: «Narración con IA: no aplica a estimar una cantidad (solo cubre la clasificación en dos
      categorías).»
    - EN: «AI narration: does not apply to estimating a quantity (it only covers classification
      into two categories).»
  - **Tests:** cambia la regex de `tests/unit/regresion-ui.test.tsx:320` y de
    `tests/e2e/regresion.spec.ts:67` a `/narración con IA solo cubre la clasificación/` (sin «la »
    inicial).
  - **Manual `:333`:** el dueño de la casilla 4 corrige «por ahora solo cubre» → «solo cubre».
- **Verificado cuando:**
  - `grep -n "Por ahora\|por ahora\|For now\|for now" messages/*.json` ya no muestra estas dos
    claves.
  - Los tests pasan.

#### AU-C-12 · Bajo · Plurales: «escrito con 1 decimales» (un test lo fija) y «Estimaciones (1 filas)»

- **Dónde:**
  - `messages/es.json:525` y `messages/en.json:525` (`modelcard.estimate.targetStats`, con
    `{decimals}`).
  - `src/lib/modelcard.ts:187`.
  - `tests/unit/regresion-ui.test.tsx:607`: fija «1 decimales».
  - `messages/es.json:348` y `messages/en.json:348` (`score.quantity.title`, con `{rows}`).
  - `src/components/ScoreScreen.tsx:562`.
- **Qué pasa:** `translate` solo elige `_one` con el parámetro `count`.
  - El ejemplo empaquetado (`consumo_kwh`, un decimal) produce en su model card «escrito con 1
    decimales» / «written with 1 decimals».
  - Puntuar un CSV de una fila da «Estimaciones (1 filas)».
  - Hermana heredada: `score.distribution.title` (S3).
- **Evidencia / escenario:** sonda `ui.sonda.test.tsx`: «(escrito con 1 decimales)».
- **Ajuste ejecutable:**
  - **`targetStats`:**
    - en ES y EN, `{decimals}` → `{count}`;
    - suma `"targetStats_one"` con el mismo texto y la cola «(escrito con 1 decimal).» / «(written
      with 1 decimal).»;
    - `modelcard.ts:187`: `decimals: targetStats.decimals` → `count: targetStats.decimals`;
    - test `:607`: «(escrito con 1 decimal)».
  - **`score.quantity.title`:**
    - `"Estimaciones ({count} filas)"` y `"title_one": "Estimaciones (1 fila)"`;
    - EN `"Estimates ({count} rows)"` y `"title_one": "Estimates (1 row)"`;
    - `ScoreScreen.tsx:562`: `{ rows: n }` → `{ count: n }`.
  - **Test nuevo:** en «puntuar al estimar», un `ScoreScreen` con una sola predicción muestra
    «Estimaciones (1 fila)».
- **Verificado cuando:**
  - La model card del ejemplo dice «(escrito con 1 decimal)».
  - El e2e «Estimaciones (2 filas)» sigue verde.

#### AU-C-13 · Bajo · «{pct} %» con espacio normal (puede partir la línea) e inconsistente con «{share}%»

- **Dónde:** `messages/es.json:243` (`results.regression.verdict.beatsDetail`), `:428`
  (`narration.template.regression.verdict.beats`), `:438` (`…regression.outliers`, «El {share} %»)
  frente a `config.eda.target-outliers` («{share}%»).
- **Qué pasa:**
  - El design system exige un espacio NO separable entre el número y la unidad (R9), y el `%` va
    con un espacio normal: «un 24 / % menos» puede partirse en un móvil.
  - Además, el mismo dato se escribe de dos maneras en ES.
- **Evidencia / escenario:** lectura del JSON (U+0020 antes de `%`).
- **Ajuste ejecutable:**
  - En `es.json:243,428` cambia ` % menos` → ` % menos`; en `:438`, `{share} %` →
    `{share} %`; en `config.eda.target-outliers`, `{share}%` → `{share} %`.
  - EN queda «{pct}%», sin espacio, como es norma en inglés.
  - Test `tests/unit/regresion-ui.test.tsx:626` (cadena cruda): `un 24 % menos` →
    `un 24${NBSP}% menos`. El de `:135` usa `getByText`, que normaliza el NBSP: sin cambio.
- **Verificado cuando:** `grep -n " %" messages/es.json` no muestra estas claves, y los tests pasan.

#### AU-C-14 · Bajo · Cada botón de respuesta de la ambigua repite su descripción (en el nombre y en `aria-describedby`)

- **Dónde:** `src/components/TaskCard.tsx:104-131`.
- **Qué pasa:**
  - El nombre accesible del botón toma TODO su texto: etiqueta, «Sugerida» y la descripción.
  - `aria-describedby` vuelve a apuntar a la descripción, así que el lector la lee dos veces.
- **Evidencia / escenario:** el nombre calculado es «Una cantidad Sugerida Se estima el número…», y
  la descripción, «Se estima el número…».
- **Ajuste ejecutable:**
  - En el `<span className="flex flex-wrap items-center gap-x-2 font-medium">` (`:116`), suma
    `id={`task-answer-${id}-label`}`.
  - En el `<button>`, suma `aria-labelledby={`task-answer-${id}-label`}` y conserva
    `aria-describedby`.
  - Test en `tests/unit/league-ui.test.tsx:146-162`:
    `expect(within(group).getByRole("button", { name: /Una cantidad/ })).toHaveAccessibleDescription(/Se estima el número/)`
    y `toHaveAccessibleName(/^Una cantidad( Sugerida)?$/)`.
- **Verificado cuando:** el test pasa, y el e2e `tarea-ambigua` (`name: /Una cantidad/`) sigue verde.

#### AU-C-15 · Bajo · Casilla 5: `TargetUnit.suffix` no tiene lector

- **Dónde:** `src/workers/protocol.ts:315`; `src/lib/experiment.ts:480-485`.
- **Qué pasa:**
  - `inferUnit` escribe `suffix` (un trozo del nombre de la columna), pero ningún archivo de `src/`
    lo lee. Solo lo leen los tests.
  - Todo consumidor usa `symbol`.
- **Evidencia / escenario:** `grep -rnE "\.suffix\b" src` (excluido `protocol.ts`) no da ningún
  lector.
- **Ajuste ejecutable:**
  - `protocol.ts:315` → `export type TargetUnit = { symbol: string | null };`.
  - `experiment.ts:480-485` → `return { symbol };`; la línea `const suffix = …` se queda, porque
    sirve para buscar en la tabla.
  - Quita `suffix` de los literales de los tests: `league-ui.test.tsx:118,132,175`,
    `regresion-ui.test.tsx:92,95,217,469,566` y `regresion-motor.test.ts:323,463`.
- **Verificado cuando:** `pnpm typecheck` pasa, y `grep -rn "suffix" src/workers/protocol.ts` sale
  vacío.

#### AU-C-16 · Bajo · Un fixture imposible fija en los tests que «Lineal» supera a «una regresión lineal»

- **Dónde:**
  - `tests/unit/factories.ts:174-262` (`regressionPipelineResult`): el roster por defecto empieza en
    `linear`, con un MAE de prueba de 33.5, y el baseline lineal tiene 43.8.
  - Lo fijan `tests/unit/regresion-ui.test.tsx:131-136` y `:625-627`.
- **Qué pasa:**
  - El miembro `linear` y el baseline `linear` son el MISMO ajuste: `LinearRegression()` en
    `pipeline.py:413` y `:802`, así que dan el mismo MAE de prueba.
  - Los tests fijan un veredicto que la app real no puede producir: «**«Lineal» supera al
    baseline** — … una regresión lineal se equivoca por ±43.8 kWh».
  - Un test que fija algo imposible da falsa cobertura.
- **Evidencia / escenario:** lectura del factory y de las dos aserciones citadas.
- **Ajuste ejecutable:**
  1. En `regressionPipelineResult`, define los baselines antes del `league` y usa
     `test: name === "linear" ? baselines.linear : regressionMetrics({ mae: mean - 1.5, rmse: mean + 9 })`.
     Agrega el comentario «el miembro y el baseline lineales son el mismo ajuste
     (pipeline.py:413/802)».
  2. Cambia el roster por defecto a `["ridge", "linear", "extra_trees"]`.
  3. Corre `pnpm vitest run tests/unit/regresion-ui.test.tsx tests/unit/regresion-motor.test.ts
tests/unit/model-file.test.ts` y actualiza cada aserción que nombraba «Lineal» como ganador por
     defecto. Por ejemplo, `:131` y `:626` pasan a ««Ridge» supera al baseline».
  4. Opcional, para el auditor del contrato: una carnada en `validateTrainResult` que exija
     `league[linear].test.mae === baselines.linear.mae`.
- **Verificado cuando:**
  - `grep -n "«Lineal» supera" tests/unit/*.tsx` sale vacío.
  - La suite unit pasa.

#### AU-C-17 · Bajo · La plantilla de regresión escribe una frase por cada columna con pinta de identificador

- **Dónde:** `src/lib/narration/templates.ts:152-154`. La binaria las junta (`:79-84`).
- **Qué pasa:** con dos columnas tipo id, el texto estándar dice «Además, a parece un
  identificador… Además, b parece un identificador…». La binaria dice «Además, a, b parece…» en una
  sola frase.
- **Evidencia / escenario:** lectura del bucle `for (const alert of edaAlerts ?? [])`.
- **Ajuste ejecutable:**
  - Antes del bucle:
    ```ts
    const idLike = (edaAlerts ?? [])
      .filter((a) => a.kind === "id-like")
      .map((a) => a.column);
    if (idLike.length > 0)
      parts.push(
        t("narration.template.idLike", { columns: idLike.join(", ") }),
      );
    ```
  - Quita la rama `id-like` del bucle.
  - **Test** en `tests/unit/narration-templates.test.ts`: `buildRegressionTemplate` con dos alertas
    `id-like` (`a`, `b`) contiene exactamente una vez «parece un identificador», y contiene «a, b».
- **Verificado cuando:** el test pasa.

#### AU-C-18 · Bajo · Lógica en `ScoreScreen`: la mediana se calcula en el componente, y el conteo por etiqueta corre también al estimar

- **Dónde:**
  - `src/components/ScoreScreen.tsx:343-348`: el conteo por etiqueta, inútil con números.
  - `:538-560`: el orden, la mediana, el mínimo y el máximo en `QuantitySummary`.
- **Qué pasa:** la regla 3 pide componentes sin lógica. El resumen numérico es un cálculo puro sin
  test propio, y el mapa de conteos se arma con hasta 50 000 cadenas que no se muestran.
- **Evidencia / escenario:** lectura del componente.
- **Ajuste ejecutable:**
  - En `src/lib/scored-csv.ts`, suma:
    ```ts
    export function estimateSummary(
      values: readonly number[],
    ): { min: number; median: number; max: number } | null {
      if (values.length === 0) return null;
      const s = [...values].sort((a, b) => a - b);
      const n = s.length;
      const median =
        n % 2 === 1 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
      return { min: s[0]!, median, max: s[n - 1]! };
    }
    ```
  - `QuantitySummary` lo usa.
  - En `ScoreScreen.tsx:343`, `const counts = new Map<string, number>(); if (!quantity) for (…)`.
  - **Test** en `tests/unit/scored-csv.test.ts`: `[3,1,2]` da `{1,2,3}`, `[1,2,3,4]` da mediana 2.5
    y `[]` da `null`.
- **Verificado cuando:** el test pasa, y el test «puntuar al estimar» (`regresion-ui.test.tsx:381`)
  sigue verde.

#### AU-C-19 · Bajo · El banner de fuga está duplicado en `BinaryVerdict` y en `RegressionVerdict`

- **Dónde:** `src/components/ResultsScreen.tsx:268-274`; `src/components/RegressionResults.tsx:39-45`.
- **Qué pasa:** el mismo objeto `{ tone: "caution", mark: "⚠", headline: suspicious, detail:
suspiciousDetail }` vive en dos sitios. Si uno cambia (por ejemplo, el copy al estimar), los dos
  divergen.
- **Evidencia / escenario:** lectura de las dos ramas.
- **Ajuste ejecutable:**
  - En `src/components/VerdictCard.tsx`, exporta:
    ```ts
    export function suspiciousBanner(t: (key: string) => string): Banner {
      return {
        tone: "caution",
        mark: "⚠",
        headline: t("results.verdict.suspicious"),
        detail: t("results.verdict.suspiciousDetail"),
      };
    }
    ```
  - Úsalo en los dos sitios.
  - Los tests existentes («con fuga, el titular es la sospecha» y su par binario) siguen como gate.
- **Verificado cuando:** `grep -n "results.verdict.suspiciousDetail" src/components` da una sola
  línea, en `VerdictCard.tsx`.

#### AU-C-20 · Bajo · Las marcas del gráfico se ven a ~8 px en un móvil de 360

- **Dónde:** `src/components/PredichoVsReal.tsx:58,98,106,174,181`.
- **Qué pasa:**
  - El SVG mide 340 unidades de ancho y se escala con `w-full`.
  - En 360 px el ancho útil es 360 − 48 (`px-6` del `main`) − 40 (`p-5` del Card) = 272 px, una
    escala de 0.8.
  - Las marcas de 10 px se ven a 8 px, y los rótulos de eje de 11 px, a 8.8 px: difíciles de leer.
- **Evidencia / escenario:** cálculo con `page.tsx:34` (`px-6`) y `RegressionResults.tsx:135` (`p-5`).
- **Ajuste ejecutable:**
  - `:98,106`: `text-[10px]` → `text-[12px]`.
  - `:174,181`: `text-[11px]` → `text-[12px]`.
  - Si los rótulos del eje Y se recortan, `MARGIN.left` sube de 58 a 64.
  - Regenera `*-07-grafico` con `capturas-s6.mjs` a 360 y 1280 y léelas como imagen. Es una segunda
    vuelta visual: se registra «maquetado, no visto» para el gate ⭐.
- **Verificado cuando:** en la captura de 360, las marcas se leen sin zoom y sin pisarse.

### Conteo

| Severidad | n   | Ids               |
| --------- | --- | ----------------- |
| Crítico   | 1   | AU-C-01           |
| Alto      | 1   | AU-C-02           |
| Medio     | 8   | AU-C-03 … AU-C-10 |
| Bajo      | 10  | AU-C-11 … AU-C-20 |
| **Total** | 20  |                   |

**Orden de pago sugerido (kit v1.35.0): primero los que crean o amplían gates**:

- AU-C-01 (scrub + test)
- AU-C-07 (`Record` de fallas)
- AU-C-04 (fichas)
- AU-C-02 (foco)
- AU-C-09 (Nivel 2)
- AU-C-10 (axe)

Después, el resto. Los gates nuevos se corren al final sobre el árbol completo.
