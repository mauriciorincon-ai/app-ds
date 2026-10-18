---
sprint: 009
app: ds
hito: H-2
opened: 2026-10-17
closed: 2026-10-17
branch: sprint-009/existe-al-decidir
pr:
---
# Sprint 009 «¿Existe al decidir?» — cierre ejecutivo

**Nombre:** S9 «¿Existe al decidir?» · etapa 4 del Protocolo DS (de 10), con M2, M3 y B13 del S8 pagadas.
**Objetivo planeado:** la etapa 4 abre con la 3 cumplida; apuesta antes de revelar; hallazgos (fuga, identificadores, repetidas, deriva); inventario por columna; compuerta con la comparación en el cuaderno.
**Resultado:** cumplido; la etapa 4 abre, se apuesta, se revela, se inventaria y se registra; la 5 queda cerrada. **Estado:** listo para PR.
**Tiempo:** estimado 5 h (F1 2 · F2 2,5 · F3 0,5) · real 1,9 h (script) · diferencia −3,1 h.

**Horas (`scripts/horas-sprint.mjs`, `origin/main..HEAD`):** 22 commits · 1 sesión · **1,9 h activas** (22:02 → 23:26).
**Por fase (estimado → real):** F1 2 → 0,9 h ✔ · F2 2,5 → 0,8 h ✔ · F3 0,5 → 0,2 h ✔ (el script no ve el trabajo previo al primer commit de cada fase; ninguna pasó +50 %).

**Entregables:** `src/engine/protocolo/{etapa4,deriva,duplicados}.ts` · `src/components/protocolo/Etapa4{Form,Revelacion,Inventario}.tsx` · `src/lib/protocolo/apuesta.ts` · diálogos compartidos (M2/M3) · kit `bajas-con-fuga.csv` · pruebas (unitarias 1082/1082; integración scipy 4/4; e2e 88/88) · capturas `scripts/capturas-s9.mjs` · manual (sección etapa 4, fila 009) · guía (bloque K, 78 casillas).
**No completado:** etapa 5 y siguientes; validación adversarial; casi duplicados; el resto del lote de medios y bajos del S8.
**Desviaciones:** ninguna de plan. `hallazgos4` en frío ~2,1 s a 50 000×79 en el hilo principal (deuda D2).

**Decisiones:** la apuesta se fija al revelar y se guarda en `sessionStorage`, atada a la huella y a las respuestas 1–3; cambia al reemplazar o empezar el cuaderno. La acción en bloque solo para columnas sin alerta, con declaración. «Se llena después» solo admite «excluir» (G-Plan 1a). PSI con umbrales 0,10/0,25 declarados como convención (Lewis 1994), no prueba.

**Deuda al lote del hito (`archivo:línea`, detalle en `sprints/SPRINT_009-auditoria.md`):** M1 `etapa4.ts:236-241` (identificador numérico sin detectar) · M2 `MANUAL-DE-USO.md:627-630` · B1 `CargaDatos.tsx:111-113`, `CuadernoPanel.tsx:305-308` (plural) · B2 `apuesta.ts:6-61` (sessionStorage sin mencionar en privacidad) · B3 `useProtocolo.ts:362` · B4 `Etapa4Revelacion.tsx:187-190` (PSI a 2 decimales) · B5 `campos.tsx` (encabezados duplicados) · B7 `useProtocolo.ts:278,370,386,405` · B8 `GUIA-DE-PRUEBA.html:673` (fecha) · B9 `Etapa4Revelacion.tsx` (aviso de exportación). Propios: D1 `globals.css:22` (sin `color-scheme: dark`: radios blancos en tema oscuro; heredado de S8) · D2 `hallazgos4` en hilo principal · D3 apuesta editada a mano no detectable (declarado y con prueba).

**Aprendizajes:** una auditoría independiente encontró un texto falso que las pruebas no miraban (solo probaban estados ya respondidos): ahora hay prueba del estado vacío. Un e2e que recarga antes de «Guardado» pierde la última escritura: esperar el estado. El puerto 3000 lo comparten sesiones de esta máquina: para una corrida completa, puerto propio.

**Recomendación para el siguiente:** gate humano del hito H-2 (⭐⭐ del Protocolo, con el CSV de crédito y el de bajas) y lote de medios y bajos antes de la etapa 5.
**Evaluación esfuerzo-beneficio:** alta.

**Auditoría (Sonnet 5.5 · high · una pasada, independiente):** alcance completo · calidad: requiere ajustes → **A1** (trampas que afirmaban sin respuestas) pagado · fac4a9f + 96a0278 · seguridad: sin Críticos ni Altos · frases caducadas: una (M2) al lote; ninguna falsa.

**Modelo por fase:** F1 y F2 Sonnet 5.5 · F3 Haiku 5.5 (en prueba) · auditor Sonnet 5.5 · planificación Opus 5.5 · sin desvío.
**Haiku en F3 bastó** para manual, guía, cierre y A1 (pruebas verdes a la primera); A1 tocó lógica de motor, más allá de «construcción simple»: observación para la decisión de los tres sprints. **Relevos:** ninguno.

**Pruebas (después del hecho):** `pnpm typecheck` y `pnpm lint` limpios · unitarias 1082/1082 (81 archivos; motor del Protocolo 96,07 % líneas / 86,73 % ramas) · e2e 88/88 en CI-mode, 0 flaky · Lighthouse local: `/protocolo` script 272.337 B (S8: 251.726; +8,2 %, presupuesto 307.200), LCP 3.010 ms, TBT 0, categorías ≥ 0,9 · `pnpm audit --audit-level high` sale 0 (la alta es la excepción vigente GHSA-vfj7-8cjw-p6xm) · `verificar-dependencias` ✓ · `verificar-retiros` ✓ · sin cambios de dependencias en el sprint.
**Para mergear:** squash y borrar la rama; después `/cierre-sprint ds`.
