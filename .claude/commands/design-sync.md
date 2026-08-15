# /design-sync

Publica el design system de esta app en **Claude Design** (tool `DesignSync`), de forma
**incremental**: solo lo que cambió, nunca un reemplazo masivo.

> Estampado localmente en app-ds el 2026-08-15 tras la fricción del cierre H1 (el comando no
> existía y cada sesión improvisaba el flujo). Propuesta para adoptarlo en el kit:
> `sprints/PROPUESTA-metodo-design-sync.md`.

## Las tres piezas y su jerarquía

1. **`design-system.md`** — la fuente de verdad (prosa + tokens). Manda sobre todo.
2. **`design-sync/`** — el bundle publicable, VERSIONADO en el repo. Espejo 1:1 de lo publicado
   (README.md, styles.css, `components/<grupo>/<tarjeta>.html`). Deriva del design-system; jamás
   lo contradice.
3. **El proyecto en Claude Design** — la vitrina. Se escribe desde el bundle; **nunca se edita
   allí directamente** (no hay camino de vuelta al repo).

El destino está en **`design-sync/project.json`** (projectId + nombre). No busques con
`list_projects` ni crees proyectos: si el archivo falta o el proyecto no existe, detente y
pregunta al usuario.

## Procedimiento

1. **Actualiza el bundle en el repo** (`design-sync/`), no en el scratchpad. Reglas de tarjeta:
   - Primera línea EXACTA: `<!-- @dsCard group="<Grupo>" name="<Nombre>" -->` — así indexa
     Claude Design sus tarjetas; sin ella la tarjeta no aparece.
   - HTML autocontenido (CSS inline, sin CDNs), `lang="es"`, tokens/hex de la paleta canónica.
   - Grupos en uso: `Fundamentos` · `Componentes` · `Componentes · S3` · `Componentes · S4`.
2. **Diff con git**: `git status design-sync/` te dice exactamente qué publicar. Ese es el plan.
3. **Publica** con el tool `DesignSync`:
   - `list_files` (verifica el estado remoto — barato, sin prompt),
   - `finalize_plan` con `writes` = SOLO los paths cambiados, `deletes` = los eliminados
     (**el campo es obligatorio aunque sea `[]`**), `localDir` = `design-sync/` del repo,
   - `write_files` con `localPath` (el contenido sube desde disco, no pasa por el contexto).
4. **Cierra el ciclo de registro**: actualiza `lastPublished` y `publishedFiles` en
   `project.json`, línea en la bitácora del sprint con qué se publicó y por qué, commit.

## Cuándo

- **Obligatorio** en cierre de ciclo (CLAUDE.md § Cierre de CICLO).
- **Recomendado** al cerrar cualquier sprint que tocó UI, tras el gate de `diseno-ui`: así el
  cierre de ciclo es un delta pequeño, no una reconstrucción.
- Cambios visuales surgidos de un gate ⭐ (reglas nuevas, estados nuevos) se reflejan en
  `design-system.md` PRIMERO, luego en el bundle, luego se publica.

## Por qué el bundle vive en el repo (la lección)

En el cierre H1 el bundle se construyó en el scratchpad de sesión (efímero): al retomar días
después quedaban **4 de 13 archivos**, el diff incremental era imposible y hubo que reconstruir la
copia local descargando desde el proyecto remoto. Versionado en `design-sync/`, el bundle
sobrevive a las sesiones, el diff es `git status`, la revisión va en el PR y el gitleaks lo
escanea como a todo lo demás.
