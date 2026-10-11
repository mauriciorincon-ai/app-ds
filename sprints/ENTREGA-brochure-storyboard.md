---
entrega: brochure
app: ds
estado: guion aprobado
propuesto: 2026-08-15
aprobado: 2026-08-15
aprobado_por: usuario (regla CERO del molde v2)
branch: entrega/brochure-conoce
delta_s7: decidido 2026-10-06 (§9) — D-A = A (E04b + quinta puerta), D-B = A (ES/EN en este PR)
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

> Conteo del guion aprobado en el H1. El S6 lo llevó a 35 sin tocar este guion (tabla de mapeo en
> `SPRINT_006-summary.md`); el delta del S7 (§9) propone 41.

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

---

## 9 · Delta del Sprint 007 — el catálogo (DECIDIDO 2026-10-06)

> **Decisión del usuario (2026-10-06), literal:** «1. A, 2. A 3. Arreglalo 2 A». Lo que toca al
> brochure: **D-A = A** (la escena E04b «Cuatro preguntas, la misma vara» + la quinta puerta) y **D-B =
> A** (el brochure en ES y EN en este PR). El clímax no cambia. El veredicto visual de lo construido
> va a la parada 7 del ⭐⭐ corto (Acto 2).

> Regla CERO: ni una línea de HTML hasta que decidas. Lo que sigue propone qué cambia en el guion;
> las §1–§8 de arriba siguen siendo el guion aprobado y no se reescriben.

### 9.1 · Qué cambió en la app y qué volvió falso en la página

El S7 cerró el catálogo del H2: la app **clasifica en varias categorías** (3 a 20, con la matriz K×K y
la fuga por categoría) y **agrupa filas parecidas sin objetivo** (cuatro agrupadores, la lectura «los
grupos existen / son frágiles / no hay estructura», perfiles, filas con su grupo y asignar filas
nuevas). Frases del brochure de hoy que eso volvió falsas o incompletas:

| Línea de `docs/BROCHURE.html` | Dice hoy | Por qué ya no basta |
| --- | --- | --- |
| :798 (V1) | «Una columna de dos opciones… o una cantidad» | También varias categorías, o ninguna columna (agrupar) |
| :802 (fuga) | «La columna X podría ser un proxy del objetivo» | Con varias categorías nombra también **la categoría** que delata |
| :803 (métricas) | Al clasificar, las cinco de dos clases | Con varias categorías decide la exactitud balanceada; al agrupar no hay prueba |
| :808 (la pregunta) | «¿Categorías o una cantidad? Te lo pregunta» | Cierto, pero ahora **las dos respuestas entrenan** |
| :842 (ejemplos) | «cinco ejemplos incluidos» | **Siete** (se sumaron «Planes de suscripción» y «Segmentos de clientes») |
| :882 (narración) | «Narración con IA, solo si la pides» | Solo en la tarea de **dos clases**; las otras tres usan el texto estándar |
| :1055 (lo fino) | «Varias categorías, todavía no.» | **Falso**: promesa aplazada que el S7 cumplió |
| :1138 (diccionario) | «Desbalance: una de las dos respuestas…» | Con varias categorías, «una de las respuestas» |
| :1157 y :1174 (pie) | 35 funcionalidades; historial hasta la Etapa 6 | Falta el S7 |

### 9.2 · Las dos decisiones

| Archivo | Qué decidir | Opciones | Respuesta esperada |
| --- | --- | --- | --- |
| este archivo, §9.3–§9.5 | **D-A · La forma del catálogo en la página** | **A (recomendada):** una escena nueva, «Cuatro preguntas, la misma vara» (E04b, entre las puertas y el corte), más una **quinta puerta**, «Agrupar sin objetivo». **B:** solo la quinta puerta (re-corte de E03/E04), sin escena nueva. **C:** corregir lo falso y el conteo, con las funcionalidades nuevas repartidas en las cuatro puertas de hoy | A, B o C |
| `docs/BROCHURE.html` entero | **D-B · El inglés del brochure** (regla 16 de la constitución: el brochure es bilingüe; hoy solo existe en español, desde el H1) | **A (recomendada):** el brochure en ES y EN en este PR: mismo archivo, conmutador ES/EN visible, idioma inicial el del navegador, copy **redactado** en inglés (no traducido) y un e2e que exige las mismas escenas, puertas y conteo en los dos idiomas. El export (`brochure-export.json`) es un contrato compartido con la vitrina: su inglés lo anoto como desviación para la planeadora, que es su dueña. **B:** deuda declarada en el summary, con el S8 como sprint de pago | A o B |

**El clímax (E06) no cambia, y es a propósito.** La promesa mayor sigue siendo el veredicto franco
contra la mejor regla simple («▼ NO supera al baseline»). Agrupar no tiene veredicto: su honestidad
(«○ No hay estructura de grupos») la cuenta la escena E04b, sin pelearle el pico al clímax. Si
prefieres que el clímax la mencione, dilo al decidir.

### 9.3 · E04b · «Cuatro preguntas, la misma vara» (solo con D-A = A)

| Campo | Valor |
| --- | --- |
| **Mensaje** | Le puedes hacer cuatro preguntas a tu tabla, y en las cuatro la app te dice cuánto creerle. |
| **Gramática** | G3 (corrida al entrar en el viewport, una sola vez). |
| **Técnica** | Cuatro fichas de instrumento (una columna a 360 px; 2 × 2 desde ~640 px). Cada una lleva la **pregunta** en grande, un **ejemplo** en una línea y la **vara** con su símbolo: (1) «¿Sí o no?» · «¿renuncia o se queda?» · **▲ ＝ ▼** contra la mejor regla simple; (2) «¿Cuál de varias?» · «¿qué plan contrata?» · **✓** en la diagonal: dónde acierta y con qué se confunde; (3) «¿Cuánto?» · «¿cuántos kWh gastará?» · **±** el error en las unidades de tu columna; (4) «¿Qué grupos hay?» · «¿qué clientes se parecen?» · **● ⚠ ○** si los grupos existen, son frágiles o no hay estructura. Las fichas **asientan** con stagger de 70 ms y, dentro de cada una, el orden es pregunta → ejemplo → vara (jerárquico, jamás uniforme). Remate debajo: «En las cuatro, la app te dice cuánto creerle — también cuando la respuesta es que no.» |
| **Cómo el motion cuenta el mensaje** | Las cuatro llegan iguales y se quedan quietas: la misma vara para todas. Nada se anima para adornar; la escena es un respiro antes del corte. |
| **Assets** | Glifos SVG de trazo por ficha (estilo de los iconos del DS, como el SVG del clímax): ✓, una cuadrícula con su diagonal, una nube de puntos con su recta y tres racimos de puntos. 0 KB externos. |
| **Propiedades** | Solo `transform` + `opacity`. Sin loop. |
| **Reduced-motion** | Las cuatro fichas completas y quietas desde el primer frame. |
| **Daltonismo** | El significado lo portan el símbolo y el texto de la vara; el color es el tercer refuerzo. |

### 9.4 · La quinta puerta: «Agrupar sin objetivo» (con D-A = A o B)

La entradilla de E03 pasa a «Cinco cosas, y las cinco de frente». La puerta entra la última, con el
mismo stagger (la estrella sigue siendo el veredicto). Icono: un glifo propio de trazo, tres racimos de
puntos, en el estilo del DS (el set de `ICON_PATHS` no tiene uno de grupos; se declara como el SVG del
clímax). Resumen: «Cuando no hay nada que predecir: encuentra grupos y te dice si existen de verdad».

| # | Funcionalidad | Sección del manual |
| --- | --- | --- |
| G1 | **Agrupa filas parecidas, sin objetivo.** Cuatro agrupadores prueban de 2 a 10 grupos y cada uno dice cómo eligió cuántos. | Agrupar filas parecidas, sin objetivo |
| G2 | **Te dice si los grupos existen.** ● existen · ⚠ frágiles · ○ no hay estructura: compara con datos al azar y repite el agrupamiento. Sin prueba ni baseline, porque no hay respuesta que examinar. | ídem |
| G3 | **Qué distingue a cada grupo.** Su tamaño y las columnas que más lo separan, en tus unidades; las filas que no caen en ningún grupo, aparte. | ídem |
| G4 | **Tus filas con su grupo.** Tu tabla entera con una columna más, armada en tu navegador. | ídem |
| G5 | **Asigna filas nuevas a un grupo.** Con la regla dicha y un archivo de modelo sin ninguna de tus filas. | ídem |

### 9.5 · Delta por escena y conteo

| Escena | Cambio |
| --- | --- |
| E01 · portada | Ninguno. |
| E02 · la probeta | Ninguno (mide el recorrido, sea cual sea su largo). |
| E03/E04 · las puertas | Quinta puerta (§9.4). En la del veredicto: **V-nueva «Clasifica en varias categorías»** (de 3 a 20, la exactitud balanceada contra dos baselines, la matriz con los aciertos marcados ✓ y la confusión más frecuente en palabras), y V1, fuga, métricas y la pregunta corregidas (§9.1). En datos: «siete ejemplos». En el porqué: la narración «en la tarea de dos clases». |
| E04b · el catálogo | Nueva (§9.3), solo con D-A = A. |
| E05 · el corte | Una frase más en la leyenda: «Al agrupar no hay respuesta que examinar, así que no hay segunda parte: la app repite el agrupamiento sobre partes de tus filas y lo compara con datos al azar.» |
| E06 · clímax | Ninguno (ver §9.2). |
| E07 · lo fino | «Varias categorías, todavía no» sale; entran los límites de agrupar (los grupos describen, no prueban una causa; el jerárquico usa una muestra por encima de 8,000 filas) y la narración solo en dos clases. Diccionario: exactitud balanceada, silueta, estabilidad y «fuera de todo grupo»; «Desbalance» corregido. |
| E08 · cierre | **41** funcionalidades; historial con la **Etapa 7** («El catálogo: varias categorías y agrupar sin objetivo»). |

**Conteo: 35 → 41** = la puerta del veredicto 12 → 13 (V-nueva) + la quinta puerta 5 (G1–G5); el
resto no cambia (7 + 5 + 9 + 2 de lo fino). Con D-A = C, las mismas 6 entran en las puertas de hoy
(V-nueva y G1–G3 en la del veredicto, G4 y G5 en «El modelo se usa») y el total es el mismo. La tabla
de mapeo completa va en el summary del S7, como pide la regla 12.

**Dial `MOTION_INTENSITY`:** sin cambios («instrumento calibrado»). **Riesgo registrado:** una escena
más alarga el recorrido y puede diluir el clímax. Mitigación: E04b solo asienta, es corta, y va antes
del corte, así que el último pico sigue siendo E06.

**Pruebas que cambian:** `tests/e2e/brochure.spec.ts` (5 puertas, 41 en el pie, la visibilidad real de
E04b con reduced-motion) y `tests/unit/brochure-export.test.ts` (el total y los grupos del export). Con
D-B = A, además, la paridad ES/EN.
