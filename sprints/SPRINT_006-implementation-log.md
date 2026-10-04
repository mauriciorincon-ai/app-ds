# Sprint 006 — Bitácora de implementación («Estimar» · ciclo H2, sprint 2 de 3)

Branch: `sprint-006/estimar` · Orden: `portafolio/ds/ordenes/SPRINT_006-orden.md` · Plan:
`portafolio/ds/sprints/SPRINT_006.md`. El usuario aprobó el plan de ejecución el 2026-10-03
(plan mode) y dio el «construye» ese mismo día, con Opus 5.5 y el modelo ya fijado.

La app aprende la **segunda tarea: estimar una cantidad**. Hasta ahora, un objetivo numérico mostraba
«predicción de una cantidad: llega en una próxima versión». Al cerrar el sprint, ese objetivo entrena
la liga de regresión con la mecánica del S5:

- validación cruzada dentro de train;
- regla de un error estándar;
- la prueba se abre una sola vez;
- encarriladores por costo;
- honestidad que etiqueta.

El veredicto se lee en las unidades del objetivo. Cero IA nueva. **Condición dura: la liga binaria
no se rompe.**

## Desviación del plan

Quedaron registradas al aprobarse el plan (2026-10-03). La planeadora las lee aquí; no se escribe en
ella.

- **D1 · Numeración de ADRs.** El plan de la planeadora numeraba 012 y 013 para los dos ADRs de
  regresión. Pero la excepción de `braces` (kit v1.34.0) también necesita su ADR, y ese ocupa el 012.
  Quedan así: **012** = excepción de `braces` · **013** = regresión como segunda tarea · **014** =
  manifiesto por tarea.
- **D2 · «Ambigua → clases» en el S6.** La aceptación 3 dice que «las dos respuestas llevan a
  entrenar la tarea correcta», pero multiclase llega en el S7.
  - «Cantidad» entrena la regresión.
  - «Clases» lleva a la tarjeta de multiclase, que dice con franqueza que esa tarea llega en una
    próxima versión.

  Las dos respuestas enrutan a su tarea correcta; hoy solo entrena una.

## Fase 0 — delta del kit + deuda del S5 + spike de regresores

### Delta del kit v1.33.0 → v1.35.0 (por nombre)

| Ítem del kit                                         | Qué se hizo                                                                                                                                                                                                                                                                                                                                                                                                                        | Rojo demostrado (siempre con `scripts/demo-rojo.sh`)                                                                                                                                                            |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v1.34.0 · excepción de auditoría con ADR             | `braces` sigue **sin parche** (`first_patched_version: null`; 3.0.3 es la última en npm; verificado el 2026-10-03). Se escribió el **ADR 012**: id, razón, fecha y condición de retiro. El comentario de `pnpm-workspace.yaml` ahora apunta al ADR. **Gate nuevo** (no estaba en el plan, se suma): `tests/unit/audit-exceptions.test.ts` falla si un id de `ignoreGhsas` no tiene un ADR que lo nombre con su condición de retiro | Mutación en `pnpm-workspace.yaml`: `GHSA-vfj7-8cjw-p6xm` → `GHSA-2222-3333-4444`. Resultado: «advisories ignoradas sin ADR: GHSA-2222-3333-4444», 1 de 2 en rojo. Al restaurar, 2 de 2 en verde                 |
| v1.35.0 · `scripts/demo-rojo.sh`                     | Estampado en 100755. `.demo-rojo/` agregado a `.gitignore`                                                                                                                                                                                                                                                                                                                                                                         | Su propia demo: una mutación en un comentario de `verificar-dependencias.mjs`, que el gate no ve. Resultado: «✗ EL GATE PASÓ CON LA MUTACIÓN — no es una demo en rojo», exit 1. Restaurado (0 rastros)          |
| v1.35.0 · `verificar-dependencias.mjs` falla cerrado | Reemplazado por el del kit. Antes solo fallaba cerrado en CI; en local, una base ilegible «se omitía» en verde                                                                                                                                                                                                                                                                                                                     | Mutación del default `origin/main` → `origin/rama-que-no-existe`. Resultado: «✗ no puedo leer la rama base…», exit 1. Al restaurar: «675 paquetes, ninguno por debajo de origin/main»                           |
| v1.35.0 · PreToolUse de gitleaks avisa               | `.claude/settings.json` del kit. Test nuevo en `tests/integration/gitleaks-hook.test.ts`: con un PATH sin gitleaks (`/usr/bin:/bin`), el hook sale con 0 y escribe «AVISO kit B-8» en stderr                                                                                                                                                                                                                                       | Mutación: quitar el bloque del aviso (el hook de v1.32.1). Resultado: «expected '' to match /AVISO kit B-8/». Al restaurar, 8 de 8                                                                              |
| v1.35.0 · comandos                                   | Re-estampados `audita-sprint.md` (copy por la casilla 4, orden de pago, casilla 7) y `deploy-check.md` (§9 repara el homepage). `README.md` de comandos nuevo, con `/release-check` marcado «no se estampa: perfil WEB». Cabecera de `dependabot.yml` al día                                                                                                                                                                       | Son comandos, no gates                                                                                                                                                                                          |
| Deuda del S5 · `lighthouse-categorias.json`          | Estampado. Segundo paso del job `lighthouse`: `lhci assert --config=./lighthouse-categorias.json --aggregationMethod=median-run` sobre la misma colección. El job no cambia de nombre                                                                                                                                                                                                                                              | Mutación: `categories:accessibility` con `minScore` 0.9 → 1.01. Resultado: «categories.accessibility failure for minScore assertion · expected ≥1.01 · found 1», exit 1. Al restaurar: «All results processed!» |

### Lighthouse por categorías: la primera medición pagó un defecto real

Build de producción, `lhci collect` × 3 sobre `/`:

| Momento          | Rendimiento        | Accesibilidad | Buenas prácticas | SEO | LCP (3 corridas)         |
| ---------------- | ------------------ | ------------- | ---------------- | --- | ------------------------ |
| Antes del pago   | 0,99 · 0,99 · 0,94 | **0,95**      | 1                | 1   | 1.582 · 1.594 · 2.841 ms |
| Después del pago | 0,97 × 3           | **1**         | 1                | 1   | 2.638 · 2.617 · 2.651 ms |

Las cuatro categorías ya pasaban 0,9, pero la auditoría `label` de accesibilidad estaba en 0.

**El defecto:** había tres `<input type="file" class="sr-only">` sin nombre accesible: dos en
`StartScreen` y uno en `ScoreScreen`. Se podían alcanzar con Tab, así que eran una parada «muda» del
teclado, duplicada con el botón visible.

**El pago:** `tabIndex={-1}` + `aria-hidden` en los tres. El control real es el botón visible; el
input queda solo como mecanismo del navegador. Los e2e usan `setInputFiles` con selector de
atributo, así que no cambian.

**Por qué se escapó:** ningún e2e pasaba axe por **Inicio vacío**. El primer escaneo de cada spec
ocurre después de cargar datos.

**Gate nuevo:** `happy-path.spec.ts` › «Inicio vacío pasa axe en ambos temas».

- **Rojo** (`demo-rojo.sh --puerto 3000`): se quitó `tabIndex={-1}` + `aria-hidden` del input CSV
  de `StartScreen`. Resultado: violación **`label`**, 1 en rojo (desktop-chromium). Al restaurar, 1
  en verde.
- **Hallazgo al nacer:** en tema oscuro, axe informaba `color-contrast` sobre `text-ink-muted` dentro
  de los contenedores con `transition-colors`. Era **transitorio**: axe medía a mitad del fundido de
  150 ms que dispara el cambio de tema, con el texto del tema nuevo sobre el fondo del viejo.
  `axeBothThemes` (`tests/e2e/axe-temas.ts`) ahora espera a que `document.getAnimations()` no tenga
  nada corriendo antes de medir. Con eso, 2 de 2 en verde, en móvil y en escritorio.

### Dependabot #15: Pyodide se retiene (decisión del usuario, 2026-10-04)

El lote `todo-npm` (#15: react 19.2.4 → 19.3.0, react-dom igual, **pyodide 314.0.2 → 314.0.7**)
quedó en rojo en `integration`:

> «RUNTIME_VERSIONS (TS) coincide con el runtime real — expected '314.0.7' to be '314.0.2'»

Es el gate funcionando.

- El build copia Pyodide desde `node_modules`, así que el navegador habría corrido 314.0.7.
- Cada modelo exportado habría seguido declarando 314.0.2.
- Esa versión gobierna el aviso de versiones al importar. Por eso el S4 la fijó con pin exacto: se
  mueve por decisión.

El usuario eligió **retener Pyodide** (opción recomendada):

- El #15 se cerró con un comentario que explica el motivo.
- `.github/dependabot.yml` ahora ignora `pyodide` en todos los tipos de actualización (toma efecto
  cuando este PR llegue a `main`). React 19.3 vuelve sola en el próximo lote.
- Pyodide se sube a propósito en el cierre del ciclo H2, con el runtime re-medido.
- El #14 (GitHub Actions) estaba en verde, 6 de 6: lo mergea el usuario.

**Gate nuevo:** `tests/unit/runtime-pin.test.ts` corre en `quality` y no necesita runtime. Vigila tres
cosas: pin exacto en `package.json` · `RUNTIME_VERSIONS.pyodide` igual al pin · `ignore` de Pyodide
en dependabot. Dos rojos, ambos con `demo-rojo.sh`:

| Mutación                                                      | Qué dijo el fallo                                                                                   |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `package.json`: `"pyodide": "314.0.2"` → `"314.0.7"` (el #15) | «package.json pide pyodide 314.0.7 pero los modelos exportados declararían 314.0.2», 1 de 3 en rojo |
| `dependabot.yml`: quitar `- dependency-name: "pyodide"`       | «falta el ignore de pyodide en .github/dependabot.yml», 1 de 3 en rojo                              |

En los dos casos, al restaurar volvió a 3 de 3 en verde. Antes, este cruce solo lo atrapaba
`integration`, con Pyodide real y minutos después.

## Fricciones del kit (SEPARADAS del producto)

- **K-S6-1 · `README.md` dentro de `.claude/commands/` se carga como un comando `/README`.** El kit
  v1.35.0 lo estampa ahí, y Claude Code lo lista como skill invocable («README: Slash Commands — Kit
  General»). No rompe nada, pero ensucia la lista de comandos. Propuesta: moverlo a
  `.claude/COMMANDS.md`, o documentarlo en el README del kit.
- **K-S6-2 · `demo-rojo.sh` con `--buscar` de varias líneas.** El `grep -F` de la verificación
  interpreta cada línea como un patrón aparte (OR). La comprobación «la mutación ya no está» se
  debilita; la que sostiene la garantía es el `cmp`. Usado aquí con tres líneas en `StartScreen.tsx`
  sin daño. Propuesta: verificar la ausencia con Python (`in`), igual que la mutación.
