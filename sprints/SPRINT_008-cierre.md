---
sprint: 008
app: ds
hito: H-2
opened: 2026-10-17
closed:
branch: sprint-008/protocolo-esqueleto
pr:
---

# Sprint 008 — cierre ejecutivo (borrador: se completa al cierre)

<!-- Evidencia anotada en cuanto se produce (regla 27; K-S7-8: el scratchpad no sobrevive). -->

- F1 `f1396c0`: `cmp` núcleo = planeadora, centinela presente; `pnpm test` 769/769 (64 archivos), líneas 94.49 %; cero enlaces local limpio.
- F2 demo en rojo de la compuerta (`scripts/demo-rojo.sh`, exit 0): `compuerta.ts` `if (bloquea !== null)` → `if (bloquea !== null && false)` → 4 de 14 en rojo, nombró «la etapa 2 no abre sin la 1»; restaurado (Python + `cmp`), verde 14/14.
- F2 `.protocolo.json`: «[contrato .protocolo.json] detectó 20 de 20»; `pnpm test` 806/806 (68 archivos), líneas 92.19 %.
