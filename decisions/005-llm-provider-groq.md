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

- **Models:** Narrator → `llama-3.3-70b-versatile` (better instruction-following → higher
  verification pass rate); Grader → `llama-3.1-8b-instant` (style scoring; the cheap model is
  enough).
- **Prices (verified 2026-07-09, [groq.com/pricing](https://groq.com/pricing)):**
  70B $0.59/$0.79 per 1M tokens (in/out); 8B $0.05/$0.08. **Free tier without a credit card**
  (~30 req/min, 1K req/day for the 70B) covers personal-scale usage entirely; even on paid
  on-demand, a narration (≤2 calls, ≤550 output tokens total) costs well under **$0.001** —
  the $10/month ceiling has enormous margin.
- **Budget bounded by construction** (`lib/ia/client.ts`): ≤2 calls per narration (Narrator +
  Grader), `maxOutputTokens` 400/150, 10 s timeout, **zero retries** — any failure falls back to
  the deterministic template. Cost per request logged with Pino (`lib/ia/cost.ts`), no column
  names in logs.
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
- Free-tier rate limits (1K req/day on the 70B) are far above personal usage; if exceeded, the
  route's fallback already degrades honestly to templates.
