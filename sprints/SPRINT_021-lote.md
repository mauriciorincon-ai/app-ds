---
sprint: 021
app: ds
anexo: el lote del H-2 (deuda de medios y bajos de S17 a S20), las dos medidas y las demos en rojo
---

# S21 — el lote, las medidas y las demos en rojo

Estados del lote: **pagado** (commit del área y prueba vista fallar antes) · **ya estaba** (lo pagó un sprint anterior; se cita la línea o la
prueba) · **cerrado con razón y sitio** (con su decisión). Precedente: `SPRINT_016-lote.md`. Las secciones de abajo se escriben cuando
el hecho ocurrió (regla 27).

## El lote, punto por punto (S17–S20)

### Pagados

| Punto | Estado | Dónde quedó | Prueba (vista fallar antes) | Commit |
|---|---|---|---|---|
| 17-4 | pagado | plantillas/receta.py lee `formato` (se niega con otro, código 2) e imprime `app` | tests/python/test_publica.py ×2 (formato, app) | `ae45709` |
| 17-5 | pagado | engine/protocolo/{etapa8,ficha}.ts, lib/protocolo/ficha-texto.ts, messages/etapas/etapa10.*.json: la ficha nombra al rival sin modelo | tests/unit/protocolo-ficha-texto «la robustez NOMBRA al rival…» | `53b5d95` |
| 17-6 | pagado | plantillas/puntuador.html carga pyodide.js con integrity (PYODIDE_SRI sha384) + crossOrigin; scripts/verificar-publica.mjs lo cruza con el CDN | tests/unit/verificar-publica.test (SRI ×3, demo en rojo); e2e publica.spec «no ejecuta un pyodide.js que no es el que declara» (corre con el build del F3) | `ae45709` |
| 18-11 | pagado | src/workers/contrato-intervalo.ts (seed = la del experimento), IntervaloPanel.tsx | tests/unit/contract-intervalo.test.ts «la semilla que vuelve…» | `b7d9e84` |
| 18-12 | pagado | LimpiezaPanel.tsx + messages/limpieza.*.json (la cuota se dice cuando el aviso salió del contenido) | tests/unit/limpieza-panel.test.tsx «dice qué parte de las celdas…» | `393081b` |
| 18-15 | pagado | engine/limpieza-plan.ts motivo `ya-excluida` (+ `excluidas`), lib/experiment.ts `columnasQueAgruparExcluye`, useExperiment.ts, messages/limpieza.*.json: al agrupar, un paso sobre un identificador o fecha no se registra como aplicado | tests/unit/limpieza.test «lo que la tarea ya deja fuera…», experiment.test | `393081b` |
| 19-01 | pagado | VigilanciaPanel.tsx muestra `vigilancia.ayuda` (la clave tenía texto y ningún lector) | vigilancia-reglas-paneles.test «con el objetivo…» | `393081b` |
| 19-02 | pagado | SimuladorPanel.tsx el selector de categoría usa `categoria_valor` (clave sin lector; antes repetía la etiqueta de la opción) | simulador-panel.test «una categoría que no existe…» | `393081b` |
| 19-03/04 | pagado | SimuladorPanel.tsx `problemaDeCostos` dice `costos.invalido` y `costos.clases_faltan` (un costo ≤ 0 se callaba) | simulador-panel.test ×2 (S21, lote 19-03/04) | `393081b` |
| 19-05/06 | pagado (borrado) | engine/reglas.ts `columnasDe` y `tipoDePrediccion` (sin lector en producto; los tests usan `hojasDe`) | tsc + reglas.test «las columnas que usa…» | `ecddf98` |
| 19-07/08 | pagado (borrado) | engine/vigilancia.ts `nPrueba` y `diferencia` (sin lector); referencia.ts | tsc + vigilancia.test; integration reglas «corrido peor que igual» por `hoy.valor` | `ecddf98` |
| 19-09 | pagado (borrado) | engine/simulador.ts `ComparacionBinaria.positiva` | tsc + simulador.test | `ecddf98` |
| 19-10 | pagado | lib/protocolo/useGanador.ts (un ajuste en vuelo con la misma clave se espera, no se manda otra vez) | tests/unit/use-ganador.test «dos pedidos del mismo ajuste…» | `53b5d95` |
| 19-11 | pagado | SimuladorPanel.tsx `vigente` (la respuesta de una simulación anterior no pisa el reinicio) | simulador-panel.test «la respuesta de la columna de antes…» | `393081b` |
| 19-12 | pagado | lib/simulador/pedir.ts oyentes `error`/`messageerror` (la promesa no se queda colgada) y los tres se quitan | tests/unit/pedir.test.ts ×2 (nuevo) | `b7d9e84` |
| 19-13 | pagado | SimuladorPanel.tsx región viva `simulador-vivo` | simulador-panel.test «al pulsar viaja solo lo del modelo…» (vivo antes y después) | `393081b` |
| 19-14 | pagado | ReglasPanel.tsx `reglas-vivo` | vigilancia-reglas-paneles.test «debajo del umbral…» | `393081b` |
| 19-15 | pagado | VigilanciaPanel.tsx `vigilancia-vivo` | vigilancia-reglas-paneles.test «con el objetivo…» | `393081b` |
| 19-18 | pagado | Etapa9Simulador.tsx `unidadDelObjetivo` (al estimar, el cambio se dice en la unidad que Probeta infiere del objetivo) | tests/unit/etapa9-unidad.test.ts ×3 (nuevo) | `53b5d95` |
| 19-19 | pagado | messages/{es,en}.json (stage.3.help.proposito, stop.causal, trap.causal), content/glosario.ts, content/protocolo.ts: «el ¿Qué pasaría si? de Probeta solo dice qué diría el modelo» | tests/unit/referencia-que-pasaria-si.test.ts ×5 (nuevo) | `a96932c` |
| 19-20 | pagado | Etapa10Modelo.tsx `guardando` (un segundo clic con la exportación en vuelo no la repite) | protocolo-etapa10-ui.test «dos clics seguidos descargan UN archivo…» | `53b5d95` |
| 19-21 | pagado (sin cambio de conducta) | Etapa10Modelo.tsx el literal "knn" sale de `MEMBERS[id].family === "neighbors"` | cubierto por protocolo-etapa10-ui (texto de filas del entrenamiento solo con vecinos) | `53b5d95` |
| 20-02 | pagado (solo prueba) | — | tests/unit/pronostico.test «si la plantilla dice una cifra que no está…»; demo en rojo vista (narration/pronostico.ts sin el respaldo → falla nombrándolo) | `ecddf98` |
| 20-04 | pagado (simplificación sin cambio de conducta) | pipeline.py `needed` del pronóstico: las dos ramas daban lo mismo | pruebas de `needed` del pronóstico (integración + contract-pronostico) | `b7d9e84` |
| 20-05 | pagado (borrado) | engine/serie.ts campo `vistos` del acumulador | tsc + serie.test | `ecddf98` |
| 20-06 | pagado | narration/pronostico.ts importa `METODOS` de engine/pronostico.ts (la lista estaba repetida) | tsc + pronostico-narracion | `ecddf98` |
| 20-07 | pagado | tests/unit/constantes-python.test.ts (nuevo): 10 constantes de pipeline.py, RULES_MIN_UPLOADED=53 y las listas de métodos contra sus copias en TS; Etapa10Reglas exporta FILAS_MINIMAS | demo en rojo vista (FORECAST_MAX_FOLDS 12→13 → falla nombrándola) | `ecddf98` |
| 20-11 | pagado | workers/contrato-reglas.ts `truth.n ≤ fidelity.n` | tests/unit/contract-reglas.test «la fidelidad es acuerdo…» (línea nueva) | `b7d9e84` |
| 20-12 | pagado | pipeline.py `_MODEL["origin"]="protocolo"` en fit-winner y `run_rules` rechaza `truth` (contract:truth) | tests/integration/reglas.test «el ganador del Protocolo reajustado…»; demo en rojo vista (pipeline.py: el guardián cambiado por `pass` → falla nombrando contract:truth) | `b7d9e84` |
| 20-16 | pagado | Etapa10Constancia.tsx crea UN `useGanador()` y lo pasa a Etapa10Modelo y Etapa10Reglas | tests/unit/use-ganador.test «crea un solo useGanador()…» | `53b5d95` |
| 20-B | pagado | PronosticoPanel.tsx `pronostico-vivo` y GemeloPanel.tsx `gemelo-vivo` (las dos lecturas sin aria-live del S20) | pronostico-panel.test y gemelo-panel.test | `393081b` |
| 19-16/17 | pagado | `messages/reglas.*.json`, `ReglasPanel.tsx`, `narration/reglas.ts`: título y botón neutros («Armar las reglas») hasta medir la fidelidad, cabecera según ella, `tu_tabla`/`your_table` por idioma | `reglas-texto.test`, `vigilancia-reglas-paneles.test` | `eac0aa3` |
| 20-01 (M-4) | pagado | `pipeline.py` `SYNTH_SPARSE_FROM = 512`: la cercanía del gemelo usa `scipy.sparse` | `gemelo.test` (denso = disperso, fila a fila, a 8 decimales) · medida 51,9 s → 13,7 s | `149bf84` |
| 20-14/15 | pagado (medido) | gemelo y Holt-Winters medidos en Node y en el navegador, dentro del presupuesto | `medidas-s21.test.ts` y `medidas-s21.spec.ts` (`MEDIR=1`) | `149bf84` |
| 20-03 | pagado | e2e de teclado de Pregúntale a tus datos, el gemelo y el pronóstico | `teclado-paneles.spec.ts` | `588462e` |

### Ya estaba (el lector del contrato lo coteja, o está documentado)

| Punto | Qué | Evidencia |
|---|---|---|
| 17-1 | `task` del estrés | `contrato-estres.ts:58` `task: oneOf([sent.task])` |
| 17-2 | `shuffle[].kind` | `contrato-estres.ts:66-71` `kind: oneOf(["numeric", "categorical"])` |
| 18-10 | `n` del intervalo | `contrato-intervalo.ts` `n: refine(int, v => v === sent.n_test)` |
| 19-22 | `SimulateResult.column` | `contrato-simulador.ts:56` `column: oneOf([sent.column])` |
| 19-24 | `EvaluateNewResult.n_rows` | `contrato-vigilancia.ts:38,50` contra `sent.rows` y contra las filas usadas y descartadas |
| 20-08 | `ForecastResult.{seasonal_reason, step, scale, best, se}` | `contrato-pronostico.ts:70-90,130-138` (el motivo estacional se cruza con los pliegues; lo demás se valida) |
| 20-10 | `SynthesizeResult.kinds` | `contrato-gemelo.ts:108,119` contra lo enviado y contra las columnas |
| 20-13 | cercanía de muestra contra muestra | documentada: ADR 029 § 4 («contra dos mitades reales») |

### Cerrados con razón y sitio

| Punto | Qué | Razón y sitio | Commit |
|---|---|---|---|
| 17-3 | `StressResult.elapsed_ms` | telemetría que valida el contrato; ninguna pantalla ni medición la lee; el comentario de `workers/protocol.ts` lo dice así (auditoría A-12) | `0a0d7e1` |
| 19-23 | `RulesResult.elapsed_ms` | ídem | `0a0d7e1` |
| 20-09 | `ForecastResult.elapsed_ms`, `SynthesizeResult.{rounds, proximity.p5_real, elapsed_ms}` | los valida el contrato; `elapsed_ms` lo leen las mediciones (`medidas-s21`); `rounds` y `p5_real`, solo la prueba denso/disperso; ninguna pantalla | `0a0d7e1` |
| 18-9 | `cleaning_plan` sin lector (`model-file.ts:620`) | es el registro de procedencia del plan de limpieza que aprobó el dueño: se guarda y se descarga, y lo lee quien abre el archivo (ADR 026 § `cleaning_plan`) | — |
| 18-13/14 | `SIN_LUGAR_EN_LA_TAREA` y `FUERA_DE_LA_LISTA_DE_LA_VISION` | los cierra la decisión del usuario (2026-10-26, la del G-Plan por omisión): se aceptan las ausencias por tarea de la liga; `roster.ts`, BLUEPRINT fila 6 y manual lo dicen | `79abe65` |
| 17-8 | margen de 4,6 KiB de `/protocolo` | H-3, con sitio en `docs/BLUEPRINT.html` (tabla «Lo que queda»); el S21 no cambia el peso (`/protocolo` 288,4 KiB, tope 320) | — |
| 17/18/19-25 | LCP bimodal de `/protocolo` (2,7 s o 3,4 s con el mismo código) | H-3, con sitio en `docs/BLUEPRINT.html`; el job `lighthouse` oscila en esa ruta y se declara en cada cierre | — |

### No completado (aplazado, no descartado)

| Punto | Qué | Por qué | A dónde va |
|---|---|---|---|
| 17-7 | e2e de un booster (lightgbm, xgboost) en el puntuador | Es el orden de recorte ② del plan aprobado: exige forzar el modelo en el Nivel 2 y bajar sus wheels dentro del navegador, y lo que queda sin ver es solo la rama de carga de esos dos paquetes en `prepararMotor`. La receta y el servicio de CADA modelo corren en CPython y `puntuar.py` puntúa igual que la app para todo el roster (Node + Pyodide) | H-3 (pruebas esenciales de lo que cambia) |

## La auditoría de una pasada (Sonnet 5.5 · high · solo lectura · 20:13:17 a 20:24:40, 11 min)

Recomendación del auditor: «requiere ajustes». **23 hallazgos: 0 Críticos · 4 Altos · 8 Medios · 11 Bajos. Todos pagados** (la regla del hito: también los medios y los bajos). Cada ajuste con su prueba; los que se pagaron antes de escribir su prueba se vieron fallar con una demo en rojo.

| Id | Sev. | Qué era | Pago | Commit |
|---|---|---|---|---|
| A-01 | Alto | «distinto de», «diferente de», «≠», «not equal to» invertían el filtro sin decirlo | el operador `!=` sin número niega el valor que sigue; «≠» se cambia antes de normalizar | `f8c5340` |
| A-02 | Alto | un valor que es palabra de relleno («este», «A») se ignoraba sin aviso | se lee tras una preposición o pegado a su columna; «todos»/«all» jamás | `f8c5340` |
| A-03 | Alto | promedio, mínimo, máximo y mediana por categoría decían «fue Total» | frase propia sin total | `24cd356` |
| A-04 | Alto | «menor a -5» se leía «menor a 5» | el signo viaja en el número | `f8c5340` |
| A-05 | Medio | «ventas no premium» no negaba | «no» entre los negadores | `f8c5340` |
| A-06 | Medio | `ventas_usd` escrito como la app lo imprime no se leía | el guion bajo es espacio al tokenizar | `f8c5340` |
| A-07 | Medio | el tope de 500 grupos no valía por periodo | `validar` cuenta las cubetas igual que las categorías | `24cd356` |
| A-08 | Medio | «constructor» y `__proto__` se leían como mes o unidad | mapas sin prototipo | `f8c5340` |
| A-09 | Medio | el SQL se prueba con `NULL` donde el motor ve «NA», «-», etc. | la nota del SQL lo dice en los dos idiomas | `24cd356` |
| A-10 | Medio | un «o» entre columnas distintas pasaba a «y» en silencio | aviso `union-y` | `f8c5340` |
| A-11 | Medio | `1.234,567` se leía 1 234 567 | el último separador es el decimal; `2023,2024` no es un número | `f8c5340` |
| A-12 | Medio | comentarios de telemetría con una razón falsa | reescritos con quién lee de verdad; filas 17-3, 19-23 y 20-09 corregidas | `0a0d7e1` |
| A-13 | Medio | el SRI protege menos de lo que decía | comentario y ADR 024 nombran su alcance (solo `pyodide.js`) | `0a0d7e1` |
| A-14 | Bajo | fechas imposibles y ventanas enormes pasaban | no se leen; `ventana-grande` | `f8c5340` |
| A-15 | Bajo | los conteos pequeños salían con decimales | `decimalesDe` (frase, tabla y gráfico) | `24cd356` |
| A-16 | Bajo | al cambiar lo propuesto desaparecía el control | queda, con «cambiado por ti» | `f8c5340` · `24cd356` |
| A-17 | Bajo | «dentro de las fechas» aunque empezara antes | aviso `ventana_antes` | `24cd356` |
| A-18 | Bajo | exports muertos y listas copiadas a mano | borrados; las listas salen del léxico | `f8c5340` · `24cd356` |
| A-19 | Bajo | docblock de `prepareClusterRun` mal puesto y lógica duplicada | un helper `columnasIdLike` | `d6bae4f` |
| A-20 | Bajo | «1 filas» | variantes `_one` | `24cd356` |
| A-21 | Bajo | una columna nombrada dos veces abría «¿cuál medir?» | una sola columna es una sola cifra | `f8c5340` |
| A-22 | Bajo | la prueba «contra la tabla, no contra el reloj» no fijaba el reloj | `vi.setSystemTime` | `f8c5340` |
| A-23 | Bajo | el plan decía que agrupar por números pregunta; el código lo marca error de validación | **desviación declarada** en el cierre (el ADR 030 ya lo decía así) | — |

Casilla 4 (frases caducadas): 0 frases aplazadas vencidas en los documentos y los textos; las afirmaciones «lo que no se leyó se dice» del manual, el ADR, el brochure y la guía W2 eran falsas en A-01, A-02 y A-04 y dejan de serlo con los pagos. Repasada otra vez sobre el diff de los pagos: sin coincidencias nuevas.

### Flaky `teclado-probeta` (20-17)

No se reprodujo: 60 repeticiones del test con traza y `--retries=0` (20 con 3 trabajadores y 40 con 6, la segunda con la auditoría y los gates corriendo a la vez), 0 fallos; la falla original (1 de 168 en el S20) no dejó traza. Se declara, no se da por cerrado: el job `e2e` ahora **sube `test-results/` también cuando el job pasa** (`ci.yml`), así que el próximo spec que falle y pase en su reintento deja su traza.

## Las dos medidas del S20 (presupuesto fijado antes de medir)

| Qué                                                                                                                            | Presupuesto            | Antes                                                                  | Después                                                            | Dónde queda                                               |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------- |
| Gemelo, peor caso que `planGemelo` deja pasar (50 000 filas, tres categóricas de 10 000 valores, ancho 30 000), Node + Pyodide | ≤ 30 s, el worker vivo | 51,9 s, heap de WebAssembly a 1 829 MiB (el techo de 32 bits es 2 048) | **13,7 s**, heap plano en 322 MiB                                  | `pipeline.py` `SYNTH_SPARSE_FROM = 512`, ADR 029 (adenda) |
| El mismo caso por la pantalla, navegador, build de producción                                                                  | ≤ 30 s, el worker vivo | —                                                                      | **17,4 s** en frío (incluye bajar Python) · **12,4 s** en caliente | ADR 029 (adenda)                                          |
| Holt-Winters, 2 000 días (también 2 100), horizontes 7 · 30 · 120, Node + Pyodide                                              | ≤ 45 s                 | —                                                                      | **7,3 a 9,2 s** (sin cambio de código)                             | ADR 028 (adenda)                                          |
| Holt-Winters, 2 000 días por la pantalla, navegador, build de producción                                                       | ≤ 45 s                 | —                                                                      | **13,5 s** en frío · **8,4 s** y **6,9 s** en caliente             | ADR 028 (adenda)                                          |

Tamaños intermedios del gemelo (Node, antes → después): ancho 50 1,1 → 1,1 s · 1 000 2,3 → 1,1 s · 5 000 8,0 → 2,0 s · 10 000 17,6 → 5,0 s.
La comparación de relaciones, en el hilo principal: 67 a 114 ms en todos los casos. 50 000 filas × 79 columnas sigue siendo H-3.
Peso de script (réplica de LHCI, transferencia, mediana de 3): `/` 220,1 KiB · `/protocolo` 288,4 KiB; el `main` de hoy (el S20) midió lo mismo, así que el delta del S21 es 0; topes 300 y 320.

## Las demos en rojo de los gates propios nuevos (`scripts/demo-rojo.sh`; cada una nombró lo esperado y volvió a verde tras restaurar)

| Gate                                             | Mutación                                                                 | Falló nombrando                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| El SQL da la misma tabla que el motor (CPython)  | `consulta.ts`: se quita el `IS NOT NULL` de la columna medida            | `test_el_sql_da_la_misma_tabla_de_resultado_que_el_motor`            |
| La pregunta y los valores no salen del navegador | `PreguntaPanel.tsx`: el panel envía la pregunta con `fetch`              | «de la pregunta al CSV no se crea un Worker ni se hace una petición» |
| `/` no arrastra el lector por imports estáticos  | `app/page.tsx`: `import "@/engine/consulta"`                             | «la portada importa src/engine/consulta.ts»                          |
| `/protocolo` no arrastra el panel                | `app/protocolo/page.tsx`: `import "@/components/pregunta/PreguntaPanel"` | «/protocolo importa src/components/pregunta/PreguntaPanel.tsx»       |
| La frase cae a la línea mínima si no cuadra      | `narration/consulta.ts`: se devuelve la frase sin mirar `verificarTexto` | «si la plantilla dice una cifra que no está, o calla una que sí»     |
| Una consulta con un error de validación no corre | `consulta.ts`: `sePuedeCorrer` devuelve siempre verdadero                | «sin él, la consulta no se puede correr»                             |
| El worker del ganador reajustado no mide la verdad (20-12) | `pipeline.py`: el guardián de `origin == "protocolo"` cambiado por `pass` | `contract:truth` (`reglas.test` de integración) |
| La frase del pronóstico cae a la línea mínima (20-02) | `narration/pronostico.ts`: se devuelve la frase sin mirar `verificarTexto` | «cae a la línea mínima» |
| Las constantes de Python y sus copias en TS coinciden (20-07) | `pipeline.py`: `FORECAST_MAX_FOLDS` de 12 a 13 | «FORECAST_MAX_FOLDS es PRONOSTICO_PLIEGUES_MAX» |
| El puntuador no ejecuta un `pyodide.js` que no es el que declara (17-6) | `puntuador.html` servido: sin `integrity` ni `crossOrigin` | `Received: true` (el script cambiado sí se ejecutó; e2e `publica.spec`) |

La demo de la frase salió **verde con la mutación** la primera vez: la recuenta cuadra siempre con el motor, así que el último respaldo
(`verificarTexto` sobre la plantilla) no tenía prueba. Se escribió la prueba (una plantilla que inventa una cifra y otra que calla una) y la
demo se repitió en rojo.
