---
sprint: 009
app: ds
auditor: subagente Sonnet 5.5 · high · una pasada · solo lectura
base: 5d01712 (main) → HEAD de la rama sprint-009/existe-al-decidir
---

# Sprint 009 · auditoría de una pasada

**Veredicto del auditor:** requiere ajustes. Ninguna regla dura se rompe. Un hallazgo Alto (A1), pagado en el sprint. Medios y bajos, al lote del hito.
**Cómo se verificó lo pagado:** A1 leído en `src/engine/protocolo/etapa4.ts` antes de cambiarlo (los estados vacíos hacían emitir «la dejaste fuera»); arreglo y pruebas verdes (unitarias 1082/1082; e2e 88/88 sobre el build final).

| # | Sev. | Ubicación | Qué está mal | Estado |
|---|---|---|---|---|
| A1 | Alto | `src/engine/protocolo/etapa4.ts` (`trampas`: `decir`, `nada-para-entrenar`); render en `src/components/protocolo/Etapa4Inventario.tsx:576` | Con el inventario sin responder, la etapa 4 decía «la dejaste fuera del entrenamiento» y «excluiste todas las columnas». | **pagado · fac4a9f** (motor) + **96a0278** (pruebas: inventario vacío, estados mezclados, todo respondido) |
| M1 | Medio | `src/engine/protocolo/etapa4.ts:236-241`; límites en `docs/MANUAL-DE-USO.md:633-645` | Un identificador numérico (`id` entero) no se marca: `idLikeAlerts` descarta las numéricas. El manual no lo dice. | lote del hito |
| M2 | Medio | `docs/MANUAL-DE-USO.md:627-630` | «Lo que la etapa 2 calculó» no menciona la etapa 4, que también se recalcula (`dependeDeDatos`). Incompleto, no falso. | lote del hito |
| B1 | Bajo | `src/components/protocolo/CargaDatos.tsx:111-113`; `src/components/protocolo/CuadernoPanel.tsx:305-308` | Plural roto: «(1 entradas)». Las claves reciben `n`/`now`/`incoming`, no `count`. | lote del hito |
| B2 | Bajo | `src/lib/protocolo/apuesta.ts:6-61`; `docs/MANUAL-DE-USO.md` (Privacidad, ~l.612) | La apuesta (nombres de columna) va a `sessionStorage` y el manual solo nombra `localStorage` y el cuaderno. No viaja a observabilidad. | lote del hito |
| B3 | Bajo | `src/lib/protocolo/useProtocolo.ts:362` | Importar sin confirmar si el cuaderno actual solo tiene cargas (`cargas`), no evidencias. | lote del hito |
| B4 | Bajo | `src/components/protocolo/Etapa4Revelacion.tsx:187-190` | PSI redondeado a 2 decimales: 0.2496 se rotula «moderado» y se ve «0.25». | lote del hito |
| B5 | Bajo | `src/components/protocolo/campos.tsx` (`CampoCasillas`, `key={opcion}`); `src/engine/protocolo/etapa4.ts:718` | Encabezados duplicados: claves repetidas y ambas casillas marcadas; la pantalla no avisa antes de la apuesta. | lote del hito |
| B6 | Bajo | `src/engine/protocolo/etapa4.ts` (`criterio`, bloque); `Etapa4Inventario.tsx` (declaración) | La «declaración escrita» (G-Plan 2a) es una casilla; el cuaderno guarda la lista `en_bloque`, sin texto ni fecha. Decisión aceptada y anotada: el texto de la declaración no se registra. | aceptado (decisión) |
| B7 | Bajo | `src/lib/protocolo/useProtocolo.ts:278, 370, 386, 405` | `olvidarApuesta()` y `guardar()` dentro del actualizador de `setEstado`: impuro; en StrictMode corre dos veces. Idempotente; sin bug observado. | lote del hito (posible) |
| B8 | Bajo | `docs/GUIA-DE-PRUEBA.html:673` | Fecha del historial «2026-10-18»; la fecha de trabajo es 2026-10-17 (zona horaria del builder). | lote del hito (confirmar al cerrar) |
| B9 | Bajo | `Etapa4Revelacion.tsx`; `protocol.privacy` (messages) | La app no avisa en pantalla, junto a «Exportar cuaderno», de que el archivo lleva datos derivados (ahora también la procedencia en texto libre). B13 se cumple en manual y guía. | lote del hito |

## Las cuatro casillas

1. **Alcance: completo.** M2/M3 con diálogos de nombre y foco (`Confirmacion.tsx`); B13 en manual y guía; etapa 4 completa (apuesta, revelación, inventario, compuerta con `recalcular`); glosario de 5 términos; kit `bajas-con-fuga.csv` (480 filas); capturas `scripts/capturas-s9.mjs`; manual y guía (bloque K, 78 casillas). Excluido y sin tocar: etapa 5 y siguientes. Salvedad: B6 (decisión).
2. **Calidad: requiere ajustes → pagado (A1).** Sin hallazgos de división entre cero ni índices fuera de rango en el motor (`psiDeConteos`, `ksD`, `ruidoEsperado`, `periodosDeDeriva`, `vistaColumna` protegen n = 0). Sin `.only` ni `.skip` en las pruebas del sprint. Medios y bajos: M1, B1, B4, B5, B7 al lote.
3. **Seguridad y privacidad: sin Críticos ni Altos.** Ningún `console`, `captureMessage`, `addBreadcrumb`, `reportProtocolError`, `fetch`, Sentry ni narración con valores de celda en el diff. Sin claves nuevas de breadcrumb. Cero IA generativa. Sin `dangerouslySetInnerHTML`; los nombres de columna se renderizan como texto. `interpolate` hace una sola pasada (un nombre con `{score}` no reinyecta marcadores). Claves hostiles: `Object.hasOwn` y `Object.fromEntries`; `__proto__` se rechaza en `criterio`. `leerArchivo` + `leer` validan tipos, largos alineados, enums y `PROCEDENCIA_MAX`; `leerApuestaFija` valida con `try/catch`.
4. **Frases caducadas: una (M2, por omisión); ninguna falsa.** Las promesas aplazadas de `protocol.*` y `start.*` describen las etapas 5–10, que siguen sin construir (cierto). Manual l.287, 292, 749 no hablan del Protocolo. La guía J1, J5 y J6 ya dicen «Cerrada», no «Sin construir».

## Revisado sin hallazgos (auditor)

Paridad es/en (0 claves huérfanas). Todas las claves `k(...)` de `Etapa4*.tsx` existen. Sin literales visibles sin `t()` salvo símbolos con `aria-hidden`. Sin `any` ni `@ts-ignore`. «No sé» no entrena (`estadosPermitidos`, `criterio`, `columnasParaEntrenar`). «Después» solo admite «excluir» (UI, criterio y reducer). `recalcular` impide chequeos inventados. El kit coincide con la guía K6 (99,2 % en `referencia`; 4 de 480 repetidas; 7 de unidad + momento).
