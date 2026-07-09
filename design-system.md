# Probeta DS — Sistema de diseño

> Fuente de verdad visual de la app. Creado en el Sprint 001. Toda pantalla lo obedece; se extiende
> por ADR, nunca se contradice en silencio. Tono declarado (constitución): herramienta seria y
> honesta, no pedagógica, no lúdica.

## Personalidad

**Preciso · Confiable · Sobrio.**
Nunca **pedagógico** (no es un tutorial ni un juguete didáctico), nunca **lúdico** (sin
gamificación, sin emojis-icono, sin ilustraciones alegres), nunca **genérico-corporativo** (sin el
degradado violeta/azul de IA, sin hero centrado de plantilla).

La metáfora es un **instrumento de laboratorio**: legible, calibrado, franco. La honestidad del
producto se refleja en la sobriedad visual — los números no se maquillan, el diseño tampoco.

## Tokens

Implementados como CSS variables en `globals.css` (`@theme`). **Cero valores mágicos en los
componentes** — todo sale de aquí.

### Color — rol → hex

Paleta restringida: papel cálido, tinta casi negra, **un** acento petróleo, y semánticos que solo
aparecen en veredicto/estados. El acento se gasta con avaricia (acción primaria, foco, dato clave).

| Rol                                  | Claro     | Oscuro    |
| ------------------------------------ | --------- | --------- |
| `--bg` (papel)                       | `#FAFAF7` | `#0E1116` |
| `--surface` (tarjeta)                | `#FFFFFF` | `#161A21` |
| `--surface-sunken` (relleno/preview) | `#F2F2EC` | `#1C222B` |
| `--ink` (texto principal)            | `#14181F` | `#E7E9EC` |
| `--ink-muted` (secundario)           | `#586172` | `#9AA4B2` |
| `--hairline` (bordes)                | `#E4E4DC` | `#28303B` |
| `--accent` (petróleo)                | `#0E6E6B` | `#2FA6A0` |
| `--accent-ink` (texto sobre acento)  | `#FFFFFF` | `#08201F` |
| `--positive` (supera baseline)       | `#1C7C4A` | `#54B885` |
| `--caution` (fuga / advertencia)     | `#8A5A0C` | `#D69B4A` |
| `--negative` (no supera)             | `#A5372F` | `#E0776E` |

Cada semántico tiene un tinte de fondo al 8–12% para badges. **Nada comunica solo con color**: el
veredicto y las métricas siempre llevan símbolo + texto (▲ supera · ＝ empata · ▼ no supera · ⚠ fuga).

Contraste objetivo AA: `ink`/`bg` ≈ 14:1; `ink-muted`/`bg` ≥ 4.5:1; acento/blanco ≥ 4.5:1 (verificar
en el gate).

### Tipografía

Dos familias con carácter técnico (ya self-hosteadas por `next/font`), sin caer en "Inter en todo":

- **Geist Sans** — UI, títulos, prosa.
- **Geist Mono** — **todas las cifras**: métricas, porcentajes, matriz de confusión, tamaños de
  dataset. Siempre con `font-variant-numeric: tabular-nums`. El mono es la firma del instrumento.

Escala (rem, base 16): `display` 2.25/600 · `h1` 1.75/600 · `h2` 1.25/600 · `body-lg` 1.125/450 ·
`body` 1/450 · `small` 0.875/450 · `caption` 0.75/500 (muted, mayúsculas suaves en etiquetas).

### Spacing, radios, sombras, motion

- **Spacing** múltiplos de 4: `4 8 12 16 24 32 48 64`. El espacio en blanco es material: la landing
  respira, la tabla de métricas es densa a propósito.
- **Radios**: `sm 4px` (badges/inputs) · `md 6px` (botones/controles) · `lg 10px` (tarjetas). **No**
  radios XL uniformes.
- **Sombras** (familia única, sutil): `sm 0 1px 2px rgb(20 24 31 / .06)` · `md 0 2px 10px rgb(20 24
31 / .08)`. Solo en tarjetas y popovers, no en todo.
- **Motion**: `fast 150ms` · `base 220ms` · easing `cubic-bezier(.2,0,0,1)`. El movimiento explica
  causalidad (aparición de resultados, avance del entrenamiento), no decora. Respeta
  `prefers-reduced-motion` (lo desactiva).

## Componentes canon

shadcn/ui **personalizados** con estos tokens (nunca el default):

- **Button** — `primary` (acento sólido), `secondary` (hairline + ink), `ghost`. Alto 44px (táctil),
  radio `md`, foco con ring de `accent`.
- **Card** — `surface`, hairline, radio `lg`, sombra `sm`.
- **Dropzone** — carga de CSV: borde punteado hairline, estado hover/drag con acento; microcopy
  honesto del límite (5 MB / 50k filas).
- **DataTable** — preview del dataset y matriz de confusión; cifras en mono/tabular-nums; cabecera
  `surface-sunken`.
- **MetricTile** — una métrica (valor mono grande + etiqueta caption); en fila para el panel de test.
- **VerdictBanner** — **la pieza jerárquica del producto**: enuncia el veredicto (símbolo + texto +
  color semántico) y el delta vs baseline. Es lo más importante de la pantalla de resultados.
- **LeakageAlert** — advertencia de fuga (`caution`, icono ⚠ + texto): "esta columna podría ser un
  proxy del objetivo", sin prometer exhaustividad.
- **ProgressStepper** — etapas honestas del entrenamiento (preparando motor → cargando datos →
  entrenando), con la etapa activa en acento.
- **Badge** — perfilado (tipo/nulos/cardinalidad, fecha detectada) y estados.
- **LangToggle** — ES/EN, `aria-pressed`.

## Jerarquía por pantalla (la "una cosa importante")

1. **Inicio/carga** → la elección: subir CSV o elegir ejemplo. Estado vacío diseñado (no ícono gris).
2. **Configuración** → seleccionar el objetivo; perfilado y avisos alrededor.
3. **Entrenamiento** → el progreso honesto (qué está pasando ahora).
4. **Resultados** → el **VerdictBanner**; métricas, matriz y advertencias lo sostienen.
5. **Error** → el mensaje llano + la acción de recuperación.

## Modo claro/oscuro

Ambos definidos arriba. Se sigue la preferencia del sistema (`prefers-color-scheme`); sin toggle
manual en S1. Orientación: responsive vertical (móvil 360–420) y desktop (≥1024), no landscape-only.
