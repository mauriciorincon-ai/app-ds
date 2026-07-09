---
name: testing-patterns
description: Patrones de testing aplicables a las apps del pipeline (unit, integration, e2e). Invocar cuando Claude Code necesite escribir tests, refactorizar tests existentes, o decidir qué tipo de test aplica a un módulo nuevo.
---

# Testing Patterns — Kit General

Patrones de testing que aplican a las 8 apps del pipeline. Alineado con el non-negotiable #1 de los estándares del pipeline (CLAUDE.md § Estándares).

## Decisión rápida: qué tipo de test escribir

| Tipo de código | Test recomendado | Herramienta |
|---|---|---|
| Motor matemático/lógica pura | Unit (cobertura >80%) | Vitest |
| Hook de React | Unit + integration | Vitest + Testing Library |
| Componente UI con lógica | Integration | Testing Library + jsdom |
| Flujo multi-componente | Integration | Testing Library + MSW para APIs |
| Flujo completo con DB/API real | E2E | Playwright |
| API route / Server Action | Integration | Vitest + supertest o fetch directo |

## Patrón: motor puro testeable

Los motores de dominio (Gestalt en Power BI, Decision Boundary en DS, Monte Carlo en Financiera, etc.) deben ser **funciones puras**: mismo input → mismo output, sin side-effects.

**Ejemplo (Power BI Gestalt):**

```typescript
// src/engine/gestalt.ts
export type Visual = {
  id: string;
  type: 'card' | 'chart' | 'table';
  priority: number;
  preferredSize?: { w: number; h: number };
};

export type Layout = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export function computeLayout(
  visuals: Visual[],
  canvas: { width: number; height: number }
): Layout[] {
  // función pura: sin DOM, sin storage, sin fetch
  // ...
}
```

```typescript
// tests/unit/gestalt.test.ts
import { describe, it, expect } from 'vitest';
import { computeLayout } from '@/engine/gestalt';

describe('computeLayout', () => {
  it('distribuye 4 visuals en grid 2x2 dentro del canvas', () => {
    const visuals = [/* ... */];
    const layout = computeLayout(visuals, { width: 1280, height: 720 });
    expect(layout).toHaveLength(4);
    expect(layout[0].x + layout[0].w).toBeLessThanOrEqual(1280);
  });

  it('prioriza visuals con priority mayor en posiciones superiores', () => {/* ... */});

  it('respeta preferredSize cuando hay espacio', () => {/* ... */});

  it('es determinista: mismo input produce mismo output', () => {
    const visuals = [/* ... */];
    const a = computeLayout(visuals, { width: 1280, height: 720 });
    const b = computeLayout(visuals, { width: 1280, height: 720 });
    expect(a).toEqual(b);
  });
});
```

## Patrón: integration de componente con datos

```typescript
// tests/integration/dashboard.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dashboard } from '@/components/Dashboard';

it('renderiza visuals y permite reorganizar con drag-and-drop', async () => {
  const user = userEvent.setup();
  render(<Dashboard visuals={fixtures.visuals} />);

  expect(screen.getAllByRole('article')).toHaveLength(4);

  const firstCard = screen.getByTestId('visual-card-1');
  const target = screen.getByTestId('drop-zone-3');
  await user.pointer([
    { keys: '[MouseLeft>]', target: firstCard },
    { coords: { x: target.offsetLeft, y: target.offsetTop } },
    { keys: '[/MouseLeft]' }
  ]);

  // assert: el estado cambió
});
```

## Patrón: e2e del happy path

```typescript
// tests/e2e/dashboard-creation.spec.ts
import { test, expect } from '@playwright/test';

test('usuario crea un dashboard desde CSV y lo exporta', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Subir CSV' }).click();
  await page.setInputFiles('input[type=file]', 'tests/fixtures/sales.csv');
  await expect(page.getByRole('heading', { name: 'Dashboard generado' })).toBeVisible();

  await page.getByRole('button', { name: 'Exportar JSON' }).click();
  const download = await page.waitForEvent('download');
  expect(download.suggestedFilename()).toMatch(/\.json$/);
});
```

## Reglas anti-flakiness

1. **No `sleep`/`setTimeout` arbitrario.** Usa `waitFor`, `findBy`, `expect.toBeVisible()` con polling.
2. **Selectores resilientes:** `getByRole`, `getByLabelText`, `getByTestId`. Evita `getByText` para texto que cambia.
3. **Fixtures deterministas:** datos de prueba versionados en `tests/fixtures/`.
4. **Aislamiento:** cada test crea su propio estado, no depende de otros tests.
5. **Semilla de aleatoriedad:** si usas `faker`, fija la seed: `faker.seed(123)`.

## Qué NO testear

- **Código generado** (types de TS, rutas de Next.js, componentes de shadcn sin customizar).
- **Libraries de terceros.** Confía en que React funciona.
- **Triviales:** getters/setters simples, mapeos 1:1.

## Cobertura

- **Motores puros / utils:** >80% (línea y rama).
- **Hooks y componentes con lógica:** >60%.
- **UI pura (solo markup):** no obligatorio testear.
- **Total del app:** >70%.

Configurar en `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 70,
        branches: 70,
        functions: 70,
        statements: 70
      },
      exclude: ['**/*.config.*', '**/types/**', '.next/**']
    }
  }
});
```

## CI integration

Los tests corren en cada push/PR. Ver skill `repo-app` para detalle de pipelines.
