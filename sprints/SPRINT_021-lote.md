---
sprint: 021
app: ds
anexo: el lote del H-2 (deuda de medios y bajos de S17 a S20), las dos medidas y las demos en rojo
---

# S21 — el lote, las medidas y las demos en rojo

Estados del lote: **pagado** (commit del área y prueba vista fallar antes) · **ya estaba** (lo pagó un sprint anterior; se cita la línea o la
prueba) · **cerrado con razón y sitio** (con su decisión). Precedente: `SPRINT_016-lote.md`. Las secciones de abajo se escriben cuando
el hecho ocurrió (regla 27).

## Las dos medidas del S20 (presupuesto fijado antes de medir)

| Qué                                                                                                                            | Presupuesto            | Antes                                                                  | Después                                                            | Dónde queda                                               |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------- |
| Gemelo, peor caso que `planGemelo` deja pasar (50 000 filas, tres categóricas de 10 000 valores, ancho 30 000), Node + Pyodide | ≤ 30 s, el worker vivo | 51,9 s, heap de WebAssembly a 1 829 MiB (el techo de 32 bits es 2 048) | **13,7 s**, heap plano en 322 MiB                                  | `pipeline.py` `SYNTH_SPARSE_FROM = 512`, ADR 029 (adenda) |
| El mismo caso por la pantalla, navegador, build de producción                                                                  | ≤ 30 s, el worker vivo | —                                                                      | **17,4 s** en frío (incluye bajar Python) · **12,4 s** en caliente | ADR 029 (adenda)                                          |
| Holt-Winters, 2 000 días (también 2 100), horizontes 7 · 30 · 120, Node + Pyodide                                              | ≤ 45 s                 | —                                                                      | **7,3 a 9,2 s** (sin cambio de código)                             | ADR 028 (adenda)                                          |
| Holt-Winters, 2 000 días por la pantalla, navegador, build de producción                                                       | ≤ 45 s                 | —                                                                      | **13,5 s** en frío · **8,4 s** y **6,9 s** en caliente             | ADR 028 (adenda)                                          |

Tamaños intermedios del gemelo (Node, antes → después): ancho 50 1,1 → 1,1 s · 1 000 2,3 → 1,1 s · 5 000 8,0 → 2,0 s · 10 000 17,6 → 5,0 s.
La comparación de relaciones, en el hilo principal: 67 a 114 ms en todos los casos. 50 000 filas × 79 columnas sigue siendo H-3.
Peso de script (réplica de LHCI, transferencia, mediana de 3): `/` 220,1 KiB (main 220,0) · `/protocolo` 288,4 KiB (main 288,6); topes 300 y 320.

## Las demos en rojo de los gates propios nuevos (`scripts/demo-rojo.sh`; cada una nombró lo esperado y volvió a verde tras restaurar)

| Gate                                             | Mutación                                                                 | Falló nombrando                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| El SQL da la misma tabla que el motor (CPython)  | `consulta.ts`: se quita el `IS NOT NULL` de la columna medida            | `test_el_sql_da_la_misma_tabla_de_resultado_que_el_motor`            |
| La pregunta y los valores no salen del navegador | `PreguntaPanel.tsx`: el panel envía la pregunta con `fetch`              | «de la pregunta al CSV no se crea un Worker ni se hace una petición» |
| `/` no arrastra el lector por imports estáticos  | `app/page.tsx`: `import "@/engine/consulta"`                             | «la portada importa src/engine/consulta.ts»                          |
| `/protocolo` no arrastra el panel                | `app/protocolo/page.tsx`: `import "@/components/pregunta/PreguntaPanel"` | «/protocolo importa src/components/pregunta/PreguntaPanel.tsx»       |
| La frase cae a la línea mínima si no cuadra      | `narration/consulta.ts`: se devuelve la frase sin mirar `verificarTexto` | «si la plantilla dice una cifra que no está, o calla una que sí»     |
| Una consulta con un error de validación no corre | `consulta.ts`: `sePuedeCorrer` devuelve siempre verdadero                | «sin él, la consulta no se puede correr»                             |

La demo de la frase salió **verde con la mutación** la primera vez: la recuenta cuadra siempre con el motor, así que el último respaldo
(`verificarTexto` sobre la plantilla) no tenía prueba. Se escribió la prueba (una plantilla que inventa una cifra y otra que calla una) y la
demo se repitió en rojo.
