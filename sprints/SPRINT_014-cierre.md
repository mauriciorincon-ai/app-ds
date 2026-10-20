---
sprint: 014 · app: ds · hito: H-2 · opened: 2026-10-19 · closed: 2026-10-19
branch: sprint-014/la-decision · pr: se abre con este cierre
---
# Sprint 014 · «¿Sirve para la decisión?» · cierre ejecutivo
- **Objetivo y resultado:** la etapa 9 del Protocolo, sin reabrir la prueba, con usar · iterar · no usar. Cumplido: abre con la 8 registrada, decide con números, y «no usarlo» pasa la compuerta. Más M1, M2, techo por ruta y LCP observado (deuda del S13).
- **Estado y tiempo:** cerrado para merge; falta el gate humano del hito. Estimado 3,5 h · real 2,0 h (piso del script) · −1,5 h. Por fase, estimado / script: F1 1,0/0,6 · F2 1,75/0,7 · F3 0,75/0,8.
- **Horas** (`node scripts/horas-sprint.mjs --rango main..HEAD`):
```
### Horas del sprint (`scripts/horas-sprint.mjs`, rango `main..HEAD`, heurística git-hours: huecos ≤ 2 h + 0,5 h por sesión)

| Commits | Sesiones | Horas activas | Span (primer → último commit) |
|---:|---:|---:|---|
| 15 | 1 | 2,0 h | 2026-10-19 20:19 → 2026-10-19 21:51 (1,5 h) |

| Fase | Commits | Horas activas |
|---|---:|---:|
| F1 | 5 | 0,6 h |
| F2 | 4 | 0,7 h |
| F3 | 6 | 0,8 h |
```
- **Entregables:** motor, pantalla y compuerta de la etapa 9 (tres términos nuevos); la 8 guarda su tabla de umbrales; techo por ruta (`/` 300 KB, `/protocolo` 320 KB); LCP observado en e2e; manual y guía v11 (bloque P, 7 pruebas).
- **No completado:** la etapa 10 (ficha y vigilancia) y la recalibración, fuera de alcance por diseño.
- **Desviaciones y causas:** (1) un cuaderno con la 8 anterior al S14 pide volver a registrar la 8; la 9 no la recalcula. (2) Sin `decision.ts` diferido: el cálculo vive en `etapa9.ts`, porque la compuerta lo recalcula al cargar. (3) El paso e2e de la etapa 3 llena «R² anticipado» si aparece.
- **Decisiones y aprendizajes:** una prueba que pasa el umbral a mano no prueba el camino que arma la pantalla; la prueba de la pantalla parte de la pantalla.
- **Modelo y relevos:** F1 Sonnet 5.5 · F2 Opus 5.5 · F3 Haiku 5.5 · auditor Sonnet 5.5 (high). Sin desvío. Haiku bastó en F3 (docs y un arreglo de motor de 8 líneas con su prueba roja antes). El Alto de la etapa 9 nació en F2, con Opus. Relevos: ninguno.
- **Auditoría** (subagente Sonnet 5.5, alta, solo lectura; 5 min 05 s, tiempo propio en F3):
- Alcance: casi completo; la medición de main contra la rama va en este cierre, no en el diff.
- Calidad: **Alto** (la etapa 9 no registraba con dos clases sin probabilidades) · pagado · a37434f. Medio: sin prueba de UI multiclase · lote.
- Seguridad: sin Crítico ni Alto. Bajos · lote.
- Frases caducadas: «deuda H2» en ci.yml · pagado · 70e43c5. «se cuenta como apertura», inexacta · pagado · 1e1b2bb. Viñetas de la 8 bajo la 9 en el manual · pagado · a527fd6. Repetida sobre los arreglos: 0 hallazgos.
- **Lote de H-2** (medios y bajos, archivo:línea): `tests/unit/protocolo-etapa9-ui.test.tsx` sin caso multiclase; `src/engine/protocolo/etapa9.ts:~486` (`leer` no acota ganador, `base_id` ni `hoy_id`, y `CuadernoPanel.tsx` lo pinta como clave cruda); `src/engine/protocolo/etapa8.ts:852-866` (la tabla no exige umbrales monótonos); `src/engine/protocolo/etapa9.ts:445` (`umbralValido` rearma el arreglo en cada llamada). Del S13, siguen B1, B2, B4, B5, C1–C3.
- **LCP y peso** (réplica de la CI, sin `.env.local`, main y rama medidas igual): mediana de `/protocolo` · main 3373 · F1 2728 · F2 2715 · F3 2020 ms. Es bimodal, con corridas de ~1,5 a ~3,4 s. El presupuesto de 3 500 no sube. Peso `/protocolo` 316 495 B: 11 KB (3,4 %) de margen hasta 320 KiB; riesgo para la etapa 10.
- **Gates:** typecheck y lint 0 · `pnpm test` 1709/1709 (93,52 % líneas) · integración 117 + 1 saltada · e2e `CI=1` 120/120 en 10,0 min, sin reintentos · `lhci assert` de categorías y presupuestos por ruta OK · gitleaks sin hallazgos · peers, retiros y auditoría de dependencias OK.
- **Para el hito H-2:** prueba manual de teclado y lector de pantalla, revisión de diseño, gate humano de FORMA y TEXTO, brochure, BLUEPRINT as-built de la etapa 9.
- **Para mergear:** squash y borrar la rama; después `/cierre-sprint ds`.
