# ADR 018 — Lighter landing: lazy screens and a client Sentry started with `@sentry/browser`

- **Status:** accepted
- **Date:** 2026-10-05
- **Sprint:** 007 «Agrupar y multiclase» (risk R15 of the plan; user decision 7 of the F0 STOP)

## Context

The `lighthouse` CI job asserts `perf-budget.json` on `/`. After the sixth commit of Sprint 007
(clustering in the app, `6534cc2`, run 37255735608), `resource-summary.script.size` on `/` measured
**321,841 B** in all three runs, against a budget of **307,200 B** (300 KB). The job went red, and
because the step runs with `bash -e`, the category assertion and `lighthouse-margen` did not run.

Two causes, measured on a clean `git archive` copy built without `.env.local`. That copy matched CI
to the byte (321,841 B):

1. **Every screen shipped with the landing.** `src/app/page.tsx` imported the configuration,
   training, results and scoring screens statically, although `/` only draws the start screen. With
   the multiclass and clustering screens inside, that chunk weighed ≈ 48.6 KB gzip, and Lighthouse
   flagged 43 KB of it as unused.
2. **The client `init` of `@sentry/nextjs` is heavy.** By default it adds browser tracing and the
   Next router instrumentation, including the Pages Router code. With `tracesSampleRate: 0` none of
   this sends anything, and it cost ≈ 50 KB gzip on `/`. Importing only `init` from
   `@sentry/nextjs` saves nothing: the weight is the `init` itself.

**Why local builds never saw it.** The developer `.env.local` declares
`NEXT_PUBLIC_SENTRY_DSN` with an **empty** value. Next inlines `""`, the minifier deletes the whole
`if (dsn) { … }`, and Sentry leaves the client bundle. In CI the variable does not exist, so it
stays a runtime lookup and the `init` ships. Local measurements of script weight and simulated LCP
made with that `.env.local` are therefore ≈ 70 KB too optimistic.

## Decision

1. **Lazy screens.** `ConfigScreen`, `TrainingScreen`, `ResultsScreen` and `ScoreScreen` load with
   `next/dynamic` (`ssr: false`) when their phase arrives. This is the same pattern as the model
   card dialog (`FichaButton`, S5/R12). `StartScreen` and `ErrorScreen` stay static.
2. **Client Sentry via `@sentry/browser`.** `instrumentation-client.ts` calls `init` from
   `@sentry/browser`, a new direct dependency at **the same version** that `@sentry/nextjs` bundles
   (10.75.3 today). Nothing else changes:
   - privacy is untouched: the same `scrubSentryEvent`, no PII, no tracing, no replay;
   - the `environment` that the Next `init` used to derive is kept (`vercel-<env>`, otherwise
     `NODE_ENV`);
   - `onRouterTransitionStart` is dropped, because it only feeds tracing, which is off;
   - `src/lib/observability.ts` keeps `@sentry/nextjs`, because the server route shares it.
     Measured: moving it to `@sentry/core` saves 0 B.
3. **The coupling has a gate.** Sentry keeps its global state per version. If the direct
   `@sentry/browser` drifted from the version inside `@sentry/nextjs`, the `captureMessage` and
   `addBreadcrumb` calls of `observability.ts` would land in an instance without a client and vanish
   silently. `tests/unit/sentry-cliente.test.ts` checks two things in `quality`: the two versions in
   the lockfile match, and `instrumentation-client.ts` does not mention `@sentry/nextjs`. That
   second check matters because, with the empty local DSN, local builds are blind to that weight.
   Both checks were born red with `scripts/demo-rojo.sh`. Both packages use the `^` specifier, so
   the grouped dependabot batch moves them together.

## Measurement (clean copy, LHCI 0.15.1, 3 runs, median)

| State                                 | Script on `/` | LCP (simulated) | LCP margin vs 3,500 ms |
| ------------------------------------- | ------------: | --------------: | ---------------------: |
| `6534cc2` (as CI)                     |     321,841 B |        3,243 ms |                  7.3 % |
| + lazy screens                        |     302,498 B |        3,242 ms |                  7.4 % |
| + client Sentry via `@sentry/browser` |     252,708 B |        3,073 ms |                 12.2 % |

The **observed** LCP on localhost equals the observed FCP (38–57 ms). The simulated 3 s is the
Lantern artefact that the Sprint 004 note in `ci.yml` already describes: the simulation charges all
script evaluation that happened before the first paint to the LCP paragraph. That is why fewer
script bytes lower it.

## Consequences

- `/` loads ≈ 69 KB less script. The screens arrive in their own chunks on first use (a local fetch,
  not perceptible on the e2e runs).
- Script weight and LCP are measured on a clean `git archive` copy, never on the working repo, until
  the local `.env.local` stops declaring an empty public DSN.
- Lost from the Next `init`: the SDK name tag (`nextjs`), stack frame normalisation of Next asset
  paths (no source maps are uploaded, so it only touched frame names), and the `NEXT_REDIRECT`
  filter (the client never redirects).
