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

## PUNTO DE REANUDACIÓN (borrar al cerrar) — F1 casi cerrada

**Hecho y verificado (4 commits `[F1]` sobre `main`=5d01712, rama `sprint-009/existe-al-decidir`, sin empujar, sin PR):**
M2/M3 (`Confirmacion.tsx` + `protocolo-dialogos.test.tsx` 10/10 + e2e `protocolo.spec.ts` 12/12 con axe en los 4 diálogos) ·
B13 (guía J6 y manual) · motor `src/engine/protocolo/{deriva,duplicados,etapa4}.ts` + `fechasPorFila` + `vistaColumna`/`nombreClase`
en `tabla.ts` · kit `bajas-con-fuga.csv` (480 filas) · pruebas `protocolo-{deriva,duplicados,etapa4}.test.ts` +
`protocolo-etapa4-helpers.ts` (protocolo local `PROTOCOLO4`, `armar`, `inventario`, `datosBajas`). `pnpm test` 1033/1033; motor
del Protocolo 96,62 % líneas / 88,24 % ramas. La etapa 4 NO está registrada en `PROTOCOLO_DS` (eso es F2).
**Falta de la F1 (Sonnet 5.5):** (1) `tests/unit/protocolo-etapa4-forjado.test.ts` por exportar→editar→`leerArchivo(texto, PROTOCOLO4)`
→`evaluar` (fuga escondida, alertas recortadas + `en_bloque` con una alerta, aciertos/duplicados/PSI/identificador inventados →
`no-cuadra`; `registrar` con chequeos falsos → `datos-invalidos`/`chequeos`; sin tabla → `sin-datos`; ida y vuelta JSON honesta sigue
cumplida; apuesta cambiada a mano NO se detecta = limitación declarada) y su **demo en rojo** (`scripts/demo-rojo.sh --archivo
src/engine/protocolo/etapa4.ts --buscar '  recalcular,' --reemplazar '  // recalcular,' --gate 'pnpm exec vitest run
tests/unit/protocolo-etapa4-forjado.test.ts' --debe-nombrar 'una fuga escondida' --esperar-verde <igual> --minimo-tests 8`);
(2) `tests/integration/deriva-scipy.test.ts` (Pyodide): `chi2.ppf(0.99,5)` = `CHI2_99_GL5` y `ks_2samp(a,b).statistic` = `ksD`;
(3) `portada-liviana.test.ts`: sumar `Etapa4Form`, `Confirmacion`, `etapa4` a la lista prohibida; (4) medir el tiempo en frío de
`hallazgos4` a 50 000×79 (el test solo exige < 60 s; la cifra va al cierre).
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
