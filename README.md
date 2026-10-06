# Probeta DS

**Ciencia de datos honesta, de principio a fin.** · _Honest data science, end to end._

[Español](#español) · [English](#english)

## Español

Probeta DS lleva a profesionales que no son científicos de datos por el ciclo completo: cargar un CSV,
limpiarlo, entenderlo, modelar, comprobar y publicar. Sirve para clasificar en dos o en varias
categorías, estimar una cantidad o agrupar filas parecidas sin objetivo. La honestidad es automática:
la selección del modelo vive en validación cruzada dentro de entrenamiento, la prueba se abre una sola
vez, cada resultado se compara con un baseline y una posible fuga de datos se nombra.

**Tus datos no salen de tu navegador.** El cómputo (pandas y scikit-learn en WebAssembly, con Pyodide)
corre en un Web Worker de tu equipo. Ningún servidor recibe el dataset, y los registros de errores solo
llevan metadatos (cuántas filas y columnas), nunca valores ni nombres de columnas.

### Correrla en tu equipo

```bash
pnpm install          # también activa los hooks de git (gitleaks)
pnpm dev              # copia los assets de Pyodide y arranca en http://localhost:3000
```

| Comando                  | Qué hace                                                                 |
| ------------------------ | ------------------------------------------------------------------------ |
| `pnpm lint`              | ESLint                                                                   |
| `pnpm typecheck`         | TypeScript estricto                                                      |
| `pnpm test`              | Pruebas unitarias con cobertura (Vitest)                                 |
| `pnpm test:integration`  | Pruebas con el runtime Pyodide real                                      |
| `pnpm test:e2e`          | Pruebas de punta a punta (Playwright) sobre el build de producción       |
| `pnpm verificar:retiros` | Dice si una excepción de `pnpm audit` ya tiene parche (y debe retirarse) |

### Dónde está cada cosa

- [`docs/MANUAL-DE-USO.md`](docs/MANUAL-DE-USO.md): el manual, en español llano.
- [`docs/GUIA-DE-PRUEBA.html`](docs/GUIA-DE-PRUEBA.html): la guía de prueba acumulativa.
- [`docs/BROCHURE.html`](docs/BROCHURE.html): la presentación de la app.
- [`docs/BLUEPRINT.html`](docs/BLUEPRINT.html): la infraestructura tal como está construida.
- [`design-system.md`](design-system.md): la fuente de verdad visual.
- [`decisions/`](decisions/): las decisiones de arquitectura (ADR).
- [`sprints/`](sprints/): la bitácora, la auditoría y el resumen de cada sprint. La historia de la app
  vive ahí y en el historial de git; el `CHANGELOG` del kit con que se estampó el repo no aplica a la
  app y no se mantiene aquí.

## English

Probeta DS walks professionals who are not data scientists through the whole cycle: load a CSV,
clean it, understand it, model, check and publish. It classifies into two or several categories,
estimates a quantity, or groups similar rows without a target. Honesty is automatic: model selection
lives in cross-validation inside the training set, the test set is opened once, every result is
compared against a baseline, and a possible data leak is named.

**Your data never leaves your browser.** The computation (pandas and scikit-learn in WebAssembly,
through Pyodide) runs in a Web Worker on your machine. No server receives the dataset, and error
reports carry metadata only (how many rows and columns), never values or column names.

### Running it locally

```bash
pnpm install          # also enables the git hooks (gitleaks)
pnpm dev              # copies the Pyodide assets and starts on http://localhost:3000
```

| Command                  | What it does                                                            |
| ------------------------ | ----------------------------------------------------------------------- |
| `pnpm lint`              | ESLint                                                                  |
| `pnpm typecheck`         | Strict TypeScript                                                       |
| `pnpm test`              | Unit tests with coverage (Vitest)                                       |
| `pnpm test:integration`  | Tests against the real Pyodide runtime                                  |
| `pnpm test:e2e`          | End-to-end tests (Playwright) on the production build                   |
| `pnpm verificar:retiros` | Says whether a `pnpm audit` exception has a patch (and must be retired) |

### Where things are

- [`docs/MANUAL-DE-USO.md`](docs/MANUAL-DE-USO.md): the user manual (in Spanish).
- [`docs/GUIA-DE-PRUEBA.html`](docs/GUIA-DE-PRUEBA.html): the cumulative test guide.
- [`docs/BROCHURE.html`](docs/BROCHURE.html): the app's presentation page.
- [`docs/BLUEPRINT.html`](docs/BLUEPRINT.html): the infrastructure as built.
- [`design-system.md`](design-system.md): the visual source of truth.
- [`decisions/`](decisions/): architecture decision records (ADRs).
- [`sprints/`](sprints/): each sprint's log, audit and summary. The app's history lives there and in
  the git log; the `CHANGELOG` of the kit this repo was stamped from does not apply to the app and is
  not kept here.
