---
sprint: 010 · app: ds · hito: H-2 · branch: sprint-010/sin-modelo
opened: 2026-10-18 · closed: 2026-10-18 · pr: #25
---
# Sprint 010 «Lo que ya se logra sin modelo» — cierre ejecutivo
**Nombre:** S10 · etapa 5 del Protocolo DS (línea base sin modelo y regla de hoy); D1 y M1 del S9 pagados.
**Objetivo planeado:** la etapa 5 abre con la 4 cumplida; referencias sin modelo en la moneda de la decisión; regla de hoy medida; compuerta con porqué. **Resultado:** cumplido, salvo un check rojo: Lighthouse de la CI, por peso. **Estado:** listo para merge cuando la CI confirme el presupuesto de 320 KB; los demás checks pasan en `ef85b7f`.
**Tiempo:** estimado 3 h · real 1,7 h (script; no ve el trabajo previo al primer commit de cada fase; la sesión va de 10:24 al último commit, 11:47) · diferencia −1,3 h.
**Horas (`horas-sprint.mjs`, al cerrar el código):**
```
### Horas del sprint (`scripts/horas-sprint.mjs`, rango `origin/main..HEAD`, heurística git-hours: huecos ≤ 2 h + 0,5 h por sesión)

| Commits | Sesiones | Horas activas | Span (primer → último commit) |
|---:|---:|---:|---|
| 12 | 1 | 1,7 h | 2026-10-18 10:35 → 2026-10-18 11:47 (1,2 h) |

| Fase | Commits | Horas activas |
|---|---:|---:|
| F1 | 3 | 0,5 h |
| F2 | 2 | 0,4 h |
| F3 | 7 | 0,8 h |
**Por fase (estimado → real):** F1 1,25 → 0,5 h · F2 1,25 → 0,4 h · F3 0,5 → 0,8 h (+60 %). Causa: la auditoría, la corrección de B1 y el diagnóstico del peso de Lighthouse no estaban en la estimación. Medida: la auditoría y el peso van como fase propia en el próximo sprint.
**Entregables:** motor (`regla.ts`, `etapa5.ts`; M1 en `etapa4.ts` y `tabla.ts`), pantalla (`Etapa5Form.tsx`, `regla-texto.ts`), D1 (`globals.css`), registro y textos {es, en}, manual (§7 y fila 010), guía (bloque L, v7, 84 casillas), `scripts/capturas-s10.mjs`.
**No completado:** partición y prueba sellada (etapa 6); lote de medios y bajos.
**Desviaciones:** (1) M1 exige también secuencia; la cardinalidad sola marcaba 8 medidas del kit. (2) B1 pagado aunque es Medio: texto nuevo mío y falso; el error venía del plan (`SPRINT_010.md` §1–2, «la etapa 7»), que la planeadora corrige en su archivo. (3) **Presupuesto de peso:** la CI mide `/protocolo` en 311.009 B sin `.env.local` (yo había medido 283.448 B con él: error mío); 310.412 B tras la carga diferida. **Decidiste subir el presupuesto de script a 320 KB** (`perf-budget.json`; aplica a todas las URL, porque LHCI aplica cada fila que coincide; la portada pesa 273 KB). Deuda real: los diccionarios de los dos idiomas van en cada página (`src/i18n/dictionaries.ts`).
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
**Pruebas (después del hecho):** typecheck y lint limpios · unitarias 1220/1220 (motor del Protocolo 99,13 % líneas, 87,22 % ramas) · e2e 92/92 en la CI sobre `ed77512`, 0 reintentos, 0 flaky (run 39146673863) · Lighthouse (réplica de la CI, sin `.env.local`): `/protocolo` 310.412 B con presupuesto de 327.680 B; categorías ≥ 0,9; LCP mediana 3.370 ms frente a 3.500 (aviso de margen, no bloquea) · capturas 36 encuadres, 0 desbordes, 12 leídas como imagen · demo en rojo: 9 de 13 fallan nombrando «un baseline inventado» · `pnpm audit --audit-level high`: una excepción vigente, salida 0 · dependencias y retiros ✓.
**Para mergear:** que la CI confirme el presupuesto de 320 KB; después squash y borrar la rama, y `/cierre-sprint ds`.
