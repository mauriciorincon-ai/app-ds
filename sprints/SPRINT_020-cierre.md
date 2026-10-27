---
sprint: 020 · app: ds · hito: H-2 · opened: 2026-10-25 · closed: 2026-10-25
branch: sprint-020/proyectar-y-compartir · pr: #38
---

# Sprint 020 · «Proyectar y compartir» · cierre ejecutivo

- **Objetivo y resultado:** las tres funcionalidades de la VISION que faltaban, sin llamada nueva a un LLM ni dependencia nueva: **pronosticar una serie** (seis métodos con origen móvil, veredicto contra el mejor método simple, bandas del 80 y 95 %, gráfico y CSV; ADR 028), el **gemelo sintético** (cópula gaussiana con semilla fija, informe contra dos mitades reales, «se puede compartir · revisar · no compartir», cero copias recontadas por el lector; ADR 029) y las **reglas con las filas que subes** (en «Usar el modelo», también para un modelo importado, y en la etapa 10, donde la columna del objetivo no sale del navegador y la verdad no se mide; adenda al ADR 027). Las 37: **36 construidas · 0 con otro alcance · 1 en construcción (S21) · 0 descartadas**.
- **Estado:** construido, auditado y pagado; PR #38 listo. Único STOP, sin prueba tuya (FORMA y TEXTO van al ensayo del S21; la guía v17 suma 5 paradas, 42 en total, ~170 min, y no se corrió).
- **Tiempo:** estimado 3,5 h (F1 1,25 · F2 1,0 · F3 1,25) · real según el script 2,3 h, 66 % del estimado (es un piso: F1 y F2 cuentan 1 y 2 commits). **F3 +4 %** (la auditoría y sus pagos caben en la fase); sin fase sobre el 50 %.

```
### Horas del sprint (`scripts/horas-sprint.mjs`, rango `origin/main..HEAD`, heurística git-hours: huecos ≤ 2 h + 0,5 h por sesión)

| Commits | Sesiones | Horas activas | Span (primer → último commit) |
|---:|---:|---:|---|
| 10 | 1 | 2,3 h | 2026-10-25 19:37 → 2026-10-25 21:27 (1,8 h) |

| Fase | Commits | Horas activas |
|---|---:|---:|
| F1 | 1 | 0,5 h |
| F2 | 2 | 0,5 h |
| F3 | 7 | 1,3 h |
```

- **Entregables:** `serie.ts`, `pronostico.ts`, `gemelo.ts`; comandos `forecast`, `synthesize` y `rules` con filas (fuera de los bloques de la receta) con sus lectores de contrato y fixtures; paneles `pronostico/` y `gemelo/`, `Etapa10Reglas`; 4 CSV en el kit; ADR 028, 029 y adenda al 027; manual (2 secciones y las reglas ampliadas), guía v17, BLUEPRINT 36/0/1/0, export y brochure de 76, `CLAUDE.md`, README, `design-system.md`.
- **No completado:** nada del plan. Fuera por diseño y escrito como «no prometido» (no «descartado»): el pronosticador como `.probeta.json`, pronosticar en el Protocolo, varias series a la vez, fechas en el gemelo.
- **Desviaciones:** (1) el veredicto compara con **el mejor método simple**, no solo con el ingenuo estacional: en ruido blanco la media le gana por ~29 % y «no le gana nadie» no se podía decir; medido, «supera» en ruido blanco sale 1/150 (h=12) y 11/150 (h=6). (2) El pronóstico lee la tabla **cruda**: el saneamiento descarta la fecha por «identificador» y un archivo de dos columnas quedaba inutilizable; ahora abre la configuración con esa única opción. (3) **76 funcionalidades** (57 + 19; 3 nuevas) y guía de 42 paradas. (4) El lector del gemelo **recuenta** las copias; identificador numérico = contador o nombre `id`; las fechas no viajan (se nombran). (5) El mínimo de las reglas con filas es **53** (40 de ajuste tras apartar el 25 %), no 40. (6) **Peso**, medido contra `main` en esta máquina (una corrida): `/` 220,0 → 220,1 KiB, `/protocolo` 288,6 → 288,4 (ruido ±0,3); las cifras de la CI del S19 (246,9 y 315,5) pasan a «≈»; topes 300 y 320. (7) Roadmap de CV Viva: sale `datos-sinteticos` (lo cambia la planeadora al abrir).
- **Decisiones tuyas:** sigue abierta la del S18 (aceptar las ausencias de la liga) para el S21. Nada más pende de este sprint.
- **Deuda (al lote del hito):** M-4 `pipeline.py:4130` (la cercanía del gemelo hace uno-caliente sin tope con una categórica de miles de categorías; confirmar con una prueba de memoria); `narration/pronostico.ts:84` (la caída a la línea mínima no tiene test); `teclado-probeta.spec.ts` (sin el teclado de los paneles nuevos); `pipeline.py:3840` y `serie.ts:174,190` (rama y campo muertos); `narration/pronostico.ts:20` (`METODOS` repetido); constantes de Python copiadas a mano en TS (`PronosticoPanel`, `gemelo.ts`, `Etapa10Reglas.tsx`); campos sin lector `ForecastResult.{seasonal_reason,step,scale,best,se,elapsed_ms}`, `SynthesizeResult.{kinds,rounds,proximity.p5_real}`; `contrato-reglas.ts:130-148` (no comprueba `truth.n ≤ fidelity.n`); `pipeline.py:3350` (el worker aceptaría `truth` sobre el ganador reajustado; hoy lo impide TS); `pipeline.py:4142` (cercanía de muestra contra muestra, documentada); `GemeloPanel.tsx:86` y `pipeline.py:3735` (rendimiento con 50 000 filas y Holt-Winters con 2 000 días sin medir en el navegador: medir antes del ensayo); `useGanador.ts:47` (dos instancias del worker posibles en la etapa 10). Flaky sin causa hallada: `teclado-probeta.spec.ts:36` falló 1 vez en 168 y pasó en 8 corridas más.
- **Aprendizajes:** la demo en rojo del «sin futuro» mostró que dos tests no atrapaban un ajuste sobre su propia ventana: se añadió el de ventana fija; un mínimo de filas dicho en un texto necesita su test en el borde (el texto decía 40 y el real era 53); ampliar el barrido de frases caducadas al brochure y al export halló una que el auditor no vio («no entran al análisis»).
- **Recomendación y esfuerzo-beneficio:** S21 «Conversa con tus datos» y el ensayo general; antes, medir Holt-Winters largo y la cercanía del gemelo en el navegador. Beneficio alto: cierra 3 de las 4 piezas que quedaban para completar la VISION con un costo de 2,3 h (piso) y cero servicios nuevos.
- **Auditoría** (Sonnet 5.5 · high · solo lectura · 20:45–20:57, 12 min): 0 Críticos · 0 Altos · 6 Medios · 12 Bajos. Pagados: M-1 (mínimo 53), M-2 (campo que saltaba al teclear, también el horizonte) y M-3 (CSV del gemelo en notación científica) · `29f4e60`; M-5 (el aviso de fechas decía que no se usan) y M-6 («ninguna fila es una fila tuya» antes del informe) más 5 frases menores, una hallada por el gate ampliado · `f641f53`. M-4 y B-1…B-12 en «Deuda». Peso en el BLUEPRINT · `bae2beb`.
- **Gates:** typecheck 0 · lint 0 · `pnpm test` 2814/2814 (95,39 % líneas, 86,07 % ramas) · integración 233 pasan, 1 omitida (23 archivos) · Python 17/17 (CPython 3.14) · e2e 168 pasan, 6 omitidas a propósito, `--retries=0` (la corrida final, sobre el código final) · dependencias OK y `audit` sin altas · cero enlaces limpio · cada gate nuevo se vio fallar (13 demos: veredicto contra el ingenuo estacional, gemelo que ignora copias, objetivo en el envío de la etapa 10, import estático desde `/protocolo`, backtest que ve su ventana, worker que oculta copias, árbol invertido, etapa 10 pidiendo la verdad, dato personal que viaja, mínimo de filas en el borde, campo que salta, notación científica, frase caduca). **CI: se lee al final en el PR #38, no en este archivo.**
- **Modelo y relevos:** F1, F2 y F3 Sonnet 5.5 · auditor Sonnet 5.5 (high). Sin desvío; Haiku no se usó. Relevos: ninguno.

Para mergear: squash y borrar la rama; después `/cierre-sprint ds`.
