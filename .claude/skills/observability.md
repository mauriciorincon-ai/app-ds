---
name: observability
description: Patrones de logging estructurado, error tracking y métricas aplicables a las apps del pipeline. Invocar cuando Claude Code configure un proyecto nuevo o agregue telemetría a features existentes.
---

# Observability — Kit General

Non-negotiable #3 de los estándares del pipeline (CLAUDE.md § Estándares). Aplicable desde Sprint 1.

> ⚠️ **El kit NO trae Sentry cableado** (aclaración G-Metodo 2026-07-07 — la orden del S1 de
> nutri-kids lo afirmaba y no era cierto). Cablearlo es tarea del Sprint 1 de cada app con el
> patrón validado en app-nutri-kids: instrumentation de Next + `NEXT_PUBLIC_SENTRY_DSN` por env
> var (Vercel) + verificación de envelope 200 en la preview. El cableado se promoverá al kit
> cuando se valide por 3ª vez (regla de promoción).

## Stack recomendado

| Necesidad | Herramienta | Plan gratuito |
|---|---|---|
| Logs estructurados | Pino (Node) | N/A (local) |
| Logs centralizados | Axiom o Better Stack | sí, ~100MB-1GB/mes |
| Error tracking | Sentry | 5K errores/mes gratis |
| Product analytics | PostHog | 1M eventos/mes gratis |
| Web Vitals | Vercel Speed Insights | incluido con Vercel Pro |

## Patrón: logger estructurado

```typescript
// src/lib/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: {
    app: process.env.NEXT_PUBLIC_APP_NAME,
    env: process.env.NODE_ENV,
  },
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty' }
    : undefined,
});

export function childLogger(context: Record<string, unknown>) {
  return logger.child(context);
}
```

Uso en API routes:

```typescript
import { logger } from '@/lib/logger';

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: '/api/dashboard' });
  const start = Date.now();

  try {
    log.info({ body: await req.clone().json() }, 'request received');
    const result = await processRequest(req);
    log.info({ duration: Date.now() - start }, 'request ok');
    return Response.json(result);
  } catch (err) {
    log.error({ err, duration: Date.now() - start }, 'request failed');
    throw err;
  }
}
```

## Patrón: error tracking con Sentry

```typescript
// sentry.server.config.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? 'local',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  beforeSend(event, hint) {
    // filtrar errores ruidosos
    if (event.exception?.values?.[0]?.type === 'AbortError') return null;
    return event;
  },
});
```

## Patrón: product analytics

```typescript
// src/lib/analytics.ts
import posthog from 'posthog-js';

export function trackEvent(name: string, props?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  posthog.capture(name, {
    ...props,
    app: process.env.NEXT_PUBLIC_APP_NAME,
  });
}
```

Usar para: user actions significativas (dashboard creado, feature usado), NO para clicks indiscriminados.

## Patrón: Web Vitals

Next.js 15 reporta Web Vitals nativamente. Enviar a Vercel Speed Insights:

```typescript
// src/app/layout.tsx
import { SpeedInsights } from '@vercel/speed-insights/next';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
```

## Alertas mínimas

Configurar en el dashboard de errores:

- **Error rate >1% sostenido 5 minutos** → notificación.
- **Latency P95 >2s en endpoints críticos** → notificación.
- **Build/Deploy fallido** → notificación (Vercel lo hace nativo).

## Qué NO loggear

- **Secrets o PII** (passwords, tokens, emails completos).
- **Bodies completos de requests** si contienen datos sensibles — loggear solo metadata.
- **Todo** — el costo escala con volumen. Log INFO en producción, DEBUG solo en dev.

## Checklist para cada feature nueva

- [ ] Endpoint/acción importante → log estructurado con requestId + duración.
- [ ] Error path → Sentry capture.
- [ ] User action relevante → PostHog event.
- [ ] Respuesta al user en caso de error → mensaje sanitizado (no stack trace).
