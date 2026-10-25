---
sprint: 018 · app: ds · hito: H-2 · opened: 2026-10-25 · closed: 2026-10-25
branch: sprint-018/probeta-completa · pr: #35
---

# Sprint 018 · «Probeta completa» · cierre ejecutivo

- **Objetivo y resultado:** las seis metas, construidas: **Excel** (`.xlsx` sin dependencia, ADR 025) con **aviso de datos personales** (nombra columna y tipo, jamás el valor); **plan de limpieza** que el código propone y tú apruebas paso a paso (ADR 026: nada toca la tabla, lo estadístico se ajusta solo con train; queda en la ficha, en `cleaning_plan` del `.probeta.json` y en la receta); **exploración** (histogramas, Pearson, V de Cramér); **margen de error** (1 000 remuestreos, semilla fija); **explicaciones verificadas contra los números** en las cuatro tareas, sin llamada nueva a un LLM; la **liga** confirmada contra la VISION v2.1.0 por una prueba. Las 37: **31 construidas · 1 con otro alcance (la 19, S19) · 5 en construcción · 0 descartadas**.
- **Estado:** construido, auditado y pagado; PR #35 listo. Único STOP: sin prueba tuya (FORMA y TEXTO van al ensayo del S21; la guía v15 suma sus paradas y no se corrió).
- **Tiempo:** estimado 3,3 h (F1 1,5 · F2 1,2 · F3 0,6; el prompt decía 2,5 h) · real según el script 2,5 h, 76 % del estimado (el script es un piso). **F3 +100 %** (1,2 h contra 0,6): la auditoría (15 min) y sus 13 pagos, más la guía de 32 paradas; medida: en un sprint de documentos pesados la F3 se estima en ≥ 1,0 h.

```
### Horas del sprint (`scripts/horas-sprint.mjs`, rango `origin/main..HEAD`, heurística git-hours: huecos ≤ 2 h + 0,5 h por sesión)

| Commits | Sesiones | Horas activas | Span (primer → último commit) |
|---:|---:|---:|---|
| 22 | 1 | 2,5 h | 2026-10-25 10:45 → 2026-10-25 12:46 (2,0 h) |

| Fase | Commits | Horas activas |
|---|---:|---:|
| F1 | 5 | 1,0 h |
| F2 | 2 | 0,3 h |
| F3 | 15 | 1,2 h |
```

- **Entregables:** `xlsx.ts`/`archivo.ts`, `personales.ts`, `limpieza.ts`/`limpieza-plan.ts`, `exploracion.ts`, `intervalo.ts`, `narration/{cifras,explicacion,exploracion}.ts`, `_make_preprocessor(…, limpieza)` y `interval` en el worker, paneles `limpieza/` `exploracion/` `resultados/` con diccionarios diferidos, `liga-vision.test.ts`, kit de prueba con `.xlsx`, ADR 025 y 026, manual, guía v15 (32 paradas, bloque T), BLUEPRINT 31/1/5/0, export y brochure de 68, `CLAUDE.md`, README, `design-system.md`.
- **No completado:** nada del plan. Fuera por diseño: Excel en el Protocolo (sigue en CSV), elegir hoja, `.xls`, recuperar `$1,200`, el margen de error en la ficha de Probeta.
- **Desviaciones:** (1) **31, no 32**: la fila 1 ya contaba. (2) El aviso de datos personales no es un `EdaAlert` (nace al cargar, antes del objetivo). (3) **Peso**: `/` 244,4 → 246,6 KiB (**+2,1 KiB**, cableado mínimo de Excel y del plan en la carga inicial; tope 300) y `/protocolo` 315,4 → 315,5 (+0,1; tope 320), medidos en la réplica de CI. (4) La prueba de la liga lleva la lista de la VISION como constante citada: la VISION es privada y la CI, pública. (5) La firma nueva de `_make_preprocessor` rompió tres espías anti-fuga: arreglados. (6) La auditoría halló un cierre real del informe del plan (H-01).
- **Decisiones tuyas:** aceptar en el S21 las ausencias de la liga que ya tienen razón escrita en `roster.ts:100,126`: Lasso y regresión lineal al clasificar; logística y Naive Bayes al estimar. Nada quedó descartado.
- **Deuda (al lote del hito):** contrato sin lector `model-file.ts:620` (`cleaning_plan`), `contrato-intervalo.ts:33-34,50-51` (`n`, `seed`), `personales.ts:20` (`cuota`), `roster.ts:100,126` (mapas de razones que solo lee la prueba); `experiment.ts:898-905` (el registro de agrupar marca `aplicado` una columna que el agrupador ya excluía por id o fecha). Heredada: LCP bimodal de `/protocolo`.
- **Aprendizajes:** correr la integración COMPLETA antes de la auditoría (los espías se rompieron por la firma, no por la lógica); medir el peso en un puerto libre (el 3000 estaba ocupado y dio 404 en `/protocolo`).
- **Auditoría** (Sonnet 5.5 · high · solo lectura · 12:02–12:17, 15 min): 0 Críticos · 1 Alto · 4 Medios · 8 Bajos. Alto F1 pagado · `0c4c4c1`. Medios: F2 signo de las cifras · `0c907b5`; F3 libro hostil · `f8a4435`; F4 «número de teléfono» · `46cbda2`; F5 paridad de diferidos · `bd41b20`. Bajos: F6, F7, F11 · `cf7c1db`; F8, F12 · `e35d34e`; F9 · `2f20b75`; F10 parcial y F13 en «Deuda». Frases caducadas: 3 reales, pagadas.
- **Gates:** typecheck 0 · lint 0 · `pnpm test` 2457/2457 (95,54 % líneas, 85,83 % ramas) · integración 166 pasan, 1 omitida · Python 13/13 (CPython 3.14.0) · e2e 152 pasan, 6 omitidas a propósito, 0 flaky (`--retries=0`) · dependencias OK · `audit` sin altas · cada gate nuevo se vio fallar (libro hostil, paridad, reglas de cardinalidad, carrera del intervalo, signo, espías, valor inyectado en el aviso, `.xlsx` cifrado, liga sin un modelo). **CI: se lee al final en el PR #35, no en este archivo.**
- **Modelo y relevos:** F1, F2 y F3 Sonnet 5.5 · auditor Sonnet 5.5 (high). Sin desvío; Haiku no se usó. Relevos: ninguno.

Para mergear: squash y borrar la rama; después `/cierre-sprint ds`.
