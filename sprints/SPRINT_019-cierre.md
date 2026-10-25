---
sprint: 019 · app: ds · hito: H-2 · opened: 2026-10-25 · closed: 2026-10-25
branch: sprint-019/del-modelo-a-la-decision · pr: #36
---

# Sprint 019 · «Del modelo a la decisión» · cierre ejecutivo

- **Objetivo y resultado:** las tres funcionalidades de la VISION asignadas al S19, construidas y sin llamada nueva a un LLM: el **«¿qué pasaría si?» en dinero** (costo esperado por cada 100 decisiones con las probabilidades del propio modelo, en Probeta, en «Usar el modelo» y en la etapa 9, donde mueve solo las filas de entrenamiento), el **modelo en reglas** (árbol de profundidad 4, fidelidad medida en filas que no vio, texto y SQL que CPython corre con la misma respuesta) y **vigilar el desempeño** (sigue · revisar · reentrenar con el margen del 95 %), más el **ganador del Protocolo guardado como `.probeta.json`** (ADR 027). Las 37: **34 construidas · 0 con otro alcance · 3 en construcción (S20–S21) · 0 descartadas**.
- **Estado:** construido, auditado y pagado; PR #36 listo. Único STOP: sin prueba tuya (FORMA y TEXTO van al ensayo del S21; la guía v16 suma 5 paradas y no se corrió).
- **Tiempo:** estimado 3,5 h (F1 1,2 · F2 1,3 · F3 1,0; el archivo del sprint decía 3 h) · real según el script 2,3 h, 66 % del estimado (es un piso). **F3 +30 %** (1,3 h contra 1,0): la auditoría (10 min), sus pagos y el R10 móvil; bajo el 50 %, sin medida.

```
### Horas del sprint (`scripts/horas-sprint.mjs`, rango `origin/main..HEAD`, heurística git-hours: huecos ≤ 2 h + 0,5 h por sesión)

| Commits | Sesiones | Horas activas | Span (primer → último commit) |
|---:|---:|---:|---|
| 17 | 1 | 2,3 h | 2026-10-25 14:43 → 2026-10-25 16:29 (1,8 h) |

| Fase | Commits | Horas activas |
|---|---:|---:|
| F1 | 4 | 0,5 h |
| F2 | 5 | 0,5 h |
| F3 | 8 | 1,3 h |
```

- **Entregables:** `simulador.ts`, `reglas.ts`, `vigilancia.ts`; comandos `simulate`, `fit-winner`, `rules`, `evaluate-new` (fuera de los bloques de la receta) con sus cuatro lectores de contrato y fixtures; `ids-panel.ts` (un solo asignador de ids); paneles `simulador/` `reglas/` `vigilancia/` con diccionarios diferidos; `model-file-protocolo.ts` (variante `origin: "protocolo"`, validador diferido); etapas 9 y 10 con su simulador y su archivo; gate de SQL en CPython (`test_reglas.py`); 2 CSV de resultados en el kit; ADR 027; manual (3 secciones), guía v16 (37 paradas), BLUEPRINT 34/0/3/0, export y brochure de 73, `CLAUDE.md`, README, `design-system.md`.
- **No completado:** nada del plan. Fuera por diseño: reglas para el Protocolo o un modelo importado (no tienen las filas de entrenamiento), traer los resultados desde otro sistema (los subes tú).
- **Desviaciones:** (1) 3,5 h y no 3 (la variante del manifiesto y el gate de SQL). (2) **73 funcionalidades** (54 + 19) y 5 paradas nuevas en la guía. (3) **Peso** (réplica de CI, `1a5ebf1`): `/` 246,6 → 246,9 KiB (+314 B) y `/protocolo` 315,5 → 315,5 (+34 B); topes 300 y 320. (4) El R10 de móvil ya no mide solo el estado de reposo: con 20 categorías y un nombre de 55 caracteres el panel empujaba la página (463 px sobre 412); corregido y ahora también mide _después_ de simular. (5) Un `origin` en un archivo de Probeta ahora se rechaza (A-04). (6) Se reescribieron 9 frases caducadas, entre ellas «se ignora» el objetivo y «harían falta los resultados nuevos».
- **Decisiones tuyas:** dos piezas quedaron «sin sprint, no descartadas» en el BLUEPRINT: traer los resultados nuevos desde otro sistema y el modelo en reglas para el Protocolo o un modelo importado. ¿Se construyen, se descartan por escrito o se quedan así? Roadmap de CV Viva: sale `que-pasaria-si-en-dinero` (lo cambia la planeadora al abrir).
- **Deuda (al lote del hito):** `messages/simulador.es.json:15,39,41` y `vigilancia.es.json:4` (claves sin lector) y `SimuladorPanel.tsx:162` (un costo ≤ 0 se calla); `reglas.ts:94,192`, `vigilancia.ts:28,36`, `simulador.ts:272` (código sin lector); `useGanador.ts:61` (segundo `fit-winner`); `SimuladorPanel.tsx:183` + `pedir.ts:54` (respuesta de otra columna y sin tope si el worker muere); `SimuladorPanel.tsx:589`, `ReglasPanel.tsx:150`, `VigilanciaPanel.tsx:169` (lecturas sin `aria-live`); `messages/reglas.es.json:3,6,31` y `narration/reglas.ts:54` (nombran «el modelo en reglas» antes de medir; tabla `tu_tabla` también en inglés); `Etapa9Simulador.tsx` (sin unidad al estimar), `messages/es.json:1212,1261,1264` y `glosario.ts:115` (referencia cruzada al «¿qué pasaría si?»); `Etapa10Modelo.tsx:61,100` (doble clic descarga dos veces; literal `"knn"`); campos sin lector `SimulateResult.column`, `RulesResult.elapsed_ms`, `EvaluateNewResult.n_rows`. Heredada: LCP bimodal de `/protocolo`.
- **Aprendizajes:** el e2e completo atrapó lo que la unitaria no puede medir (el ancho de la página en un teléfono); un test que barre los diccionarios y los documentos por frases caducadas encontró dos que el auditor no vio; el puerto 3000 lo ocupa otro proyecto: el e2e corre en otro puerto.
- **Auditoría** (Sonnet 5.5 · high · solo lectura · 15:55–16:05, 10 min): 0 Críticos · 2 Altos · 5 Medios · 14 Bajos. Altos: A-01 la vigilancia leía una cifra no definida (AUC con una clase, recall/F1 sin positivos) como «peor» y pedía reentrenar · `9fda963`; A-02 el manual decía que vigilar el desempeño «no está en esta versión» · `1a5ebf1`. Medios: A-03 · `9fda963`; A-04 · `5f65900`; A-05, A-06, A-07 · `1a5ebf1`. Bajos: A-10 · `5f65900`; A-16, A-17, A-19 · `1a5ebf1`; A-18 · `9fda963`; el resto en «Deuda». Frases caducadas: 9 reales, pagadas (2 que el auditor no vio: `glosario.ts:334` y la fila «Plan de vigilancia» del manual).
- **Gates:** typecheck 0 · lint 0 · `pnpm test` 2669/2669 (95,24 % líneas, 85,78 % ramas) · integración 193 pasan, 1 omitida · Python 17/17 (CPython 3.14) · e2e 156 pasan, 6 omitidas a propósito, 0 flaky (`--retries=0`) · dependencias OK y `audit` sin altas · cero enlaces limpio · cada gate nuevo se vio fallar (envío con `test`, SQL alterado, regla invertida, texto que no cuadra, variante sin `protocol`, módulo estático desde `/protocolo`, R10 móvil, `origin` ajeno, frase caduca). **CI: se lee al final en el PR #36, no en este archivo.**
- **Modelo y relevos:** F1, F2 y F3 Sonnet 5.5 · auditor Sonnet 5.5 (high). Sin desvío; Haiku no se usó. Relevos: ninguno.

Para mergear: squash y borrar la rama; después `/cierre-sprint ds`.
