---
sprint: 017 · app: ds · hito: H-2 · opened: 2026-10-24 · closed: 2026-10-25
branch: sprint-017/lo-que-faltaba · pr: #34
---
# Sprint 017 · «Lo que faltaba» · cierre ejecutivo
- **Objetivo y resultado:** las tres `[MVP]` de Probeta que faltaban, construidas: **Estrésalo** (Probeta y etapa 8, con su línea de robustez en el sello de la ficha), **receta reproducible** (`.py`) y **«Publícalo en un clic»** (puntuador `.html` + plantilla de servicio `.zip`). La CI ejecuta receta y servicio de cada modelo del roster en CPython 3.14.0 (Linux); el puntuador, por e2e. 26 de las 37 de la VISION construidas, `descartadas: []`.
- **Estado:** construido, auditado y pagado; PR #34 listo. Es el único STOP: sin prueba tuya (FORMA y TEXTO van al ensayo del S21).
- **Tiempo:** estimado 4,5 h (F1 1,5 · F2 2,0 · F3 1,0) · real según el script 2,1 h (F1 1,0 · F2 0,3 · F3 0,7), 47 % del estimado; el script es un piso (F2 se commiteó en una tanda). Auditoría: 10 min, dentro de la F3.
```
### Horas del sprint (`scripts/horas-sprint.mjs`, rango `origin/main..HEAD`, heurística git-hours: huecos ≤ 2 h + 0,5 h por sesión)

| Commits | Sesiones | Horas activas | Span (primer → último commit) |
|---:|---:|---:|---|
| 21 | 1 | 2,1 h | 2026-10-24 23:00 → 2026-10-25 00:36 (1,6 h) |

| Fase | Commits | Horas activas |
|---|---:|---:|
| F1 | 8 | 1,0 h |
| F2 | 4 | 0,3 h |
| F3 | 9 | 0,7 h |
```
- **Entregables:** `pipeline.py` (sección S17 y 8 bloques `# plantilla:`), `src/lib/ds/plantillas/` (7), `src/lib/publica/`, paneles `estres/` y `publica/`, etapa 8 + ficha, `scripts/verificar-publica.mjs`, `tests/python/`, ADR 023 y 024 (nota en la 007), manual, guía v14 (24 paradas, no corrida), BLUEPRINT as-built (26/6/5/0), export y brochure de 62, `CLAUDE.md`.
- **No completado:** nada del plan. Vecinos más cercanos sin servicio; receta y servicio solo en las tres tareas con objetivo (al agrupar, solo el puntuador).
- **Desviaciones:** (1) **peso**: `/` +1 470 B y `/protocolo` +1 805 B sobre `main` (no «≤ main»), bajo sus topes (`/protocolo` 315,4 de 320 KiB); ningún identificador del S17 está en los chunks iniciales (verificado en el build): el cableado fue +226 B tras la F1, el resto es el diccionario (~90 B) y el reparto de chunks de Turbopack. LCP de `/protocolo` en mi réplica 3 517 ms (main 3 369; techo 3 500): bimodal conocido, el gate es el job `lighthouse`. (2) #33 absorbido y cerrado (el plan lo declaró). (3) 26 construidas, no 25: el sello cierra su hueco. (4) Los bosques de árboles dicen «reproduce de forma aproximada». (5) El archivo de vecinos más cercanos SÍ lleva filas: «no tus filas» corregido en app, manual, export, brochure y ADR 007. (6) El bump de axe 4.14 trajo `label-content-name-mismatch`: arreglo en `TaskCard` (`9fc578f`).
- **Decisiones (las del plan, sin veto):** #33 absorbido; servicio sin vecinos; el estrés lee la misma prueba (no es apertura); ✓ si con 10 % de ruido sigue ganándole a su rival. Cero miradas de DECISIÓN.
- **Deuda (al lote del hito):** campos de contrato sin lector `contrato-estres.ts:58,70,76` · `ensamblar.ts:16-17` · `etapa8.ts:614` (el rival no se imprime en la ficha); `puntuador.html:128-134` (`pyodide.js` sin SRI; lightgbm/xgboost sin e2e). Heredada: LCP bimodal de `/protocolo`, margen 4,6 KiB.
- **Aprendizajes:** tras un bump de `@axe-core/playwright`, correr el e2e completo, no solo los specs del sprint. Una ADR no cita una prueba que no existe: se escribe la prueba y luego la frase. `git add a && git add -u b && commit`: si el segundo falla, el commit arrastra lo indexado; mirar `git diff --cached --stat`. No regenerar `tests/integration/.salida/` mientras corre Python.
- **Recomendación:** S18 con el margen de `/protocolo` (4,6 KiB) a la vista: todo texto nuevo de etapa, diferido. **Esfuerzo-beneficio:** alto; tres funciones de producto con prueba real en CPython por menos de la mitad del estimado.
- **Auditoría** (subagente Sonnet 5.5 · high · solo lectura · 10 min): 0 Críticos · 1 Alto · 5 Medios · 10 Bajos. Alto H-01 (etapa 8 sin numéricas) pagado · `7c17ae6`. Medios: H-02 paridad de partición con 30 casos · `26725e7`; H-03 servicio solo en 127.0.0.1 y H-06 `.pyc` · `bf5b97b`; H-05 barrido en rojo · `2feae1c`; H-04 costo como consejo · `b125bf0`. Bajos pagados: H-07, H-10 · `bf5b97b`; H-08, H-09, H-13, H-15 · `2feae1c`; H-14, H-16 · `b125bf0`; H-11 y H-12 en «Deuda». Alcance: los recorridos de teclado no pasaban por Estrésalo · pagado `9b16a08`. Frases caducadas: repetidas sobre los pagos, sin coincidencias.
- **Gates:** typecheck 0 · lint 0 · `pnpm test` 2116/2116 (95,55 % líneas, 85,82 % ramas) · integración 132/133 (1 omitida) · Python 13/13 (CPython 3.14.0) · e2e 134 pasan, 6 omitidas a propósito, 0 flaky · cada gate nuevo se vio fallar (receta alterada, versiones, hash, `verificar-publica`, barrido con valor inyectado, partición con otra semilla, pins vs lock). **CI: se lee al final en el PR #34, no en este archivo.**
- **Modelo y relevos:** F1, F2 y F3 Sonnet 5.5 · auditor Sonnet 5.5 (high). Sin desvío. Haiku no se usó. Relevos: ninguno.

Para mergear: squash y borrar la rama; después `/cierre-sprint ds`.
