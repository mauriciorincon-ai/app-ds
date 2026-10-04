---
sprint: 005
app: ds
status: closed
opened: 2026-10-02
closed: 2026-10-03
branch: sprint-005/liga-honesta
pr: https://github.com/mauriciorincon-ai/app-ds/pull/13
---

# Sprint 005 Summary — Probeta DS («La liga honesta» · ciclo H2, sprint 1 de 3)

## Outcome

**Sí.** Con un CSV de objetivo binario, la app entrena la liga de clasificación (12 modelos + 2
variantes balanceadas = 14), elige al ganador por **validación cruzada dentro de train** y abre el
test una sola vez. Tres encarriladores deterministas deciden la tarea, quién compite y en qué
nivel, y la ficha de lectura de cada modelo. La honestidad **acompaña y etiqueta; no bloquea ni
esconde**: los puntajes de prueba de los perdedores se ven bajo «no sirve para elegir», y la
elección manual queda registrada como «◆ Elegido por ti».

| Outcome                       | Estado | Evidencia                                                                                                                                                                                                                                                          |
| ----------------------------- | :----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| O1 · La liga                  |   ✓    | `pipeline.py` (roster, CV con el preprocesador dentro del Pipeline, test una vez); anti-fuga de la CV con espía (rojo demostrado, G1); export → import → puntuar con XGBoost y con LightGBM (integración)                                                          |
| O2 · Los encarriladores       |   ✓    | E1 `engine/tarea.ts` (5 tareas, solo binaria entrena; «próxima versión» en vez de «S6/S7», D16) · E2 `engine/encarrilador.ts` (reparto por costo contra el techo de 5 s, razón por modelo) · E3 `content/modelos.ts` (fichas `{es,en}` con test de paridad)        |
| O3 · Dos niveles y honestidad |   ✓    | Nivel 1 automático; Nivel 2 con estimación calibrada EN ESTE EQUIPO, «incluir de todos modos» y cancelar con restauración del modelo (instantánea); puntajes de prueba etiquetados; elección manual registrada en model card y manifiesto; copy fijo CV/test ES/EN |

## Qué se construyó

- **Motor (Python + contrato):** roster de 14 con hiperparámetros fijos, semilla y `n_jobs=1`;
  regla de un error estándar (D8); estados `ok` / `no-converge` / `error` con solo el tipo de error
  (regla dura 2); `fit_member` para la elección manual; progreso por miembro en dos fases;
  `_validate_payload` (lado que lee TS → Python) y `src/workers/contract.ts` (lado que lee Python →
  TS, en producción, que además recalcula la selección y cruza el scorer de la CV).
- **Encarriladores:** `tarea.ts` (E1), `encarrilador.ts` + `costos.ts` (E2, modelo de costos medido
  en el navegador real y calibración por equipo), `content/modelos.ts` (E3).
- **UI:** `TaskCard` y `RosterCard` en Configuración; `TrainingScreen` modelo a modelo con
  estimación y «Cancelar el Nivel 2»; `LeagueTable` (★ ganador, ▲ mejor puntaje, ≈ banda del error
  estándar, ⚠/✕ estados, puntajes de prueba a pedido, «Elegir» y «Volver al ganador»);
  `FichaModelo` (`<dialog>` nativo, carga dinámica); `Level2Card`; resumen del import con cómo se
  eligió el modelo.
- **Datos:** `docs/kit-de-prueba/liga-mediana.csv` (5.000 filas, D6) para probar el Nivel 2.
- **Kit v1.16 → v1.33 (F0):** `/audita-sprint`, comandos re-estampados, regla 15 completa, regla 18
  (dependabot con techo 2, `pnpm peers check`, `verificar-dependencias.mjs`), regla 19 (contrato
  entre lenguajes), regla 20 (contenido largo como dato `{es,en}`), gitleaks B-8, Sentry
  `beforeSend` sin el mensaje, e2e sin `--pass-with-no-tests`, Lighthouse mediana de 3, gate de
  peso de Pyodide.
- **Documentos:** ADR 009, 010 y 011 (ADR 008 §2 reemplazado); manual («La liga honesta · desde
  Sprint 005», diccionario, FAQ); guía de prueba v2 acumulativa (38 pruebas); `design-system.md` y
  bundle `design-sync/`; corrección mínima del brochure y su export (U2/D1).

## DoD — checklist

| Estándar                | Estado | Evidencia                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | :----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Testing                 |   ✓    | `pnpm test` 41 archivos · **387/387**; cobertura 92,9 % de líneas, `engine/` 100 % de líneas y 95,2 % de ramas, `useExperiment.ts` 72,9 % de ramas. `pnpm test:integration` (Pyodide real) **47/47**. `pnpm test:e2e` sobre build de producción **32/32**, sin reintentos. Carnadas: TS → Python 16/16 · train 27/27 · fit-member 6/6 · progreso 5/5 · export 6/6 · score 5/5 · manifiesto 16/16 |
| CI/CD                   |   ✓    | `quality`, `integration`, `e2e`, `lighthouse`, Vercel y Vercel Preview Comments con conclusión propia `success` en `gh pr checks 13` tras cada push (ver «Checks»)                                                                                                                                                                                                                               |
| Observabilidad          |   ✓    | Breadcrumb `probeta.league` con filas, columnas, competidores, nivel, tiempo y si se canceló, sin valores ni nombres de columna; excepciones a Sentry sin mensaje; rutas de contrato con `*` en vez de claves del usuario (AU-S5-15)                                                                                                                                                             |
| Seguridad               |   ✓    | `pnpm audit --audit-level high` exit 0 (un aviso alto de `braces` aceptado por nombre, solo desarrollo: deuda abajo); gitleaks B-8 (PreToolUse + pre-commit que falla cerrado, rojo demostrado); `verificar-dependencias.mjs` y `pnpm peers check` en `quality`; cero secrets                                                                                                                    |
| Performance             |   ⚠    | `perf-budget.json` vía job `lighthouse` (mediana de 3 corridas). Pyodide sigue bajo demanda y fuera del LCP; los wheels nuevos crecen **1,40 MiB** (tope 2 MiB, gate con rojo natural en su primera corrida). **Categorías ≥ 90 sin gate mecánico en esta app** (falta `lighthouse-categorias.json`, K-S5-5): no medidas este sprint, deuda declarada                                            |
| UX + A11y               |   ✓    | axe en ambos temas en Configuración (tarea que se entrena y tarea que no), Resultados, ficha abierta, tarjeta del Nivel 2 y Nivel 2 corriendo; ★/◆/▲/≈/⚠/✕ con texto, nunca solo color; teclado en la ficha (foco atrapado, Esc, foco de vuelta) y en el Nivel 2; e2e de reduced-motion con opacidad efectiva                                                                                    |
| IA embebida responsable |  N/A   | Cero IA nueva; la narración del S2 no se tocó (solo se invalida al elegir a mano, con test R8)                                                                                                                                                                                                                                                                                                   |
| Manual de uso           |   ✓    | `docs/MANUAL-DE-USO.md` § «La liga honesta · desde Sprint 005», diccionario, FAQ «¿por qué bajó mi puntaje?», mensajes francos y limitaciones                                                                                                                                                                                                                                                    |
| Revisión de diseño      |   ✓    | Miradas de FORMA M1 y M2 en matriz de una fila, **«lo abrí y apruebo»** del usuario (2026-10-02); estados nuevos de la auditoría (TaskCard bloqueada, estimación al entrenar) capturados y leídos como imagen                                                                                                                                                                                    |

**Checks del PR y primeras corridas.** Corrieron por primera vez en este PR, así que no hay
histórico con el que afirmar regresión ni no-regresión:

- los specs e2e nuevos: `liga`, `liga-cancelar`, `liga-booster-export` y `reduced-motion-app`;
- los pasos nuevos de `quality`: `verificar-dependencias`, `pnpm peers check` y el peso de Pyodide;
- Lighthouse con mediana de 3 corridas.

## Métricas técnicas

| Criterio de aceptación (SPRINT_005.md)                                | Resultado                                                                                                                                         |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rotación: Nivel 1 con ≥ 8 modelos dentro del techo                    | ✓ 13 modelos (la red neuronal queda fuera con 200 filas); la liga completa tarda 3,4–4,5 s en Chromium (techo 5 s, fijado por el usuario en F0-1) |
| Nivel 2: estimación antes de arrancar, cancelar, app usable           | ✓ e2e `liga-cancelar`: estima, arranca, cancela, el Nivel 1 vuelve y se exporta                                                                   |
| Objetivo numérico o sin objetivo → tarjeta de tarea, no «no binario»  | ✓ con D16 («próxima versión»); un objetivo «0/1/1.0» ahora tiene su mensaje propio (AU-S5-10)                                                     |
| KNN fuera con 20.000 filas · MLP fuera con 100                        | Cambiado por D9 (aprobado): KNN cuesta 1,5 s con 20.000 filas y compite; MLP fuera con < 500 filas; balanceadas fuera con clases equilibradas     |
| Export → import → puntuar con XGBoost y con LightGBM                  | ✓ integración (predicciones y probabilidades idénticas) + e2e con LightGBM                                                                        |
| Anti-fuga de la CV en rojo en el mismo commit                         | ✓ G1 (espía): «expected … to have a length of 15 but got 8»                                                                                       |
| Model card: cuántos compitieron, k, criterio, tiempo, elección manual | ✓ sección «Selección del modelo»                                                                                                                  |
| Nada se esconde: test de los perdedores bajo su etiqueta              | ✓ «Ver puntajes de prueba — no sirve para elegir»                                                                                                 |
| Pyodide crece ≤ 2 MB                                                  | ✓ 1,40 MiB                                                                                                                                        |

**Antes / después (H1 → S5, spike F0).** El número reportado baja en algunos datasets porque se
corrige el sesgo de selección. Con la regla de un error estándar:

- rotación pasa de «supera» (0,766) a «la liga no encontró nada mejor que la regresión de
  referencia» (0,755 frente a 0,756);
- clientes-sucio pasa de «supera» a empate;
- marketing sigue «supera» con HGB.

El manual lo anticipa en su FAQ.

## Decisiones no anticipadas

- **ADR 009 — La liga y la selección por validación cruzada:** CV estratificada dentro de train,
  regla de un error estándar, el test se abre una vez. Reemplaza el ADR 008 §2.
- **ADR 010 — Encarriladores deterministas y modelo de costos:**
  - reparto por costo contra el techo;
  - reglas «fuera» solo con respaldo medido;
  - calibración del Nivel 2 con el tiempo real de cada miembro;
  - cancelar con instantánea.
- **ADR 011 — La honestidad que acompaña:** etiquetar en vez de esconder; elección manual
  registrada.
- **Desviaciones D1–D17** en la bitácora. Las de mayor peso:
  - D8 (un error estándar);
  - D9 (KNN y NB compiten);
  - D3 (niveles por costo);
  - D16 («próxima versión» en la UI);
  - D17 (R15 resuelto con «Cancelar el Nivel 2»).

## Bugs + resoluciones

- **AU-S5-01 (Alto):** cuando la logística ganaba la liga y perdía contra la clase mayoritaria, el
  titular «＝ La liga no encontró nada mejor…» escondía el «▼ NO supera».
  - Resuelto: ese titular ahora solo reemplaza un empate.
  - Test con rojo demostrado.
- **AU-S5-07:** `fit_member` retenía el modelo antes de calcular sus detalles. Si los detalles
  fallaban, el archivo exportado no era el modelo del veredicto.
  - Resuelto: se invirtió el orden.
  - Test en Pyodide real con rojo demostrado: la clase retenida cambiaba de KNN a
    LogisticRegression.
- **AU-S5-31 (propio, desde el S4):** el resumen del import mostraba «{name}» sin interpolar.
- **Heredado (S2):** el `<pre>` de la model card no era enfocable (`scrollable-region-focusable`).
  Lo encontró el axe nuevo de la F2.
- **Regresión del propio pago:** AU-S5-24 puso `role="status"` sobre el `<ol>`. El axe nuevo de
  AU-S5-08 la atrapó en su primera corrida (`listitem`, `aria-allowed-role`) y se corrigió con un
  `<div>`.
- **CI roja por el calendario (F0):** avisos nuevos de `pnpm audit` sin cambios en el árbol.
  - Resuelto con parches directos.
  - El aviso `braces` sin parche se aceptó por nombre (decisión 7 de la F0).

## Qué salió bien / qué generó fricción

**Bien:**

- **El spike en el navegador real (F0)** encontró lo que el de Node no podía ver:
  - el máximo de la CV elige mal con muestras chicas (de ahí la regla de un error estándar);
  - KNN es barato;
  - el MLP del plan no convergía nunca.
- **Los gates se ganaron el sueldo:**
  - el gate de peso nació rojo solo;
  - la tercera pregunta de la regla 15 detectó un test de determinismo que no podía fallar;
  - el axe nuevo atrapó un error introducido por otro pago de la auditoría.
- **La auditoría independiente** encontró un Alto real sobre la regla dura 3 que 387 pruebas
  verdes no veían.

**Fricción** (del kit, separada en la bitácora):

- K-S5-1: el kit tiene dos casillas «6» en `/audita-sprint`.
- K-S5-4: `verificar-dependencias` sale verde cuando la rama base es ilegible.
- K-S5-5: huecos de la app anteriores a v1.16.
- K-S5-6: la mecánica de las carnadas no está en el wiki.
- K-S5-9: el PreToolUse de gitleaks falla abierto.

**Fricción del constructor:**

- K-S5-7: heredoc sin comillas.
- K-S5-8: una demo en rojo que no se puso roja.
- K-S5-10: respaldo en otra carpeta.
- K-S5-11: `pkill` no mataba el server.

## Sugerencias de mejora al método

1. **La Fase 1 de `/audita-sprint` fabrica copy y debe pasarlo por su propia casilla 4 antes de
   proponerlo.** Ejemplo de este sprint: el arreglo propuesto para el pie del brochure prometía «se
   suman cuando la página se re-arme» en una página pública. Se pagó con otra redacción, aprobada.
2. **Pagar primero los hallazgos que crean gates y después correrlos sobre todos los pagos.** El
   axe de AU-S5-08 atrapó una regresión de AU-S5-24. En la Fase 2, los gates nuevos se corren al
   final, sobre el árbol completo.
3. **Las demos en rojo necesitan un procedimiento con candado:**
   - una sola carpeta de respaldo;
   - un `grep` del ajuste después de cada restauración (K-S5-10);
   - el server se mata por puerto, comprobando que no quede `EADDRINUSE` (K-S5-11).

   El kit podría traer un `scripts/demo-rojo.sh` que aplique la mutación, corra el gate y restaure
   con verificación.

## Deuda técnica aceptada

| Qué                                                                       | Por qué                                                     | Pago                                                                         |
| ------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Aviso alto de `braces` aceptado por nombre (`auditConfig.ignoreGhsas`)    | Sin parche publicado; solo en la ruta de desarrollo         | Se retira cuando haya versión parcheada (condición en `pnpm-workspace.yaml`) |
| Lighthouse por categorías sin gate (falta `lighthouse-categorias.json`)   | Hueco anterior a v1.16 (K-S5-5), fuera del delta pedido     | Lo decide la planeadora (sugerido: S6)                                       |
| Brochure: las funcionalidades del S5 no tienen tarjeta propia (conteo 33) | Decisión U2: solo se corrigió lo falso                      | Re-armado del brochure en el cierre del ciclo H2 (S7, según el plan)         |
| Solo se entrena la tarea binaria                                          | Alcance del S5                                              | S6 (estimar) y S7 (multiclase y agrupar), según el plan del ciclo            |
| WebKit solo en el spike, no en la CI                                      | Los proyectos de Playwright son Chromium móvil y escritorio | Sin sprint asignado; se reporta                                              |

**Tabla de mapeo del brochure (regla 12).** El conteo sigue en 33 (U2).

| Funcionalidad del S5                                                       | En el brochure                                                              |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| La liga elegida por CV + elección manual                                   | Tarjeta V9 reescrita: «Una liga de modelos, elegida sin mirar la prueba»    |
| CV para elegir, test para creer                                            | Bloque «Por qué el número es real» corregido (AU-S5-04)                     |
| Dos baselines, partición 75/25                                             | Diccionario corregido (AU-S5-17)                                            |
| Encarriladores, fichas, Nivel 2 + cancelar, puntajes de prueba etiquetados | Sin tarjeta propia; el pie ya no afirma «ninguna se quedó fuera» (AU-S5-05) |

## Auditoría

- **Artefacto:** `sprints/SPRINT_005-auditoria.md`, del auditor independiente. Recomendación de la
  Fase 1: **requiere ajustes**.
- **Hallazgos:** 30 (1 Alto · 8 Medio · 21 Bajo) + 1 propio de la Fase 2 (AU-S5-31, Bajo).
- **Todos pagados**, cada uno con su verificación. Hubo rojo demostrado en 01, 02, 06, 07, 08 (dos
  rojos: el real y el deliberado), 10, 13, 15, 16, 19, 21, 22, 23, 24, 27 y 31. La tabla completa
  está en la bitácora, «Cierre — `/audita-sprint`».
- **Aprobación de la Fase 1:** el usuario, el 2026-10-03, con dos variaciones (AU-S5-05 y AU-S5-20).
- **Casilla 4 (frases caducadas):** repetida sobre el diff de la Fase 2 y sobre este summary. La
  única promesa aplazada nueva es la del manual, «varias categorías y cantidades llegan en una
  próxima versión», que es verdad hoy y está inventariada (igual que la UI, D16).

## Gate ⭐ — diferimiento y contrapesos

| Contrapeso                     | Evidencia (archivo, cuenta medida, corrida)                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pasada de capturas del builder | **36 encuadres** con `scripts/capturas-s5.mjs` sobre el build de producción (360 y 1280 px × claro y oscuro + la guía v2), `scrollWidth ≤ clientWidth` medido en cada uno, alto de la ficha contra la ventana y pasada de interacción (desplegable, ficha, Nivel 2, cancelar, recuperar), 2026-10-02. Más **10 encuadres** de la Fase 2 de la auditoría (brochure corregido, TaskCard bloqueada, estimación del Nivel 1; 6 mediciones OK), 2026-10-03. Todos leídos como imagen |
| e2e de `reduced-motion`        | `tests/e2e/reduced-motion-app.spec.ts`: 1 prueba × 2 proyectos (móvil y escritorio), visibilidad real con opacidad efectiva que cuenta los ancestros y transiciones apagadas en configurar → liga → ficha. Corre en el job `e2e` desde este PR (primera corrida aquí). Más la heredada del brochure (`brochure.spec.ts`)                                                                                                                                                        |

**⭐ diferido: 4 pruebas al acumulado del ciclo (S5: 4):** F3, F4, F6 y F8 de la guía v2, diferidas
al gate del cierre del ciclo H2. Las 11 ⭐ del H1 ya se corrieron y quedan como regresión.

## Archivos clave

1. `src/lib/ds/pipeline.py` — roster, CV, regla de un error estándar, `fit_member`, `_validate_payload`
2. `src/workers/contract.ts` — el lado que lee Python → TS, en producción
3. `src/engine/encarrilador.ts` · `src/engine/costos.ts` · `src/engine/tarea.ts` — E2 y E1
4. `src/content/modelos.ts` — E3, las fichas `{es,en}`
5. `src/lib/useExperiment.ts` — máquina de estados: liga, elección manual, Nivel 2, cancelar y restaurar
6. `src/components/LeagueTable.tsx` · `Level2Card.tsx` · `FichaModelo.tsx` · `TaskCard.tsx`
7. `tests/integration/liga.test.ts` — anti-fuga de la CV, selección sin test, cruces de punta a punta
8. `tests/unit/contract.test.ts` — carnadas «detectó k de n»
9. `decisions/009-*.md` · `010-*.md` · `011-*.md`
10. `sprints/SPRINT_005-auditoria.md` · `sprints/SPRINT_005-implementation-log.md`

## Cómo probar

1. `pnpm install && pnpm build && pnpm start`. Otra opción es la preview del PR (la URL va en la
   conversación, nunca en el repo).
2. «Rotación de empleados» → objetivo `edad` (tarjeta ámbar: predicción de una cantidad) →
   `renuncio` (binaria, quién compite) → «Entrenar modelos».
3. En Resultados:
   - ★ ganador con su razón;
   - «Ver puntajes de prueba» (etiquetados);
   - la ficha ⓘ de cada modelo;
   - «Elegir» otro → «◆ Elegido por ti» en el veredicto y en la model card → «Volver al ganador».
4. «Nuevo experimento» → `docs/kit-de-prueba/liga-mediana.csv`, objetivo `objetivo` → tarjeta del
   Nivel 2 con estimación → «Correr el Nivel 2» → «Cancelar el Nivel 2» → vuelve el resultado
   anterior y «Exportar» funciona.
5. Guía completa: `docs/GUIA-DE-PRUEBA.html` (38 pruebas; filtro «⭐ Solo el gate H2»).
6. Suites: `pnpm test` · `pnpm test:integration` · `pnpm test:e2e`.
