---
tipo: propuesta
destino: planeadora (método / kit-app)
app: ds
origen: fricción real del cierre de ciclo H1, sesión constructora de app-ds
fecha: 2026-08-15
estado: propuesta — el comando ya está estampado LOCALMENTE en app-ds como prueba piloto
---

# Propuesta al método — `/design-sync` como proceso definido, no como improvisación

> El método exige publicar el design system en Claude Design al cerrar cada ciclo (CLAUDE.md
> § Cierre de CICLO, método v1.8.0), pero **no define CÓMO**. El resultado fue que cada
> publicación se improvisó con el tool crudo, con el bundle en almacenamiento efímero, y el
> usuario percibió el proceso como "mucho ruido". Esta propuesta lo convierte en un proceso
> estándar de tres piezas con jerarquía clara. **Todo lo propuesto ya está implementado y
> funcionando en app-ds como piloto** — al kit solo le toca adoptarlo.

## 1. Qué pasó (evidencia, cierre H1 de ds)

| #   | Fricción observada                                                                                         | Consecuencia                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | El método ordena `/design-sync` pero **el comando no existe** en las apps (solo el tool `DesignSync`)      | Cada sesión re-descubre el flujo con el tool crudo; el summary de S4 ya lo registró como sugerencia                                                                  |
| 2   | El bundle publicable se construyó en el **scratchpad de sesión** (efímero)                                 | Al retomar días después quedaban **4 de 13 archivos**; hubo que reconstruir la copia local descargando archivo por archivo desde el proyecto remoto (`get_file` × 9) |
| 3   | **Sin registro del destino**: el `projectId` se re-descubría con `list_projects` en cada sesión            | Riesgo real de publicar a un proyecto equivocado (la cuenta tiene 6, dos llamados genéricamente "Design System")                                                     |
| 4   | Peculiaridades del tool aprendidas por prueba y error, documentadas en ningún sitio                        | `finalize_plan` exige `deletes` aunque sea `[]`; las tarjetas se indexan por el marcador `@dsCard` de la primera línea; el schema del tool es diferido (ToolSearch)  |
| 5   | Sin momento definido: ¿se publica en el cierre de ciclo, en cada sprint con UI, cuando el usuario lo pide? | El usuario tuvo que invocarlo a mano dos veces y no sabía si era su trabajo o del builder                                                                            |

La fricción 2 es la estructural: **un artefacto que el método declara entregable de ciclo vivía
fuera del repo, sin versión, sin diff y sin supervivencia entre sesiones.**

## 2. El principio que ordena todo

**El bundle publicable es un artefacto del repo, no un efecto secundario de la sesión.** Tres
piezas con jerarquía explícita:

| Pieza                  | Dónde vive        | Papel                                                                                                     |
| ---------------------- | ----------------- | --------------------------------------------------------------------------------------------------------- |
| `design-system.md`     | repo (raíz)       | **Fuente de verdad.** Prosa + tokens. Manda sobre todo                                                    |
| `design-sync/`         | repo (versionado) | **Bundle publicable.** Espejo 1:1 de lo publicado: README, styles.css, tarjetas HTML. Deriva del anterior |
| Proyecto Claude Design | claude.ai         | **Vitrina.** Se escribe desde el bundle; jamás se edita allí (no hay camino de vuelta)                    |

Con el bundle en el repo, cada problema de la tabla desaparece por construcción:

- **Sobrevive a las sesiones** — el scratchpad deja de participar.
- **El diff es `git status design-sync/`** — publicar es exactamente lo que git dice que cambió;
  el plan de `finalize_plan` se llena solo, y la publicación incremental (regla del tool) queda
  garantizada en vez de prometida.
- **Se revisa en el PR y lo escanea gitleaks** como a cualquier otro archivo.
- **`design-sync/project.json`** registra `projectId`, nombre y última publicación — las sesiones
  leen, no buscan.

## 3. El proceso estándar (ya estampado en app-ds)

`.claude/commands/design-sync.md` de este repo contiene el procedimiento completo listo para que
el kit lo adopte tal cual. Resumen:

1. Editar el bundle **en el repo** (regla de tarjeta: primera línea `@dsCard`, HTML
   autocontenido, paleta canónica).
2. `git status design-sync/` = el plan.
3. `DesignSync`: `list_files` → `finalize_plan` (writes = solo lo cambiado; `deletes`
   obligatorio aunque vacío; `localDir` = `design-sync/`) → `write_files` con `localPath`.
4. Registro: `project.json` actualizado + línea en bitácora + commit.

**Cuándo:** obligatorio en cierre de ciclo (ya lo dice el método); recomendado al cerrar
cualquier sprint que tocó UI, tras el gate `diseno-ui` — así el cierre de ciclo es un delta
pequeño y no una reconstrucción. **Quién:** el builder lo ejecuta (los permisos del tool ya piden
confirmación del plan al usuario en `finalize_plan` — ese es el punto de control humano, no la
invocación manual).

## 4. Qué se pide al kit (decisiones de la planeadora)

1. **Adoptar el comando** `.claude/commands/design-sync.md` en la plantilla del kit (el piloto de
   ds sirve de base; ajustar la referencia a esta propuesta al estamparlo).
2. **Añadir `design-sync/` a la estructura estándar** de las apps con UI (con `project.json`
   desde el primer sprint que publique).
3. **kit-check / cierre de ciclo:** verificar que `design-sync/project.json` existe y que
   `lastPublished` no es anterior al último sprint con UI cerrado — el equivalente a "el design
   system publicado no está podrido".
4. **Aclarar en el método** (una línea en el bloque Cierre de CICLO): la publicación la ejecuta
   el builder con el comando; el gate humano es la aprobación del plan de escritura, no la
   invocación.

## 5. Qué NO propone esto

- No propone automatizar la publicación en CI (el tool requiere la sesión autenticada del
  usuario; el punto de control humano es valioso).
- No propone mover la fuente de verdad: sigue siendo `design-system.md`; el bundle deriva.
- No toca las otras apps del pipeline hasta que la planeadora adopte el patrón en el kit — en ds
  queda como piloto funcionando.

## 6. Estado del piloto en app-ds (2026-08-15)

- `design-sync/` versionado con el espejo completo de los 13 archivos publicados (recuperados
  los 9 perdidos desde el proyecto remoto — última vez que hará falta).
- `design-sync/project.json` con el projectId real.
- `.claude/commands/design-sync.md` estampado.
- Proyecto remoto: **"Probeta DS — Design System"**, 13 tarjetas/archivos, al día con el gate ⭐.
