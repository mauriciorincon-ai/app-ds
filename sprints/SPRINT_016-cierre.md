---
sprint: 016 · app: ds · hito: H-2 · opened: 2026-10-21 · closed: pendiente (en ensayo general)
branch: sprint-016/el-producto-completo · pr: este
---
# Sprint 016 · «El producto completo» · cierre ejecutivo
- **Objetivo y resultado:** cerrar el H-2. Pagado el lote de medios y bajos del S8 al S15 (cada punto con su prueba que falla sobre el código del S15), teclado completo y axe en dos temas por e2e, documentos del hito al día y la ruta «Ensayo general del H-2» (18 paradas). **Veredicto del ensayo: pendiente** (ver «Ensayo»).
- **Estado:** construido y auditado; tu ensayo general es el único STOP. Sin el sí de cada parada, el H-2 no cierra.
- **Tiempo:** estimado 3,5 h · real ≥ 2,4 h según el script (el piso: solo cuenta commits; la F1 se commiteó en tandas al guardar un punto seguro). Por fase, estimado / script: F1 1,75/1,1 · F2 1,25/1,3 · F3 0,5/(al cerrar). Auditoría: 20 min, dentro de la F2.
- **Horas** (`node scripts/horas-sprint.mjs`):
```
### Horas del sprint (`scripts/horas-sprint.mjs`, rango `origin/main..HEAD`, heurística git-hours: huecos ≤ 2 h + 0,5 h por sesión)
| Commits | Sesiones | Horas activas | Span (primer → último commit) |
|---:|---:|---:|---|
| 16 | 1 | 2,4 h | 2026-10-21 20:41 → 2026-10-21 22:33 (1,9 h) |
| Fase | Commits | Horas activas |
|---|---:|---:|
| F1 | 9 | 1,1 h |
| F2 | 7 | 1,3 h |
```
- **Entregables:** lote en 5+ commits por área; `tests/e2e/teclado*.ts` (3) y axe en dos temas donde faltaba; `un-pr-vivo` con su demo en rojo; manual, guía v13 (bloque R + ruta del ensayo), BLUEPRINT as-built (diez etapas, peso por ruta, 37 de la VISION), ADR 021 y 022, `design-system.md` + tarjeta de `design-sync/`, brochure de seis puertas y export de 58 con copia del esquema de CV Viva, `CLAUDE.md`. Anexo del lote: `sprints/SPRINT_016-lote.md`.
- **No completado:** nada del plan. Lo que se cierra con razón y sitio (S9 D2, S8 M4, S8 B7/S9 B7 al H-3) está en el anexo. `/design-sync`: lo invocas tú, una vez, junto al STOP.
- **Desviaciones:** (1) la ruta del ensayo suma unos 70 min, no 40: son 18 paradas (VoiceOver en la 1 y la ficha, claro, inventario). (2) `/` sube 474 B (diccionario base `es.json`); `/protocolo` baja 194 B. (3) S9 B3 se cierra, no se paga (no hay trabajo que perder). (4) `estado` del export queda `inicial`: `sellado` lo decide la planeadora tras tu sí a todo.
- **Decisiones (tuyas, en el plan):** el export cuenta como el manual (41 + 17 = 58); las 8 funcionalidades de la VISION sin construir van a `descartadas` con nombre; la tabla de las 37 la confirmas en la parada 18.
- **Deuda:** al H-3 con sitio en el BLUEPRINT («Lo que queda para H-3 y H-4»): hilo principal de la etapa 4 con 50 000 × 79, LCP bimodal de `/protocolo` (margen 6,5 KiB), dos pestañas, efectos en `setEstado`. Al H-4: firma del archivo y red teaming de la narración (ADR 005/007).
- **Aprendizaje:** una decisión del usuario con el PR abierto se commitea y se sube antes de pedir el merge. Un `pnpm exec` en una copia de `git archive` falla; usar el binario de `node_modules/.bin`.
- **Auditoría** (subagente Sonnet 5.5 · high · solo lectura · 20 min): alcance parcial en el anexo y la guía; calidad, seguridad y frases caducadas **13 Medios y 20 Bajos, 0 Críticos y 0 Altos**, **todos pagados** en `1188f8b`, `73a0bd8` y `d38a1aa` (tres solo anotados: H-13, H-19, H-33). Las seis superficies de S10 B5–B13 se recorrieron: seis defectos reales, pagados. Frases caducadas repetidas sobre los pagos: sin coincidencias.
- **Modelo y relevos:** F1, F2 y F3 Sonnet 5.5 · auditor Sonnet 5.5 (high). Sin desvío. Haiku no se usó. Relevos: ninguno.
- **Gates:** typecheck 0 · lint 0 · `pnpm test` 2003/2003 (95,96 % líneas, 86,02 % ramas) · integración 117/118 (1 omitida) · e2e completo 132 pasan y 4 omitidas (Tab en móvil), 0 reintentos · en el código del S15 fallan 56 pruebas nuevas · peso (réplica CI, mediana de 3): `/protocolo` 321 128 B (main 321 322), LCP 2862 ms · `/` 248 806 B (main 248 332), LCP 2930 ms.
- **Ensayo:** en curso. Una fila por parada y el veredicto, al cierre del ensayo (anexo `sprints/SPRINT_016-lote.md`, sección «Ensayo general»).

Para mergear: squash y borrar la rama; después `/cierre-sprint ds`.
