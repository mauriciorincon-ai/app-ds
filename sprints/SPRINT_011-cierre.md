---
sprint: 011 · app: ds · hito: H-2 Producto completo · branch: sprint-011/prueba-sellada
opened: 2026-10-18 · closed: 2026-10-18 · pr: el de esta rama, abierto con este cierre
---

# Sprint 011 · «La prueba sellada»
- **Objetivo:** etapa 6 del Protocolo (partición, sello, pantalla), pagar B2–B4 del S10 y el peso de los diccionarios. **Resultado:** etapa 6 construida y sellada; `/protocolo` en 295.022 B frente a 300 KB. **Estado:** construido y verificado; PR listo para el squash.
- **Estimado:** 4,25 h (F1 1,25 · F2 2,25 · F3 0,75). **Real:** la salida de abajo es un piso; no mide lectura, paradas ni tiempo de sesión.

### Horas del sprint (`scripts/horas-sprint.mjs`, rango `origin/main..HEAD`, heurística git-hours: huecos ≤ 2 h + 0,5 h por sesión)

| Commits | Sesiones | Horas activas | Span (primer → último commit) |
|---:|---:|---:|---|
| 12 | 1 | 1,5 h | 2026-10-18 14:18 → 2026-10-18 15:20 (1,0 h) |

| Fase | Commits | Horas activas |
|---|---:|---:|
| F1 | 4 | 0,6 h |
| F2 | 5 | 0,6 h |
| F3 | 3 | 0,4 h |

- **Modelo por fase:** F1 Sonnet 5.5 · F2 Opus 5.5 · F3 Haiku 5.5, sin desvío; auditoría Sonnet 5.5 · high, 9 min. **Relevos:** ninguno. **Haiku en F3:** bastó para manual y guía; la auditoría encontró dos errores míos en la guía (estado de la etapa 7 y versión), corregidos.
- **Entregables:** etapa 6 (motor, pantalla, glosario, diccionarios, sha256 síncrono), contrato aditivo, B2–B4, un idioma por página con spec en inglés, manual, guía con bloque M. **No completado:** nada del plan; fuera por diseño, etapas 7–8, validación cruzada y quitar duplicados entre lados.
- **Desviaciones:** (1) ahorro de 25,9 KB frente a 27,7 KB; (2) horizonte preguntado en la etapa 6, no en la VISION; (3) «tiempo mezclado» rediseñado: la primera medida daba 384 (todas las filas); (4) dos textos corregidos tras leer capturas; (5) K5 sin cambio: no nombra la etapa 6, aunque el plan decía que sí; (6) el inglés baja los dos diccionarios; (7) «E2E en inglés» es una spec focalizada; (8) B2–B4 en un solo commit.
- **Auditoría** (subagente Sonnet 5.5 · high, solo lectura, 9 min): alcance **pasa**; calidad **1 Medio, 4 Bajos** (lote); seguridad y privacidad **pasa**; frases caducadas **1 Medio pagado** (`916affd`, guía M6) y **3 Bajos** (lote); críticos y altos **0**.
- **Evidencia:** peso en la réplica de la CI sin `.env.local`: `/protocolo` 310.412 → 284.461 → 295.022 B; `/` 273.085 → 246.811 → 249.468 B (antes, tras F1, tras F2). Demo en rojo del sello (F2): 1 de 9 falla y dice «un sello que no cuadra»; restaurado, 9 de 9. Capturas (F2): 40 encuadres y 48 interacciones, 0 fallas; 9 leídas como imagen. Unitarias: 93 archivos, 1.329 pruebas en verde. e2e completo con `CI=1`: 106 de 106, 0 flaky, 3,8 min. Typecheck y lint: código 0. `pnpm audit`: 1 high ignorado (braces, ADR 012), vigente en `verificar:retiros`.
- **Deuda al lote del hito** (medios y bajos, `archivo:línea`):
- Medio · `src/components/protocolo/Etapa6Form.tsx:89,107`: el esquema «elegido» se precarga de la corrección previa y puede pedir una razón que no se eligió.
- Bajo · `src/engine/protocolo/particion.ts:577-579`: la clase «constructor» impide registrar; «__proto__» sale del conteo.
- Bajo · `src/engine/protocolo/etapa6.ts:509` y `particion.ts:642,663-664`: `sellosDistintos` cuenta el cálculo previo; la caché de resultados no tiene tope.
- Bajo · `src/components/protocolo/Etapa6Form.tsx:528-536` y `CuadernoPanel.tsx:209,214`: camino muerto `verify.time-bad`; un esquema vacío muestra la clave cruda.
- Bajo · `messages/*.json` (`protocol.stage.6.seal.note`, `porque`) y manual ítem 8: «la etapa 7 no abre» en presente, con etapas sin construir; mismo patrón que S10.
- **Aprendizaje:** las expectativas de la guía no se contrastaban con el motor; la auditoría encontró una. **Recomendación:** subir al hito, antes del gate humano, la precarga de `Etapa6Form` y la clase «constructor». **Esfuerzo-beneficio:** alto; la etapa 6 cierra la garantía anti-fuga del Protocolo, con 12,2 KB de margen en peso. **Fase pasada > 50 %:** ninguna medible con el script.

Para mergear: squash y borrar la rama; después `/cierre-sprint ds`.
