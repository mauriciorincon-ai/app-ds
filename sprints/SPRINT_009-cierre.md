---
sprint: 009
app: ds
hito: H-2
opened: 2026-10-18
closed:
branch: sprint-009/existe-al-decidir
pr:
---

# Sprint 009 «¿Existe al decidir?» — cierre ejecutivo (BORRADOR: se completa al cierre)

## PUNTO DE REANUDACIÓN (borrar al cerrar) — F1 CERRADA, sigue la F2

**F1 hecha y verificada (7 commits `[F1]` sobre `main`=5d01712, rama `sprint-009/existe-al-decidir`, sin empujar, sin PR):**
M2/M3 (`Confirmacion.tsx`, `protocolo-dialogos.test.tsx` 10/10, e2e `protocolo.spec.ts` 12/12 con axe en los 4 diálogos) · B13 (guía J6 y
manual) · motor `src/engine/protocolo/{deriva,duplicados,etapa4}.ts` + `fechasPorFila` + `vistaColumna` · kit `bajas-con-fuga.csv` ·
pruebas del motor + `protocolo-etapa4-forjado.test.ts` (15) + `tests/integration/deriva-scipy.test.ts` (4) + `portada-liviana` (20).
`pnpm typecheck && pnpm lint && pnpm test` verdes: 79 archivos, 1053/1053; motor del Protocolo 96,62 % líneas / 88,24 % ramas.
**Demos en rojo (regla 27, tras correrlas):** (a) `etapa4.ts` con `recalcular` comentado → 11 de 15 pruebas del forjado fallan y la
salida nombra «una fuga escondida»; restaurado, 15/15 · (b) `deriva.ts` con `CHI2_99_GL5` = 15.09 → el oráculo de scipy falla
nombrando `chi2.ppf(0.99, 5)`; restaurado, 4/4. **scipy coincide** (1e-12) en χ² crítico, D de KS (con empates y constantes),
cortes de quintiles (`inverted_cdf`) y PSI (= divergencia de Jeffreys con `rel_entr`).
**Tiempo medido:** `hallazgos4` en frío a 50 000×79 ≈ 2,1 s (2071 / 2082 / 2108 ms, vitest·jsdom, esta máquina); la 2.ª llamada sale de
la caché (< 50 ms). En la pantalla: pintar «Calculando…» ANTES de bloquear el hilo (setTimeout/transición), una sola vez por archivo.
La etapa 4 NO está registrada en `PROTOCOLO_DS` (eso es F2).
**Luego F2 (Sonnet 5.5):** `Etapa4Form.tsx` (apuesta → revelación → inventario → bloque; nada que dependa de hallazgos se MONTA antes
de fijar la apuesta; apuesta en `sessionStorage` atada a huella+evidencias 2–3; foco al título al revelar; `role="status"` único
para cambios automáticos; `useReducer` + filas `memo`; orden por riesgo UNA vez), `CampoCasillas`, registrar en `ids.ts`
(`ETAPAS_CONSTRUIDAS` 1–4 + 5 términos del glosario: procedencia, existe-al-decidir, deriva, columna-identificador, duplicado),
`protocolo-ds.ts`, `formularios.tsx`, `terminos` de `ETAPA_4`, `content` (tarea y porqué), resumen de la etapa 4 en `CuadernoPanel`
(no listas crudas; ojo: `leerValor` traduce cualquier cadena que coincida con `protocol.value.*`), claves `field.*`/`check.*`/
`missing.*`/`trap.*` (`TRAMPAS_4` y `CLAVES_4` ya exportadas; falta atar el criterio con sus `faltan`: estado, despues-excluir,
nose-usar, usar-sin-antes, procedencia, bloque, apuesta, nombres-columnas, etapas-previas), pruebas que fijan la 4 «sin construir»
(`protocolo-etapas` ~469, `protocolo-forjado` ~114/131/168/192, `protocolo-contenido`, `protocolo.spec.ts` ~151/287), e2e
`protocolo-etapa4.spec.ts` (credito-fuga-plantada + bajas-con-fuga), `scripts/capturas-s9.mjs`, Lighthouse local (corte 290 KB;
si pasa, `next/dynamic`). **F3 (Haiku 5.5):** manual, guía «Nuevo · S9» (prefijo `guia-ds:s9:`, J1/J5 se reescriben), auditoría
Sonnet·high, `/deploy-check`, cierre ≤ 40 líneas con `horas-sprint.mjs`, PR.
**Fuentes abiertas (van al manual/cierre):** Potgieter et al. 2023 (arXiv 2307.11878): PSI = Σ(p̂−p₀)(ln p̂−ln p₀), valor crítico
de Yurdakul y Naranjo = (1/n+1/m)·χ²; umbrales 0,10/0,25 = Lewis 1994 p.106 (ejemplo, convención, no prueba); no se abrió el original
de Yurdakul y Naranjo. Lección: `new Array(n)` + `push` deja huecos (bug de mi prueba de rendimiento).
**Reglas vivas:** gate de modelo por fase (F1/F2 Sonnet 5.5; F3 Haiku: `/model claude-haiku-5-5`); relevo (2 intentos / 20 min); un
solo PR vivo (`gh pr list --state open`); Co-Authored-By de quien corra el commit; cero enlaces tras el último `git add`; tripwire de
despacho: nunca comparar con los literales `"binaria"|"multiclase"|"numerica"|"agrupar"` (me mordió: usa `byTask`/`matchTask`).
