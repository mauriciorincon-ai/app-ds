---
sprint: 021 · app: ds · hito: H-2 · opened: 2026-10-26 · closed: 2026-10-28
branch: sprint-021/pregunta-a-tus-datos · pr: #39
---

# Sprint 021 · «Pregúntale a tus datos» · cierre ejecutivo

- **Objetivo, resultado y estado:** la 15 y última de la VISION, **Pregúntale a tus datos**: un lector determinista ES/EN (sin LLM ni dependencia nueva; la pregunta y los valores no salen del navegador) que muestra la consulta en palabras y en SQL, la valida antes de correr y da tabla, gráfico, CSV y una frase verificada (`pregunta.ts`, `consulta.ts`, `narration/consulta.ts`, panel `pregunta/`, kit `ventas-por-region.csv`; ADR 030; el SQL da la misma tabla en CPython). Más el **lote del hito** (S17–S20) y el **hito en papel** (manual, guía v18, BLUEPRINT as-built, ADR 028–030, `design-system.md`, `design-sync/`, export y brochure de 77). Las 37: **37 construidas · 0 · 0 · 0**. Construido, auditado y pagado; PR listo; el ensayo es el único STOP y sigue pendiente.
- **Tiempo:** estimado 3,5 h (F1 1,25 · F2 1,5 · F3 0,75) · real según el script 2,5 h, 71 % del estimado (es un piso: F1 se escribió entera antes de su primer commit, 10-27 19:39; el «construye» fue el 10-26 20:27). **F3 +33 %** (gates sobre el árbol final y la última recuenta del export); ninguna fase sobre el 50 %.

```
### Horas del sprint (`scripts/horas-sprint.mjs`, rango `origin/main..HEAD`, heurística git-hours: huecos ≤ 2 h + 0,5 h por sesión)

| Commits | Sesiones | Horas activas | Span (primer → último commit) |
|---:|---:|---:|---|
| 33 | 2 | 2,5 h | 2026-10-27 19:39 → 2026-10-28 05:29 (9,8 h) |

| Fase | Commits | Horas activas |
|---|---:|---:|
| F1 | 6 | 0,5 h |
| F2 | 23 | 1,0 h |
| F3 | 4 | 1,0 h |
```

| Lote S17–S20 (`SPRINT_021-lote.md`)          | Puntos | Dónde                                                                                                                               |
| -------------------------------------------- | -----: | ----------------------------------------------------------------------------------------------------------------------------------- |
| Pagado, con su prueba vista fallar           |     35 | S17 3 · S18 3 · S19 17 · S20 12                                                                                                     |
| Ya estaba (el lector del contrato lo coteja) |      8 | 17-1, 17-2, 18-10, 19-22, 19-24, 20-08, 20-10, 20-13                                                                                |
| Cerrado con razón y sitio                    |      7 | telemetría 17-3 · 19-23 · 20-09 · `cleaning_plan` 18-9 · ausencias de la liga 18-13/14 (tu decisión del 10-26) · H-3: 17-8 y el LCP |

- **Las dos medidas del S20** (presupuesto fijado antes): gemelo en su peor caso (50 000 filas, tres categóricas de 10 000 valores) 51,9 s y 1 829 MiB de heap → **13,7 s** y 322 MiB con la matriz dispersa (`SYNTH_SPARSE_FROM = 512`; navegador 17,4 s en frío · 12,4 s en caliente; presupuesto 30 s). Holt-Winters con 2 000 días **7,3 a 9,2 s** en Node y 13,5 · 8,4 · 6,9 s en el navegador (presupuesto 45 s), sin cambio de código.
- **No completado y desviaciones:** 17-7 (e2e de un booster en el puntuador), recorte ② declarado, **aplazado a H-3, no descartado**. (1) El gemelo SÍ necesitó pago; Holt-Winters no. (2) El gate del peor caso del gemelo pasó de tiempo a memoria (45 s y 25 s con 25 archivos en paralelo). (3) El lector aprendió «los 3 con más ventas» y «cuántas filas hay» al verlos mal leídos. (4) A-23: agrupar por un número es error de validación, no pregunta. (5) El flaky `teclado-probeta` (20-17) no se reprodujo en 60 repeticiones: declarado; `ci.yml` ahora sube `test-results/` también si el job pasa. (6) **`/design-sync` NO se ejecutó**: exige tu `/design-login` interactivo; el bundle está listo y `project.json` sigue en 13 archivos · 2026-08-15. (7) Peso `/` 220,1 → 220,3 y `/protocolo` 288,4 → 288,7 KiB (tres frases de 19-19 en el diccionario base; topes 300 y 320; margen ≈ 4,2 KiB).
- **Decisiones, deuda, aprendizajes y recomendación:** la del S18 (ausencias de la liga) queda cerrada con el default del G-Plan. Deuda a H-3: 17-7; margen de 4,2 KiB y LCP bimodal de `/protocolo`; 50 000 × 79 en el gemelo; `/design-sync` (tuyo). Aprendizajes: una demo en rojo salió verde con la mutación (el último respaldo de `verificarTexto` no tenía prueba) y se escribió; un gate de tiempo con 25 archivos en paralelo es intermitente, uno de memoria no. Siguiente: H-3 tras tu `/design-login` + `/design-sync`; beneficio alto, la VISION queda 37/37 con 2,5 h (piso) y cero servicios nuevos.
- **Auditoría** (Sonnet 5.5 · high · solo lectura · 20:13–20:24; alcance · calidad · seguridad · frases caducadas): 0 Críticos · 4 Altos · 8 Medios · 11 Bajos, **todos pagados** (cierra el hito). Altos: A-01, A-02, A-04 (lecturas que invertían o ignoraban en silencio) · pagado `f8c5340`; A-03 («fue Total» sin sumar) · pagado `24cd356`. Medios y bajos con commit en el anexo; A-23 es desviación declarada. Frases caducadas: 0 vencidas; 3 hechas falsas por los hallazgos y reparadas.
- **Gates** (código final): typecheck 0 · lint 0 · `pnpm test` 3114/3114 (95,35 % líneas) · integración 347 pasan, 10 omitidas · Python 23/23 (CPython 3.14) · e2e 183 pasan, 13 omitidas a propósito, `--retries=0` en los dos proyectos · dependencias OK y `audit` sin altas · cero enlaces limpio · 10 demos en rojo vistas (anexo). **CI: se lee al final en el PR, no en este archivo.**
- **Ensayo general (único STOP):** pendiente. Fecha, duración por tanda y una fila por parada se escriben aquí tras tu veredicto; guía v18: 44 paradas, 5 tandas, ~180 min; lo no visto no cuenta.
- **Modelo y relevos:** F1, F2 y F3 Sonnet 5.5 · el fork del hito en papel y el auditor, Sonnet 5.5 (high). Sin desvío; Haiku no se usó. Relevos: ninguno.

Para mergear: squash y borrar la rama; después `/cierre-sprint ds`.
