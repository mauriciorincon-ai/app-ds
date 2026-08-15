# Probeta DS — Design System ("Instrumento de laboratorio")

Referencia de marca de **Probeta DS**, una app web que lleva a profesionales **no científicos de
datos** por el ciclo completo (cargar → limpiar → entender → modelar → comprobar → publicar) para
construir un modelo **defendible a nivel de investigación**: sin fuga de datos, validado
correctamente, honesto contra un baseline. Fuente de verdad en el repo: `design-system.md` +
`src/app/globals.css`. Esta es una **referencia de marca** (tokens + componentes y patrones
representativos), no una librería compilada: úsala para diseñar **en la paleta, tipografía y
patrones reales de la app**.

## La regla que gobierna todo

**Honestidad metodológica como diseño.** El diferenciador no es el AutoML (commodity) sino que la
app **no maquilla**: la fuga de datos es imposible por construcción, el veredicto contra baseline
es franco ("supera por +N" / "NO supera — revisa tus features"), y todo cómputo corre en el
navegador (los datos del usuario nunca salen). **La sobriedad visual refleja esa honestidad — los
números no se maquillan, el diseño tampoco.** La metáfora es un **instrumento de laboratorio**:
legible, calibrado, franco. Nunca pedagógico, nunca lúdico, nunca genérico-corporativo (sin el
degradado violeta/azul de IA, sin hero de plantilla).

## Idioma de estilo: propiedades semánticas, nunca hex ni primitivos

Los diseños consumen `styles.css`. **Estiliza SOLO con la capa semántica** (custom properties), que
cambia sola por contexto (claro / oscuro por `prefers-color-scheme` o `[data-theme]`). Nunca uses
hex directos en la UI.

| Token                                     | Uso                                                         |
| ----------------------------------------- | ----------------------------------------------------------- |
| `--bg` / `--surface` / `--surface-sunken` | papel · tarjeta · relleno/preview                           |
| `--ink` / `--ink-muted`                   | texto principal / secundario                                |
| `--hairline`                              | bordes                                                      |
| `--accent` / `--accent-ink`               | **el** acento petróleo (acción, foco, dato clave); su texto |
| `--positive` / `--caution` / `--negative` | supera baseline · fuga/advertencia · no supera              |
| `--font-sans` / `--font-mono`             | Geist (UI, títulos, prosa) · Geist Mono (TODAS las cifras)  |

**El acento se gasta con avaricia:** acción primaria, foco, dato clave — nada más. Los semánticos
solo aparecen en veredicto/estados, cada uno con un tinte de fondo al 8–12% para badges.

## Reglas de composición

- **Nada comunica solo con color.** El veredicto y las métricas SIEMPRE llevan símbolo + texto:
  **▲** supera · **＝** empata · **▼** no supera · **⚠** fuga/aviso · **▶** modelo elegido ·
  **✓** verificado/limpio · **⚙** saneamiento aplicado.
- **Todas las cifras en Geist Mono con `tabular-nums`** (métricas, %, matriz de confusión, tamaños
  de dataset). El mono es la firma del instrumento; la prosa va en Geist Sans.
- **A11y desde el inicio:** táctil ≥44px, foco visible con ring de acento, contraste AA
  (`ink`/`bg` ≈ 14:1), `prefers-reduced-motion` desactiva el movimiento. Alertas exploratorias con
  `role="status"` (informan, no interrumpen); errores con `role="alert"`.
- **Radios:** `sm 4px` (badges/inputs) · `md 6px` (botones/controles) · `lg 10px` (tarjetas). No
  radios XL uniformes. **Motion** `fast 150ms` / `base 220ms`: explica causalidad, no decora.

## Dónde vive la verdad

`styles.css` (los tokens, con sus capas: claro por defecto, oscuro por `@media dark` /
`[data-theme]`). Las tarjetas de preview muestran los patrones reales: paleta, tipografía, y los
componentes canon — con el **VerdictBanner** como pieza jerárquica — más los añadidos de cada
sprint (narración con importancia, scoring con novedad, saneamiento y candidatos).

## Snippet idiomático

```html
<section
  style="background: var(--surface); border: 1px solid var(--hairline);
         border-radius: 10px; padding: 16px; color: var(--ink);
         box-shadow: var(--shadow-sm);"
>
  <p
    style="font-family: var(--font-mono); font-variant-numeric: tabular-nums;
            font-size: 12px; letter-spacing: .04em; text-transform: uppercase;
            color: var(--ink-muted); margin: 0 0 8px;"
  >
    Veredicto sobre el conjunto de prueba
  </p>
  <p
    style="font-size: 20px; font-weight: 600; margin: 0; color: var(--positive);"
  >
    ▲ Supera al baseline por +0.12 en F1
  </p>
</section>
```
