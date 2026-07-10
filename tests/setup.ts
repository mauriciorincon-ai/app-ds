// Setup global de Vitest (referenciado por vitest.config.ts).
// Matchers de Testing Library (toBeInTheDocument, toHaveAccessibleName, ...).
import "@testing-library/jest-dom/vitest";

// Sin `globals: true` en la config, Testing Library NO registra su auto-cleanup
// y los renders se acumulan entre tests (matches duplicados) — se registra a mano.
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());
