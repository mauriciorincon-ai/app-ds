// @vitest-environment node
//
// El route es el circuito completo del estándar 7: kill-switch → proveedor →
// rate limit → Zod → Narrator → verificación determinista → Grader. Todos los
// casos corren con el proveedor MOCK (sin red): éxito, narrador-que-miente y
// proveedor caído.
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/narrate/route";
import { RATE_LIMIT_MAX, resetRateLimit } from "@/lib/ia/guardrails";
import type { NarrationPayload } from "@/lib/ia/schemas";

function payload(): NarrationPayload {
  return {
    locale: "es",
    problem: "binary-classification",
    target: "convirtio",
    dataset: { rows: 200, cols: 7 },
    metrics: {
      accuracy: 0.71,
      precision: 0.62,
      recall: 0.55,
      f1: 0.58,
      auc: 0.81,
    },
    verdict: {
      level: "beats",
      primaryMetric: "auc",
      modelScore: 0.81,
      baselineScore: 0.77,
      delta: 0.04,
    },
    explainability: {
      method: "permutation_importance",
      scoring: "roc_auc",
      features: [
        {
          name: "visitas_web",
          kind: "numeric",
          importance: 0.21,
          direction: "positive",
        },
        {
          name: "dispositivo",
          kind: "categorical",
          importance: 0.15,
          direction: null,
        },
      ],
    },
    leakage: [],
  };
}

function request(body: unknown, ip = "203.0.113.1"): Request {
  return new Request("http://localhost/api/narrate", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function enableMock(mode?: string) {
  vi.stubEnv("NARRATION_ENABLED", "true");
  vi.stubEnv("NARRATION_PROVIDER", "mock");
  if (mode) vi.stubEnv("NARRATION_MOCK_MODE", mode);
}

afterEach(() => {
  vi.unstubAllEnvs();
  resetRateLimit();
});

describe("POST /api/narrate", () => {
  it("kill-switch apagado ⇒ fallback 'disabled' (nunca error, nunca sección vacía)", async () => {
    const response = await POST(request({ payload: payload() }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "fallback",
      reason: "disabled",
    });
  });

  it("sin proveedor configurado ⇒ fallback 'no-provider'", async () => {
    vi.stubEnv("NARRATION_ENABLED", "true");
    const response = await POST(request({ payload: payload() }));
    expect(await response.json()).toEqual({
      status: "fallback",
      reason: "no-provider",
    });
  });

  it("groq sin API key ⇒ fallback 'no-provider' (la key es solo server-side)", async () => {
    vi.stubEnv("NARRATION_ENABLED", "true");
    vi.stubEnv("NARRATION_PROVIDER", "groq");
    vi.stubEnv("GROQ_API_KEY", "");
    const response = await POST(request({ payload: payload() }));
    expect(await response.json()).toEqual({
      status: "fallback",
      reason: "no-provider",
    });
  });

  it("mock éxito ⇒ 'verified' con narrativa que pasó verificación + grader", async () => {
    enableMock();
    const response = await POST(request({ payload: payload() }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("verified");
    expect(body.narrative).toContain("visitas_web");
    expect(body.grader.accuracy).toBeGreaterThanOrEqual(4);
  });

  it("narrador que miente ⇒ la verificación lo descarta (fallback, no se publica)", async () => {
    enableMock("lying");
    const response = await POST(request({ payload: payload() }));
    expect(await response.json()).toEqual({
      status: "fallback",
      reason: "verification-failed",
    });
  });

  it("proveedor caído ⇒ fallback 'provider-error' sin retries", async () => {
    enableMock("down");
    const response = await POST(request({ payload: payload() }));
    expect(await response.json()).toEqual({
      status: "fallback",
      reason: "provider-error",
    });
  });

  it("body inválido ⇒ 400 'invalid-request' (Zod es la puerta)", async () => {
    enableMock();
    const bad = await POST(request({ payload: { hola: "mundo" } }));
    expect(bad.status).toBe(400);
    const notJson = await POST(request("esto no es json"));
    expect(notJson.status).toBe(400);
  });

  it("rate limit ⇒ 429 tras el máximo por ventana", async () => {
    enableMock();
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      const ok = await POST(request({ payload: payload() }));
      expect(ok.status).toBe(200);
    }
    const blocked = await POST(request({ payload: payload() }));
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({
      status: "fallback",
      reason: "rate-limited",
    });
  });
});
