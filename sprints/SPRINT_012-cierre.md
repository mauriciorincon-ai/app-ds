---
sprint: 012 · app: ds · hito: H-2 Producto completo · branch: sprint-012/ganador-prueba-cerrada
opened: 2026-10-18 · closed: 2026-10-18 · pr: el de esta rama, abierto con este cierre
---

# Sprint 012 · «El ganador, con la prueba cerrada»
- **Objetivo:** etapa 7 del Protocolo (liga dentro de los pliegues del entrenamiento, línea base por pliegue, permutación) y pagar el medio y el bajo del S11. **Resultado:** etapa 7 construida; la prueba queda cerrada hasta la 8. **Estado:** construido, PR abierto.
- **Estimado:** 3,75 h (F1 1 · F2 2 · F3 0,75). **Real:** 2,8 h activas según el script (span 2,3 h): −25 %.

### Horas del sprint (`scripts/horas-sprint.mjs`, rango `origin/main..HEAD`, medido 19:27)
| Commits | Sesiones | Horas activas | Span (primer → último commit) |
|---:|---:|---:|---|
| 8 | 1 | 2,8 h | 2026-10-18 17:12 → 19:27 (2,3 h) |

| Fase | Commits | Horas activas |
|---|---:|---:|
| F1 | 3 | 0,5 h |
| F2 | 4 | 1,1 h |
| F3 | 1 | 1,1 h |

- **Modelo por fase:** F1 Sonnet 5.5 · F2 Opus 5.5 · F3 Haiku 5.5, sin desvío en el gate. El plan se escribió con Sonnet 5.5 y planear pide Opus: desvío declarado. Auditoría Sonnet 5.5 · high, 5,4 min. **Relevos:** ninguno. **Haiku en F3:** bastó para manual, guía y cierre; contrastar la guía con `evaluar()` cazó tres pruebas falsas (J1, L6, M6) y una frase caducada del manual que el plan no listaba (línea 590).
- **Entregables:** `pliegues.ts`; `run_validation` (solo entrenamiento, rechaza `test_idx`); contrato validado; motor y pantalla de la etapa 7; comparación y permutación; glosario, manual y guía (bloque N); clases «constructor» y «__proto__»; precarga de la etapa 6. **No completado:** nada del plan. La etapa 8 queda fuera (VISION).
- **Desviaciones:** (1) la tabla de la liga es propia, no `LeagueTable`; (2) roster y métrica son dato del worker; (3) `/protocolo` pesa 305.007 B de 307.200 (S11: 295.022): 2,2 KB de margen, riesgo S13; `contract.ts` ya llegaba a la página desde S10; (4) `split.ts` exporta `mulberry32` y `shuffle`; (5) N de permutaciones desde el tiempo medido, no el estimado del encarrilador.
- **Auditoría** (subagente Sonnet 5.5 · high, solo lectura): alcance **pasa** · calidad **1 Medio, 7 Bajos** (lote) · seguridad y privacidad **pasa** (ninguna fila de prueba llega al worker, a logs ni a Sentry) · frases caducadas **pasa**. Críticos y altos: **0**, nada que pagar.
- **Evidencia:** unitarias 102 archivos y 1.458 pruebas, 94,7 % de líneas; integración Pyodide 6/6; e2e 110/110 en 6,7 min, 0 reintentos; `quality` replicado en local (typecheck, lint, test, build, peso Pyodide 39,58 MiB, audit con 1 alto ignorado por la excepción del ADR 012, retiros, cero-enlaces, gitleaks en árbol limpio). Peso en la réplica de la CI sin `.env.local`: `/protocolo` 305.007 B y `/` 252.328 B.
- **Demos en rojo (F2):** (1) pliegue con solape plantado: 6 de 33 fallan; (2) fuga plantada en el envío: 4 de 11 fallan, `ESPIA-2`; (3) permutación que siempre da señal: 1 de 6 falla; (4) import estático de `Etapa7Form`: 5 de 40 fallan. Punto ciego de (4): prettier impide el otro caso.
- **Deuda al lote del hito** (medios y bajos): Medio · `tests/unit/protocolo-etapa7.test.ts:170-195`: ningún test fija que «no supera» pase la compuerta. Bajo · `src/engine/protocolo/etapa7.ts:487-516` (`leer` no acota los números del worker); `src/components/protocolo/Etapa7Form.tsx:71-75` y `src/lib/protocolo/useValidacion.ts` (la corrida no se ata a la huella); `src/engine/protocolo/pliegues.ts:82-87,317` (razón de k fija por esquema); `src/lib/protocolo/useValidacion.ts:47-50` (liga vacía cae en «worker»); `src/components/protocolo/CuadernoPanel.tsx:14-17,196-197`; ~60 líneas de reformateo ajenas en `src/workers/contract.ts`, `protocol.ts`, `split.ts`; `messages/{es,en}.json` `protocol.stage.7.why.*` sin el rótulo «medida de selección».
- **Observación:** «la etapa 8 medirá los dos en la prueba» (`protocol.stage.7.compare.no-supera`, `trap.no-supera`) se cruzó con la VISION («¿Sirve para la decisión?»: lo de hoy, en la prueba). Respaldada; revisar al construir la 8.
- **Aprendizaje:** un gate local de secretos sobre el directorio de trabajo marca `.next/` y `.env.local`; para replicar el CI hay que escanear `git ls-files -co --exclude-standard`.
- **Recomendación:** al lote del hito, antes del gate humano: M1 (test del «no supera») y B1 (acotar el worker). Subir B2 si la etapa 7 se toca otra vez.
- **Esfuerzo-beneficio:** alto. La etapa 7 cierra la liga con la prueba cerrada, en 2,8 h frente a 3,75 estimadas.

Para mergear: squash y borrar la rama; después `/cierre-sprint ds`.
