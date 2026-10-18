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

## PUNTO DE REANUDACIÓN (borrar al cerrar) — F1 CERRADA · F2 CERRADA · sigue F3 (Haiku)

**F1 (7 commits `[F1]`):** M2/M3 (`Confirmacion.tsx`) · B13 · motor `src/engine/protocolo/{deriva,duplicados,etapa4}.ts` · kit
`bajas-con-fuga.csv` · forjado + demo en rojo (`recalcular` off → 11 de 15 fallan nombrando «una fuga escondida»; restaurado 15/15) ·
oráculo scipy (4/4; χ², D de KS, cuantiles `inverted_cdf`, PSI = Jeffreys con `rel_entr`; demo en rojo con `CHI2_99_GL5`=15.09 →
nombra `chi2.ppf(0.99, 5)`) · `hallazgos4` en frío a 50 000×79 ≈ 2,1 s (2071/2082/2108 ms), caché < 50 ms.
**F2 (Sonnet 5.5; commits `[F2]`):** `Etapa4Form/Revelacion/Inventario.tsx` (tres pasos; nada que dependa de hallazgos se monta ni se
calcula antes de fijar la apuesta; «Calculando…» pinta antes de bloquear; foco al paso 2; un solo `role=status`; `useReducer` +
filas `memo`; orden por riesgo una vez; bloque con declaración + Deshacer y foco al título del panel; `<details>` sin montar hasta
abrir), `CampoCasillas`, `src/lib/protocolo/apuesta.ts` (apuesta en `sessionStorage` atada a huella + respuestas 1–3; se olvida al
empezar/reemplazar el cuaderno), `motivosDeAlerta` + `resumenEtapa4` en el motor, registro en `ids.ts` (`ETAPAS_CONSTRUIDAS` 1–4 + 5
términos) / `protocolo-ds.ts` / `formularios.tsx`, 150 claves `{es,en}` (+11 `_one`), glosario, tarea/porqué, resumen en el cuaderno,
foco al título de la tarjeta al registrar (genérico, también etapas 1–3). Pruebas: `protocolo-etapa4-ui` 15, `protocolo-apuesta` 11,
dialogos 10, e2e `protocolo-etapa4.spec.ts` (credito + bajas; mobile y desktop; axe 2 temas; 360 px; 0 `/api/narrate`; ninguna fila
del CSV en la red ni en el export).
**Medido (F2, tras el último cambio):** `pnpm typecheck && pnpm lint && pnpm test` verdes: 81 archivos, 1079/1079 (motor del Protocolo
96,05 % líneas / 86,7 % ramas) · e2e COMPLETO `playwright test` en modo CI (build + start, 2 proyectos, retries 2): **88 de 88, 0 fallos,
0 flaky** (8,2 min, `--workers=3`, puerto 3300). Dos corridas previas en el 3000 murieron a mitad con `ERR_CONNECTION_REFUSED` sin que yo
tocara nada (el 3000 lo comparten otras sesiones de esta máquina; 16 GB con ~100 MB libres): se aisló en otro puerto con una config
temporal fuera del repo, y no es un defecto de la app. Aquella corrida sí destapó un flaky REAL del spec nuevo (recargar antes de que
IndexedDB terminara de guardar la última entrada): arreglado esperando «Guardado» (commit `1c392ca`) y rehecho el 88/88 · Lighthouse
local (espejo del job): `/protocolo` script 272,312 B (S8: 251,726; +20.6 KB; presupuesto 307,200; corte 290 KB = 296,960 → sin
`next/dynamic`), total 369,757 B, LCP 2788 ms, TBT 4 ms, categorías 0.97/1/1/1; `/` 241,877 B; margen y categorías ✓ · capturas
`scripts/capturas-s9.mjs`: 56 encuadres, 56 interacciones con efecto, 0 desbordes; LEÍ 39 de 56 (cada una de las 14 vistas en un
ancho y un tema; 13 de 14 en los dos temas). Hallazgos de la lectura ya pagados: plurales («1 marcadas»), marcador del `<summary>`,
ayuda de procedencia contradictoria, título largo cortado por el borde, procedencia de 200 caracteres en un campo de una línea.
**Deuda (medio, lote del hito):** (D1) radios sin marcar se ven como círculo blanco relleno en tema oscuro: la app no declara
`color-scheme: dark` (`src/app/globals.css:22`; heredado de S8; no se tocó por tocar a Probeta) · (D2) `hallazgos4` en frío ≈ 2,1 s a
50 000×79 en el hilo principal (la pantalla pinta «Calculando…» antes; un Worker lo quitaría) · (D3) la apuesta editada a mano en el
`.protocolo.json` no se detecta (declarado; prueba `LÍMITE DECLARADO`).
**Falta (F3, Haiku 5.5 · `/model claude-haiku-5-5`):** manual (sección «Etapa 4», fila 009, líneas «construidas las etapas…» ~604 y ~805;
límites: fuga univariada, apuesta fija en esta pestaña, la compuerta verifica coherencia no verdad, umbrales PSI = convención) · guía
«Nuevo · S9» (prefijo `guia-ds:s9:`, J1/J5 reescritas) · auditoría Sonnet·high de una pasada (subagente, solo lectura) ·
`/deploy-check` · cierre ≤ 40 líneas con `node scripts/horas-sprint.mjs` · cero-enlaces tras el último `git add` ·
`gh pr list --state open` · push · PR normal · `gh pr checks` al final.
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
