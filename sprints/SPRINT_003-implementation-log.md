# Sprint 003 — Bitácora de implementación (El modelo se usa)

Branch: `sprint-003/modelo-se-usa` · Orden: `portafolio/ds/ordenes/SPRINT_003-orden.md` ·
Plan aprobado por el usuario el 2026-07-11 (plan mode).

## Verificación de supuestos del kit (Fase 0)

2026-07-11 — Verificado contra el repo real:

- ✅ `vitest.config.ts` + `vitest.integration.config.ts` + `playwright.config.ts` presentes.
- ✅ `scripts/copy-pyodide.mjs` en `predev`/`prebuild` (package.json).
- ✅ `lighthouse-urls.json` (`["/"]`) y `perf-budget.json` presentes.
- ✅ `githooks/pre-commit` (gitleaks) presente.
- ✅ Datasets de ejemplo en `public/datasets/`: `marketing-campania.csv`,
  `rotacion-empleados.csv`, `credito-fuga-plantada.csv` (lección D1: toda afirmación sobre
  columnas se verifica contra el CSV real).
- ✅ Supuesto de la orden confirmado en código: `run_experiment` NO retiene el pipeline fitted
  (`forest_pipe` variable local, `src/lib/ds/pipeline.py:168`).

**Fricciones de kit: ninguna.** Todo lo que la orden asume "ya viene" está presente.

## Desviación del plan

- (menor) La orden lista `src/i18n/dictionaries.ts` como archivo a modificar; en este repo ese
  archivo solo importa `messages/{es,en}.json` — el microcopy nuevo va en los JSON y
  `dictionaries.ts` no cambia. Sin impacto en el alcance.

## Spike export (riesgo #1) — resultado

2026-07-11 — `micropip.install("skl2onnx")` en Pyodide 314.0.2 (Node, paquete npm, mismo runtime
que producción): **NO carga.** Error literal:

```
ValueError: Can't find a pure Python 3 wheel for 'onnx>=1.2.1'.
See: https://pyodide.org/en/stable/usage/faq.html#why-can-t-micropip-find-a-pure-python-wheel-for-a-package
```

Confirma la hipótesis de la orden (onnx exige protobuf C++; no hay wheel emscripten). Decisión:
**fallback pickle (stdlib) + zlib + base64 con manifiesto JSON y SHA-256 validado antes de
deserializar** → ADR 007. Versiones del runtime real (para `RUNTIME_VERSIONS` y el manifiesto):
pyodide **314.0.2** · sklearn **1.8.0** · python **3.14.2**.

## Registro

| Fecha      | Evento                                                                                                                                                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-11 | Plan mode + /plan-sprint; plan aprobado. Branch creado. Kit verificado sin fricciones.                                                                                                                                                                |
| 2026-07-11 | Spike skl2onnx: NO carga (sin wheel para onnx). Fallback pickle+manifiesto → ADR 007.                                                                                                                                                                 |
| 2026-07-11 | Fase 1 (motor) verde: schema-check/model-file/scored-csv + pipeline.py (_MODEL, score_new_data, export/import) + protocol union + runner dispatch. Integración Pyodide 15/15 (S1/S2 intactos); RUNTIME_VERSIONS validada contra runtime real.         |
| 2026-07-11 | Decisión de detalle: el payload picklea {pipe, schema, training_profile} completo — import_model solo necesita payload_b64; el manifiesto queda como cara humana + integridad. PipelineResult solo gana `classes`.                                    |
| 2026-07-11 | Fase 2 (UI) verde: fase `scoring` en useExperiment (mapa de pendientes por id), ScoreScreen (4 estados + preparación import), export en Results, import con resumen en Start, i18n ES/EN mismo paso. Unit 179/179 con umbrales 80% en motores nuevos. |
