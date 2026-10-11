import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/**
 * S7 (ADR 018): el cliente de Sentry se inicia con `@sentry/browser` en vez de `@sentry/nextjs`
 * (el `init` de Next suma ≈ 50 KB gzip de trazado e instrumentación del router a la portada, y el
 * script de "/" pasó el budget de 300 KB en la CI). Dos cosas lo sostienen:
 *
 * 1. **La misma versión.** Sentry guarda su estado global por versión. `src/lib/observability.ts`
 *    reporta con `@sentry/nextjs` (lo comparte con el route del servidor), que en el navegador
 *    delega en su propio `@sentry/browser`. Si el `@sentry/browser` directo se separa de esa
 *    versión, los `captureMessage` y `addBreadcrumb` caen en una instancia SIN cliente y se
 *    pierden en silencio. Se mira el lockfile, que es lo que instala la CI.
 * 2. **El `init` no vuelve a `@sentry/nextjs`.** Con el DSN vacío del `.env.local` de desarrollo,
 *    Next incrusta `""` y el minificador borra el `init` entero: el build LOCAL no ve este peso,
 *    solo la CI (sin la variable, el `init` queda). Esta prueba lo ve en `quality`.
 *
 * Nació en rojo (regla 11, `scripts/demo-rojo.sh`): la versión mutada en el lockfile y el import
 * devuelto a `@sentry/nextjs`.
 */
type Importer = {
  dependencies?: Record<string, { specifier: string; version: string }>;
};
const lock = parse(readFileSync("pnpm-lock.yaml", "utf8")) as {
  importers: Record<string, Importer>;
};
const deps = lock.importers["."]?.dependencies ?? {};
/** «10.75.3(@opentelemetry/…)» → «10.75.3». */
const bare = (version: string | undefined) => version?.split("(")[0];

describe("Sentry en el cliente: @sentry/browser a la par de @sentry/nextjs", () => {
  it("el lockfile instala @sentry/browser en la MISMA versión que @sentry/nextjs", () => {
    const browser = bare(deps["@sentry/browser"]?.version);
    const nextjs = bare(deps["@sentry/nextjs"]?.version);
    expect(nextjs, "@sentry/nextjs no está en el lockfile").toBeTruthy();
    expect(
      browser,
      `@sentry/browser ${browser} ≠ @sentry/nextjs ${nextjs}: los reportes de observability.ts caerían en otra instancia`,
    ).toBe(nextjs);
  });

  it("instrumentation-client.ts inicia con @sentry/browser y no importa @sentry/nextjs", () => {
    const source = readFileSync("instrumentation-client.ts", "utf8");
    expect(source).toMatch(/from "@sentry\/browser"/);
    expect(
      source,
      "instrumentation-client.ts importa @sentry/nextjs: su init vuelve a sumar ≈ 50 KB gzip a la portada",
    ).not.toMatch(/["']@sentry\/nextjs["']/);
  });
});
