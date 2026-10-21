---
sprint: 015 · app: ds · hito: H-2 · opened: 2026-10-20 · closed: pendiente
branch: sprint-015/la-ficha · pr: pendiente (no abierto: quality en rojo)
---
# Sprint 015 · «La ficha que se escribe sola» · cierre ejecutivo
- **Objetivo y resultado:** la etapa 10 del Protocolo (ficha, plan de vigilancia, chequeo de deriva). Construida y probada: abre con la 9, la ficha sale del cuaderno con su fuente, se descarga en Markdown sin filas, el chequeo mide un CSV nuevo y «Protocolo completo» aparece con las diez etapas.
- **Estado:** **no cerrado.** `quality` está en rojo: `pnpm audit --audit-level high` marca un aviso alto de vite (GHSA-587h-7wmj-h5pm; vitest arrastra vite 8.1.3). Relevo pedido y sin ejecutar. No hay PR abierto.
- **Tiempo:** estimado 3,5 h · real 1,6 h según el script (es el piso: solo cuenta commits). Por fase, estimado / script: F1 1,25/0,5 · F2 1,5/0,7 · F3 0,75/0,4.
- **Horas** (`node scripts/horas-sprint.mjs --rango main..HEAD`):
### Horas del sprint (`scripts/horas-sprint.mjs`, rango `main..HEAD`, heurística git-hours: huecos ≤ 2 h + 0,5 h por sesión)
| Commits | Sesiones | Horas activas | Span (primer → último commit) |
|---:|---:|---:|---|
| 14 | 1 | 1,6 h | 2026-10-20 20:04 → 2026-10-20 21:11 (1,1 h) |
| Fase | Commits | Horas activas |
|---|---:|---:|
| F1 | 4 | 0,5 h |
| F2 | 6 | 0,7 h |
| F3 | 4 | 0,4 h |
- **Entregables:** motor de la etapa 10 (`etapa10.ts`, `ficha.ts`, `referencia-deriva.ts`, `chequeo-deriva.ts`), pantalla y constancia diferidas, generador de Markdown diferido, textos {es, en}, manual, guía v12 (bloque Q, 8 pruebas).
- **No completado (por diseño):** vigilar el desempeño (pide el modelo guardado); el roadmap de CV Viva (va en el PR siguiente).
- **Desviaciones:** (1) la ficha trae el peor segmento y su conteo, no un costo por segmento: la tabla es la de la etapa 8. (2) «Protocolo completo» es un banner calculado, no una evidencia. (3) el override de vite no se aplicó (ver relevo).
- **Decisiones:** el dueño no se prefilla (un clic pone al decisor de la 1); la ficha va en la tarjeta de la 10 cumplida; `LINEAS_FICHA` es el contrato línea a texto. **Para tu decisión:** la referencia guarda cortes de cuantiles (3 cifras) y nombres de categorías con 5 o más filas en el cuaderno; la regla 2 dice «ningún valor del dataset». El plan (D2) lo permitió; confírmalo o lo cambiamos.
- **Deuda (lote del hito, archivo:línea):** M2 `src/engine/protocolo/chequeo-deriva.ts:65-72` (texto sin categorías con soporte se mide estable) · B1 `src/engine/protocolo/referencia-deriva.ts:86-89` (sin soporte mínimo para cortes numéricos) · B2 `src/components/protocolo/Etapa10Deriva.tsx:23` · B3 `tests/unit/protocolo-ficha.test.ts:192-203` · B4 `src/engine/protocolo/ficha.ts:183` (`findLast`, ES2023) · B5 `src/engine/protocolo/ficha.ts:392-397` · B6 sin e2e de «iterar» · claves muertas `messages/es.json:1012,1025,1580` y su par EN.
- **Aprendizaje:** un override de pnpm no fuerza una versión transitiva ya bloqueada: pnpm no re-resuelve lo que el lock ya cumple. Verificar con `pnpm why` antes de declarar el parche; además el override reescribe el lock en cada comando.
- **Auditoría** (subagente Sonnet 5.5, high, solo lectura, 4 min 44 s):
  - Alcance: parcial en la ficha (métricas por segmento: desviación 1).
  - Calidad: **Alto** A1, el patrón de fallo no llegaba a la ficha · pagado · `7eda193`. Medio M1, escape de Markdown · pagado · `7eda193`. Medio M2 · lote. Medios M3 y M4, privacidad · pagados · `2d324ef` y `7eda193`.
  - Seguridad y herramientas: sin Crítico ni Alto. B1 al lote.
  - Frases caducadas: «Sin construir» del manual · pagado · `2d324ef`. Repetida sobre los ajustes: sin coincidencias.
- **Modelo y relevos:** F1 Opus 5.5 · F2 Sonnet 5.5 · F3 Haiku 5.5 · auditor Sonnet 5.5 (high). Sin desvío. Haiku bastó en docs y en los pagos de la auditoría; no bastó para la dependencia de vite (3 intentos del mismo camino). Relevos: 1 pedido (Haiku a Sonnet), pendiente de `/model sonnet`.
- **Gates:** typecheck 0 · lint 0 · `pnpm test` 1874/1874 (93,76 % líneas, 84,8 % ramas) · integración verde tras corregir tres pins (`a29fa4b`) · e2e completo 126/126 antes de la auditoría y 6/6 de la etapa 10 después · gitleaks sobre archivos versionados sin hallazgos · retiros y peers OK · peso Pyodide OK · **audit high en rojo (vite)**.
- **Peso y LCP** (réplica CI, sin `.env.local`, mediana de 3): `/protocolo` 320 917 B (main 316 495), LCP 2722 ms · `/` 248 242 B, LCP 2932 ms. Medido antes de los ajustes de auditoría.
- **Para mergear:** pendiente. Cuando `quality` esté verde: squash y borrar la rama; después `/cierre-sprint ds`.
