---
name: ia-embebida
description: Patrón obligatorio para features con IA generativa embebida - salidas estructuradas con Zod que se descomponen y persisten en la BD, guardrails de entrada/salida, tracking de costo y gancho HITL. Invocar al construir cualquier feature que llame a un LLM.
---

# IA embebida — el patrón de sinergia app↔LLM

Objetivo del pipeline: apps donde la IA generativa **interactúa nativamente** y sus resultados se
**descomponen y almacenan** como datos de primera clase de la aplicación — no chatbots pegados a un
lado. Este skill define el patrón único que toda feature LLM sigue.

## Arquitectura (vive en `src/lib/ia/`)

```
lib/ia/
├─ schemas.ts     # esquemas Zod de cada salida estructurada (el contrato app↔LLM)
├─ client.ts      # único punto de llamada al LLM (modelo, retry, timeout, streaming)
├─ guardrails.ts  # filtros de input/output + política del dominio
├─ persist.ts     # descomposición de la salida validada → filas/entidades en Supabase
└─ cost.ts        # medición tokens/costo por request → logger estructurado
```

**Regla de oro:** la UI nunca llama al LLM directo; llama a un route handler que usa `client.ts`,
valida contra `schemas.ts`, filtra con `guardrails.ts` y persiste con `persist.ts`.

## 1. Salida estructurada (Zod + Vercel AI SDK)

```ts
// schemas.ts — el contrato: lo que la app entiende y almacena
export const AnalisisSchema = z.object({
  resumen: z.string().max(500),
  entidades: z.array(z.object({ tipo: z.enum(["persona","monto","fecha"]), valor: z.string() })),
  confianza: z.number().min(0).max(1),
});

// client.ts — generateObject valida contra el schema; si no cumple, reintenta/falla explícito
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
const { object, usage } = await generateObject({
  model: anthropic("claude-sonnet-5"),      // Haiku para tareas simples; Sonnet para razonamiento
  schema: AnalisisSchema,
  prompt, abortSignal: AbortSignal.timeout(30_000),
});
```

- Elección de modelo por tarea: clasificación/extracción simple → Haiku; razonamiento/generación
  rica → Sonnet. Documentar la elección en el ADR si difiere del default.
- Streaming (`streamText`/`streamObject`) solo para UX de lectura; lo persistido siempre es el
  objeto validado final.

## 2. Descomposición y persistencia

`persist.ts` mapea el objeto validado a entidades de la BD (nunca guardar el blob crudo como única
forma): p. ej. `AnalisisSchema` → fila en `analisis` + N filas en `entidades` con FK. Guardar
además: `modelo`, `version_prompt`, `costo_usd`, `created_by` — trazabilidad de qué IA produjo qué
dato. RLS aplica a estas tablas como a cualquier otra.

## 3. Guardrails (capa base, por sprint)

- **Input:** longitud máxima, tipo de contenido esperado, strip de instrucciones inyectadas
  (patrón anti prompt-injection del skill `security-owasp`), rate limiting por usuario.
- **Output:** validación Zod (ya bloquea la mayoría del formato malicioso) + lista de negación del
  dominio (ej. en `habla`: nunca diagnóstico clínico; en `financiera`: nunca recomendación de
  inversión — el brief define la política).
- **System prompt** siempre del lado servidor; el cliente jamás lo compone.

## 4. Costo

`cost.ts`: por request loggear `{ requestId, modelo, tokens_in, tokens_out, costo_usd, feature }`
con Pino. Presupuesto mensual por app definido en el brief; alerta si el run-rate lo excede (F6).

## 5. HITL (por release, dominios sensibles)

Si el brief marca el dominio como sensible (habla, financiera, inmobiliaria): las respuestas
high-stakes o de baja `confianza` se marcan `estado: pending_review`, la UI muestra "en revisión",
y un dashboard mínimo de operador permite aprobar/rechazar antes de exponer.

## Checklist del sprint (lo verifica /deploy-check)

- [ ] Toda llamada LLM pasa por `lib/ia/client.ts` y valida contra un schema de `schemas.ts`.
- [ ] Lo persistido está descompuesto en entidades (no solo blob) con metadatos de trazabilidad.
- [ ] Guardrails de input/output activos; system prompt server-side.
- [ ] Costo por request loggeado.
- [ ] Tests: unit del schema (casos válidos/inválidos) + mock del LLM en integración (nunca llamar
      al API real en CI) + 1 e2e con respuesta fixture.
