# kit-app — CHANGELOG

> Las apps ya estampadas NO se actualizan solas: el delta relevante se anota en la orden de
> construcción de su siguiente sprint.

## v1.2.0 — 2026-07-07 (G-Metodo del cierre S1 nutri-kids: paga las fricciones K1–K6)

Fuente: `sprints/SPRINT_001-summary.md` de app-nutri-kids (el kit requirió cirugía DENTRO del
sprint aunque el estampado ya era limpio). Aprobado por el usuario 2026-07-07 —
detalle en `entrega/2026-07-07-propuesta-gmetodo-batch-s1-nutri-kids.md`.

- **`vitest.config.ts` + `playwright.config.ts` + `tests/setup.ts` (nuevos, K1):** los configs
  que `ci.yml` siempre asumió, con el patrón validado en nutri-kids (jsdom + coverage v8 piso 70;
  e2e móvil Pixel + desktop; webServer `pnpm build && pnpm start` bajo CI).
- **`lighthouse-urls.json` (nuevo) + ci.yml (K3):** el job Lighthouse audita la lista de URLs del
  archivo (default `["/"]`); cada sprint añade sus rutas. Nota Lantern documentada en el workflow
  (LCP simulado castiga SPAs sanas: 3.8s simulado vs 242ms observado).
- **`next.config.ts` (nuevo, K6):** `devIndicators: false` — el indicador de dev tapa la nav
  inferior móvil e intercepta taps en e2e.
- **CLAUDE.md § Stack:** IA embebida = **adapter multi-proveedor** (proveedor por ADR de cada
  app) — alineado con el principio LLM-agnóstico del pipeline.
- **CLAUDE.md regla 10 + skills:** **Claude Design pasa a BAJO DEMANDA** (2 apps seguidas
  validaron design-system.md del builder + gate visual sobre preview). `repo-app.md`: patrones
  confirmados (useSyncExternalStore para localStorage↔React; overlays de primer uso estáticos;
  devIndicators). `observability.md`: aclaración honesta — **el kit NO trae Sentry cableado**
  (K2/K5); se cablea en el S1 de cada app con el patrón de nutri-kids; se promoverá al kit a la
  3ª validación.
- **estampar-app.ps1 (K4):** el commit inicial lee la versión real del CHANGELOG.

## v1.1.5 — 2026-07-06 (limpieza final del estampado #2)

- **`--skip-install` en create-next-app:** su install interno corría ANTES de que el script
  escribiera `allowBuilds` y abortaba en rojo (`ERR_PNPM_IGNORED_BUILDS` + "Aborting
  installation") — inofensivo pero alarmante. Ahora el único install es el del paso 2, ya
  configurado. El próximo estampado debe correr de punta a punta **sin ningún rojo**.

## v1.1.4 — 2026-07-06 (hotfix #4: el kit se mordía la cola con gitleaks)

- **`security-owasp.md` línea ~116:** el ejemplo didáctico de "nunca hardcodear" traía una clave
  con pinta real (`sk-proj-abc123...`) y el **hook pre-commit de gitleaks del propio kit la
  bloqueó** en el commit inicial del estampado #2 (regla `generic-api-key`, entropía 3.69).
  Ejemplo neutralizado a placeholder sin entropía + comentario del porqué. Validación positiva
  doble: el hook `githooks/pre-commit` (nuevo en v1.1.0) **funciona en commits reales**, y el
  `Check` de v1.1.2 volvió a detener el script en el paso exacto.

## v1.1.3 — 2026-07-06 (hotfix #3: pnpm 11 cambió el mecanismo de builds nativos)

- **`allowBuilds` (pnpm 11) además de `onlyBuiltDependencies` (pnpm 10):** pnpm 11 ya no lee la
  lista `onlyBuiltDependencies`; usa el mapa `allowBuilds: {pkg: true}` y **aborta el install**
  (`ERR_PNPM_IGNORED_BUILDS` fatal) si un build nativo no está aprobado, dejando un stub
  "set this to true or false" en el yaml. El script escribe ahora AMBOS formatos (cada versión
  ignora el ajeno) y añade `@tailwindcss/oxide` (Tailwind 4 compila nativo).
- Validación en vivo del `Check` de v1.1.2: el script se detuvo honesto en
  `FALLO: pnpm install (exit 1)` — el patrón de exit codes funcionó a la primera.

## v1.1.2 — 2026-07-06 (hotfix #2 del estampado de nutri-kids — 3 bugs más)

Detectados al correr el script v1.1.1 en la máquina del usuario (el estampado llegó al final
imprimiendo "OK" con el repo git y el remoto ROTOS):

- **Escrituras sin BOM (`EscribirSinBom`):** `Set-Content -Encoding utf8` en PS 5.1 escribe BOM;
  el BOM rompía `pnpm-workspace.yaml` (pnpm ignoró los builds nativos → `ERR_PNPM_IGNORED_BUILDS`),
  `package.json` ("Invalid package.json" de pnpm) y el JSON de la ruleset. Las 3 escrituras
  ahora usan `[IO.File]::WriteAllText` con `UTF8Encoding($false)`.
- **`git init` explícito e idempotente:** el script asumía que create-next-app inicializa git;
  en la máquina real no lo hizo → 4 `fatal: not a git repository`, sin commit inicial, y el
  `gh repo create --source --push` falló en cadena.
- **`Check` de exit codes tras cada comando nativo crítico** (scaffold, installs, git, gh):
  los comandos nativos no disparan `$ErrorActionPreference=Stop`, así que el script imprimía
  "OK repo creado y push hecho" y "OK ruleset activa" sobre pasos fallidos. Ahora un fallo
  detiene el script con el paso exacto.

## v1.1.1 — 2026-07-06 (hotfix del estampado #2, nutri-kids)

- **estampar-app.ps1 — fix de encoding (bug bloqueante):** el script estaba guardado como
  UTF-8 **sin BOM** y con finales **LF**; Windows PowerShell 5.1 lee los `.ps1` sin BOM como
  ANSI, el "—" (em-dash, multibyte) se degradaba a mojibake que incluye una **comilla
  tipográfica** (0x94), PowerShell la trata como comilla real → el parseo del archivo completo
  reventaba (11 errores) y el estampado nunca arrancaba. Fix mecánico, cero cambios de texto:
  re-guardado **UTF-8 CON BOM + CRLF** (validado: 0 errores de parseo).
- **`.gitattributes` nuevo en la raíz de la planeadora:** `*.ps1 text eol=crlf` (evita que git
  o un editor degrade los scripts de vuelta a LF). Regla derivada para todo el pipeline:
  **scripts `.ps1` con caracteres no-ASCII se guardan siempre UTF-8 con BOM** — o se escriben
  100% ASCII.

## v1.1.0 — 2026-07-05 (G-Metodo: batch post-SPRINT_001 de hoja-de-vida)

Fuente: 9 hallazgos del estampado #1 + la CI real del primer sprint
(`memoria/patrones-acumulados.md` de la planeadora).

- **ci.yml:** pnpm 9 → **11** y Node 20 → **22** en los 3 jobs (el scaffold estampa pnpm 11;
  pnpm 11 exige Node ≥22.13).
- **perf-budget.json:** eliminada la propiedad `_comment` (Lighthouse CI rechaza el archivo);
  `interactive` (TTI, deprecada) → `total-blocking-time ≤300ms`; LCP 2500 → 3000ms (efecto
  font-swap documentado en README §Reglas).
- **githooks/pre-commit** (nuevo): gitleaks bloquea commits manuales con secretos — antes solo
  las escrituras de Claude estaban protegidas (hook PreToolUse).
- **estampar-app.ps1** (nuevo, aprobado G-Metodo 2026-07-04): estampado semi-automático
  completo; criterio de aceptación: app recién estampada pasa CI verde en su primer PR.
  Incorpora: scaffold ANTES del kit, `--src-dir`, builds nativos pre-aprobados
  (`pnpm-workspace.yaml`), scripts `typecheck`/`test`/`test:e2e` con `--passWithNoTests`,
  CLAUDE.md desde `ordenes/CLAUDE-md-para-app.md`, ruleset `main-protegida` por API.
- **Sin `ai`/`@ai-sdk/<proveedor>` en el estampado:** el proveedor LLM se decide por ADR en el
  sprint que active IA.
- **README:** bloque de estampado reescrito alrededor del script; reglas nuevas (Lighthouse
  local orientativo; budget y font-swap).
- **CLAUDE.md:** regla 7 actualizada (doble cinturón gitleaks).

## v1.0.0 — 2026-07-02

Versión inicial (migración Cowork→Code): CLAUDE.md, skills, commands, settings con hooks,
ci.yml, perf-budget.json, MANUAL-DE-USO, gitignore.plantilla.
