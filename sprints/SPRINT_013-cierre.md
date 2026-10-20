---
sprint: 013 · app: ds · hito: H-2 Producto completo · branch: sprint-013/prueba-abierta-una-vez
opened: 2026-10-18 · closed: 2026-10-19 · pr: el de esta rama, abierto con este cierre
---

# Sprint 013 · «La prueba, abierta una vez»
- **Objetivo:** etapa 8 del Protocolo (la prueba sellada se abre una vez: medida sin sesgo, error por segmento, calibración, peores casos) y pagar M1 y B1 del S12. **Resultado:** etapa 8 construida y registrada; la 9 se ve «Sin construir». **Estado:** construido y verificado; PR abierto con este cierre.
- **Estimado:** 4 h (F1 1,25 · F2 2 · F3 0,75). **Real:** 2,7 h activas según el script: −33 %. Ninguna fase pasó el 50 %. El span de 22 h incluye una pausa entre dos sesiones.

### Horas del sprint (`scripts/horas-sprint.mjs`, rango `origin/main..HEAD`, tras `148812b`)
| Commits | Sesiones | Horas activas | Span (primer → último commit) |
|---:|---:|---:|---|
| 21 | 2 | 2,7 h | 2026-10-18 20:49 → 2026-10-19 19:08 (22,3 h) |

| Fase | Commits | Horas activas |
|---|---:|---:|
| F1 | 4 | 0,7 h |
| F2 | 14 | 1,3 h |
| F3 | 3 | 0,7 h |

- **Modelo por fase:** F1 Sonnet 5.5 · F2 Opus 5.5 · F3 Haiku 5.5 (`claude-haiku-5-5`), sin desvío en el gate. Auditoría: subagente Sonnet 5.5 · high. **Relevos:** ninguno; dos fallos se resolvieron cambiando de enfoque (dos presupuestos de LHCI que chocaban; una lista de detectores incompleta). **Haiku en F3:** bastó con una corrección: escribió una frase falsa del manual (M3), que la auditoría cazó; la guía se contrastó con `evaluar()`.
- **Entregables:** etapa 8 completa (motor, comando `test` y su lector, emisor `envio8`, hook `usePrueba`, cuaderno con aperturas, pantalla diferida, resumen, textos {es, en}, registro); manual; guía v10 con el bloque O (7 pruebas, total 103). **No completado:** nada del plan; la 9 no se construye.
- **Desviaciones:** (1) tope de peso de `/*` de 300 a 320 KB (G-Plan 1a): `/protocolo` 308.678 B, 1.478 B sobre 300 KB; `/` 246.685 B. La portada pierde 20 KB de protección (B3). (2) El gate de literales vive en `textos-etapa.test.ts`, no en `i18n-parity.test.ts`: equivalente. (3) Auditoría: seguí la regla del S13 (críticos y altos se pagan; medios y bajos al lote), no el kit, que paga todos: lo decide la planeadora. (4) Brochure sin tocar: la regla 13 lo ajusta al cierre del hito.
- **Decisiones:** la 8 mide y no decide (umbral y costo son de la 9); el peor segmento exige soporte; la prueba se abre una vez, y las reaperturas se cuentan y se rotulan sin bloquear (F0 #13); los peores casos no van al cuaderno.
- **Auditoría** (subagente Sonnet 5.5 · high, solo lectura, diff `origin/main...HEAD`): alcance **cumple** · calidad **3 Medios** (M3 pagado en `148812b`; M1 y M2 al lote) y **5 Bajos** · seguridad y privacidad **limpia** (ninguna fila de la prueba sale de la red, logs, Sentry ni `/api/narrate`) · frases caducadas **0 falsas**; 3 Bajos al lote. Críticos y altos: **0**.
- **Evidencia:** unitarias 110 archivos y 1.643 pruebas (ramas 84,6 %). Integración Pyodide: 117 pasan y 1 se salta por diseño (el emisor del fixture de S6, `describe.runIf(EMIT)`). E2e completa: 114/114 en 7,0 min con `CI=1`, 0 reintentos; la de Protocolo, 32/32. Local: peers, typecheck, lint, peso Pyodide 39,58 MiB, audit (1 alto ignorado por ADR 012), retiros, regla 18 (675 paquetes), cero-enlaces. Lighthouse en réplica sin `.env.local`: categorías 0,92–0,96, presupuesto exit 0.
- **Peso (réplica, sin `.env.local`):** `/protocolo` 305.007 B antes de F1 → 298.869 tras F1 → 308.678 tras F2; `/` 252.328 → 245.951 → 246.685 B.
- **Demos en rojo:** F1, cuatro (claves de forma, claves que pinta el cuaderno, import estático de textos, falta de inglés) más M1 y B1: fallan nombrando lo esperado y vuelven a verde. F2, tres: sello alterado → «con un sello alterado la prueba no abre»; probabilidades +0,25 → «la calibración con dos clases»; import estático de `Etapa8Form` → al primer intento el detector no lo nombró (sus entradas estaban en la lista de la portada); corregido en `a79b36e`.
- **Deuda al lote del hito** (`archivo:línea`):
  - Medio · `src/engine/protocolo/etapa8.ts:499-500, 792-796`: el peor segmento puede tener exceso ≤ 0; la pantalla dice «▲ el peor» y la trampa «cuesta −N más» (M1). **El que más se ve.**
  - Medio · `src/components/protocolo/Etapa8Form.tsx:139-144`: cada tecla del patrón vuelve a correr el bootstrap B=1000 (M2).
  - Bajo · `src/engine/protocolo/etapa8.ts:638-713`: `leer` no acota ganador, métrica, intervalos ni `peores_n` (B1). `messages/etapas/etapa8.{es,en}.json:92`: «ninguna fila» es falso con costo 0 (B2). `perf-budget.json:11`, `.github/workflows/ci.yml:138`, `docs/BLUEPRINT.html:227` siguen en 300 KB (B3). `src/lib/protocolo/prueba8.ts:59` y `liga7.ts:86`: `.sort()` en vez de `byCodePoint` (B4). `src/lib/protocolo/archivo.ts:81`: `aperturas` sin tope (B5).
  - Bajo · frases: `messages/etapas/etapa8.es.json:96` y `src/content/protocolo.ts` prometen usos de las etapas 9 y 10 (C1); `src/content/protocolo.ts:131,135` dicen «la prueba todavía cerrada» (C2); `messages/es.json:1412-1413` habla de medir una clase (C3).
- **Riesgo, se decide:** LCP de `/protocolo` 3.374 ms frente a 3.500 (margen 3,6 %; aviso de `lighthouse-margen`, exit 0). La corrida varía de 2.727 a 3.377 ms; no medí `main` en la misma réplica, así que no atribuyo el cambio a la etapa 8. **Pendiente del hito H-2:** teclado y lector de pantalla a mano, revisión de diseño, gate humano FORMA y TEXTO, brochure, BLUEPRINT as-built.
- **Aprendizajes:** en zsh, `$VAR` no se separa en palabras: una tanda de comprobaciones no corrió y se repitió con los comandos escritos. Una lista de detectores de peso queda corta al mover una forma de página. El derivado «peor» necesita el signo del exceso (M1).
- **Recomendación:** antes del gate humano, pagar M1 y M2; decidir por ADR el margen de LCP o bajar `/protocolo`; un techo de peso por ruta. **Esfuerzo-beneficio:** alto: etapa 8 completa y verificada en 2,7 h activas frente a 4 h.

Para mergear: squash y borrar la rama; después `/cierre-sprint ds`.
