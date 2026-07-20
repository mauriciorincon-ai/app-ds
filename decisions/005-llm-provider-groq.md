# ADR 005 — Initial LLM provider: Groq via Vercel AI SDK (mock in CI)

- **Status:** accepted
- **Date:** 2026-07-09
- **Sprint:** 002

## Context

Sprint 002 debuts embedded AI (standard 7): a Narrator writes a plain-language explanation of the
experiment and a Grader scores it — both verified before display. The app's runtime budget is
**≤US$10/month**; CI must never call a real API; and the CLAUDE.md mandates a multi-provider
adapter switchable by env, with the concrete provider decided by ADR with current prices.

## Decision

**Groq** as the single configured real provider, called through the **Vercel AI SDK**
(`ai` + `@ai-sdk/groq`, `generateObject` + Zod schema — the `ia-embebida` skill pattern).

- **Models:** `openai/gpt-oss-120b` for BOTH roles (Narrator and Grader) — see the amendment
  below for why the originally chosen llama models were replaced.
- **Prices (verified 2026-07-09, [groq.com/pricing](https://groq.com/pricing)):**
  gpt-oss-120b $0.15/$0.60 per 1M tokens (in/out). **Free tier without a credit card** covers
  personal-scale usage entirely; a full narration (2 calls, ~1.5K total tokens including
  reasoning) costs ~**$0.0005** — the $10/month ceiling has enormous margin.
- **Budget bounded by construction** (`lib/ia/client.ts`): ≤2 calls per narration (Narrator +
  Grader), `maxOutputTokens` 1500/600 (gpt-oss are reasoning models: the output budget includes
  reasoning tokens, kept at ~40-100 via `reasoningEffort: "low"`), 15 s timeout, **zero
  retries** — any failure falls back to the deterministic template. Cost per request logged with
  Pino (`lib/ia/cost.ts`), no column names in logs.
- **`mock` provider** (`NARRATION_PROVIDER=mock`): in-process, deterministic, no network; modes
  `success` / `lying` / `down` (env `NARRATION_MOCK_MODE`) reproduce the three standard-7 test
  scenarios. CI and all tests run on mock only.
- **Env contract:** `NARRATION_PROVIDER` (groq | mock), `NARRATION_ENABLED` (kill-switch),
  `GROQ_API_KEY` (server-side only, never `NEXT_PUBLIC_`).
- **Rate limit** on the route: in-memory sliding window (10 req/min per IP). Known limit: it is
  per serverless instance, not global — acceptable at personal scale, revisit with real users.

**Rejected:** installing more provider SDKs now (the adapter's env switch leaves room; CLAUDE.md
forbids SDKs without their ADR); calling Groq's OpenAI-compatible endpoint with raw fetch (kept
as documented contingency if AI SDK + Zod 4 ever conflict — the Zod contract would not change).

## Consequences

- CI is deterministic and needs no secrets; the provider can be swapped by env without touching
  the flow (route → client → verify → grader).
- Nothing the LLM produces is persisted; the narration lives in the experiment state and the
  model card cites it only when verified (`persist.ts` of the skill pattern is N/A this sprint).
- Free-tier rate limits are far above personal usage; if exceeded, the route's fallback already
  degrades honestly to templates.

## Amendment (2026-07-09) — empirical validation with a real key

The original choice (`llama-3.3-70b-versatile` + `llama-3.1-8b-instant`) failed on first contact
with the real API and was replaced after end-to-end testing:

1. **Groq does not support `response_format: json_schema` on the llama-3.x models** (only
   `json_object`), and the AI SDK's `generateObject` requires it. The `openai/gpt-oss` models DO
   support structured outputs — and are cheaper than the 70B.
2. **gpt-oss models are reasoning models:** with `maxOutputTokens: 400` the whole budget went to
   reasoning and Groq returned "Failed to validate JSON". Fixed with `reasoningEffort: "low"` +
   larger output budgets (still bounded: 1500/600).
3. **Grader stability decides the model:** `gpt-oss-20b` scored the same good narrative 3/4/5 on
   completeness across runs ⇒ arbitrary template fallbacks. `gpt-oss-120b` was stable (5/5/5 × 3
   runs) at ~$0.0002/call, so both roles use the 120b.
4. **Two verifier/prompt hardenings found by real output:** (a) Spanish prose naturally accents
   column names ("la región" for `region`) — the deterministic mention-check is now
   diacritic-insensitive (still literal matching); (b) the model interpreted `direction:
negative` as "reduces conversion" — but it cannot know the positive class (we never send class
   labels, by ADR-006), so the prompt now forbids phrasing directions as real-world outcomes.
5. **Grader rubric made explicit** (what 1-5 means per axis) after real narratives were rejected
   2/3 times on vague completeness judgments; with the narrator prompt also requiring full
   coverage (verdict + scores + top variables + leakage warning), the circuit went **5/5
   verified** on repeat runs.

## Amendment (2026-07-20) — H1 closing audit: cost table + prompt-injection residue

Two gaps found by the pre-close audit, one fixed and one documented:

1. **The Pino cost log was blind.** `cost.ts` still priced only the discarded llama models, so
   every real call logged `costUsd: 0` — the budget instrument (standard 7) measured nothing.
   Fixed: `openai/gpt-oss-120b` priced at $0.15/$0.60 per 1M (the figures this ADR already
   documented), plus a unit test (`ia-cost.test.ts`) that FAILS if the production models
   (`GROQ_NARRATOR_MODEL`/`GROQ_GRADER_MODEL`) ever lack a price entry again.
2. **Prompt injection has a vehicle; the residue is a known limit.** Column names from the user's
   CSV (target, top-8 features, leakage columns — ~1KB bounded by the schema) travel verbatim
   into both prompts. `verify.ts` anchors every claim, figure and direction, but it does NOT
   bound free sentences that cite no feature: a malicious header could, in the worst case, steer
   a sentence that still passes verification and renders with the "verified" badge. Mitigations
   now in place: the Narrator prompt explicitly declares column names untrusted data (never
   instructions), and the guardrails comment no longer claims the vector doesn't exist. Accepted
   residual risk at H1 scale (self-inflicted for one's own CSVs; relevant only for "open this
   third-party dataset" scenarios); a verifier rule bounding non-claim sentences is the H2
   follow-up if that scenario becomes real.
