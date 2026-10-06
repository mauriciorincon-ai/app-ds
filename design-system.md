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

**Primitivos propios** en `src/components/ui.tsx`, con estos tokens (no se instaló shadcn/ui ni
Radix: ADR 019; los diálogos son el `<dialog>` nativo):

- **Button** — `primary` (acento sólido), `secondary` (hairline + ink), `ghost`. Alto 44px (táctil),
  radio `md`, foco con ring de `accent`. **Todo botón de acción lleva icono de trazo a la
  izquierda del texto** (gate ⭐ S4): SVG inline propio (`Icon` en `ui.tsx`), `currentColor`,
  stroke ~1.8, `aria-hidden`, ~16px — jamás emojis; el texto siempre permanece (el icono
  refuerza, no reemplaza).
- **Card** — `surface`, hairline, radio `lg`, sombra `sm`.
- **Dropzone** — carga de CSV: borde punteado hairline, estado hover/drag con acento; microcopy
  honesto del límite (5 MB / 50k filas).
- **DataTable** — preview del dataset y matriz de confusión; cifras en mono/tabular-nums; cabecera
  `surface-sunken`.
- **MetricTile** — una métrica (valor mono grande + etiqueta caption); en fila para el panel de test.
- **VerdictBanner** — **la pieza jerárquica del producto**: enuncia el veredicto (símbolo + texto +
  color semántico) y el delta vs baseline, **nombrando al modelo ganador** («Random Forest» supera
  al baseline — gate ⭐ S4: "el modelo" a secas dejaba la duda de cuál). Es lo más importante de la
  pantalla de resultados.
- **LeakageAlert** — advertencia de fuga (`caution`, icono ⚠ + texto): "esta columna podría ser un
  proxy del objetivo", sin prometer exhaustividad.
- **ProgressStepper** — etapas honestas del entrenamiento (preparando motor → cargando datos →
  entrenando), con la etapa activa en acento.
- **Badge** — perfilado (tipo/nulos/cardinalidad, fecha detectada) y estados.
- **LangToggle** — ES/EN, `aria-pressed`.

### Añadidos Sprint 002 (mismos tokens, cero valores nuevos)

- **ImportanceChart** (en WhySection) — barras CSS puras: relleno `accent` sobre `surface-sunken`,
  cifras en mono/tabular-nums, dirección SIEMPRE con símbolo + texto (▲/▼/·), nunca solo color.
  La dirección **nombra la columna objetivo del usuario** ("más probable que «convirtio» sea «1»"),
  jamás una etiqueta huérfana; al pie, una nota fija explica **qué clase se intenta detectar** y que
  la barra mide _importancia_ mientras la línea dice _dirección_ — una variable puede pesar mucho y
  no tener una sola dirección (gate ⭐ S4, bloque C).
- **VerifiedBadge** — variante `positive` del Badge: "✓ verificada con los números"; su contraparte
  neutral "Texto estándar" distingue la plantilla. La diferencia es informativa, no decorativa.
- **NarrationBlocks** — DOS tarjetas hermanas y rotuladas (gate ⭐ S4): **"Texto estándar"**
  (determinista, local, SIEMPRE presente, con Badge neutro "sin IA · siempre disponible") y
  **"Narración con IA"** (a demanda, con botón `secondary` + icono `sparkle`, explicación honesta
  de qué viaja y Badge `positive` "✓ verificada con los números" al llegar). La IA jamás reemplaza
  al texto local: se leen uno al lado del otro. Sin interruptor persistente — la pulsación ES el
  consentimiento, para ese experimento y una vez (ADR-006 enmendado).
- **ModelCardView** — tarjeta sobria con acción primaria (descarga) y vista previa plegable en mono
  (`details`, sin JS extra). El documento es el protagonista, no la tarjeta.

### Añadidos Sprint 003 (mismos tokens, cero valores nuevos)

- **NoveltyPanel** (en ScoreScreen) — la advertencia central del scoring: conteos por columna en
  `caution` con ⚠ + texto ("«columna»: N valores fuera del rango…"), resumen en mono/tabular-nums
  ("adivinando en N de M filas (P%)") y su contraparte positiva "✓ Sin novedades". Nunca solo color.
- **SchemaBlock** (en ScoreScreen) — bloqueo honesto en `negative` con ✕ + lista mono de columnas
  faltantes EXACTAS; jamás puntúa a medias. Chips mono de columnas requeridas en el estado vacío.
- **ScoredPreview** (en ScoreScreen) — tabla con las 2 columnas nuevas primero (nombres resueltos,
  cifras en mono) y las del usuario en `ink-muted`; overflow-x en móvil.
- **ImportSummary** (en StartScreen) — resumen del manifiesto ANTES de continuar: ✓ + dataset,
  fecha, métrica, veredicto y fugas; advertencia de versión en `caution`; rechazo en `negative`
  con la razón exacta y microcopy "solo archivos de Probeta". El payload nunca se toca aquí.
- **ExportModelCard** (en ResultsScreen) — par de acciones "Usar el modelo" (primaria) y "Exportar
  modelo" (secundaria, estados listo/exportando/error) + microcopy honesto de qué contiene el
  archivo (y qué no: filas crudas). Tras el feedback visual del usuario (S3), "Exportar modelo"
  también vive en la barra inferior de ScoreScreen — SOLO para modelos entrenados en la sesión
  (un modelo importado ya es el archivo).

### Añadidos Sprint 004 (mismos tokens, cero valores nuevos)

- **SanitationBlock** (en ConfigScreen) — informe de saneamiento ANTES de entrenar, con dos caras
  honestas: dataset limpio ⇒ franja `positive` con ✓ "nada que sanear" (el usuario merece saber
  que no se tocó nada); dataset sucio ⇒ tarjeta con ⚙ + lista de acciones con **conteos exactos**
  en llano (filas duplicadas quitadas, columnas excluidas por ID/constante, celdas basura→nulo por
  columna). Nada silencioso. `role="status"`. **Estados positivos con verde EVIDENTE** (gate ⭐
  S4, daltonismo leve del usuario): tinte 15% + borde sólido + barra izquierda + ✓ en **círculo
  relleno** `positive` con texto `--bg` — la tranquilidad jamás depende de percibir un tinte
  sutil.
- **EdaBlock** (en ConfigScreen) — alertas exploratorias del objetivo elegido: posible fuga /
  casi-identificador / desbalance, en `caution` con ⚠ + texto (nunca solo color); silencio activo
  ✓ "sin señales" si el objetivo está sano. `role="status"` (no `alert`: informa, no interrumpe —
  Next reserva `alert` para el anuncio de ruta, regla 7). Distinto visual y semánticamente de
  **LeakageAlert** (aquel es el hallazgo del veredicto, este es un aviso pre-entrenamiento).
- **CandidatesList** (en ResultsScreen) — la competencia franca de modelos (Random Forest vs
  HistGradientBoosting) bajo el MISMO veredicto, en **caja destacada** (`accent` al 5% + borde
  `accent/40`, título `text-base` — gate ⭐ S4: merece protagonismo): tabla comparativa con las
  **métricas completas de AMBOS candidatos** (columna por candidato, fila por métrica; la primaria
  resaltada con fondo `sunken` + sufijo "(primaria)"), el ganador marcado con símbolo **▶**
  (`positive`) + peso tipográfico + Badge `positive` "elegido"; los demás con **·** en `ink-muted`.
  La nota metodológica ("mismo preprocesamiento, mismo veredicto; sin trucos") en `text-sm`, nunca
  letra pequeña. Símbolo + texto, nunca solo color. _Reemplazada en el Sprint 005 por la
  **LeagueTable** (abajo): «sin selector de usuario» dejó de ser la regla — la honestidad acompaña
  y etiqueta, no bloquea ni esconde (ADR 011)._
- **SanitationSection** (en ModelCardView) — el saneamiento aplicado se registra también en la
  model card exportable (qué se limpió y con qué conteos), coherente con el informe de config; el
  nombre del modelo ganador queda parametrizado (ya no hardcodea "Random Forest").
- **ImportanceChart — regla nueva (gate ⭐ S4, bloque E):** una variable con **importancia ≤ 0 no
  muestra dirección y tiene mensaje PROPIO**. La dirección se calcula por correlación univariada,
  INDEPENDIENTE de la importancia; pintar una flecha sobre una variable que el modelo no usa
  afirmaría un comportamiento que la medición no respalda. Y el mensaje debe distinguirse del de
  «sin dirección clara»: una variable que pesa 0.063 sin dirección consistente y otra de −0.005
  que no aporta nada **no pueden leerse igual** (confusión real del usuario en el gate). Copy
  exacto: _«· el modelo no se apoya en esta variable (quitarla no le haría perder precisión)»_.
  **La honestidad manda sobre la simetría visual**: es preferible una fila sin flecha que una
  flecha sin respaldo. La regla vive UNA vez en `engine/explainability.ts` (`isFeatureUsed`) y la
  consumen el gráfico, la plantilla determinista y el prompt del LLM; su umbral es espejo del de
  `pipeline.py`, con test de paridad.
- **ErrorScreen — estado "esto no es un CSV de comas"** (gate ⭐ S4, bloque D): cuando el archivo
  llega separado por `;` o tabuladores (lo que produce Excel en español), la app **no adivina**:
  nombra el separador real, explica por qué no reconoce ninguna columna y da la acción exacta
  ("vuelve a guardarlo como CSV delimitado por comas"). Mismo patrón de copy que el mensaje de
  fuga —qué pasa · elemento nombrado · acción concreta— que el usuario declaró estándar de la app.
  Bloquear con diagnóstico es preferible a leer mal en silencio: una lectura adivinada convertiría
  columnas numéricas en categorías sin avisar.

### Añadidos Sprint 005 — la liga (mismos tokens, cero valores nuevos)

Regla madre (ADR 011): **la honestidad acompaña y etiqueta; no bloquea ni esconde.** Todo puntaje
se muestra con su etiqueta, toda marca lleva símbolo **relleno** + texto (daltonismo leve del
usuario: un tinte sutil no comunica), y todo botón de acción lleva su icono de trazo a la izquierda.

- **TaskCard** (en ConfigScreen, E1) — el tipo de predicción del objetivo elegido con su razón en
  números (_«2 valores distintos → clasificación binaria»_); si la tarea aún no se entrena, lo dice
  en `ink-muted` y deshabilita «Entrenar modelos» sin esconder la columna. Si la tarea se entrena
  pero el plan está bloqueado (p. ej. muy pocas filas), tampoco hay ✓: ⚠ `caution` y la frase
  remite al motivo, que se muestra debajo. El selector ofrece TODAS las columnas como «columna ·
  tarea».
- **RosterCard** (en ConfigScreen, E2) — «Quién compite»: **Nivel 1** (chips `sunken` + estimación),
  **Nivel 2** (uno por línea con su costo y el total de la liga completa) y **Fuera ·
  recomendación** (uno por línea con su razón medida), más la nota «nada se esconde». La acción
  «Entrenar modelos» vive ARRIBA de la vista previa (mirada de forma S5: en 360 px quedaba a varias
  pantallas del objetivo) con la estimación debajo.
- **LeagueTable** (en ResultsScreen) — reemplaza a CandidatesList. **Filas = modelos** (escala a 14),
  ordenadas por validación cruzada: media en mono + «± desviación» en `ink-muted`.
  - Encima, la regla fija: _«La tabla se calcula con validación cruzada: sirve para elegir. El
    veredicto se calcula con el conjunto de prueba: sirve para creer.»_
  - Marcas (bajo el nombre, `text-xs`): **★ en disco relleno `accent` + «Ganador (validación
    cruzada)»** con fila `border-l-4 accent` + `accent/5`; **◆ en disco relleno `ink` + «Elegido por
    ti»** con fila `border-l-4 ink` + `sunken`; ▲ «mejor puntaje»; ≈ «empata con el mejor»; ⚠ «no
    convergió» en `caution`; ✕ «no concluyó (tipo)» en `negative`; «lo incluiste tú».
  - Prueba **a pedido**: botón ghost con icono `eye` y `aria-expanded`; al abrir, advertencia en
    franja `caution/10` y la columna «Prueba · métrica · no sirve para elegir» en banda ámbar. En
    móvil la prueba va como línea propia ámbar dentro de la celda de CV («prueba 0.761»).
  - Acción por fila: Badge `positive` «✓ En uso» · «Elegir» (`secondary` + `check`) · «Volver al
    ganador» (`secondary` + `back`). En móvil vive bajo el nombre; desde `sm`, en su columna «Usar».
  - Pendientes del Nivel 2 y «fuera» como filas de ancho completo en `ink-muted`, con su razón.
  - Región desplazable `relative overflow-x-auto` enfocable por teclado (un `sr-only` absoluto sin
    bloque contenedor posicionado estiraba la página a 403 px en 360 — pasada de capturas S5).
  - Al pie: cómo se eligió el ganador (regla de un error estándar, con la cifra) y el tiempo.
- **VerdictBanner — elegido por ti (U1):** con elección manual, el veredicto habla del elegido y
  suma la línea _«◆ Elegido por ti, no por la validación cruzada. Si lo elegiste mirando la prueba,
  este número puede ser optimista.»_ Si gana la logística (también baseline) el titular es propio:
  _«La liga no encontró nada mejor que la regresión de referencia»_ (＝, `ink`).
- **FichaButton + FichaModelo** (E3) — el nombre de cada modelo (y de cada baseline) es un botón
  subrayado sutil (`decoration-hairline`) con icono `info` a la izquierda, 44 px. Abre un
  `<dialog>` nativo modal (`surface`, radio `lg`, `backdrop: black/50`, máx. 85 dvh con scroll):
  eyebrow «Ficha del modelo», nombre, **línea de estado en esta liga** (★/◆ + texto, puesto k de n,
  pendiente, fuera porque…, baseline), y cinco apartados en `dl` (qué es · cuándo sirve · cuándo no
  · qué mirar · cuánto cuesta); las variantes balanceadas suman su párrafo en caja `sunken`.
  «Cerrar» (`secondary` + `x`), Esc o clic en el fondo; el foco vuelve al botón. Llega por
  `import()` dinámico.
- **Level2Card** (en ResultsScreen) — «Nivel 2: la liga completa»: qué suma (con nombres),
  `fieldset` «Incluir de todos modos» con checkbox de 20 px y fila táctil de 44 px por cada «fuera»
  con la razón del encarrilador, estimación con las cifras en mono «N modelos · unos T en este equipo» y la nota en prosa `ink-muted` «Calibrado con lo que tardó la corrida anterior.»,
  acción primaria «Correr el Nivel 2 (+n)» con icono `play` y la promesa de cancelación debajo.
  Avisos tras cancelar/fallar con icono `info` (`role="status"`); restauración fallida en `negative`
  con ✕ (`role="alert"`).
- **TrainingScreen — liga:** línea mono «Validación cruzada · modelo k de N: nombre» (y luego
  «Conjunto de prueba · …») + barra `progressbar` accesible (`sunken` con relleno `accent`); en el
  Nivel 1, línea mono con la estimación que prometió Configuración; en el Nivel 2, encabezado mono
  con conteo y estimación + «Cancelar el Nivel 2» (`secondary` + `stop`). La región viva
  (`role="status"`) envuelve solo la lista de etapas: la línea por modelo cambia hasta 2·N veces y
  no se anuncia (la barra expone el avance).
- **Motion:** `motion-reduce:transition-none` en botones, zonas de carga y tarjetas de ejemplo — la
  regla «respeta prefers-reduced-motion» ahora la vigila un e2e con opacidad efectiva medida.

### Añadidos Sprint 006 — estimar una cantidad (mismos tokens, cero valores nuevos; ADR 013)

Miradas de FORMA M1 (Resultados de regresión) y M2 (la pregunta de la columna ambigua),
aprobadas por el usuario el 2026-10-04 con la preview abierta.

- **TaskCard — cantidad y pregunta:**
  - **Cantidad:** con un objetivo numérico dice _«Vas a estimar una cantidad, en kWh…»_ (✓
    `positive`). La unidad sale de una tabla CERRADA de sufijos del nombre (`_kwh`, `_usd`…). Sin
    sufijo conocido no se inventa: _«…en las unidades de «columna»»_.
  - **Columna ambigua** (pocos números distintos): `role="group"` con la pregunta _«¿«columna» guarda
    categorías o una cantidad?»_, marcada con `?` en `accent` y franja `border-l-4 accent`.
  - **Las dos respuestas:** botones de ancho completo (44 px mínimo, icono de trazo a la izquierda:
    `ruler` para cantidad, `tag` para categorías) con su consecuencia en `text-xs ink-muted`.
  - **La sugerida:** borde `accent` + `accent/5` + **«★ Sugerida»** (símbolo + texto, nunca solo
    color).
  - **Respondida:** la tarjeta dice _«Respondiste: …»_, la tarea que resulta, y ofrece «Cambiar la
    respuesta» (ghost + `retry`).
- **VerdictCard** (compartida por las dos tareas): el banner jerárquico del S1 extraído. Al estimar,
  el detalle va **en unidades**: _«En promedio se equivoca por ±33.5 kWh; una regresión lineal se
  equivoca por ±43.8 kWh: un 23 % menos de error.»_
  - El rival es el mejor de dos baselines: la **mediana** o la **lineal**.
  - La lineal es baseline Y miembro: el titular «La liga no encontró nada mejor que la regresión
    lineal de referencia» aparece SOLO si empata. «NO supera» nunca se tapa.
- **Métricas de regresión:** cuatro MetricTile (MAE · RMSE · R² · MedAE; `grid-cols-2` en móvil,
  `sm:grid-cols-4`) + la línea «cuál mirar y por qué» en prosa `ink-muted`.
- **Cifras en unidades (R9):** punto decimal y miles con coma, como el resto de la app (no
  dependen del idioma). Llevan 3 cifras significativas del valor más chico del grupo que se compara
  (el modelo y el baseline salen con los mismos decimales). Entre el número y la unidad va un
  **espacio no separable**: «33.5 kWh» nunca se parte en dos líneas.
- **PredichoVsReal** (SVG sin librería, en Resultados, fuera del LCP) — «Estimado frente a real,
  en el conjunto de prueba»:
  - **Ejes:** real en horizontal, estimado en vertical, mismo rango en los dos. Rejilla `hairline`,
    marcas mono de 12 px en el viewBox con paso redondo (1·2·5 × 10ⁿ) y rótulo de eje con la
    unidad, también de 12 px. En un móvil de 360 px el SVG se escala a 0,8, así que se leen a unos
    9,6 px (con 10 px quedaban en 8; auditoría del S6, AU-S6-43). Los márgenes salen del rótulo más
    largo: el izquierdo (mínimo 64) para no pisar el título del eje y el derecho (mínimo 12) para
    que quepa medio rótulo de una marca en el borde. Si los rótulos del eje horizontal se tocarían,
    se rotula una marca de cada dos (o de cada k) y la rejilla va entera (`leftMargin`,
    `rightMargin` y `labelEvery` en `src/lib/scatter.ts`).
  - **La diagonal** y = x: línea continua `ink`, 1.5 px.
  - **La franja ±MAE:** relleno `accent/10` con bordes punteados `accent` pleno (4 3): ≥ 3:1 contra el fondo en los dos temas (con `accent/60` daban 2,7:1 y 2,9:1; auditoría del S6, AU-S6-20).
  - **Los puntos cambian de FORMA, no solo de color:** disco relleno `accent` dentro de la franja;
    anillo `caution` sobre `surface` fuera.
  - **Leyenda** en HTML con una muestra dibujada de cada elemento.
  - **Accesibilidad:** `role="img"` con un nombre que describe el gráfico y cuántos de cada 100
    quedan dentro de la franja. Si la muestra es menor que la prueba (tope 200), se dice.
  - **El equivalente en texto** va debajo, sobre TODA la prueba: tres frases (dónde cae la mitad del
    error, el 90 %, hacia dónde se inclina) y una tabla de percentiles del error con signo
    (estimado − real).
- **LeagueTable — menor es mejor:** con el MAE la tabla ordena de menor a mayor, la banda del error
  estándar suma y una línea ▼ lo dice (_«En esta tabla, menor es mejor…»_). Las cifras van en
  unidades. El resto, igual que el S5.
- **WhySection — sin IA al estimar:** las direcciones se leen contra la cantidad (_«▲ a mayor
  valor, mayor «consumo_kwh»»_). El bloque de IA se reemplaza por una línea franca en caja `sunken`
  (no hay botón que no haría nada); el texto estándar sí está.
- **ScoreScreen — estimar:** la columna nueva es `<objetivo>_estimado` con los decimales del
  objetivo, sin probabilidad (se dice por qué). El mosaico de clases se reemplaza por tres
  MetricTile: mínimo · mediana · máximo.

### Añadidos Sprint 007 — varias categorías y agrupar (mismos tokens, cero valores nuevos; ADR 015 y 016)

Miradas de FORMA M1 (resultados de varias categorías), M2 (resultados de agrupar) y M3 («agrupar en
su lugar»): maquetadas, no vistas. Su veredicto viaja al gate ⭐⭐ del cierre del ciclo H2 (paradas 4
y 5 del ⭐⭐ corto de la guía v4; plan del S7, D4).

- **Símbolos (se suman a los del S1–S6; nunca solo color):**
  - **●** «Los grupos existen» (`positive`), **⚠** «son frágiles» (`caution`), **○** «No hay
    estructura de grupos» (`ink`). ○ también marca la tarjeta «Fuera de todo grupo»: el mismo
    significado, «sin grupo».
  - **◆ queda reservado para «Elegido por ti»** en toda la app. La lectura de agrupar lo usaba hasta
    el décimo commit del S7, y lo vigila una prueba.
  - **★** sigue siendo el ganador: «★ Ganador por consenso» si al menos dos agrupadores coinciden;
    si no, «★ Ganador por puntaje».
  - **✓** marca los aciertos en la diagonal de la matriz de confusión, con «acierto:» en `sr-only`.
- **Inicio:** siete ejemplos en la misma grilla (`sm:grid-cols-2 lg:grid-cols-3`). Los dos nuevos
  son «Planes de suscripción» y «Segmentos de clientes».
- **Configuración:**
  - El selector empieza con **«Sin objetivo: agrupar filas parecidas»**. Su valor no choca con una
    columna del mismo nombre.
  - **TaskCard:** con varias categorías, ✓ `positive` y _«Vas a clasificar en N categorías…»_. Con
    una columna que no sirve como objetivo, ⚠ y el botón secundario **«Agrupar filas parecidas en su
    lugar»** (icono `plus`).
  - **La tarjeta del plan de agrupar:** qué columnas forman el parecido, cuáles solo describen y
    cuáles quedan fuera con su razón. Con más de 8,000 filas suma la nota de la muestra del
    jerárquico, en caja `sunken` con `info`.
  - **RosterCard al agrupar:** «agrupadores», no «modelos». Explica cómo elige k cada uno, y no habla
    de validación cruzada.
- **Resultados de varias categorías** (`MulticlassResults`):
  - **VerdictCard** como siempre. Con una fuga, el titular es «⚠ Posible fuga de datos — sospechoso»
    en las tres tareas con objetivo (decisión 2 del usuario en la auditoría del S7); «métricas casi
    perfectas» ya no es un titular.
  - Cinco MetricTile (`grid-cols-2`, `sm:grid-cols-5`): exactitud balanceada · F1 macro · exactitud ·
    pérdida logarítmica · AUC uno contra el resto. Sin probabilidades, «—», nunca un número
    inventado.
  - **ConfusionTable:** región con desplazamiento propio (`role="region"`, enfocable, nombrada por su
    título), así que la página nunca se desplaza de lado. Nombres recortados (`truncate`, 7–9 rem)
    con el nombre completo en `title`. La frase de la confusión más frecuente va debajo.
  - **PerClassTable:** precisión, sensibilidad, F1 y filas de prueba por categoría.
- **Resultados de agrupar** (`ClusterResults`):
  - **La lectura es el h1** (VerdictCard con ● / ⚠ / ○), con su porqué en cifras y la frase de que
    no hay prueba ni baseline.
  - **Tarjetas de grupo** (`sm:grid-cols-2`): tamaño en mono, las columnas que separan con η² o V de
    Cramér y el promedio de los grupos al lado. Las demás columnas van en un `details` con
    `summary` de 44 px.
  - «Fuera de todo grupo» va en una tarjeta de borde punteado.
  - **La tabla de agrupadores:** el mismo patrón que la LeagueTable, con fila `border-l-4 accent` para
    el ganador y `border-l-4 ink` + `sunken` para el elegido. Cada cifra va con su columna: grupos y
    cómo se eligieron, silueta, fuera de grupo y puntaje.
  - **El Nivel 2 al agrupar:** «Nivel 2: todos los agrupadores», con su propio copy.
- **Cifras (R9, ampliado):** los conteos (filas, muestras) siguen la misma regla que las cantidades:
  «8,000» en los dos idiomas (`thousands` = `formatQuantity(n, 0)`). Las cifras diminutas de un
  perfil van en notación científica, nunca «0».
- **Puntuar:** con varias categorías, `<objetivo>_predicho` + `<objetivo>_probabilidad` (la
  probabilidad de esa categoría) y su nota. Al agrupar, la columna `grupo` desde 1 o «fuera de todo
  grupo», y `grupo_probabilidad` solo con la mezcla gaussiana.

## Jerarquía por pantalla (la "una cosa importante")

1. **Inicio/carga** → la elección: subir CSV o elegir ejemplo. Estado vacío diseñado (no ícono gris).
2. **Configuración** → seleccionar el objetivo; desde S5 la **TaskCard** y la **RosterCard** dicen
   qué se entrenaría y quién compite, y «Entrenar modelos» queda arriba de la vista previa. El
   **SanitationBlock** y el **EdaBlock** lo enmarcan.
3. **Entrenamiento** → el progreso honesto (qué modelo, en qué fase); en el Nivel 2, cancelar.
4. **Resultados** → el **VerdictBanner**; la **LeagueTable** dice por qué ganó quien ganó, y
   métricas, matriz y advertencias lo sostienen. Al estimar (S6), el veredicto va en unidades y el
   **PredichoVsReal** ocupa el lugar de la matriz. Con varias categorías (S7), la matriz es K×K.
   Al agrupar (S7), la **lectura** ocupa el lugar del veredicto, y los grupos y la tabla de
   agrupadores la sostienen.
5. **Error** → el mensaje llano + la acción de recuperación.
6. **Usar el modelo (S3)** → el **NoveltyPanel** antes de descargar; la descarga lo sostiene.
   Encabezado estático (candidato LCP, patrón lcp-nace-estatico).

## Modo claro/oscuro

Ambos definidos arriba. Se sigue la preferencia del sistema (`prefers-color-scheme`); sin toggle
manual en S1. Orientación: responsive vertical (móvil 360–420) y desktop (≥1024), no landscape-only.
