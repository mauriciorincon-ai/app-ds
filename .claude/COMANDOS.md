# Slash Commands — Kit General

> Vive en `.claude/COMANDOS.md`, FUERA de `.claude/commands/` (kit v1.38.0, ds K-S6-1): todo `.md` dentro de esa
> carpeta se registra como comando, y este README aparecía como `/README` en la lista.

Comandos reutilizables que Claude Code puede invocar en cualquier app del pipeline. Cada archivo es un `.md` con frontmatter que Claude Code carga desde `.claude/commands/` de la app.

## Comandos incluidos

| Comando | Cuándo usarlo |
|---|---|
| `/plan-sprint` | Al iniciar sesión de trabajo. Lee la orden de construcción de la planeadora y propone plan de ejecución por fases. |
| `/self-review` | Antes de crear PR. Revisa el diff como staff engineer estricto. |
| `/security-audit` | Antes de merge a main, o cada 2-3 sprints. OWASP Top 10 checklist. |
| `/deploy-check` | Antes de mergear a main (perfil WEB). Verificaciones exhaustivas (tests, lint, build, a11y, perf). |
| `/release-check` | Perfil ESCRITORIO (kit v1.27.0). **No se estampa en esta app** (perfil WEB: el cierre usa `/deploy-check`). |
| `/run-tests` | Corrida completa de la suite (unit + integration + e2e + a11y). |
| `/audita-sprint` | OBLIGATORIO al concluir la construcción, antes de la guía/gate ⭐ y del summary (método v1.10.0). Dos fases: auditor independiente (solo lectura, todas las severidades con archivo:línea) → aprobación → pagos de TODOS los hallazgos. |
| `/design-sync` | Al cierre de ciclo, DESPUÉS del gate ⭐⭐ y solo cuando el usuario lo invoca (lleva `disable-model-invocation`): publica el design system con el bundle `design-sync/` del repo. |

## Cómo Claude Code los usa

Claude Code carga automáticamente los comandos de `.claude/commands/` cuando inicias una sesión en un proyecto. Los invocas escribiendo `/nombre-del-comando` en el chat.

## Agregar comandos nuevos

Cuando un patrón de tarea se repite en 3+ sprints, considera promoverlo a command. El formato mínimo:

```markdown
---
description: [una línea clara de qué hace]
---

# /nombre-comando

[Descripción larga]

## Pasos
1. ...

## Output esperado
[Estructura del output]
```

## Comandos específicos por app

Si una app tiene necesidades únicas (ej. `/rebuild-vector-index` solo para Hoja de Vida), ponlos en el `.claude/commands/` del repo de esa app, NO en este kit.
