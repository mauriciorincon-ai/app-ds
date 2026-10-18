---
sprint: 010 · app: ds · hito: H-2 · branch: sprint-010/sin-modelo
opened: 2026-10-18 · closed: 2026-10-18 · pr: por abrir
---
# Sprint 010 «Lo que ya se logra sin modelo» — cierre ejecutivo
**Nombre:** S10 · etapa 5 del Protocolo DS (línea base sin modelo y regla de hoy); D1 y M1 del S9 pagados.
**Objetivo planeado:** la etapa 5 abre con la 4 cumplida; referencias sin modelo en la moneda de la decisión; regla de hoy medida; compuerta con porqué. **Resultado:** cumplido, dos desviaciones declaradas. **Estado:** listo para PR.
**Tiempo:** estimado 3 h · real 1,4 h (script; no ve el trabajo previo al primer commit de cada fase; la sesión va de 10:24 al último commit, 11:28) · diferencia −1,6 h.
**Horas (`horas-sprint.mjs`, al cerrar el código):**
```
### Horas del sprint (`scripts/horas-sprint.mjs`, rango `origin/main..HEAD`, heurística git-hours: huecos ≤ 2 h + 0,5 h por sesión)

| Commits | Sesiones | Horas activas | Span (primer → último commit) |
|---:|---:|---:|---|
| 10 | 1 | 1,4 h | 2026-10-18 10:35 → 2026-10-18 11:28 (0,9 h) |

| Fase | Commits | Horas activas |
|---|---:|---:|
| F1 | 3 | 0,5 h |
| F2 | 2 | 0,4 h |
| F3 | 5 | 0,5 h |
```
**Por fase (estimado → real):** F1 1,25 → 0,5 h · F2 1,25 → 0,4 h · F3 0,5 → 0,5 h · ninguna pasó +50 %.
**Entregables:** motor (`regla.ts`, `etapa5.ts`; M1 en `etapa4.ts` y `tabla.ts`), pantalla (`Etapa5Form.tsx`, `regla-texto.ts`), D1 (`globals.css`), registro y textos {es, en}, manual (§7 y fila 010), guía (bloque L, v7, 84 casillas), `scripts/capturas-s10.mjs`.
**No completado:** partición y prueba sellada (etapa 6); lote de medios y bajos.
**Desviaciones:** (1) M1 exige también secuencia; la cardinalidad sola marcaba 8 medidas del kit. (2) B1 pagado aunque es Medio: texto nuevo mío y falso; el error venía del plan (`SPRINT_010.md` §1–2, «la etapa 7»), que la planeadora corrige en su archivo. (3) Lighthouse medido antes de B1 (solo texto).
**Causas:** el plan fijó «cardinalidad» sin mirar las medidas enteras del kit, y repitió «etapa 7» sin cruzarlo con la visión.
**Decisiones:** ninguna de producto.
**Deuda al lote (`archivo:línea`):** medio B2 `Etapa5Form.tsx:97-113`, `etapa5.ts:600`, `:661` («1,5» en sí/no de una cantidad se rechaza sin decir por qué) · medio B3 `MANUAL-DE-USO.md:674` (dice punto donde el campo acepta coma) · medio B4 `etapa5.ts:376-383`, `:898` (campos que no llegan al cuaderno) · bajos B5–B13: `MANUAL-DE-USO.md:641-643`, `:868`; `protocolo-etapa5.spec.ts:105-122`; `etapa5.ts:155-156,369,914,1001-1002`; `Etapa5Form.tsx:90`; `messages/es.json:1558-1582`, `:1600`; `regla.ts:65-67` · heredado del S9 sin cambios: `sprints/SPRINT_009-auditoria.md`. Observado, no es gate: prettier marca el manual y la guía, que ya fallaban en `main`.
**Aprendizajes:** un plan de la planeadora puede traer un dato falso: cruzarlo con la visión. Mirar las medidas reales antes de fijar una regla.
**Recomendación para el siguiente:** gate humano del hito H-2 con la guía (bloques K y L); antes de la etapa 6, pagar B2.
**Evaluación esfuerzo-beneficio:** alta.
**Auditoría (Sonnet 5.5 · high · una pasada, independiente, solo lectura):**
- **Alcance:** completo; M1 con desviación declarada; B6 parcial (la prueba de «ningún valor» mira filas enteras).
- **Calidad:** sin Críticos ni Altos; medios B2–B4 y bajos B5–B13 al lote.
- **Seguridad:** sin hallazgos; ningún valor del dataset en breadcrumbs, logs ni narración; cero IA generativa.
- **Frases caducadas:** B1 (medio) pagado · `4e6d8c4`, `2c3df3c`, `bbc6638`; B5 al lote.
**Modelo por fase:** F1 y F2 Sonnet 5.5 · F3 Haiku 5.5 · auditor Sonnet 5.5 · planificación Opus 5.5 · sin desvío. **Haiku en F3:** bastó (manual, guía, cierre y B1); un reemplazo falló en silencio, lo cazó una comprobación y se rehizo al primer reintento. **Relevos:** ninguno.
**Pruebas (después del hecho):** typecheck y lint limpios · unitarias 1220/1220 (motor del Protocolo 99,13 % líneas, 87,22 % ramas) · e2e 92/92 antes de B1 y etapas 4–5 8/8 después · Lighthouse `/protocolo`: script 283.448 B (presupuesto 307.200), LCP 2.708–3.013 ms, TBT 0–4, perf 0,95 · capturas 36 encuadres, 0 desbordes, 12 leídas como imagen · demo en rojo: 9 de 13 fallan nombrando «un baseline inventado» · `pnpm audit --audit-level high`: una excepción vigente, salida 0 · dependencias y retiros ✓.
**Para mergear:** squash y borrar la rama; después `/cierre-sprint ds`.
