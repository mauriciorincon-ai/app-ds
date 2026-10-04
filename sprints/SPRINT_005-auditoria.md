# Sprint 005 — Auditoría final, Fase 1 («La liga honesta» · Probeta DS)

- **Fecha:** 2026-10-02
- **Auditor:** subagente independiente (no construyó el sprint). Fuente primaria: el diff; la
  bitácora se usó solo para contrastar lo que el constructor cree que hizo.
- **Base → HEAD:** `main` → `620ed2a` (rama `sprint-005/liga-honesta`, PR #13).
- **Diff:** 125 archivos, +18 623 / −1 875 líneas, 13 commits (`8c514d0` … `620ed2a`).
- **Corridas del auditor (solo lectura, árbol limpio al terminar):**
  - `pnpm typecheck` ✓ · `pnpm lint` ✓.
  - `pnpm test`: 41 archivos, 368/368 ✓. Cobertura total 90,9 % de líneas; `engine/` 100 % de
    líneas y 95,2 % de ramas; `useExperiment.ts` 76 % de líneas y 57,8 % de ramas.
  - Carnadas (vitest verbose): train 26/26 · fit-member 6/6 · progreso 5/5 · export 6/6 ·
    score 5/5 · manifiesto 16/16. TS → Python 16/16 según la bitácora y el job `integration`.
  - El barrido de cero enlaces `git grep -nE "vercel[.]app|workers[.]dev|pages[.]dev" -- ':!pnpm-lock.yaml'`
    sale vacío (exit 1). `homepageUrl` es la URL del propio repo.
  - `gh pr checks 13` en `620ed2a`: `quality`, `integration`, `e2e`, `lighthouse`, Vercel y Vercel
    Preview Comments, todos `pass` con conclusión propia.
  - Dos sondas propias en el scratchpad, con una config de vitest fuera del repo:
    1. `["0","1","1.0"]`: `detectTask` → `binaria`, mientras que `prepareRun` →
       `target-not-binary`.
    2. `check(dict(num), {salario_mensual_de_juan: "x"})` → `field: "salario_mensual_de_juan"`.
  - No corrí la suite de integración (Pyodide real) ni Playwright. Para ellas cito el job de la
    CI en `620ed2a`.

## Recomendación

**Requiere ajustes.** Encontré 1 hallazgo Alto, 8 Medios y 21 Bajos (30 en total, todos abajo con
`archivo:línea` y ajuste ejecutable).

El motor está bien construido:

- La garantía anti-fuga de la CV está probada con un espía.
- La selección no mira el test (las etiquetas de test permutadas no cambian nada).
- El contrato entre lenguajes se valida en producción y TS recalcula la regla de un error
  estándar.
- La máquina de estados del Nivel 2 (instantánea, cancelar, restaurar) resiste todos los
  escenarios que recorrí.

Lo que no está listo:

- **El Alto (AU-S5-01):** cuando gana la logística y pierde contra la clase mayoritaria, el
  veredicto franco queda escondido.
- **Dos textos públicos que el S5 volvió falsos:** «toda cifra sale de la prueba», en la app y en
  el brochure.
- **Huecos de prueba:**
  - axe no audita la configuración ni el entrenamiento.
  - La elección manual no tiene tests unitarios en el hook.

---

## Casilla 1 — Cobertura de alcance

Fuentes: plan aprobado (`glittery-drifting-wilkes.md`), orden `SPRINT_005-orden.md`, criterios de
`SPRINT_005.md` y desviaciones D1–D15 (aprobadas). Leyenda: **C** Completo · **P** Parcial ·
**N** No implementado · **D** Implementado con desviación.

| #   | Ítem planeado                                                                                                                               | Estado               | Evidencia                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `/audita-sprint` estampado                                                                                                                  | C                    | `.claude/commands/audita-sprint.md` (nuevo, 130 líneas)                                                                                                            |
| 2   | Constitución: texto aprobado literal + frase centinela                                                                                      | C                    | `CLAUDE.md:25` (centinela en una línea), regla dura 3 literal                                                                                                      |
| 3   | Reglas 15/18/19/20 del kit en el CLAUDE.md                                                                                                  | C                    | `CLAUDE.md` reglas 11, 13, 14, 15 y «Bilingüe estructural»                                                                                                         |
| 4   | Regla 18: `pnpm peers check` + `verificar-dependencias.mjs` en `quality`                                                                    | C                    | `.github/workflows/ci.yml:27-32`, `scripts/verificar-dependencias.mjs`                                                                                             |
| 5   | `dependabot.yml` + test                                                                                                                     | C                    | `.github/dependabot.yml`, `tests/unit/dependabot-config.test.ts`                                                                                                   |
| 6   | Hooks gitleaks B-8                                                                                                                          | C (ver AU-S5-29)     | `.claude/settings.json:12`, `githooks/pre-commit:17-23`                                                                                                            |
| 7   | Sentry `beforeSend` con `value = type`                                                                                                      | C                    | `src/lib/sentry-scrub.ts:29`, `instrumentation-client.ts:20`, `sentry.server.config.ts:16`                                                                         |
| 8   | e2e sin `--pass-with-no-tests` + `upload-artifact` + Lighthouse mediana de 3                                                                | C                    | `package.json:16`, `ci.yml:67-76`, `ci.yml:109-111`                                                                                                                |
| 9   | xgboost + lightgbm en el runtime (con el gate de peso ≤ +2 MB)                                                                              | C                    | `scripts/pyodide-paquetes.mjs:7-16`, `public/pyodide-runner.js:20-50`, `scripts/verificar-peso-pyodide.mjs`, `pyodide-budget.json`                                 |
| 10  | Spike en el navegador + tabla de costos                                                                                                     | C                    | `scripts/spike-liga/*`, `sprints/SPRINT_005-spike-costos.md`                                                                                                       |
| 11  | Roster de 14 con hiperparámetros fijos, semilla y `n_jobs=1` (D4)                                                                           | C                    | `src/lib/ds/pipeline.py:290-320`, `src/engine/roster.ts:7-22`                                                                                                      |
| 12  | `_validate_payload` (el lector de TS → Python)                                                                                              | C                    | `pipeline.py:338-363`                                                                                                                                              |
| 13  | CV con el preprocesador dentro del Pipeline                                                                                                 | C                    | `pipeline.py:409-427`                                                                                                                                              |
| 14  | Selección por la regla de un error estándar (D8), con espejo en TS (D15)                                                                    | D (aprobada)         | `pipeline.py:430-444`, `roster.ts:167-181`, `contract.ts:142-147`                                                                                                  |
| 15  | El test se abre una vez, después de elegir; baselines después (D14); perdedores eager (F0-5)                                                | C                    | `pipeline.py:545-580`                                                                                                                                              |
| 16  | Estados `ok` / `no-converge` / `error` (D11)                                                                                                | D (aprobada)         | `pipeline.py:531-543`, `contract.ts:47-54`                                                                                                                         |
| 17  | Solo el ganador queda en `_MODEL`                                                                                                           | C                    | `pipeline.py:583`                                                                                                                                                  |
| 18  | `on_progress` por miembro (D13: dos fases)                                                                                                  | C                    | `pipeline.py:521-525`, `pyodide-runner.js:81-85`                                                                                                                   |
| 19  | `fit_member` (U1)                                                                                                                           | C (ver AU-S5-07)     | `pipeline.py:611-632`                                                                                                                                              |
| 20  | Ridge y el SVM lineal sin probabilidad inventada (D12)                                                                                      | D (aprobada)         | `pipeline.py:682`, `scored-csv.ts:52-84`, `ScoreScreen.tsx:420-465`                                                                                                |
| 21  | E1 `tarea.ts` (5 tareas; solo binaria entrena)                                                                                              | C (ver AU-S5-10)     | `src/engine/tarea.ts:45-97`                                                                                                                                        |
| 22  | E1: «llega en el S6/S7», nunca «objetivo no binario»                                                                                        | P                    | El texto dice «llega en una próxima versión» (`messages/es.json:452`), una desviación no registrada (AU-S5-30). «Objetivo no binario» sigue alcanzable (AU-S5-10). |
| 23  | E2 `encarrilador.ts` con constantes exportadas; reparto por costo (D3); fuera solo con respaldo medido (D9); forzados (U3); la unión (D5)   | D (aprobada)         | `encarrilador.ts:22-218`                                                                                                                                           |
| 24  | Aceptación 4: «KNN fuera con 20 000 filas y MLP fuera con 100»                                                                              | D (D9 aprobada)      | `encarrilador.ts:94-100`; KNN compite (medido)                                                                                                                     |
| 25  | Modelo de costos + calibración                                                                                                              | C                    | `src/engine/costos.ts`                                                                                                                                             |
| 26  | `prepareRun`: roster, `cv_k` acotado, `too-few-rows`, muestra pequeña                                                                       | C                    | `src/lib/experiment.ts:199-249`                                                                                                                                    |
| 27  | `assembleResult` con `league` + `selection`; `applyMemberFit`                                                                               | C                    | `experiment.ts:261-327`                                                                                                                                            |
| 28  | `contract.ts` usado en producción                                                                                                           | C                    | `useExperiment.ts:411, 489, 544, 582, 606, 623`                                                                                                                    |
| 29  | Manifiesto aditivo-opcional (`league`, `selection`, versiones de los boosters), compatible con S3/S4                                        | C (ver AU-S5-06)     | `src/lib/model-file.ts:104-107, 161-191`; test `model-file.test.ts:285-299`                                                                                        |
| 30  | Model card: sección «Selección»                                                                                                             | C                    | `src/lib/modelcard.ts:105-133`                                                                                                                                     |
| 31  | Tests F1 (anti-fuga CV, selección sin test, cada miembro, fallo aislado, determinismo, boosters, E1/E2, costos, paridad, compatibilidad S4) | C                    | `tests/integration/liga.test.ts:95-427`, `tests/unit/{tarea,encarrilador,costos,roster,model-file}.test.ts`                                                        |
| 32  | Carnadas del contrato, «detectó k de n»                                                                                                     | C                    | Ver la sección «Regla 15»                                                                                                                                          |
| 33  | ConfigScreen: TaskCard + RosterCard + «Entrenar (Nivel 1, ~N s)»                                                                            | D                    | `ConfigScreen.tsx:104-154`: el botón dice «Entrenar modelos», con la estimación debajo (aprobado en la mirada M1). TaskCard contradice el bloqueo (AU-S5-02).      |
| 34  | LeagueTable: filas = modelos, CV ± desviación, ★, prueba a pedido, «Elegir», copy fijo, R2                                                  | C (ver AU-S5-01)     | `LeagueTable.tsx:29-396`, `ResultsScreen.tsx:107-135`                                                                                                              |
| 35  | FichaModelo `<dialog>` + `modelos.ts` `{es,en}` + `import()` + paridad                                                                      | C                    | `FichaModelo.tsx`, `FichaButton.tsx:10`, `src/content/modelos.ts`, `tests/unit/modelos.test.ts`                                                                    |
| 36  | Nivel 2: estimación calibrada, «incluir de todos modos», progreso, Cancelar con instantánea                                                 | C                    | `Level2Card.tsx`, `TrainingScreen.tsx:38-106`, `useExperiment.ts:891-962`                                                                                          |
| 37  | «Nuevo experimento» durante el Nivel 2 usa el camino de cancelar (R15)                                                                      | P                    | `reset()` respawnea (`useExperiment.ts:1068`), pero la UI no ofrece «Nuevo experimento» mientras corre (`page.tsx:50-57`). AU-S5-20.                               |
| 38  | TrainingScreen «progreso modelo a modelo **con tiempo estimado**» (pantalla 3)                                                              | P                    | El tiempo estimado solo aparece en el Nivel 2 (`TrainingScreen.tsx:38-45`). AU-S5-21.                                                                              |
| 39  | Elección manual + «Volver al ganador»                                                                                                       | C                    | `useExperiment.ts:868-883`, `LeagueTable.tsx:212-238`                                                                                                              |
| 40  | Observabilidad: breadcrumb con solo metadatos                                                                                               | C (ver AU-S5-19, 28) | `observability.ts:60-83`                                                                                                                                           |
| 41  | Manual: sección S5, diccionario, FAQ                                                                                                        | C (ver AU-S5-17)     | `docs/MANUAL-DE-USO.md:208-299, 347-360`                                                                                                                           |
| 42  | Guía v2 acumulativa (hereda 27, bloque F, 4 ⭐, `guia-ds:s5:`)                                                                              | C (ver AU-S5-11)     | `docs/GUIA-DE-PRUEBA.html` (38 `li[data-origen]`, 4 `.o-clave`)                                                                                                    |
| 43  | design-system + `design-sync/` en el mismo PR                                                                                               | C                    | `design-system.md:155-244`, `design-sync/components/componentes/{liga,encarriladores,ficha-modelo}.html`                                                           |
| 44  | Brochure: corrección mínima (U2/D1)                                                                                                         | P                    | La tarjeta V9 se corrigió (`BROCHURE.html:805`), pero quedan dos frases falsas (AU-S5-04, AU-S5-05).                                                               |
| 45  | ADR 009, 010 y 011; ADR 008 marcado                                                                                                         | C (ver AU-S5-18)     | `decisions/009-*.md`, `010-*.md`, `011-*.md`, `008-*.md:3`                                                                                                         |
| 46  | e2e: liga · cancelar · booster · reduced-motion · axe en ambos temas en cada pantalla tocada                                                | P                    | Las cuatro specs existen. axe en ambos temas solo cubre Resultados y la ficha (AU-S5-08).                                                                          |
| 47  | Contrapesos ⭐: pasada de capturas 360/1280 en ambos temas                                                                                  | C                    | `scripts/capturas-s5.mjs`; 36 mediciones según la bitácora                                                                                                         |
| 48  | R8: «la narración se invalida sola… un test lo fija»                                                                                        | P                    | El comportamiento existe (`useNarration.ts:82-85`), pero el test no (AU-S5-22).                                                                                    |
| 49  | R3: «`target-not-binary` deja de ser alcanzable desde la UI»                                                                                | N                    | Sigue siendo alcanzable (sonda 1; AU-S5-10).                                                                                                                       |
| 50  | Summary EN el PR, `/deploy-check`                                                                                                           | —                    | Fuera de esta fase (van después de la auditoría).                                                                                                                  |

---

## Casilla 2 — Calidad de código

### Correctitud

- **Máquina de estados del Nivel 2** (`useExperiment.ts:305-350, 399-740, 891-962`): recorrí 13
  escenarios y todos se comportan como dice el ADR 010:
  - cancelar antes o después de la instantánea;
  - el Nivel 2 que falla en Python o en el contrato;
  - el worker que muere antes o después de la instantánea;
  - la restauración que falla;
  - doble clic en Cancelar;
  - elegir mientras se restaura (los mensajes se encolan en orden en el runner);
  - `reset` con trabajo en vuelo;
  - Nivel 2 con elección manual previa;
  - mensajes tardíos de un worker terminado (se ignoran porque el mapa de pendientes se vació).

  Sin defectos en esta parte.

- **Defectos verificados:** AU-S5-01 (veredicto), AU-S5-02 (TaskCard contra el bloqueo), AU-S5-07
  (orden retener/detalles en `fit_member`), AU-S5-10 (E1 frente a `isBinaryTarget`) y AU-S5-23
  (liga vacía → error genérico).
- **Contrato:** sin defectos de forma. TS y Python desempatan igual (el primero máximo) y comparan
  con los mismos doubles, así que el recálculo de la selección en TS es determinista.

### Seguridad y privacidad (regla dura 2)

Revisé cada `console.*`, cada `report*`, `recordLeagueRun` y los mensajes de error nuevos:

- `console.error("[experiment] …")` (`useExperiment.ts:432, 491, 584, 608, 628`) es solo local;
  `scrubSentryEvent` descarta los breadcrumbs de consola (`sentry-scrub.ts:20-27`).
- Las excepciones a Sentry llegan sin mensaje (`sentry-scrub.ts:29`).
- Python solo envía el **tipo** de la excepción (`pipeline.py:541, 578`).
- `recordLeagueRun` lleva solo conteos (`observability.ts:69-83`).

**Hueco latente:** las rutas de `dict()` incrustan el nombre de columna del usuario y viajan como
`contract:<campo>` a los tags de Sentry (AU-S5-15). El regex de `pythonContractField` no está
anclado (AU-S5-16).

### Tests

- Motores: más del 80 % ✓. Integración en Pyodide real (CI) ✓. Carnadas ✓.
- **Huecos:**
  - Sin tests unitarios del hook para `chooseMember`/`fit-member` ni para `planTarget`/
    `selectTarget` (AU-S5-09).
  - El R2 «pierde» no tiene test (AU-S5-01).
  - Falta el test de R8 (AU-S5-22).
  - Ningún test asegura que cada miembro del roster tenga sus nombres i18n (AU-S5-27).
  - El test de integración usa su propia copia de `withoutLeague` (AU-S5-26).

### Diseño y consistencia

- Hay comentarios interinos que el F2 dejó caducados (AU-S5-12).
- `BASELINE_IDS` se exporta pero no se usa (AU-S5-25).
- La categoría del breadcrumb no coincide con la convención documentada (AU-S5-28).

---

## Casilla 3 — Herramientas y dependencias

**Sin hallazgos.** Los validadores escritos a mano en lugar de zod están justificados (budget de
script de 300 KB, lección S2). Cargar xgboost por la URL de su wheel, sin el cierre declarado,
está medido (0,84 MiB menos) y vigilado (`pyodide-paquetes.test.ts` + integración). Los upgrades
de next 16.3.8 y fast-uri, y el aviso `braces` aceptado por GHSA, están documentados con su
condición de retiro (`pnpm-workspace.yaml:17-27`). La devDep `yaml` solo la usa el test de
dependabot.

---

## Casilla 4 — ¿Qué frases caducaron?

Barrido por vocabulario de promesa aplazada sobre las superficies pedidas, más un barrido de
afirmaciones que el S5 invalida.

| Coincidencia                                                                                              | Ubicación                                                                                | ¿Verdad HOY?                                                                                                           | Hallazgo       |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------- |
| «Todas las métricas se calculan sobre el conjunto de prueba, nunca sobre el de entrenamiento.»            | `messages/es.json:157`, `en.json:157` → `ResultsScreen.tsx:298`, `modelcard.ts:222`      | **Falsa:** en la misma pantalla, la tabla de la liga muestra métricas de validación cruzada calculadas dentro de train | AU-S5-03       |
| «Toda cifra que te muestre la app sale de esa segunda mitad.»                                             | `docs/BROCHURE.html:950-951`                                                             | **Falsa** (puntajes de CV dentro de train; además, la partición es 75/25, no mitades)                                  | AU-S5-04       |
| «…y toda cifra sale del conjunto de prueba»                                                               | `docs/brochure-export.json:29`                                                           | **Falsa**                                                                                                              | AU-S5-04       |
| «33 funcionalidades, todas las que Probeta DS tiene hoy. Ninguna se quedó fuera de esta página.»          | `docs/BROCHURE.html:1155-1156`                                                           | **Falsa** desde el S5 (liga, fichas, Nivel 2, elección manual no están)                                                | AU-S5-05       |
| «Recorre las pantallas nuevas (… candidatos)»                                                             | `docs/GUIA-DE-PRUEBA.html:308` (E4)                                                      | **Estado que ya no existe:** la lista de candidatos se retiró                                                          | AU-S5-11       |
| «S5: derivado de la liga … mientras la UI de la F2 no la reemplace» · «Interino S5 F1 … hasta que la F2…» | `src/workers/protocol.ts:100, 214`; `src/lib/experiment.ts:251-252`                      | **Caducada:** la F2 ya la reemplazó                                                                                    | AU-S5-12       |
| «Modelos que compitieron» / «elegido» / «Métrica» / «primaria» / nota de candidatos                       | `messages/es.json:177, 210-213` (y en)                                                   | Claves muertas: ninguna pantalla las lee                                                                               | AU-S5-12       |
| «El objetivo debe tener exactamente dos categorías.»                                                      | `messages/es.json` `errors.target-not-binary`                                            | Alcanzable junto a «✓ clasificación binaria» (sonda 1)                                                                 | AU-S5-10       |
| «compiten todos los que tu navegador puede entrenar (14 …)»                                               | `docs/MANUAL-DE-USO.md:210-211`                                                          | **Sobredicha:** compite el Nivel 1; el resto es a demanda y puede haber «fuera»                                        | AU-S5-17       |
| «Baseline: … responder siempre lo más frecuente» · «primera mitad … segunda»                              | `MANUAL-DE-USO.md:283, 285`; `BROCHURE.html:1130, 1132`                                  | **Falsas** (dos baselines, y la logística es una de ellas, como el S5 ahora dice; partición 75/25)                     | AU-S5-17       |
| «5 trozos (3 si son muy grandes)»                                                                         | `MANUAL-DE-USO.md:293`                                                                   | Incompleta: k se acota a la clase minoritaria                                                                          | AU-S5-17       |
| ADR 011: «Before (H1): not computed / not shown»                                                          | `decisions/011-honesty-that-accompanies.md:24`                                           | **Falsa:** el S4 calculaba y mostraba la prueba de RF y HGB                                                            | AU-S5-18       |
| ADR 010: «`reset()`… a new experiment never queues behind an abandoned league (R15)»                      | `decisions/010-…md:79-80`                                                                | La UI no permite abandonar una liga con «Nuevo experimento»                                                            | AU-S5-20       |
| `task.notYet`: «todavía no… llega en una próxima versión. Por ahora…»                                     | `messages/es.json:452`, `en.json:452`                                                    | Verdadera hoy (solo binaria); caduca en el S6/S7                                                                       | — (inventario) |
| `config.target.help` «Esta versión entrena las de dos categorías»                                         | `messages/es.json:76`                                                                    | Verdadera hoy                                                                                                          | —              |
| `config.warnings.date` «En esta versión no se usan…»; `modelcard.limits.{binary,dates}`                   | `messages/es.json:87, 391, 394`                                                          | Verdaderas hoy (heredadas)                                                                                             | —              |
| `roster.level2Hint` «podrás correr la liga completa»; `roster.note` «podrás incluirlo… en el Nivel 2»     | `messages/es.json:458, 469`; `design-sync/components/componentes/encarriladores.html:62` | Verdaderas (Level2Card existe)                                                                                         | —              |
| `level2.cancelHint` «vuelves a este resultado sin perder nada»                                            | `messages/es.json` `level2.cancelHint`                                                   | Verdadera (salvo `restore-failed`, que se avisa)                                                                       | —              |
| Manual «mientras tanto, Usar el modelo y Exportar esperan»                                                | `MANUAL-DE-USO.md:261`                                                                   | Verdadera                                                                                                              | —              |
| Manual «Publicar el modelo… llegará más adelante»; «no puede detectar cambios más sutiles»                | `MANUAL-DE-USO.md:167, 169`                                                              | Verdaderas (heredadas)                                                                                                 | —              |
| Brochure «Ni tres, ni un número continuo, todavía»; «aún no se usan»                                      | `BROCHURE.html` (sección «Qué mide»)                                                     | Verdaderas hoy                                                                                                         | —              |
| Brochure «Etapa 4 … un segundo modelo compitiendo»                                                        | `BROCHURE.html:1167`                                                                     | Verdadera como historia (etapa 4)                                                                                      | —              |
| `design-sync/README.md:13` «El diferenciador no es el AutoML (commodity)»                                 | `design-sync/README.md:13`                                                               | No contradice el texto nuevo; ya está matizada en la línea 16                                                          | —              |
| `README.md`                                                                                               | —                                                                                        | Plantilla de create-next-app, sin afirmaciones del producto (K-S5-5)                                                   | —              |
| Plantillas de narración (`narration.template.verdict.*`)                                                  | `messages/es.json` `narration.template`                                                  | Verdaderas; con AU-S5-01, la plantilla dice «NO supera» mientras el banner dice «＝»                                   | AU-S5-01       |

---

## Casilla 5 — Campos del contrato sin consumidor

Conteo de lectores fuera de su construcción y de sus tests (grep del nombre del campo en `src/`).

| Tipo (archivo)                                             | Campos nuevos o ampliados                                                                                       | Con lector | Huérfanos                                                                                                                                                                                                                                     |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LeagueRow` (`protocol.ts:121-130`)                        | name, status, cv, test, elapsed_ms, error_type                                                                  |      5 / 6 | **`elapsed_ms`**: solo lo validan. El JSDoc `protocol.ts:127` dice que «calibra la estimación del Nivel 2», pero la calibración usa el total (`Level2Card.tsx:41`, `useExperiment.ts:905`). → AU-S5-13                                        |
| `CvScore` (`protocol.ts:113-119`)                          | mean, std, folds                                                                                                |      3 / 3 | `folds`: el validador de producción lo lee (`contract.ts:138`, folds = k). Aceptable                                                                                                                                                          |
| `CvSummary` (`protocol.ts:132-141`)                        | k, scoring, rule, best, se                                                                                      |      4 / 5 | **`scoring`**: solo `str` en `contract.ts:96`. → AU-S5-13                                                                                                                                                                                     |
| `PipelineResult` (`protocol.ts:153-172`)                   | model_name (compat), winner, league, cv, elapsed_ms, preprocessing (ahora obligatorio)                          |      6 / 6 | — (`preprocessing.numeric_medians`, heredado del S4, solo lo leen los tests)                                                                                                                                                                  |
| `ProgressDetail` (`protocol.ts:143-150`)                   | phase, member, index, total                                                                                     |      4 / 4 | —                                                                                                                                                                                                                                             |
| `MemberFitResult` (`protocol.ts:180-187`)                  | model, model_name, elapsed_ms, confusion_matrix, explainability, preprocessing                                  |      5 / 6 | **`elapsed_ms`**. → AU-S5-13                                                                                                                                                                                                                  |
| `Selection` (`protocol.ts:190-203`)                        | by, cvWinner, best, k, metric, rule, se, competitors, elapsedMs                                                 |      9 / 9 | —                                                                                                                                                                                                                                             |
| `ExperimentResult` (`protocol.ts:205-226`)                 | candidates (redefinido), league, selection, smallSample                                                         |      4 / 4 | — (`candidates` solo lo lee la model card; su comentario caducó, AU-S5-12)                                                                                                                                                                    |
| `RuntimeVersions` (`protocol.ts:279-287`)                  | xgboost?, lightgbm?                                                                                             |      2 / 2 | — (`model-file.ts:311-330`)                                                                                                                                                                                                                   |
| `DatasetSummary` (`protocol.ts:43-54`)                     | targetTasks (+ targetCandidates, que el S5 dejó sin uso)                                                        |      1 / 2 | **`targetCandidates`**: solo `experiment.ts:51,70` y dos tests. → AU-S5-14                                                                                                                                                                    |
| `TaskDetection` (`tarea.ts:28-35`)                         | task, reason, distinct, suggested                                                                               |      4 / 4 | —                                                                                                                                                                                                                                             |
| `Routing` (`encarrilador.ts:70-80`)                        | placements, level1, level2, out, ceilingS, level1EstimateS, unionEstimateS                                      |      5 / 7 | **`out`** (solo tests), **`ceilingS`** (ningún lector). → AU-S5-14                                                                                                                                                                            |
| `Level2Plan` (`encarrilador.ts:174-188`)                   | roster, added, forceable, factor, estimateS                                                                     |      4 / 5 | **`factor`** (ningún lector). → AU-S5-14                                                                                                                                                                                                      |
| Manifiesto (`model-file.ts:61-77, 104-107`)                | league[].{name,status,cv_mean,cv_std,test}, selection.{by,cv_winner,k,metric,rule}, versions.{xgboost,lightgbm} |     2 / 12 | **`league` y `selection` completos:** se escriben y se validan, pero el flujo de import no los lee; el resumen del import pierde «elegido por ti» (`StartScreen.tsx:286-299`). Las versiones sí tienen lector (`versionWarnings`). → AU-S5-06 |
| Dict de retorno de Python (`pipeline.py:585-608, 625-632`) | los mismos de `PipelineResult` / `MemberFitResult`                                                              |          — | Los mismos huérfanos de arriba                                                                                                                                                                                                                |

---

## Casilla 6 — La guía heredada contra la arquitectura

Contrasté las 27 pruebas heredadas (A1–A7, B1–B4, C1–C6, D1–D5, E1–E5) con el diseño y los ADR
de hoy:

- Siguen válidas A1–A7, B3, C1–C5, D1–D5, E1–E3 y E5.
  - En D3, la regla de la probabilidad en el CSV se matizó con una nota que apunta a F11.
  - En A4, la alerta EDA sigue apareciendo con un objetivo binario (`ConfigScreen.tsx:109-113`).
- B1, B2, B4 y C6 ya vienen marcadas «Mejorada en S5» y su resultado esperado coincide con el
  código. B2: rotación gana la logística y empata consigo misma; la rama corregida en AU-S5-01
  solo afecta a «pierde».
- **E4 pide revisar «candidatos», una pantalla que el S5 retiró.** Es un hallazgo: AU-S5-11.

---

## Casilla 6b — Ningún número de entidades cableado

La VISION v1.1.0 declara extensibles por datos la **liga** («toda la liga que tu navegador puede
entrenar»), las **tareas** (cuatro, con un encarrilador) y los idiomas.

- **Roster:**
  - Todo deriva de `MEMBER_IDS` (`roster.ts:7-22`).
  - Los conteos visibles salen de `league.length`, `detail.total` y `routing.level1.length`, con
    plural `_one`.
  - `COST_COEFFICIENTS` y `FICHAS` están tipados con `Record<MemberId…>`, así que agregar un
    miembro rompe la compilación hasta que tenga costo y ficha.
  - Busqué los literales 11/12/13/14 en `src/` y no aparecen.
  - **No hay test que asegure los nombres i18n por miembro**: agregar un id mostraría la clave
    cruda (AU-S5-27, Bajo).
- **Tareas:** `TRAINABLE_TASKS` es un dato (`tarea.ts:43`).
  - Las suposiciones de dos clases (`contract.ts:84, 207`, `confusionV` 2×2, `pipeline.py:451`
    `labels=[0,1]`, `RouteProfile.minorityShare`) pertenecen a la tarea binaria, la única que el S5
    entrena. No son la cardinalidad de una entidad extensible.
  - Quedan anotadas para el S7 (multiclase). No es hallazgo.
- **Baselines:** son fijos por diseño (dos, ADR 001). Sin embargo, `ResultsScreen.tsx:110, 281`
  repite la lista en vez de usar `BASELINE_IDS` (AU-S5-25, Bajo).

**Resultado:** ningún hallazgo Alto en esta casilla.

---

## Verificaciones adicionales pedidas

- **Regla 15 (gate de contrato entre lenguajes):**
  - **Emisor real:** `tests/integration/liga.test.ts:528-561` corre `pipeline.py` en Pyodide y
    escribe o compara `tests/fixtures/contrato/*.json` por firma de forma (`shape()`, `:496-508`;
    regenera con `CONTRATO_ACTUALIZAR=1`). El payload lo emite el `prepareRun` real (`:560`).
  - **Lector en producción:** `contract.ts` se usa en `useExperiment.ts:411, 489, 544, 582, 606,
623`. `_validate_payload` está en `pipeline.py:338-363`.
  - **Carnadas:** train 26/26 · fit-member 6/6 · progreso 5/5 · export 6/6 · score 5/5 ·
    manifiesto 16/16 · TS → Python 16/16. Todos los campos nuevos del contrato tienen carnada
    (`chosen_by_user` se retiró por D10).
  - **Cruces de punta a punta:** `liga.test.ts:360-427` (prepareRun → Pyodide → contract →
    assembleResult → fit_member → applyMemberFit, y el progreso) y el e2e `liga.spec.ts`.
  - **Veredicto:** ✓.
- **Cero enlaces:** barrido vacío y homepage = repo ✓.
- **Paridad i18n:** `tests/unit/i18n-parity.test.ts` ✓ (incluye las claves `_one`).
- **e2e:**

  | Cobertura                                     | Estado | Dónde                                                                       |
  | --------------------------------------------- | :----: | --------------------------------------------------------------------------- |
  | Liga                                          |   ✓    | `tests/e2e/liga.spec.ts`                                                    |
  | Cancelar                                      |   ✓    | `liga-cancelar.spec.ts`, que además exporta el Nivel 1                      |
  | Exportar un booster                           |   ✓    | `liga-booster-export.spec.ts` (LightGBM; XGBoost y LightGBM en integración) |
  | reduced-motion con visibilidad real           |   ✓    | `reduced-motion-app.spec.ts:10-39`, opacidad efectiva contando ancestros    |
  | axe en ambos temas: Resultados y diálogo      |   ✓    | `liga.spec.ts:23-31, 75, 82, 125`                                           |
  | axe en Configuración, Entrenamiento y Nivel 2 |   ✗    | AU-S5-08                                                                    |

---

## Hallazgos

Cada hallazgo trae severidad, ubicación verificada, qué está mal, evidencia, ajuste ejecutable y
criterio de «verificado». Recordatorio de la regla 11: todo test nuevo que funcione como gate se
demuestra **en rojo** (revirtiendo el ajuste) y se registra en la bitácora.

### AU-S5-01 — Alto — El banner de la logística esconde un veredicto «NO supera»

- **Dónde:** `src/components/ResultsScreen.tsx:107-112` (condición) y `:120-125` (banner).
- **Qué está mal:**
  - `logisticWon = modelName === "logistic" && selection.by === "cv" && verdict.level !== "beats"`.
    Como la logística también es baseline, el veredicto nunca puede ser «beats» con ella:
    `pickBestBaseline` toma el máximo de las dos, y el delta es ≤ 0.
  - La condición vale entonces también para **«loses»**. Ocurre cuando la clase mayoritaria
    (AUC 0,50) supera a la logística (por ejemplo, AUC de prueba 0,46), un caso típico con datos
    desbalanceados y sin señal: justo cuando la logística gana la liga por ser la primera dentro
    del error estándar.
  - En ese caso el titular muestra «＝ La liga no encontró nada mejor que la regresión de
    referencia», con detalle «…a la regresión logística, que también es el baseline». Ese texto
    esconde el «▼ NO supera» y sus cifras.
  - Rompe la regla dura 3 («el veredicto contra baseline sigue siendo franco») en la pieza
    jerárquica de la pantalla.
- **Evidencia:**
  - `verdict.ts:43-53` (máximo de los baselines) y `:68-74` (niveles).
  - La model card (`modelcard.ts:75-77`) y la plantilla de narración sí dirán «NO supera»: la
    pantalla se contradice a sí misma.
  - El único test (`tests/unit/league-ui.test.tsx:391-402`) cubre solo `ties`.
- **Ajuste ejecutable:**
  1. En `ResultsScreen.tsx`, reemplazar las líneas 107-112 por:
     ```ts
     // S5 (R2): la logística es baseline Y miembro — si gana la liga y EMPATA, empata
     // consigo misma y se dice así. Si PIERDE (la clase mayoritaria rinde mejor), el
     // veredicto franco «NO supera» no se reemplaza (regla dura 3).
     const logisticWon =
       result.modelName === "logistic" &&
       result.selection.by === "cv" &&
       verdict.level === "ties";
     ```
  2. En `tests/unit/league-ui.test.tsx`, después de la línea 402, agregar:
     ```tsx
     it("R2: si gana la logística pero PIERDE contra la clase mayoritaria, el veredicto franco se mantiene", () => {
       const result = rotationResult();
       screenWith({
         ...result,
         verdict: {
           ...result.verdict,
           level: "loses",
           delta: -0.04,
           modelScore: 0.46,
           baselineScore: 0.5,
         },
       });
       expect(
         screen.queryByText(
           "La liga no encontró nada mejor que la regresión de referencia",
         ),
       ).toBeNull();
       expect(
         screen.getByRole("heading", {
           level: 1,
           name: /NO supera al baseline/,
         }),
       ).toBeInTheDocument();
     });
     ```
  3. Demo en rojo: con la condición vieja (`!== "beats"`), el test nuevo falla; con la nueva pasa.
     Registrarlo en la bitácora.
- **Verificado cuando:** `pnpm vitest run tests/unit/league-ui.test.tsx` está verde con el caso
  nuevo; el caso `ties` existente (`:391`) sigue verde; la demo en rojo queda registrada.

### AU-S5-02 — Medio — TaskCard dice «✓ Se puede entrenar» cuando el plan está bloqueado

- **Dónde:** `src/components/TaskCard.tsx:9-13, 45-47`; `src/components/ConfigScreen.tsx:105`.
- **Qué está mal:**
  - `TaskCard` calcula `trainable = isTrainable(detection)` sin mirar `plan.blocked`.
  - Con un objetivo binario bloqueado por `too-few-rows` (o por AU-S5-10), la pantalla muestra a
    la vez «✓ 2 valores distintos → clasificación binaria. Se puede entrenar.», en verde, y
    «✕ Hay muy pocos ejemplos…», con el botón deshabilitado.
  - Son dos mensajes contradictorios, y el ✓ verde es justo la señal que el usuario lee como «todo
    bien».
- **Evidencia:** `ConfigScreen.tsx:105` (`<TaskCard detection={plan.task} />`), `:116-126` (el
  bloqueo). El test `league-ui.test.tsx:246-257` no afirma la ausencia de «Se puede entrenar.».
- **Ajuste ejecutable:**
  1. `TaskCard.tsx`:
     - La firma pasa a `export function TaskCard({ detection, blocked = false }: { detection: TaskDetection; blocked?: boolean })`.
     - La línea 12 pasa a `const trainable = isTrainable(detection) && !blocked;`.
     - Las líneas 45-47 pasan a
       `{trainable ? t("task.trainable") : blocked ? t("task.blocked") : t("task.notYet")}`.
  2. `ConfigScreen.tsx:105` pasa a `<TaskCard detection={plan.task} blocked={plan.blocked !== null} />`.
  3. i18n, en el mismo paso:
     - `messages/es.json` → `task.blocked`: «Es un tipo de predicción que la app entrena, pero con
       estos datos no se pueden comparar modelos con honestidad (el motivo está abajo).»
     - `messages/en.json` → `task.blocked`: «The app trains this kind of prediction, but with this
       data models cannot be compared honestly (the reason is below).»
  4. En `league-ui.test.tsx:246-257`, agregar:
     ```tsx
     expect(screen.queryByText("Se puede entrenar.")).toBeNull();
     expect(
       screen.getByText(/no se pueden comparar modelos con honestidad/),
     ).toBeInTheDocument();
     ```
- **Verificado cuando:**
  - El test está verde, y con `blocked` ignorado se pone rojo.
  - En la pantalla con el objetivo bloqueado ya no hay ✓ verde: aparece ⚠ con el texto nuevo.

### AU-S5-03 — Medio — «Todas las métricas se calculan sobre el conjunto de prueba» caducó

- **Dónde:** `messages/es.json:157` y `messages/en.json:157` (`results.testNote`), mostrado en
  `ResultsScreen.tsx:298` y en `modelcard.ts:222`.
- **Qué está mal:** desde el S5, la misma pantalla muestra la tabla de la liga con métricas de
  validación cruzada calculadas **dentro del entrenamiento**. La frase «nunca sobre el de
  entrenamiento» queda falsa para la pantalla entera.
- **Ajuste ejecutable:**
  - `messages/es.json:157`: «Las métricas del veredicto, la matriz de confusión y los baselines
    se calculan sobre el conjunto de prueba, nunca sobre el de entrenamiento. La tabla de la liga
    usa validación cruzada dentro del entrenamiento: sirve para elegir.»
  - `messages/en.json:157`: «The verdict metrics, the confusion matrix and the baselines are
    computed on the test set, never on the training set. The league table uses cross-validation
    inside the training set: it is for choosing.»
- **Verificado cuando:**
  - `pnpm test` (paridad i18n) está verde.
  - `grep -n "Todas las métricas se calculan" messages/es.json` sale vacío.
  - La model card descargada contiene la frase nueva.

### AU-S5-04 — Medio — Brochure y export afirman que «toda cifra sale de la prueba»

- **Dónde:**
  - `docs/BROCHURE.html:950-951`: «El modelo aprende con una mitad… Toda cifra que te muestre la
    app sale de esa segunda mitad.»
  - `docs/BROCHURE.html:939`: el rótulo «Con esta mitad aprende».
  - `docs/brochure-export.json:29` (`diferencial`): «…se ajusta solo con la mitad de
    entrenamiento… y toda cifra sale del conjunto de prueba.»
  - `docs/brochure-export.json:381`: «…fuera de la mitad de entrenamiento».
- **Qué está mal:** el S5 muestra puntajes de validación cruzada calculados dentro de train, así
  que la frase es falsa en la ruta pública `/conoce` y en la vitrina. Además, la partición es
  75/25 (`experiment.ts:47`, `TEST_SIZE = 0.25`), no «mitades».
  La decisión U2 pide corregir lo que el S5 vuelve falso; esto es lo que quedó.
- **Ajuste ejecutable:**
  - `BROCHURE.html:939`: «Con esta mitad aprende» → «Con esta parte aprende».
  - `BROCHURE.html:950-953`: reemplazar el párrafo por «El modelo aprende con una parte y se
    examina con la otra, que nunca vio. El veredicto y sus métricas salen de esa segunda parte;
    para elegir entre modelos, la app los compara solo dentro de la primera (validación cruzada).
    <b>Por eso el número es real</b> — y por eso no hay forma de que la limpieza de datos
    contamine el examen: se ajusta solo con la parte de aprender.»
  - `brochure-export.json:29`:
    - «…se ajusta solo con la mitad de entrenamiento…» → «…se ajusta solo con la parte de
      entrenamiento…».
    - «…y toda cifra sale del conjunto de prueba.» → «…y el veredicto sale del conjunto de
      prueba, que se abre una sola vez, después de elegir el modelo con validación cruzada.»
  - `brochure-export.json:381`: «fuera de la mitad de entrenamiento» → «fuera de la parte de
    entrenamiento».
- **Verificado cuando:**
  - `grep -n "Toda cifra\|toda cifra" docs/BROCHURE.html docs/brochure-export.json` sale vacío.
  - `pnpm vitest run tests/unit/brochure-export.test.ts` está verde.
  - El e2e `tests/e2e/brochure.spec.ts` está verde.
  - Hay una captura del bloque «Por qué el número es real» en 360 px, leída como imagen
    (regla 12).

### AU-S5-05 — Medio — El pie del brochure dice «ninguna se quedó fuera» y ya no es cierto

- **Dónde:** `docs/BROCHURE.html:1155-1156`.
- **Qué está mal:** «33 funcionalidades, todas las que Probeta DS tiene hoy. Ninguna se quedó fuera
  de esta página.» Desde el S5 la app tiene funcionalidades que la página no lista: la liga, las
  fichas, el Nivel 2 y la elección manual. U2 fijó el conteo en 33, pero no autoriza afirmar que
  está completo.
- **Ajuste ejecutable:** reemplazar las líneas 1155-1156 por
  `<b><span class="oculto-visual">33 </span>funcionalidades</b> del primer ciclo (H1), todas en esta página. Las de la liga honesta (Sprint 005) se suman cuando la página se re-arme, al cierre del ciclo H2.`
  Se mantiene `data-contador="33"` y el texto contiguo «33 funcionalidades» que exige
  `brochure.spec.ts:99-102`.
- **Verificado cuando:**
  - `brochure-export.test.ts` y `brochure.spec.ts` están verdes.
  - `grep -n "Ninguna se quedó fuera" docs/BROCHURE.html` sale vacío.

### AU-S5-06 — Medio — El import no lee `selection`: «elegido por ti» se pierde al importar

- **Dónde:** `src/components/StartScreen.tsx:290-299` (ImportSummary); `src/lib/model-file.ts:104-107`
  (campos); `:262-275` (escritura).
- **Qué está mal:**
  - El manifiesto registra `selection.by = "user"` y `league`, pero ningún lector de la app los
    usa después del import (casilla 5: 10 de 12 campos huérfanos).
  - Un modelo elegido a mano, exportado y reimportado, muestra su métrica y su veredicto sin la
    etiqueta «◆ Elegido por ti». La honestidad que «acompaña y etiqueta» se cae justo al cruzar
    el archivo.
- **Ajuste ejecutable:**
  1. En `StartScreen.tsx`, después del bloque `manifest.model_name` (línea 299), agregar:
     ```tsx
     {
       manifest.selection?.by === "user" && (
         <li>
           {t("start.import.summary.chosen", {
             winner: t(
               `results.candidates.model.${manifest.selection.cv_winner}`,
             ),
           })}
         </li>
       );
     }
     {
       manifest.selection?.by === "cv" && (
         <li>
           {t("start.import.summary.cv", {
             k: manifest.selection.k,
             count: manifest.league?.length ?? 0,
           })}
         </li>
       );
     }
     ```
  2. i18n, ambos idiomas:
     - `start.import.summary.chosen`:
       - es: «◆ Elegido por ti, no por la validación cruzada (el ganador de la validación cruzada
         era {winner}). Si se eligió mirando la prueba, la métrica puede ser optimista.»
       - en: «◆ Chosen by you, not by cross-validation (the cross-validation winner was {winner}).
         If it was chosen by looking at the test set, the metric may be optimistic.»
     - `start.import.summary.cv`:
       - es: «Elegido por validación cruzada de {k} pliegues entre {count} modelos.»
       - en: «Chosen by {k}-fold cross-validation among {count} models.»
     - `start.import.summary.cv_one`:
       - es: «Elegido por validación cruzada de {k} pliegues (compitió 1 modelo).»
       - en: «Chosen by {k}-fold cross-validation (1 model competed).»
  3. En `tests/unit/start-import.test.tsx`, agregar un caso con un archivo empaquetado con
     `selection.by: "user"`: tras validarlo, el resumen muestra «◆ Elegido por ti».
  4. Manual: en `docs/MANUAL-DE-USO.md:159-160`, agregar a la lista del resumen «y, si lo elegiste
     a mano, la etiqueta ◆ Elegido por ti».
- **Verificado cuando:**
  - El test nuevo está verde.
  - La paridad i18n está verde.
  - La casilla 5 recontada da `selection.by` y `cv_winner` con lector.
  - Si `league[].*` y `selection.metric/rule` quedan como registro legible del archivo (ADR 007,
    «la cara legible»), se anota explícitamente en la bitácora.

### AU-S5-07 — Medio — `fit_member` retiene el modelo antes de calcular los detalles

- **Dónde:** `src/lib/ds/pipeline.py:621-632` (`_retain` en 624, `_selected_details` en 630); lo
  mismo en `run_experiment` (`:583` antes de `:606`). El comentario contradicho está en
  `src/lib/useExperiment.ts:468` («Python falló ANTES de retener: el modelo activo sigue siendo el
  de antes»).
- **Qué está mal:**
  - Si `_selected_details` (matriz, permutación, estadísticos) lanza, o si el JSON resultante no
    se puede parsear, `_MODEL` ya es el miembro nuevo.
  - La UI dice «No se pudo ajustar… Sigue activo el modelo anterior»
    (`LeagueTable.tsx:365-372`), pero exportar o puntuar usa el modelo nuevo. El veredicto y la
    model card hablan de un modelo y el archivo exportado lleva otro.
  - En `run_experiment` el Nivel 2 lo cubre la instantánea; en `fit_member`, nada.
- **Ajuste ejecutable:**
  1. `pipeline.py:621-632` queda:
     ```python
     pipe = _member_pipe(name, ctx).fit(ctx["X_train"], ctx["y_train"])
     y_pred = pipe.predict(ctx["X_test"])
     metrics = _metrics(ctx["y_test"], y_pred, _scores(pipe, ctx["X_test"]))
     details = _selected_details(pipe, y_pred, ctx)  # puede lanzar: ANTES de retener
     _retain(pipe, ctx, p["target"])
     return json.dumps({"model": metrics, "model_name": name, "elapsed_ms": _elapsed_ms(started), **details})
     ```
  2. `pipeline.py:582-606`: calcular `details = _selected_details(winner_pipe, winner_pred, ctx)`
     antes de `_retain(...)` y usar `**details` en el dict.
  3. Copiar `src/lib/ds/pipeline.py` a `public/pyodide/pipeline.py` por el mecanismo existente
     (test de identidad).
  4. Test en `tests/integration/liga.test.ts`, en el bloque «elección manual», «si fit_member
     falla después de ajustar, el modelo retenido NO cambia»:
     - correr la liga de rotación;
     - leer `py.runPython("type(_MODEL['pipe'].named_steps['model']).__name__")`;
     - parchear `_selected_details` para que lance (`py.runPython("_REAL_SD = _selected_details\ndef _selected_details(*a, **k):\n    raise RuntimeError('boom')")`);
     - esperar que `fitMember(... member distinto del ganador)` lance;
     - restaurar (`_selected_details = _REAL_SD`);
     - el nombre de clase del modelo retenido tiene que ser el mismo de antes.
  5. Demo en rojo: con el orden viejo, el test falla (la clase cambia).
- **Verificado cuando:** `pnpm test:integration` está verde con el test nuevo; la demo roja queda
  registrada; el comentario `useExperiment.ts:468` vuelve a ser verdad.

### AU-S5-08 — Medio — axe en ambos temas no cubre Configuración, Entrenamiento ni el Nivel 2 oscuro

- **Dónde:**
  - `tests/e2e/liga.spec.ts:40-48`: la configuración se recorre sin axe.
  - `tests/e2e/liga-cancelar.spec.ts:40-41`: axe solo en tema claro, y ninguno durante el Nivel 2.
  - Los demás specs pasan axe solo sobre Resultados o Puntuar, en tema claro.
- **Qué está mal:** el plan (Fase 2, punto 8) pide «axe en ambos temas en cada pantalla tocada».
  Hay tres pantallas tocadas que nunca se auditan:
  - TaskCard (verde `positive/15`, ámbar `caution/10`) y RosterCard;
  - TrainingScreen con la barra y «Cancelar el Nivel 2»;
  - Level2Card en oscuro.
- **Ajuste ejecutable:**
  1. `liga.spec.ts`:
     - Tras `page.selectOption("#target", "renuncio")` (línea 40) y el `expect` de «Quién
       compite» (45-47), insertar
       `await axeBothThemes(page); await page.emulateMedia({ colorScheme: "light" });`.
     - Antes, seleccionar `"edad"` (TaskCard no entrenable, en ámbar), correr
       `await axeBothThemes(page);` y volver a `"renuncio"`.
  2. `liga-cancelar.spec.ts`:
     - Copiar las funciones `settle` y `axeBothThemes` de `liga.spec.ts:15-31`.
     - Reemplazar las líneas 40-41 por `await axeBothThemes(page); await page.emulateMedia({ colorScheme: "light" });`.
     - Después de la línea 50 (el Nivel 2 corriendo), agregar
       `await axeBothThemes(page, "main"); await page.emulateMedia({ colorScheme: "light" });`.
  3. Demo en rojo: bajar a propósito el contraste de un texto de TaskCard (por ejemplo,
     `text-ink-muted/40` en `TaskCard.tsx:45`). El axe nuevo falla nombrando `color-contrast`. Se
     revierte y se registra en la bitácora.
- **Verificado cuando:** `CI=1 pnpm test:e2e tests/e2e/liga.spec.ts tests/e2e/liga-cancelar.spec.ts`
  está verde en móvil y escritorio, y el job `e2e` del PR tiene conclusión propia `success`.

### AU-S5-09 — Medio — El hook no tiene tests unitarios de la elección manual ni del plan E1+E2

- **Dónde:** `src/lib/useExperiment.ts`. Líneas sin cubrir medidas por el auditor (corrida con
  cobertura de `tests/unit/use-hooks.test.tsx`):
  - 241-270: `planTarget`;
  - 469-474: error de fit-member;
  - 619-643: resultado de fit-member;
  - 785-794: `selectTarget`;
  - 869-882: `chooseMember`.

  `useExperiment.ts` queda en 76,1 % de líneas y 57,8 % de ramas.

- **Qué está mal:** la elección manual (U1) es una de las tres decisiones del usuario y su máquina
  de estados en el hook no tiene ningún test unitario. Solo la cubre el e2e (más lento, y no prueba
  ni el error ni el contrato).
- **Ajuste ejecutable:** en `tests/unit/use-hooks.test.tsx`, dentro de `describe("useExperiment")`,
  agregar cuatro tests. Hay que agregar a `tests/unit/factories.ts` un `memberFit(result, member)`
  que devuelva `{ model, model_name: member, elapsed_ms, confusion_matrix, explainability, preprocessing }`
  tomados de un `pipelineResult`.
  1. `chooseMember("forest")`, después de un resultado de train:
     - postea `type: "fit-member"` con `payload.member === "forest"`, sin `roster` ni `cv_k`;
     - `choice` pasa a `{status:"fitting", member:"forest"}` y `modelReady` a `false`;
     - responder el resultado → `result.modelName === "forest"`, `selection.by === "user"`,
       `modelReady === true`, `choice.status === "idle"`.
  2. Error del runner en fit-member → `choice` es `{status:"error", member}`, `modelReady` es
     `true` y `result` no cambia.
  3. fit-member que vuelve con otro `model_name` → `phase === "error"` y
     `error.kind === "contract"`.
  4. `selectTarget`:
     - con `"y"` binaria → `plan.routing !== null`;
     - con una columna multiclase → `plan.routing === null` y `blocked === null`;
     - con un CSV de 6 filas y 1 positivo → `plan.blocked === "too-few-rows"`.
- **Verificado cuando:** los tests están verdes; las líneas listadas aparecen cubiertas; las ramas
  de `useExperiment.ts` llegan a 65 % o más (reportarlo en el summary).

### AU-S5-10 — Bajo — E1 y el entrenador no cuentan las clases igual: vuelve «objetivo no binario»

- **Dónde:** `src/engine/tarea.ts:64-70` (identidad numérica: «1» = «1.0») frente a
  `src/lib/ds/csv.ts:281-292` (`targetClasses`/`isBinaryTarget`, identidad de texto) y
  `src/lib/experiment.ts:157-159`.
- **Qué está mal:**
  - Con un objetivo que tiene «0», «1» y «1.0», `detectTask` dice `binaria`/`two-values`, pero
    `prepareRun` devuelve `target-not-binary`, igual que Python, que trata el objetivo como texto.
  - La pantalla muestra «El objetivo debe tener exactamente dos categorías», el mensaje que la
    orden prohíbe. Así se desmiente el R3 del plan.
  - Sonda 1 del auditor: `detectTask: {"task":"binaria",…} prepareRun.ok: false target-not-binary`.
- **Ajuste ejecutable:**
  1. `src/workers/protocol.ts`: agregar a `WorkerErrorKind` la variante
     `| "target-mixed-notation"` con el comentario
     `// S5: el objetivo tiene 2 valores para E1 pero escritos de más de una forma («1» y «1.0»).`
  2. `src/lib/experiment.ts:159` pasa a:
     ```ts
     if (!isBinaryTarget(labels)) {
       return {
         ok: false,
         error:
           detectTask(labels).task === "binaria"
             ? "target-mixed-notation"
             : "target-not-binary",
       };
     }
     ```
  3. i18n `errors.target-mixed-notation`:
     - es: «Tu objetivo tiene 2 valores, pero escritos de más de una forma (por ejemplo «1» y
       «1.0»): para entrenar, cada clase tiene que escribirse igual en todas las filas. Unifícalos
       en tu CSV y vuelve a cargarlo.»
     - en: «Your target has 2 values, but written in more than one way (for example «1» and
       «1.0»): to train, each class must be written the same way in every row. Make them
       consistent in your CSV and load it again.»
  4. En `tests/unit/experiment.test.ts`, agregar: `prepareRun` con objetivo `["0","1","1.0", …]`
     → `{ ok: false, error: "target-mixed-notation" }`.
  5. Con AU-S5-02 aplicado, TaskCard muestra ⚠ en vez de ✓.
- **Verificado cuando:** el test unitario está verde; `grep -rn "target-not-binary" src/` solo
  queda como defensa en `experiment.ts`; la paridad i18n está verde.

### AU-S5-11 — Bajo — La prueba heredada E4 de la guía pide revisar «candidatos», que ya no existe

- **Dónde:** `docs/GUIA-DE-PRUEBA.html:307-308` (`<li data-origen="s4">` … «(informe de
  saneamiento, alertas EDA, candidatos)»).
- **Ajuste ejecutable:**
  1. Línea 307: `data-origen="s4"` pasa a `data-origen="mejora"`.
  2. Línea 308:
     - el texto «alertas EDA, candidatos)» pasa a «alertas EDA y, desde el S5, la tabla de la
       liga, las tarjetas del encarrilador y la ficha de cada modelo)»;
     - después del chip `S4` y antes de `⭐ H1 · corrida`, agregar
       `<span class="origen o-mejora">Mejorada en S5</span>`.
  3. Línea 394 (historial): en «Mejoradas en S5: B1…, B2…, B4… y C6…», agregar «y E4 (la revisión
     visual incluye la liga)».
- **Verificado cuando:**
  - `grep -n "candidatos)" docs/GUIA-DE-PRUEBA.html` sale vacío.
  - El filtro «Mejorado en S5» muestra 5 pruebas.
  - El total sigue en 38.

### AU-S5-12 — Bajo — Claves i18n muertas y comentarios «interinos» caducados

- **Dónde:**
  - `messages/es.json:177` (`results.candidates.title`) y `:210-213` (`winner`, `metricCol`,
    `primary`, `note`).
  - Lo mismo en `messages/en.json:177, 210-213`.
  - `src/workers/protocol.ts:99-100` y `:214`.
  - `src/lib/experiment.ts:251-252`.
- **Qué está mal:** ninguna pantalla lee esas claves (grep vacío fuera de los JSON). Los
  comentarios prometen «hasta que la F2 la reemplace», y la F2 ya la reemplazó.
- **Ajuste ejecutable:**
  1. Borrar las cinco claves en ambos JSON. Se conservan `results.candidates.model` y
     `results.candidates.short`.
  2. Comentarios:
     - `protocol.ts:100`: «// S5: derivado de la liga (filas con test); lo lista la model card
       («Candidatos comparados»).»
     - `protocol.ts:214`: «/** Los miembros de la liga con puntaje de prueba (lo lista la model
       card). */»
     - `experiment.ts:251-252`: «// La model card lista los miembros con puntaje de prueba
       («Candidatos comparados»).»
- **Verificado cuando:**
  - `grep -n "metricCol\|Modelos que compitieron" messages/*.json` sale vacío.
  - `grep -n "Interino\|la F2" src` sale vacío.
  - Paridad y typecheck verdes.

### AU-S5-13 — Bajo — Campos del contrato Python → TS sin lector (`cv.scoring`, `league[].elapsed_ms`, `MemberFitResult.elapsed_ms`)

- **Dónde:**
  - `cv.scoring`: `protocol.ts:134`, `contract.ts:96`, `pipeline.py:600`.
  - `league[].elapsed_ms`: `protocol.ts:127-128` (su JSDoc dice «calibra la estimación del Nivel
    2», y es falso), `contract.ts:52`, `pipeline.py:542, 580`.
  - `MemberFitResult.elapsed_ms`: `protocol.ts:184`, `contract.ts:162`, `pipeline.py:629`.
- **Ajuste ejecutable:**
  1. **`cv.scoring` pasa a ser un cruce entre lenguajes:**
     - En `contract.ts`, declarar
       `const SCORER: Record<MetricName, string> = { auc: "roc_auc", f1: "f1", accuracy: "accuracy", precision: "precision", recall: "recall" };`
       (espejo de `pipeline.py:262-268`).
     - `validateTrainResult` recibe `sent: { roster; cv_k; primary_metric: MetricName }`.
     - Después de la línea 128, agregar
       `if (r.cv.scoring !== SCORER[sent.primary_metric]) return { ok: false, field: "cv.scoring" };`.
     - Agregar `primary_metric` a `sent` en `useExperiment.ts:215, 564, 820` (desde
       `payload.primary_metric`), en `tests/unit/contract.test.ts:33` (`SENT`) y en las llamadas
       de `tests/integration/liga.test.ts`.
     - Nueva carnada en `contract.test.ts:88`:
       `["cv.scoring", (t) => (t.cv.scoring = "accuracy")]`, para un total de 27 de 27.
     - Tripwire de paridad en `tests/unit/roster.test.ts`: el bloque `SCORER = {…}` de
       `pipeline.py` tiene las mismas parejas.
  2. **`league[].elapsed_ms` pasa a ser consumidor real de la calibración** (la ADR 010 dice «lo
     que tardaron los miembros que corrieron»):
     - `planLevel2` (`encarrilador.ts:195-218`) recibe `measured: { totalMs: number; membersMs: number }`
       en vez de `measuredMs`.
     - El factor pasa a `calibrationFactor(measured.membersMs, ranEstimateS)` y la estimación a
       `estimateS: factor * Σ + Math.max(0, measured.totalMs - measured.membersMs) / 1000`
       (la parte fija de la corrida anterior se suma una vez).
     - Callers (`Level2Card.tsx:41-45`, `useExperiment.ts:902-907`):
       `{ totalMs: result.selection.elapsedMs, membersMs: result.league.reduce((s, r) => s + r.elapsed_ms, 0) }`.
     - Actualizar los tests de `planLevel2` en `tests/unit/encarrilador.test.ts`.
     - JSDoc de `protocol.ts:127`: «CV + ajuste en train + test de ESTE miembro, en ms (calibra el
       Nivel 2: ver planLevel2).»
  3. **`MemberFitResult.elapsed_ms` se retira:**
     - borrarlo en `pipeline.py:629`, `protocol.ts:184` y `contract.ts:162`;
     - quitar la carnada `contract.test.ts:126` (5 de 5);
     - regenerar los fixtures con `CONTRATO_ACTUALIZAR=1 pnpm test:integration` y revisar el
       diff de `tests/fixtures/contrato/fit-member-result.json`.
- **Verificado cuando:**
  - `pnpm test` y `pnpm test:integration` están verdes.
  - Las carnadas reportan «train detectó 27 de 27» y «fit-member 5 de 5».
  - La casilla 5 recontada da 0 huérfanos en esos tipos.
  - La carnada `cv.scoring` se demuestra en rojo (quitar el cruce → la carnada pasa → test rojo).

### AU-S5-14 — Bajo — Salidas de motores TS sin lector (`targetCandidates`, `Routing.ceilingS`, `Routing.out`, `Level2Plan.factor`)

- **Dónde:**
  - `targetCandidates`: `src/workers/protocol.ts:47-49`, `src/lib/experiment.ts:51-53, 70`.
  - `Routing.ceilingS`: `encarrilador.ts:76, 161`.
  - `Routing.out`: `encarrilador.ts:75, 160`.
  - `Level2Plan.factor`: `encarrilador.ts:185, 215`.
- **Ajuste ejecutable:**
  1. Borrar `targetCandidates`: el campo del tipo, el cálculo (`experiment.ts:51-53`) y la
     propiedad (`:70`).
     - En `tests/unit/use-hooks.test.tsx:213`, reemplazar por
       `expect(result.current.state.dataset?.targetTasks.y?.task).toBe("binaria")`.
     - En `tests/unit/experiment.test.ts:42`, reemplazar por
       `expect(summary.targetTasks.convirtio?.task).toBe("binaria")`.
     - Si `isBinaryTarget` deja de usarse fuera de `prepareRun`, conservarla (la usa `prepareRun`).
  2. Borrar `ceilingS` del tipo `Routing` y del objeto devuelto (`:76`, `:161`). El parámetro de
     la función se queda.
  3. Borrar `factor` del tipo `Level2Plan` y del objeto devuelto (`:185`, `:215`). La variable
     local se queda.
  4. `Routing.out`: hacerlo consumidor real en `LeagueTable.tsx:64-66`. Reemplazar el filtro por
     `...(routing?.out ?? []).filter((id) => !ran.includes(id)).map((id): Entry => ({ kind: "out", placement: routing!.placements.find((p) => p.id === id)! }))`.
- **Verificado cuando:** typecheck, unit y e2e están verdes; `grep -rn "targetCandidates\|ceilingS:\|factor," src`
  no muestra campos de tipo de salida; la casilla 5 recontada está limpia.

### AU-S5-15 — Bajo — Las rutas de `dict()` incrustan nombres de columna del usuario y pueden llegar a Sentry

- **Dónde:** `src/lib/validate.ts:64-74` (el `at(path, key)` usa la clave del diccionario) y
  `:5`, el comentario que afirma lo contrario («Las rutas son nombres de campos de la app, nunca
  valores del dataset»). Destinos: `useExperiment.ts:388` (`failTrain` →
  `reportExperimentError("contract:<campo>")`), `:493`, `:548`, `:609`, `:632`.
- **Qué está mal:**
  - Los dicts son `preprocessing.numeric_medians`, `preprocessing.rare_categories`,
    `training_profile.numeric` y `training_profile.categorical`, y todos se indexan por **nombre
    de columna del usuario**.
  - Una violación en un valor viaja como tag de Sentry, por ejemplo
    `contract:preprocessing.numeric_medians.salario_juan` (sonda 2). La regla dura 2 dice
    «idealmente, ni nombres de columnas».
  - Hoy es latente (no encontré un disparador real), pero la garantía que el comentario declara
    no se cumple por construcción.
- **Ajuste ejecutable:**
  1. `validate.ts:69` pasa a `const issue = inner(value, path ? \`${path}._\` : "_");`; quitar el
`key` de la ruta.
  2. Unit en `tests/unit/contract.test.ts`, bloque «validate.ts»:
     `expect(check(dict(num), { salario_juan: "x" })).toEqual({ ok: false, field: "*" })`.
  3. Carnada nueva en el bloque fit-member:
     `["preprocessing.numeric_medians.*", (f) => { const k = Object.keys(f.preprocessing.numeric_medians)[0]; f.preprocessing.numeric_medians[k] = "x"; }]`.
- **Verificado cuando:** el test está verde; con la línea vieja, el test nuevo se pone rojo; la
  sonda 2 repetida devuelve `"*"`.

### AU-S5-16 — Bajo — `pythonContractField` no está anclado al final del traceback

- **Dónde:** `src/workers/contract.ts:254-258`.
- **Qué está mal:** `/contract:([A-Za-z_]+)/` busca en todo el mensaje. Cualquier texto
  `contract:xyz` dentro de otro error (por ejemplo, un valor citado por pandas o sklearn) se lee
  como «Python rechazó el campo xyz». Además viaja a Sentry como `contract:payload.xyz`
  (`useExperiment.ts:450-454` → `:388`).
- **Ajuste ejecutable:**
  1. `contract.ts:256` pasa a `const match = /ValueError: contract:([A-Za-z_]+)\s*$/.exec(message);`.
  2. En `tests/unit/contract.test.ts:202-207`, agregar
     `expect(pythonContractField("Traceback…\nValueError: could not convert 'contract:abc'\nRuntimeError: x")).toBeNull();`.
- **Verificado cuando:** la carnada nueva está verde (y roja con el regex viejo) y el caso
  existente `:205` sigue verde.

### AU-S5-17 — Bajo — Frases falsas en el manual y en el diccionario del brochure

- **Dónde:** `docs/MANUAL-DE-USO.md:210-213`, `:283`, `:285`, `:293`; `docs/BROCHURE.html:1130`,
  `:1132`.
- **Ajuste ejecutable:**
  - `MANUAL:210-213`: «**Qué hace:** en vez de dos modelos, la liga reúne todos los que tu
    navegador puede entrenar (14: …). Primero compiten los que caben en unos segundos (Nivel 1);
    el resto, si quieres, en el Nivel 2, y algunos quedan «fuera» con su razón, como
    recomendación. La app elige al ganador **sin mirar el conjunto de prueba**…» (el resto igual).
  - `MANUAL:283` (Baseline): «Las reglas simples contra las que se mide tu modelo: responder
    siempre lo más frecuente (clase mayoritaria) y una regresión logística. Si tu modelo no supera
    a la mejor de las dos, no sirve.»
  - `MANUAL:285`: «La app parte tus datos en dos: con tres cuartas partes aprende y con la cuarta
    parte restante, que nunca vio, se examina. Por eso el número del veredicto es real.»
  - `MANUAL:293`: «…en 5 trozos (3 si son muy grandes; menos si una de las clases tiene muy pocos
    ejemplos)…»
  - `BROCHURE.html:1130`: «Las reglas simples a batir: responder siempre lo más frecuente y una
    regresión logística. Si tu modelo no supera a la mejor, no sirve.»
  - `BROCHURE.html:1132`: «Las dos partes de tu tabla: con la más grande aprende, con la otra se
    examina.»
- **Verificado cuando:**
  - `grep -n "primera mitad\|Las dos mitades\|responder siempre lo más frecuente\. Si" docs/MANUAL-DE-USO.md docs/BROCHURE.html`
    sale vacío.
  - `brochure-export.test.ts` y `brochure.spec.ts` están verdes.

### AU-S5-18 — Bajo — El ADR 011 describe mal el H1

- **Dónde:** `decisions/011-honesty-that-accompanies.md:24`.
- **Qué está mal:** dice «Test scores of the losing models — Before (H1): not computed / not
  shown». En el S4, RF y HGB se calculaban sobre prueba y se mostraban los dos; el ganador era el
  argmax de esos puntajes (ADR 008 §2).
- **Ajuste ejecutable:** reemplazar la celda «not computed / not shown» por «computed and shown
  for the two candidates — and the winner was the argmax of those very test scores».
- **Verificado cuando:** `grep -n "not computed / not shown" decisions/` sale vacío.

### AU-S5-19 — Bajo — Al cancelar, el breadcrumb registra los competidores del Nivel 1

- **Dónde:** `src/lib/useExperiment.ts:942, 953-960`.
- **Qué está mal:** `competitors = level1Ref.current.result.league.length` describe la liga
  anterior, no la corrida del Nivel 2 que se canceló. La observabilidad queda engañosa.
- **Ajuste ejecutable:**
  1. Reemplazar la línea 942 por el cálculo **antes** de tocar `pendingRef`:
     ```ts
     const inFlight = [...pendingRef.current.values()];
     const level2Train = inFlight.find(
       (p) => p.kind === "train" && p.level === 2,
     );
     const snapshot = inFlight.find((p) => p.kind === "snapshot");
     const competitors =
       level2Train?.kind === "train"
         ? level2Train.sent.roster.length
         : snapshot?.kind === "snapshot"
           ? snapshot.next.payload.roster.length
           : level1Ref.current.result.league.length;
     ```
  2. En `tests/unit/use-hooks.test.tsx`:
     - agregar `vi.mock("@/lib/observability", async (orig) => ({ ...(await orig()), recordLeagueRun: vi.fn() }))`;
     - en «cancelar a media liga» (`:690`), afirmar que el último `recordLeagueRun` recibió
       `competitors` igual a la longitud del roster de la unión y `cancelled: true`.
- **Verificado cuando:** el test está verde, y rojo con la línea vieja.

### AU-S5-20 — Bajo — R15 («Nuevo experimento» durante el Nivel 2) no tiene camino en la UI; el ADR 010 lo da por hecho

- **Dónde:** `src/app/page.tsx:50-57` (TrainingScreen sin `reset`); `decisions/010-deterministic-routers-and-cost-model.md:79-80`.
- **Qué está mal:** `reset()` sí respawnea con trabajo en vuelo (`useExperiment.ts:1068`), pero
  durante el Nivel 2 no hay botón «Nuevo experimento»: la salida es «Cancelar el Nivel 2». La ADR
  afirma un escenario («queues behind an abandoned league») que no se puede producir desde la UI.
- **Ajuste ejecutable** (sin feature nueva, porque cancelar ya cubre la necesidad):
  1. Reemplazar `decisions/010…md:79-80` por: «`reset()` with work in flight (a manual fit, a
     snapshot restore, an export) also terminates the worker, so a new experiment never queues
     behind abandoned work (R15). While level 2 runs, the way out is «Cancelar el Nivel 2», which
     keeps the level 1 result.»
  2. Agregar a la bitácora, en `## Desviación del plan`, después de D15 (línea 84):
     «**D17 — R15 en la UI:** el plan decía que «Nuevo experimento» durante el Nivel 2 usara el
     camino de cancelar; la pantalla del Nivel 2 ofrece solo «Cancelar el Nivel 2» (que ya
     restaura el Nivel 1). `reset()` corta igual cualquier cómputo en vuelo.»
- **Verificado cuando:** la ADR y la bitácora están actualizadas, y `grep -n "abandoned league" decisions/`
  sale vacío.

### AU-S5-21 — Bajo — La pantalla de entrenamiento del Nivel 1 no muestra el tiempo estimado

- **Dónde:** `src/components/TrainingScreen.tsx:14-45`; `src/app/page.tsx:50-57`. El requisito
  está en SPRINT_005.md, pantalla 3: «progreso modelo a modelo con tiempo estimado».
- **Ajuste ejecutable:**
  1. TrainingScreen recibe la prop `estimateS?: number | null`. Cuando `!level2 && estimateS`,
     renderizar
     `<p className="font-mono text-sm tabular-nums">{t("training.estimate", { time: formatEstimate(estimateS) })}</p>`
     en la posición del bloque `level2`, línea 38.
  2. En `page.tsx:51-56`, pasar `estimateS={state.routing?.level1EstimateS ?? null}`.
  3. i18n `training.estimate`:
     - es: «Unos {time} de cálculo en un computador de escritorio (más la descarga del motor la
       primera vez).»
     - en: «About {time} of computing on a desktop computer (plus the engine download the first
       time).»
  4. En `tests/unit/league-ui.test.tsx` (bloque TrainingScreen, `:426`), agregar un caso con
     `estimateS={4.2}` que muestre «Unos 5 s».
- **Verificado cuando:** el test unitario está verde y la paridad i18n también.

### AU-S5-22 — Bajo — Falta el test del R8 (la narración se invalida con la elección manual)

- **Dónde:** `tests/unit/use-hooks.test.tsx:95-162` (bloque `useNarration`). El comportamiento
  está en `src/lib/useNarration.ts:82-85, 125-127`.
- **Ajuste ejecutable:** agregar el test «R8: si el resultado cambia (elección manual), la
  narración verificada vuelve a reposo»:
  1. `renderHook(({ result }) => useNarration({ ...input, result }), { wrapper, initialProps: { result: A } })`;
  2. pedir la narración → `verified`;
  3. `rerender({ result: { ...A, modelName: "forest", selection: { ...A.selection, by: "user" } } })`;
  4. esperar `ai.kind === "idle"` y la plantilla presente.
- **Verificado cuando:** el test está verde, y rojo si `result` se quita de las dependencias del
  `useMemo` en `useNarration.ts:84`.

### AU-S5-23 — Bajo — Una liga sin ningún «ok» termina en el error genérico

- **Dónde:** `src/lib/ds/pipeline.py:437-439` (`RuntimeError("league-empty")`);
  `src/lib/useExperiment.ts:448-454` (`failTrain("runtime", …)`).
- **Qué está mal:**
  - Si todos los miembros quedan `error` o `no-converge` (posible, por ejemplo, con un Nivel 1 de
    un solo miembro en datos enormes), el usuario ve «Ocurrió un error al procesar. Intenta de
    nuevo.».
  - Es un mensaje no franco: reintentar no cambia nada, y los puntajes de «no convergió» que
    existen se pierden.
- **Ajuste ejecutable:**
  1. Agregar `| "league-empty"` a `WorkerErrorKind` (`protocol.ts`).
  2. En `useExperiment.ts:448-454`, antes de calcular `field`:
     `if (/league-empty/.test(message.message)) { failTrain("league-empty", "league-empty"); return; }`
     (la rama `level === 2` de arriba ya lo resuelve restaurando).
  3. i18n `errors.league-empty`:
     - es: «Ningún modelo terminó la validación cruzada sin problemas (no convergieron o
       fallaron), así que no hay un ganador que se pueda defender. Prueba con más filas o con otras
       columnas.»
     - en: «No model finished cross-validation cleanly (they did not converge or failed), so there
       is no winner that can be defended. Try more rows or other columns.»
  4. En `use-hooks.test.tsx`, el runner responde `{type:"error", message:"RuntimeError: league-empty"}`
     → `state.error.kind === "league-empty"`.
- **Verificado cuando:** el test está verde y la paridad i18n también.

### AU-S5-24 — Bajo — La región viva de TrainingScreen se anuncia en cada paso de la liga

- **Dónde:** `src/components/TrainingScreen.tsx:36` (el `role="status" aria-live="polite"`
  envuelve toda la pantalla) y `:73-95` (la línea «Validación cruzada · modelo k de N» cambia unas
  2·N veces por corrida).
- **Qué está mal:** un lector de pantalla encola un anuncio por miembro y por fase (hasta 28 en el
  Nivel 2), además del botón Cancelar, que vive dentro de la región.
- **Ajuste ejecutable:**
  1. Línea 36: quitar `role="status" aria-live="polite"` del `<div>` raíz.
  2. Envolver el `<ol>` de etapas (46-72) en `<div role="status" aria-live="polite">…</div>`.
  3. La línea por miembro (75-81) queda fuera de la región. La barra `progressbar` ya expone el
     avance.
  4. Revisar que los tests que buscan `role="status"` sigan pasando y ajustar los que asuman la
     raíz.
- **Verificado cuando:** unit y e2e están verdes, y el `getByRole("status")` de TrainingScreen no
  contiene «Validación cruzada · modelo».

### AU-S5-25 — Bajo — `BASELINE_IDS` se exporta pero no se usa; ResultsScreen repite los baselines a mano

- **Dónde:** `src/engine/roster.ts:27`; `src/components/ResultsScreen.tsx:110` (`"logistic"`) y
  `:281` (`["majority", "logistic"]`).
- **Ajuste ejecutable:** importar `BASELINE_IDS` de `@/engine/roster` en `ResultsScreen.tsx`.
  - Línea 281: `{BASELINE_IDS.map((id) => (`.
  - Línea 110: `(BASELINE_IDS as readonly string[]).includes(result.modelName) &&` en lugar de
    `result.modelName === "logistic" &&`.
- **Verificado cuando:** typecheck y los tests de `league-ui`/`ficha-level2` están verdes, y
  `grep -n '"majority", "logistic"' src/components` sale vacío.

### AU-S5-26 — Bajo — El test de integración usa su propia copia de `withoutLeague`

- **Dónde:** `tests/integration/liga.test.ts:78-87` (función local) en lugar de la de producción
  (`src/lib/experiment.ts:97-104`).
- **Ajuste ejecutable:** borrar las líneas 78-87 y agregar `withoutLeague` al import de la línea 27
  (`import { applyMemberFit, assembleResult, prepareRun, withoutLeague } from "@/lib/experiment";`).
- **Verificado cuando:** `pnpm test:integration` está verde y `grep -n "function withoutLeague" tests`
  sale vacío.

### AU-S5-27 — Bajo — Nada asegura que cada miembro del roster tenga sus nombres i18n, y la ficha del MLP cablea «500»

- **Dónde:**
  - `messages/*.json` `results.candidates.{model,short}.<id>`: sin test por miembro. Agregar un id
    al roster mostraría la clave cruda.
  - `src/content/modelos.ts:282-283`: «Menos de 500 filas» está escrito a mano frente a
    `MLP_MIN_ROWS` (`encarrilador.ts:25`).
- **Ajuste ejecutable:** en `tests/unit/modelos.test.ts`, agregar:
  ```ts
  it("cada miembro tiene nombre largo y corto en ES y EN", async () => {
    const { translate } = await import("@/i18n/translate");
    for (const locale of ["es", "en"] as const)
      for (const id of MEMBER_IDS)
        for (const kind of ["model", "short"])
          expect(
            translate(locale, `results.candidates.${kind}.${id}`),
          ).not.toBe(`results.candidates.${kind}.${id}`);
  });
  it("la ficha del MLP cita el umbral real", () => {
    expect(FICHAS.mlp.notFor.es).toContain(String(MLP_MIN_ROWS));
    expect(FICHAS.mlp.notFor.en).toContain(String(MLP_MIN_ROWS));
  });
  ```
  Demo en rojo: borrar `short.mlp` de `es.json` → el test falla nombrando la clave.
- **Verificado cuando:** los tests están verdes y la demo roja queda registrada.

### AU-S5-28 — Bajo — La categoría del breadcrumb no sigue la convención que documenta la limpieza de Sentry

- **Dónde:** `src/lib/observability.ts:71` (`category: "league"`) frente a
  `src/lib/sentry-scrub.ts:8-9` («Los breadcrumbs PROPIOS de la app (categoría `probeta.*`…)»).
- **Ajuste ejecutable:**
  - `observability.ts:71` pasa a `category: "probeta.league",`.
  - Actualizar `tests/unit/observability.test.ts:48` a `category: "probeta.league"`.
- **Verificado cuando:** `pnpm vitest run tests/unit/observability.test.ts` está verde.

### AU-S5-29 — Bajo — El hook PreToolUse de gitleaks falla ABIERTO sin `jq` o sin `gitleaks` (fricción del kit)

- **Dónde:** `.claude/settings.json:12`. Si falta `jq` o `gitleaks`, el escaneo del contenido se
  salta en silencio (`exit 0`). El `githooks/pre-commit:20-23` del mismo sprint, en cambio, falla
  CERRADO.
- **Ajuste ejecutable** (no se cambia el hook: cerrarlo bloquearía toda escritura en un equipo sin
  gitleaks, y eso lo decide el kit): agregar a la bitácora, en «Fricciones del kit», después de
  K-S5-8 (línea 669):
  «**K-S5-9 — El PreToolUse de B-8 falla ABIERTO**: sin `jq` o sin `gitleaks` en el PATH, el
  escaneo del contenido no corre y no avisa (`.claude/settings.json:12`), mientras el pre-commit
  del mismo kit falla cerrado. Propuesta: que imprima un aviso visible en `stderr` cuando omite
  el escaneo.»
- **Verificado cuando:** `grep -n "K-S5-9" sprints/SPRINT_005-implementation-log.md` da una línea.

### AU-S5-30 — Bajo — Desviación de copy de E1 sin registrar («llega en el S6/S7» → «próxima versión»)

- **Dónde:** `messages/es.json:452` y `messages/en.json:452` (`task.notYet`); lo pedía la orden en
  el punto 6 y SPRINT_005.md en O2.
- **Qué está mal:** la orden pedía «llega en el S6/S7». La app dice «llega en una próxima
  versión» (sin números de sprint en la UI, decisión razonable y vista en la mirada M1), pero no
  figura entre D1–D15.
- **Ajuste ejecutable:** agregar a la bitácora, en `## Desviación del plan`, después de D15
  (línea 84):
  «**D16 — E1 sin números de sprint en la UI:** la orden pedía «llega en el S6/S7»; la tarjeta dice
  «llega en una próxima versión» (`messages/*.json` `task.notYet`). Los números de sprint son
  internos al método; para el usuario final, «próxima versión» es verdad y no caduca con un
  replan. Vista y aprobada en la mirada de FORMA M1 (2026-10-02).»
- **Verificado cuando:** `grep -n "D16" sprints/SPRINT_005-implementation-log.md` da una línea.

---

## Tabla final

| id       | severidad | archivo:línea                                                                 | resumen corto                                                                            |
| -------- | --------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| AU-S5-01 | Alto      | `src/components/ResultsScreen.tsx:109-112`                                    | El banner de la logística esconde un veredicto «NO supera» (regla dura 3)                |
| AU-S5-02 | Medio     | `src/components/TaskCard.tsx:12,45-47`; `ConfigScreen.tsx:105`                | «✓ Se puede entrenar» junto a un bloqueo                                                 |
| AU-S5-03 | Medio     | `messages/es.json:157`, `en.json:157`                                         | «Todas las métricas… nunca sobre entrenamiento» caducó con la CV                         |
| AU-S5-04 | Medio     | `docs/BROCHURE.html:939,950-951`; `docs/brochure-export.json:29,381`          | Brochure y export: «toda cifra sale de la prueba» (y «mitades»)                          |
| AU-S5-05 | Medio     | `docs/BROCHURE.html:1155-1156`                                                | «33… ninguna se quedó fuera» es falso desde el S5                                        |
| AU-S5-06 | Medio     | `src/components/StartScreen.tsx:290-299`; `src/lib/model-file.ts:104-107`     | El import ignora `selection`: «elegido por ti» se pierde                                 |
| AU-S5-07 | Medio     | `src/lib/ds/pipeline.py:621-632, 582-606`; `useExperiment.ts:468`             | `fit_member` retiene antes de calcular los detalles: modelo ≠ veredicto si falla         |
| AU-S5-08 | Medio     | `tests/e2e/liga.spec.ts:40-48`; `tests/e2e/liga-cancelar.spec.ts:40-41`       | axe en ambos temas no cubre Configuración, Entrenamiento ni el Nivel 2 oscuro            |
| AU-S5-09 | Medio     | `src/lib/useExperiment.ts:241-270,469-474,619-643,785-794,869-882`            | Sin tests unitarios del hook para la elección manual ni para el plan E1+E2               |
| AU-S5-10 | Bajo      | `src/engine/tarea.ts:64-70`; `src/lib/experiment.ts:159`                      | E1 (numérico) ≠ entrenador (texto): vuelve «objetivo no binario»                         |
| AU-S5-11 | Bajo      | `docs/GUIA-DE-PRUEBA.html:307-308`                                            | La prueba heredada E4 pide revisar «candidatos», que ya no existe                        |
| AU-S5-12 | Bajo      | `messages/*.json:177,210-213`; `protocol.ts:100,214`; `experiment.ts:251-252` | Claves i18n muertas y comentarios interinos caducados                                    |
| AU-S5-13 | Bajo      | `protocol.ts:127-128,134,184`; `contract.ts:52,96,162`                        | `cv.scoring` y los dos `elapsed_ms` sin lector (JSDoc falso)                             |
| AU-S5-14 | Bajo      | `experiment.ts:51-53,70`; `encarrilador.ts:75-76,160-161,185,215`             | `targetCandidates`, `Routing.out/ceilingS` y `Level2Plan.factor` huérfanos               |
| AU-S5-15 | Bajo      | `src/lib/validate.ts:5,64-74`                                                 | Las rutas de `dict()` llevan nombres de columna, que pueden llegar a Sentry              |
| AU-S5-16 | Bajo      | `src/workers/contract.ts:254-258`                                             | El regex `contract:` no está anclado al final del traceback                              |
| AU-S5-17 | Bajo      | `docs/MANUAL-DE-USO.md:210-213,283,285,293`; `docs/BROCHURE.html:1130,1132`   | Manual y diccionario: «compiten 14», «mitades», un solo baseline, k fijo                 |
| AU-S5-18 | Bajo      | `decisions/011-honesty-that-accompanies.md:24`                                | El ADR 011 dice que el H1 no mostraba la prueba de los perdedores (falso)                |
| AU-S5-19 | Bajo      | `src/lib/useExperiment.ts:942,953-960`                                        | Al cancelar, el breadcrumb registra los competidores del Nivel 1                         |
| AU-S5-20 | Bajo      | `src/app/page.tsx:50-57`; `decisions/010-…md:79-80`                           | R15 «Nuevo experimento» durante el Nivel 2: sin camino en la UI; ADR que lo da por hecho |
| AU-S5-21 | Bajo      | `src/components/TrainingScreen.tsx:38-45`; `src/app/page.tsx:51-56`           | El entrenamiento del Nivel 1 no muestra el tiempo estimado (pantalla 3)                  |
| AU-S5-22 | Bajo      | `tests/unit/use-hooks.test.tsx:95-162`                                        | Falta el test del R8 (la narración se invalida con la elección manual)                   |
| AU-S5-23 | Bajo      | `src/lib/ds/pipeline.py:437-439`; `src/lib/useExperiment.ts:448-454`          | Una liga sin ningún «ok» termina en el error genérico                                    |
| AU-S5-24 | Bajo      | `src/components/TrainingScreen.tsx:36,73-95`                                  | La región viva se anuncia en cada miembro de la liga                                     |
| AU-S5-25 | Bajo      | `src/engine/roster.ts:27`; `src/components/ResultsScreen.tsx:110,281`         | `BASELINE_IDS` sin uso; los baselines repetidos a mano                                   |
| AU-S5-26 | Bajo      | `tests/integration/liga.test.ts:78-87`                                        | El test de integración copia `withoutLeague` en vez de importarla                        |
| AU-S5-27 | Bajo      | `messages/*.json` (`results.candidates.*`); `src/content/modelos.ts:282-283`  | Nada asegura los nombres i18n por miembro; «500» cableado en la ficha                    |
| AU-S5-28 | Bajo      | `src/lib/observability.ts:71`; `src/lib/sentry-scrub.ts:8-9`                  | La categoría del breadcrumb no sigue la convención `probeta.*`                           |
| AU-S5-29 | Bajo      | `.claude/settings.json:12`                                                    | El PreToolUse de gitleaks falla abierto: registrar como fricción del kit (K-S5-9)        |
| AU-S5-30 | Bajo      | `messages/*.json:452`; bitácora (`## Desviación del plan`)                    | Desviación de copy de E1 sin registrar (D16)                                             |

**Conteo:** Alto 1 · Medio 8 · Bajo 21 · total 30.

**Fase 2:** se pagan todos, hasta los bajos (kit v1.31.0). Después del último ajuste hay que
**repetir la casilla 4** sobre el diff de la Fase 2 y sobre el summary. Esta Fase 1 fabrica
copy nuevo en AU-S5-02, 03, 04, 05, 06, 10, 17, 21 y 23.

> Aprueba la Fase 1 y fija el modelo de la Fase 2 con `/model`: un modelo menor basta si sigue
> este plan.

---

## Fase 2 — estado (2026-10-03, nota del constructor)

- Fase 1 aprobada por el usuario el 2026-10-03, con dos variaciones: el pie del brochure sin
  promesa de re-armado (AU-S5-05) y R15 resuelto en el ADR y la bitácora (AU-S5-20, D17).
- **Los 30 hallazgos están pagados**, más uno propio encontrado al pagar AU-S5-06: **AU-S5-31**
  (Bajo), el resumen del import mostraba «{name}» sin interpolar.
- Cada pago, su verificación y su demo en rojo están en
  `sprints/SPRINT_005-implementation-log.md`, sección «Cierre — `/audita-sprint`».
- La casilla 4 se repitió sobre el diff de la Fase 2. Se repite otra vez sobre el summary.
