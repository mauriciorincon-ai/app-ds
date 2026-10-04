# Sprint 007 — Bitácora de implementación («Agrupar y multiclase» · cierre del ciclo H2, sprint 3 de 3)

Branch: `sprint-007/agrupar-y-multiclase` (desde `main` `6f50c43`) · Orden:
`portafolio/ds/ordenes/SPRINT_007-orden.md` · Plan: `portafolio/ds/sprints/SPRINT_007.md`.

El usuario aprobó el plan de ejecución el 2026-10-04 (plan mode) sin ajustes, y dio el «construye»
el mismo día.

El sprint completa el catálogo de cuatro tareas de la VISION v1.1.0:

- **Clasificar en varias categorías:** la liga de 14 miembros en su forma multiclase, con fuga por
  clase y soporte mínimo, que la binaria también adopta (D8 del S6).
- **Agrupar sin objetivo:** K-Means, Agglomerative, GMM y HDBSCAN, con la estabilidad por
  re-muestreo como «sirve para creer».

Además entrega el **Acto 1 del cierre del ciclo H2**:

- el BLUEPRINT;
- la guía v4 con el ⭐⭐ corto;
- el brochure re-armado;
- la auditoría de la constitución.

Cero IA nueva. **Condición dura: la binaria y la regresión no se rompen.**

Regla 22 de la constitución (kit v1.38.0): **toda evidencia de esta bitácora se escribe después de
la corrida que la produce.**

## Desviación del plan

Aprobadas con el plan el 2026-10-04. La planeadora las lee aquí; no se escribe en ella.

- **D1 · Fixture `modelo-s6`.** El plan de la planeadora no lo lista. Sin él, «un archivo del S6
  importa y puntúa igual» no tiene prueba: solo existe `modelo-s5.*`. El código del S6 lo emite antes
  de tocar `pipeline.py`.
- **D2 · `githooks/pre-commit` no se re-estampa:** el del kit retrocede en macOS (dice «lo hace
  estampar-app.ps1» y solo menciona winget).

  Además, `verificar-dependencias.mjs` se porta del kit v1.37.0 **conservando el candado AU-S6-13**
  del repo: un lockfile que no se sabe leer es rojo. El kit no lo trae; queda como propuesta para su
  batch.

- **D3 · La UI de multiclase y agrupar se habilita en la F3** (mismo patrón que la D4 del S6). En la
  F1 y la F2 el motor las entrena de punta a punta, probado por unit e integración, y la preview no
  muestra un resultado nuevo en una pantalla vieja.
- **D4 · Clase de las miradas.** La orden fija Resultados multiclase y Resultados de agrupar como FORMA
  maquetada, sin parada. La regla de tres clases dice «en duda, DECISIÓN». Se sigue la orden (G-Plan
  aprobado). El usuario no pidió convertir la de agrupar en parada al aprobar el plan.

## Fase 0 — constitución + delta del kit + deuda con sitio + datasets + spike

### Constitución sincronizada (2026-10-04)

`CLAUDE.md` ← `portafolio/ds/ordenes/CLAUDE-md-para-app.md`, regenerada por la planeadora con el kit
v1.38.0.

- `cmp`: copia idéntica.
- `grep`: la frase centinela «la evidencia se escribe DESPUÉS del hecho» aparece 1 vez.

### Delta del kit v1.35.0 → v1.38.0 (por nombre)

| Ítem del kit                                                    | Qué se hizo                                                                                                                                                                                                                                                                                                                                                                                                | Rojo (con `scripts/demo-rojo.sh`, ya corrido)                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v1.38.0 · `demo-rojo.sh` endurecido                             | Reemplazado por el del kit. Es el del S6 más la verificación con Python (`contiene()`) para un `--buscar` de varias líneas. Sigue en 100755                                                                                                                                                                                                                                                                | Demo de la herramienta, con un `--buscar` de dos líneas donde solo existe la primera. El script del S6 lo aceptó: «mutación aplicada», una que no cambió nada, y salió con 1 solo porque el gate `true` pasó; con un gate que fallara por otra razón, lo habría contado como rojo. El v1.38 salió con 1 antes de mutar: «el texto de --buscar no está». En los dos, el archivo quedó intacto |
| v1.37.0 · hook PreToolUse que **falla cerrado**                 | `.claude/settings.json` del kit (sin gitleaks o jq: `BLOQUEADO`, exit 2; `KIT_SIN_GITLEAKS=1` lo salta a sabiendas) + `tests/unit/hook-secretos.test.ts` del kit. El bloque «avisa y deja pasar» del S6 en `tests/integration/gitleaks-hook.test.ts` se retiró (cambio esperado: contradice la regla nueva)                                                                                                | Con el comando del S6 en `settings.json`: «× sin gitleaks ni jq bloquea, y lo dice» — «expected +0 to be 2», 1 de 3 en rojo, nombrando lo esperado. Restaurado (Python + `cmp`): 3 de 3 en verde                                                                                                                                                                                             |
| v1.37.0 · `verificar-dependencias` con degradaciones declaradas | Portado del kit, que exporta `revisar()`, con el candado AU-S6-13 dentro de `revisar()` (D2). `scripts/degradaciones-permitidas.json` = `[]`. Prueba nueva `tests/unit/verificar-dependencias.test.ts` (7) y tipos en `scripts/verificar-dependencias.d.mts`                                                                                                                                               | (a) Una entrada sin uso en el JSON: «tiene entradas que ya no aplican; bórralas: zod 9.9.9 → 9.9.8», exit 1. (b) `zod@4.6.5` → `4.6.4` en el lockfile real: «zod: 4.6.5 (origin/main) → 4.6.4 (este árbol)», exit 1. (c) El candado AU-S6-13 apagado: «× AU-S6-13: otra lockfileVersion no se compara», 1 de 7. En los tres, restaurado y en verde (675 paquetes; 7 de 7)                    |
| v1.37.0 · `scripts/lighthouse-margen.mjs`                       | Estampado. Paso nuevo del job `lighthouse`, después de los dos `lhci assert`                                                                                                                                                                                                                                                                                                                               | **¿Puede fallar siquiera?** Con `perf-budget.json` en `"path": "/*"`, el chequeo de cobertura nunca falla con las URLs de hoy. Su rojo es un presupuesto que deja una URL medida sin cubrir: con `"path": "/x"`, «✗ la URL medida / no cae bajo ningún path», exit 1. Restaurado: «✓ … 1 URL con presupuesto». La parte del margen solo avisa (exit 0), por diseño                           |
| v1.37.0 · regla 26, worktrees prohibidos                        | Adoptada. Esta sesión no usa `git worktree`. La comparación del bundle y la medición de Pyodide 314.0.7 van con `git archive` / `npm pack` en el scratchpad                                                                                                                                                                                                                                                | No es un gate                                                                                                                                                                                                                                                                                                                                                                                |
| v1.36.0 · reglas 24 y 25                                        | Inventario abajo                                                                                                                                                                                                                                                                                                                                                                                           | No es un gate; lo pregunta la casilla 8 de la auditoría                                                                                                                                                                                                                                                                                                                                      |
| v1.38.0 · regla 27, PR en borrador, comandos                    | Re-estampados `audita-sprint.md` (por superficies, casilla 8, decisiones en llano, segunda casilla 4 con otro auditor y frases de evidencia), `deploy-check.md` (§4 contra `merge-base`) y `plan-sprint.md` (tres clases de mirada). `.claude/commands/README.md` → `.claude/COMANDOS.md` (K-S6-1), conservando que `/release-check` no se estampa (perfil WEB). Molde `docs/SPIKE-DE-COSTOS.plantilla.md` | Son comandos y moldes                                                                                                                                                                                                                                                                                                                                                                        |

**Reglas 24 y 25, inventario.** La app es web.

- Nada del sprint toca lo que el sistema operativo protege (Llavero, permisos TCC, ítems de inicio,
  Touch ID, Automatización, cuentas, certificados).
- Los arneses (capturas, spike con Chromium y WebKit de Playwright) abren navegadores headless en
  localhost, sin pedir permisos.
- `pnpm test` no abre hardware: el único proceso que lanza es `bash`, en la prueba del hook.

Si algo pidiera permiso, se enseña antes con su matriz y se espera el «sí».

**ADR 012 re-leído (regla 18 de la constitución, cierre de ciclo).** El aviso de `braces`
(`GHSA-vfj7-8cjw-p6xm`) sigue con `first_patched_version: null`, consultado el 2026-10-04 en el
`/deploy-check` del S6. La excepción sigue vigente.

### Gates en verde después del delta (2026-10-04, corridos antes del primer commit)

- typecheck 0 · lint limpio
- `pnpm test`: 533 de 533 (49 archivos), con 3 del hook y 7 de dependencias nuevos
- `gitleaks-hook.test.ts` (integración): 7 de 7

## Fricciones del kit (SEPARADAS del producto)

- **K-S7-1 · `plan-sprint.md` del kit perdió el punto 10** («al concluir la construcción, corre
  `/audita-sprint`»). La edición de v1.36.0 que cambió «dos clases de mirada» por «tres» lo borró
  junto con el bloque. Se re-estampó conservándolo, con una nota. Propuesta: restaurarlo en el kit.
- **K-S7-2 · El `--esperar-verde` de `demo-rojo.sh` exige un comando, pero su nombre parece un
  interruptor.** La primera demo del hook lo pasó sin argumento: `set -u` cortó con «$2: unbound
  variable» antes de mutar nada (exit 1, archivo intacto). Propuesta: que el script diga «falta el
  comando de --esperar-verde», o que lo tome del `--gate` por defecto.
