---
entrega: brochure
app: ds
estado: guion aprobado
propuesto: 2026-08-15
aprobado: 2026-08-15
aprobado_por: usuario (regla CERO del molde v2)
branch: entrega/brochure-conoce
---

# Storyboard — El brochure vivo de Probeta DS (`/conoce`)

> **Regla CERO del molde v2:** ni una línea de HTML sin este guion aprobado. Este archivo es el
> guion tal como el usuario lo aprobó el 2026-08-15; lo construido debe poder auditarse contra él.

## Contexto

El ciclo H1 está cerrado (PR #7, gate ⭐ 11/11) y el método pide el **Brochure vivo**: el
anti-manual que un analista recorre como página web y termina conociendo TODO sin leer nada que no
pidió. Destinatario: el profesional NO técnico de la VISION — el que tiene que **defender un modelo
ante su jefe o su comité**.

Leído entero antes de proponer: la orden, el molde v2, el banco de técnicas, el MANUAL (con su
diccionario), la GUIA v1 (27 pruebas), la VISION, `design-system.md` + `design-sync/` (13 tarjetas),
el BLUEPRINT y el piloto de app-habla.

---

## 1 · Decisiones de pieza

### Dial `MOTION_INTENSITY` = **«instrumento calibrado»**

Un punto POR DEBAJO del "cine sereno" de app-habla, y a propósito: habla es cálida y juega; Probeta
es _"preciso · confiable · sobrio… nunca lúdico"_ (`design-system.md`). Movimiento **escaso, corto y
exacto**: nada entra flotando, todo **se asienta como una aguja que deja de temblar**. Si una
animación no mide algo, se corta.

### Identidad en una frase

> _"La página se comporta como el instrumento que describe: nada se mueve para adornar — todo lo que
> se mueve, mide."_

### El riesgo registrado (la decisión valiente que el usuario juzga en la sala de proyección)

> **El clímax muestra la app FALLANDO.** El pico emocional del brochure es el veredicto **«▼ NO
> supera al baseline»** — el producto diciéndole al lector que su trabajo no se sostiene. Ninguna
> página de producto enseña su producto dando malas noticias. Aquí es _la_ noticia: es la tesis de
> la VISION («la única que te garantiza que el modelo es honesto») hecha imagen. La alternativa
> segura era mostrar el veredicto positivo — y se pierde justo lo que distingue a la app.

### Motion-system (derivado del design-system, cero números mágicos)

- **Curvas:** `--ease-asentar: cubic-bezier(0.22, 1, 0.36, 1)` (decelera largo, sin rebote — el
  "asentarse" del instrumento) + `--easing` del DS (`cubic-bezier(0.2, 0, 0, 1)`).
- **Duraciones:** las del DS (`--motion-fast 150ms` / `--motion-base 220ms`) + escala de escena
  `--dur-escena 520ms` (más corta que los 600ms de habla) · `--dur-medir 900ms`.
- **Vocabulario de la pieza:** **asentar** (sube y se queda quieto, sin rebote) · **calibrar** (el
  trazo del icono se termina de dibujar) · **medir** (una barra que crece hasta su valor y para) ·
  **cortar** (la tabla que se parte en dos) · **contar** (cifras en `tabular-nums`).
- **Stagger jerárquico, jamás uniforme:** título → apoyo → señal; la tarjeta estrella entra sola un
  beat antes, las demás a ~70 ms.

### Excepciones declaradas a "solo transform/opacity" (las tres van comentadas en el código)

1. `grid-template-rows` en la apertura de tarjeta (heredada del molde, un disparo por clic).
2. `stroke-dashoffset` para **calibrar** los iconos de trazo (SVG decorativo `aria-hidden`, un
   disparo al entrar).
3. `filter: blur(3px→0)` SOLO en la apertura del titular, con **opacidad siempre 1** (LCP honesto).

### Restricción permanente (daltonismo leve del usuario)

El color **jamás** es el único portador. Todo estado lleva símbolo + texto, con el patrón
✓-en-círculo-relleno validado en el bloque A del gate ⭐. El clímax **no depende de que el rojo se
lea como rojo**: la barra que no llega es la señal.

### Tipografía

Georgia (display) + system-ui (cuerpo) — el trade-off declarado del molde (las webfonts Geist no
viajan en un autocontenido). **Las cifras sí van en mono del sistema con `tabular-nums`**: es la
firma del instrumento y no cuesta un byte.

---

## 2 · La narrativa

Abre el link en su teléfono. Lo primero no es un documento: es una frase que se **enfoca** palabra
por palabra — _Construye un modelo que puedas defender._ Debajo, sin adornos: _todo corre en tu
navegador; tus datos nunca salen de él._

Al bajar aparece la regla del viaje: por el margen izquierdo, una **probeta graduada** de trazo fino
se va llenando con su avance. No es decoración — es el nombre de la app hecho navegación, y al final
marcará el conteo.

Las cuatro puertas la esperan quietas. Entran **asentándose** una tras otra, y el icono de cada una
**se termina de calibrar** al llegar. Ninguna se abre sola. Cuando ELLA toca una, la tarjeta se abre
como un cajón de instrumento y por dentro las features se acomodan en fila.

Entre "qué hace" y el final, un respiro de dos segundos: **una tabla se parte en dos**. Una mitad se
queda para aprender; la otra se aparta y no se toca. _Por eso el número es real._ Nadie se lo
explica; lo ve.

Y entonces el clímax, que no es un truco — es la promesa. Una vara horizontal fija: **el baseline,
la regla más tonta que podría funcionar**. Una barra crece hacia ella… y **se queda debajo**. No
rebota, no reintenta. Se queda. Aparece el veredicto: _▼ NO supera al baseline._ Y el texto que
ninguna otra herramienta pondría en su página: _Esto también te lo decimos._

Cierra bajando la voz: lo fino en acordeones, el **33 que se cuenta solo**, y la probeta del margen
llena hasta la marca.

---

## 3 · El clímax: CONFIRMADO, con un giro

Se confirma el candidato de la orden — **el veredicto honesto** — con el giro que lo vuelve
inolvidable: **la escena muestra el caso negativo**, no el positivo.

Por qué es el correcto y no la privacidad (que fue el clímax del piloto de habla):

- La VISION dice _"Construye un modelo que puedas **defender**"_ y _"todas te ayudan a **hacer** un
  modelo; Probeta es la única que te garantiza que es **honesto**"_. El veredicto ES esa frase.
- La privacidad de Probeta es una garantía **arquitectónica** excelente pero **compartida** con
  cualquier app client-side; el veredicto franco no lo tiene nadie más.
- Copiar el clímax del piloto sería copiar **personalidad**, justo lo que la orden prohíbe.
- El veredicto del propio usuario en el gate ⭐ (B3) fue _"el resultado más adecuado que he visto —
  sinceridad, puntualidad, especificidad"_. Esa frase es sobre el mensaje honesto, no sobre la
  privacidad.

La privacidad no queda enterrada: **se declara en la portada** (capa 0, texto visible, imposible de
perder) y su garantía arquitectónica completa vive en capa 3, como pide la orden.

---

## 4 · Inventario COMPLETO de escenas (8)

### E01 · Portada — la promesa

| Campo                                | Valor                                                                                                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mensaje**                          | _Construye un modelo que puedas defender_ — y todo ocurre en tu navegador.                                                                                           |
| **Gramática**                        | G3                                                                                                                                                                   |
| **Técnica**                          | Cascada **blur-to-focus** palabra por palabra (spans `aria-hidden`, texto íntegro en `aria-label`) + la línea de apoyo **asienta** con retraso.                      |
| **Cómo el motion cuenta el mensaje** | El titular se enfoca como una medición que se estabiliza: primero borroso, luego exacto. Es el arco del producto — de los datos crudos al número que sí se sostiene. |
| **Assets**                           | Solo texto. 0 KB.                                                                                                                                                    |
| **Propiedades**                      | `transform` + `opacity` + excepción `filter: blur` con **opacidad 1 en el h1** (LCP honesto).                                                                        |
| **Reduced-motion**                   | Todo nítido y en su sitio desde el primer frame. Nada falta.                                                                                                         |

### E02 · La probeta del margen — tu avance, medido

| Campo                                | Valor                                                                                                                                                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mensaje**                          | Esto es un instrumento: tu recorrido se mide, y al final se lee.                                                                                                                         |
| **Gramática**                        | **G1 serena** (scroll→progreso, mapeo puro; sin pin, sin secuestro de rueda).                                                                                                            |
| **Técnica**                          | Probeta graduada en el margen izquierdo (trazo hairline + marcas), rellena con `scaleY` interpolado en rAF con inercia; el rAF **se apaga al asentarse**. Medidas cacheadas en `resize`. |
| **Cómo el motion cuenta el mensaje** | El nombre de la app vuelto navegación. En E08 llega a la marca justo cuando el conteo se lee: _leerlo todo también fue medir_.                                                           |
| **Assets**                           | CSS puro + marcas SVG.                                                                                                                                                                   |
| **Propiedades**                      | Solo `transform: scaleY`. Cero lectura de layout en el tick.                                                                                                                             |
| **Reduced-motion**                   | No existe como animación: aparece **llena y quieta**, como decoración de margen.                                                                                                         |

### E03 · Las cuatro puertas — entradas con oficio

| Campo                                | Valor                                                                                                                                                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mensaje**                          | Qué hace la app, en 4 grupos — y que se note la mano que lo hizo.                                                                                                                                     |
| **Gramática**                        | G3                                                                                                                                                                                                    |
| **Técnica**                          | Tarjetas que **asientan** con stagger jerárquico (**la estrella —el veredicto— entra sola un beat antes**; las demás a 70 ms) + cada icono de trazo **se calibra** (`stroke-dashoffset`, un disparo). |
| **Cómo el motion cuenta el mensaje** | El orden de aparición ES la jerarquía: el veredicto primero, porque es el producto. El trazo dibujándose dice "instrumento hecho a mano", el argumento anti-plantilla.                                |
| **Assets**                           | **Iconos del design system de la app** (`ICON_PATHS` de `src/components/ui.tsx`: `check`, `table`, `sparkle`, `download`) — mismos SVG, sin desincronizar. Cero emojis (el DS los prohíbe).           |
| **Propiedades**                      | `transform`/`opacity` + excepción `stroke-dashoffset` declarada.                                                                                                                                      |
| **Reduced-motion**                   | Tarjetas e iconos completos y quietos desde el primer frame.                                                                                                                                          |

### E04 · La tarjeta abierta — el cajón del instrumento (G2)

| Campo                                | Valor                                                                                                                                                                                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mensaje**                          | Nadie lee lo que no pidió — pero cuando pides, está ordenado.                                                                                                                                                                          |
| **Gramática**                        | G2 (máquina de estados abierta/cerrada).                                                                                                                                                                                               |
| **Técnica**                          | Apertura `grid-rows: 0fr→1fr` + **`visibility` en la transición** (obligatorio: lo cerrado FUERA del árbol de accesibilidad) + coreografía interior: las features **asientan** en fila (stagger 40 ms) + presión táctil `scale(0.99)`. |
| **Cómo el motion cuenta el mensaje** | El detalle no "aparece": te lo sirven en orden de lectura.                                                                                                                                                                             |
| **Propiedades**                      | `transform`/`opacity` (+ `grid-rows` ya declarada).                                                                                                                                                                                    |
| **Reduced-motion**                   | Abre sin transición, con TODO el contenido en pose final.                                                                                                                                                                              |

### E05 · El respiro — el corte honesto

| Campo                                | Valor                                                                                                                                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Mensaje**                          | Aprende con una mitad y se examina con la otra, que nunca vio. **Por eso el número es real.**                                                                                                                                  |
| **Gramática**                        | G3 (corrida temporizada al entrar en viewport, una sola vez).                                                                                                                                                                  |
| **Técnica**                          | Una tabla de filas hairline **se corta**: el bloque de arriba (train) se queda y se marca ✓; el de abajo (test) se **separa** y queda con marca ⊘ ("no se toca"). Leyenda: _"Todas las cifras que verás salen de esta mitad."_ |
| **Cómo el motion cuenta el mensaje** | Es la mecánica madre —y el guardarraíl anti-fuga— en dos segundos, sin un párrafo. Prepara el clímax: sin este corte, el veredicto no valdría nada.                                                                            |
| **Propiedades**                      | Solo `transform: translateY` + `opacity`.                                                                                                                                                                                      |
| **Reduced-motion**                   | Cuadro final estático: las dos mitades ya separadas, con sus marcas y la leyenda íntegra.                                                                                                                                      |

### E06 · **CLÍMAX** — la vara que no se mueve

| Campo                                | Valor                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mensaje**                          | **LA promesa: te decimos cuando tu modelo NO sirve.** Ninguna otra herramienta lo hace.                                                                                                                                                                                                                                                                                                                           |
| **Gramática**                        | G3                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Técnica**                          | Escena propia con texto VISIBLE (jamás acordeón). Una **vara horizontal fija** rotulada `baseline` con su definición al lado. Una barra vertical **mide** hacia arriba (`scaleY`, `--ease-asentar`, 900 ms) y **se detiene por debajo** — sin rebote, sin reintento. Medio segundo de quietud. Entonces **asienta** el veredicto: **▼ NO supera al baseline**. Debajo, el remate: _"Esto también te lo decimos."_ |
| **Cómo el motion cuenta el mensaje** | El argumento vuelto imagen: la barra que se queda corta **es** el veredicto; el silencio tras el tope es la honestidad. Es la única escena con un beat de espera — porque la mala noticia merece pausa.                                                                                                                                                                                                           |
| **Assets**                           | SVG propio de trazo (vara + barra + rótulos), estilo de los iconos del DS.                                                                                                                                                                                                                                                                                                                                        |
| **Propiedades**                      | Solo `transform: scaleY` + `opacity`. **Sin loop** (el instrumento mide una vez y para — coherente con el dial).                                                                                                                                                                                                                                                                                                  |
| **Reduced-motion**                   | Composición estática: barra ya detenida bajo la vara, veredicto y remate completos. El mensaje entero, cero frames.                                                                                                                                                                                                                                                                                               |
| **Daltonismo**                       | El significado lo porta **la altura + el símbolo ▼ + el texto**. El color es el tercer refuerzo, nunca el primero.                                                                                                                                                                                                                                                                                                |

### E07 · Lo fino — la página baja la voz

| Campo                                | Valor                                                                                                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mensaje**                          | Privacidad arquitectónica · qué mide y qué no finge medir · requisitos y límites · el mapa · el diccionario.                                          |
| **Gramática**                        | G3 + G2 (`details` nativo).                                                                                                                           |
| **Técnica**                          | Entradas **asentar** con el reveal general; al abrir un `details`, su cuerpo asienta una vez. Nada más — ritmo: _toda escena clímax = ninguna lo es_. |
| **Cómo el motion cuenta el mensaje** | Después del clímax, sosiego. Lo fino se lee, no se dramatiza.                                                                                         |
| **Reduced-motion**                   | Apertura instantánea completa.                                                                                                                        |

### E08 · El cierre — el número que se cuenta solo

| Campo                                | Valor                                                                                                                                                                                                                                         |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mensaje**                          | Están las **33**, ninguna por fuera.                                                                                                                                                                                                          |
| **Gramática**                        | G3 (+ remate del G1 de E02).                                                                                                                                                                                                                  |
| **Técnica**                          | El **33** se **cuenta** 0→33 en rAF (`tabular-nums`, ancho fijo en `ch`, una vez al entrar en viewport). **El texto accesible dice "33 funcionalidades" desde el primer byte** — el e2e del conteo ni se entera. La probeta llega a su marca. |
| **Cómo el motion cuenta el mensaje** | El dato duro dramatizado, y la metáfora cerrada: el instrumento terminó de medir.                                                                                                                                                             |
| **Reduced-motion**                   | "33" quieto desde siempre; la probeta llena.                                                                                                                                                                                                  |

---

## 5 · Capas y cuadre del conteo — **33/33**

**Capa 1 — 4 tarjetas** (el orden ES la jerarquía):

| #   | Tarjeta                              | Icono (DS) | Features |
| --- | ------------------------------------ | ---------- | -------- |
| 1   | **El veredicto honesto** ⭐          | `check`    | 10       |
| 2   | **Datos reales, tratados de frente** | `table`    | 7        |
| 3   | **El porqué, contado honesto**       | `sparkle`  | 5        |
| 4   | **El modelo se usa**                 | `download` | 9        |

**Capa 3** completa con **2** (bilingüe ES/EN · diccionario de términos) → **31 + 2 = 33**.

La **tabla de mapeo completa** (feature → sección del manual → tarjeta) va en
`sprints/ENTREGA-brochure-summary.md`, como pide la regla 3 del molde.

**Qué NO cuenta y por qué:** el brochure no se documenta a sí mismo (regla 3 del molde).

**Capa 3 — 5 acordeones:** privacidad por construcción (Pyodide en tu navegador; la única salida es
la narración **a petición tuya**, y viajan **agregados, no filas** — **652 B medidos en el gate**) ·
qué mide y qué no finge medir (las limitaciones de los 4 sprints, tal cual) · requisitos honestos
(CPU, navegador, **sin GPU**) · el mapa (la app es **un solo espacio de trabajo** con pantallas
encadenadas — dicho con franqueza, no inventando rutas) · diccionario de términos.

---

## 6 · Plan técnico

**Branch:** `entrega/brochure-conoce`.

- **`docs/BROCHURE.html`** — canónico, autocontenido (cero CDN, cero fetch), abre con doble clic.
  Tokens `:root` **reemplazados por los del design-system** (los mismos hex de
  `design-sync/styles.css`), con tema claro base + `prefers-color-scheme: dark`; **sin
  `[data-theme]`**: el brochure vive fuera del storage de la app y **no persigue** su selector — se
  declara (nota data-tema de la regla 8).
- **`/conoce`** — sin duplicar contenido: `scripts/copy-brochure.mjs` copia `docs/BROCHURE.html` →
  `public/conoce.html` en `predev`/`prebuild` (**precedente exacto**: `scripts/copy-pyodide.mjs`) +
  rewrite `/conoce` → `/conoce.html` en `next.config.ts`. `public/conoce.html` a `.gitignore` (misma
  política que `public/pyodide/`). **CSP verificada**: `script-src`/`style-src` ya llevan
  `'unsafe-inline'`.
- **Fase 0:** adoptar el delta del kit (`/deploy-check` §11 + regla 15 + casillas de dependencias).
- **BLUEPRINT:** añadir dominio + **protección de deployment**.
- **Cero cambios** en `engine/`, `pipeline.py`, features o comportamiento.

**Tests nuevos — `tests/e2e/brochure.spec.ts`:**

1. `/conoce` responde 200 y el H1 está presente.
2. Las tarjetas llegan **cerradas** (`aria-expanded="false"`); al abrir, `true`.
3. **Lo cerrado FUERA del árbol de accesibilidad** — verificado contra el árbol real por **CDP**.
4. **Reduced-motion OBLIGATORIO** (`reducedMotion: "reduce"`): afirma **visibilidad real** (opacidad
   y tamaño > 0) del h1, del clímax y del conteo.
5. El conteo **33** presente en el pie como texto desde el primer byte.
6. `axe` con el detalle abierto.

---

## 7 · El bloqueo declarado antes del cierre

La acceptance **#10** exige probar el link de producción **desde afuera, sin sesión**. Al proponer
este guion eso era **imposible**: producción respondía **302 → SSO** (Vercel Deployment Protection).
No lo resuelve el builder — es una opción de la cuenta de Vercel del usuario. Recomendación: dejarla
**solo para previews** antes del merge. Queda documentado en el BLUEPRINT como parte de esta entrega.

## 8 · Verificación end-to-end

1. `pnpm test` · `test:integration` · `test:e2e` · `typecheck` · `lint` — todo verde, **cada check
   requerido con conclusión propia `success`**.
2. **Pasada de capturas por bloque**, leídas como imagen y **cuadro a cuadro en las animaciones**,
   ANTES de presentar nada.
3. `docs/BROCHURE.html` abierto con doble clic, sin red.
4. **Gate visual del usuario sobre la preview** (proceso con rondas, no sí/no).
5. Última milla: `/conoce` de producción en incógnito, sin sesión.
6. Al merge: `sprints/ENTREGA-brochure-summary.md` con el N y la tabla de mapeo completa.
