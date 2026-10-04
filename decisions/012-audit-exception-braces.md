# ADR 012 — Audit exception: `braces` (GHSA-vfj7-8cjw-p6xm), no patch published

- **Status:** accepted (kit v1.34.0 rule: an audit exception lives in an ADR or it does not exist)
- **Date:** 2026-10-03 (the exception itself was accepted «by name» in Sprint 005 on 2026-10-02 and
  recorded as explicit debt in `sprints/SPRINT_005-summary.md`; this ADR formalises it)
- **Sprint:** 006 «Estimar»

## Context

The `quality` CI job runs `pnpm audit --audit-level high`. On 2026-09-18 GitHub published
**GHSA-vfj7-8cjw-p6xm / CVE-2026-93687** (severity high): `braces` ≤ 3.0.3 overflows the stack on
nested brace patterns controlled by an attacker (denial of service).

- **No patched version exists.** Verified again on 2026-10-03: the advisory lists
  `first_patched_version: null` (last updated 2026-10-02) and the latest `braces` on npm is 3.0.3.
  A bump cannot fix it and an override has nothing to point to.
- **It only reaches the development toolchain:** `eslint-config-next` → `@next/eslint-plugin-next`
  → `fast-glob` → `micromatch` → `braces` (`pnpm why braces`). It runs during `pnpm lint`, over the
  fixed glob patterns of this repository. No user input ever reaches it, and `pnpm audit --prod` is
  clean, so it does not ship in the bundle.

## Decision

`pnpm-workspace.yaml` ignores **exactly one** advisory, by id:

```yaml
auditConfig:
  ignoreGhsas:
    - GHSA-vfj7-8cjw-p6xm
```

| Field             | Value                                                                                                                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advisory id       | GHSA-vfj7-8cjw-p6xm (CVE-2026-93687)                                                                                                                                                                     |
| Reason            | No patched `braces` version is published. The package is reached only by the lint toolchain, over fixed globs. It is not in the production bundle (`pnpm audit --prod` is clean)                         |
| Date              | Accepted 2026-10-02 (Sprint 005), formalised 2026-10-03 (Sprint 006)                                                                                                                                     |
| Removal condition | **As soon as `braces` ≥ 3.0.4 (or any patched version) is published:** `pnpm update`, delete the id from `ignoreGhsas`, and mark this ADR superseded. Also removed if the chain no longer pulls `braces` |

The audit level stays `high`. Any **other** high or critical advisory still turns `quality` red. That
was demonstrated in Sprint 005, and the invariant below keeps it true.

## Guard

`tests/unit/audit-exceptions.test.ts` reads `pnpm-workspace.yaml` and fails if any id in
`auditConfig.ignoreGhsas` lacks an ADR in `decisions/` that names it and states its removal condition.
An exception without its ADR cannot reach `main`. The test was born red: `scripts/demo-rojo.sh`
added an id with no ADR, as recorded in the Sprint 006 log.

## Consequences

- Each sprint's `/deploy-check` re-checks the advisory. The day a patch appears, the exception is
  paid with a bump, not carried forward.
- If a new advisory has no patch, it needs its own ADR. It never gets added to the list «by name».
