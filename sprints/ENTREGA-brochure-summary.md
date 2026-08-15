---
entrega: brochure
app: ds
status: closed — última milla verificada sin sesión (revisión detallada diferida por el usuario)
opened: 2026-08-15
branch: entrega/brochure-conoce
pr: https://github.com/mauriciorincon-ai/app-ds/pull/10
---

# Entrega puntual — El brochure vivo de Probeta DS (`/conoce`)

## Qué se entregó

1. **`docs/BROCHURE.html`** — el brochure canónico, autocontenido (0 peticiones de red, verificado
   midiendo), que abre con doble clic.
2. **Ruta pública `/conoce`** — el mismo contenido servido por la app, sin duplicarlo:
   `scripts/copy-brochure.mjs` copia el canónico a `public/conoce.html` en `predev`/`prebuild`
   (precedente exacto: `scripts/copy-pyodide.mjs`) + un rewrite en `next.config.ts`.
3. **`sprints/ENTREGA-brochure-storyboard.md`** — el guion aprobado (regla CERO).
4. **`tests/e2e/brochure.spec.ts`** — 6 chequeos, incluido el de reduced-motion obligatorio.
5. **Fase 0** — delta del kit adoptado: `/deploy-check` §11 + las tres casillas de dependencias, y
   la **regla 11** del `CLAUDE.md` (un gate se demuestra fallando **y** corriendo).
6. **BLUEPRINT** — dominio exacto + protección de deployment + la ruta `/conoce`.

## El conteo: **33/33**

| #   | Feature (como se lee en el brochure)                               | Sección del MANUAL              | Tarjeta |
| --- | ------------------------------------------------------------------ | ------------------------------- | ------- |
| 1   | Eliges qué predecir (columna de dos opciones)                      | El veredicto honesto · S1       | 1       |
| 2   | Entrena con el progreso a la vista                                 | El veredicto honesto · S1       | 1       |
| 3   | El veredicto en grande (▲ supera · ＝ empata · ▼ NO supera)        | El veredicto honesto · S1       | 1       |
| 4   | Aviso de métricas casi perfectas                                   | El veredicto honesto · S1       | 1       |
| 5   | Advertencia de fuga con la columna nombrada                        | El veredicto honesto · S1       | 1       |
| 6   | Cinco métricas, todas sobre datos no vistos                        | El veredicto honesto · S1       | 1       |
| 7   | Matriz de confusión                                                | El veredicto honesto · S1       | 1       |
| 8   | Los baselines a la vista                                           | El veredicto honesto · S1       | 1       |
| 9   | Dos modelos compiten y se dice cuál ganó                           | Sobrevive datos reales · S4     | 1       |
| 10  | Nuevo experimento                                                  | El veredicto honesto · S1       | 1       |
| 11  | Sube tu propio CSV                                                 | El veredicto honesto · S1       | 2       |
| 12  | Tres ejemplos incluidos                                            | El veredicto honesto · S1       | 2       |
| 13  | Vista previa con el perfil de cada columna                         | El veredicto honesto · S1       | 2       |
| 14  | Límites honestos (5 MB / 50 000 filas)                             | Limitaciones · S1               | 2       |
| 15  | Saneamiento con el conteo exacto                                   | Sobrevive datos reales · S4     | 2       |
| 16  | Tres alertas antes de entrenar (fuga · identificador · desbalance) | Sobrevive datos reales · S4     | 2       |
| 17  | Bloqueo de CSV con punto y coma                                    | Historial S4 (gate ⭐, D2)      | 2       |
| 18  | Gráfico de importancia con dirección                               | El porqué, contado honesto · S2 | 3       |
| 19  | Texto estándar sin IA ni internet                                  | El porqué, contado honesto · S2 | 3       |
| 20  | Narración con IA a demanda, verificada                             | El porqué, contado honesto · S2 | 3       |
| 21  | Aviso honesto si la narración falla + reintento                    | El porqué, contado honesto · S2 | 3       |
| 22  | Model card descargable                                             | El porqué, contado honesto · S2 | 3       |
| 23  | Puntuar datos nuevos                                               | El modelo se usa · S3           | 4       |
| 24  | Bloqueo honesto por columnas faltantes                             | El modelo se usa · S3           | 4       |
| 25  | Aviso de novedad con el porcentaje de filas                        | El modelo se usa · S3           | 4       |
| 26  | Distribución de predicciones + vista previa                        | El modelo se usa · S3           | 4       |
| 27  | CSV puntuado sin pisar columnas                                    | El modelo se usa · S3           | 4       |
| 28  | Exportar el modelo                                                 | El modelo se usa · S3           | 4       |
| 29  | Importar validando integridad, con la razón exacta                 | El modelo se usa · S3           | 4       |
| 30  | Resumen honesto antes de usarlo                                    | El modelo se usa · S3           | 4       |
| 31  | Puntuar sin re-entrenar                                            | El modelo se usa · S3           | 4       |
| 32  | Bilingüe ES/EN                                                     | Primeros pasos                  | Capa 3  |
| 33  | Diccionario de términos                                            | Diccionario de términos         | Capa 3  |

**Qué NO cuenta y por qué:** el brochure no se documenta a sí mismo (regla 3 del molde v2). Las
**limitaciones** de cada sprint tampoco cuentan como features — viven íntegras en el acordeón «Qué
mide, y qué no finge medir» de la capa 3, que es su sitio.

## Fidelidad al producto real

- El **veredicto del clímax** usa la copia literal de la app (`results.verdict.loses` +
  `losesDetail` de `messages/es.json`), no una redacción inventada.
- Las cifras del clímax son un caso **real del motor**: métrica primaria F1 (objetivo balanceado,
  `pickPrimaryMetric`), modelo 0.52 contra el **mejor** baseline 0.64 (`pickBestBaseline` — aquí la
  regresión logística), delta −0.12 < −`TIE_EPSILON` ⇒ `loses`.
- Los **iconos** son los mismos SVG del design system (`ICON_PATHS` de `src/components/ui.tsx`):
  `check`, `table`, `sparkle`, `download`. Cero emojis (el DS los prohíbe).
- Los **tokens** son los de `design-sync/styles.css`, hex por hex.
- El **eje del clímax va de 0.00 a 1.00 sin truncar**: una página sobre honestidad no puede
  agrandar su diferencia con un eje recortado.

## La pasada de capturas — qué encontró (y la CI no)

Cuatro perfiles (móvil 390 · escritorio 1280 · oscuro · reduced-motion), por bloque y cuadro a
cuadro en las animaciones.

| #   | Defecto visto MIRANDO                                                                                                                                                                                                                                                             | Corrección                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | **Los cuatro iconos salían en blanco.** `.puertas.dentro … [pathLength]` casa en `querySelectorAll` y aparece como regla ganadora en el CSSOM, pero el motor de estilo **no la aplica** sobre contenido SVG: el valor calculado se quedaba en `1px` y el trazo nunca se dibujaba. | El estado del trazo pasa por **propiedad heredada** (`--trazo`), sin selector de atributo. |
| 2   | La barra del clímax se leía como una **caja vacía**, no como una cantidad medida.                                                                                                                                                                                                 | Relleno al 26 % + borde superior de 3 px (lo que cuenta es DÓNDE se detuvo).               |
| 3   | El rótulo «tu modelo · 0.52» **flotaba a la derecha**, a la altura del tick 0.50.                                                                                                                                                                                                 | Pasa a pie de columna, centrado bajo su barra.                                             |
| 4   | La marca **0.50 caía a 2 px del tope de la barra** (0.52): parecía que el modelo marcaba 0.50.                                                                                                                                                                                    | Solo los extremos del eje (0.00 y 1.00), que son los que prueban que no está truncado.     |
| 5   | La línea de la brecha, suelta, no se leía como una medida.                                                                                                                                                                                                                        | Topes arriba y abajo, como una cota.                                                       |
| 6   | En escritorio la probeta del margen quedaba **pegada al borde de la pantalla**, leyéndose como un artefacto del navegador.                                                                                                                                                        | `left: max(6px, calc(50% - 386px))` — viaja junto a la columna de lectura.                 |
| 7   | «33» quedaba a media altura de una glosa de tres líneas: dejaba de leerse «33 funcionalidades».                                                                                                                                                                                   | `align-items: flex-start` + `line-height: 0.82`.                                           |
| 8   | «652 B» se partía en dos líneas.                                                                                                                                                                                                                                                  | `white-space: nowrap` en `.num`.                                                           |

Un noveno defecto lo encontró el **e2e de axe**: contraste 4.37 sobre `<b>Usar el modelo</b>`. No es
un defecto de color sino de **momento** — axe auditaba a mitad del fundido de apertura y medía la
tinta al ~60 % de opacidad sobre blanco (`#76797d`). El test ahora espera a que toda animación
termine antes de auditar; en ningún estado real de la página existe ese color.

## Verificación

| Gate                            | Resultado                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------- |
| `pnpm typecheck`                | ✅ limpio                                                                         |
| `pnpm lint`                     | ✅ limpio                                                                         |
| `pnpm test`                     | ✅ 232 pruebas · 28 archivos · cobertura 88.99 % líneas 90.69 %                   |
| `pnpm test:integration`         | ✅ 28 pruebas · 5 archivos                                                        |
| `pnpm test:e2e`                 | ✅ **24 pruebas** (6 nuevas del brochure × 2 dispositivos), cero flaky            |
| `pnpm build`                    | ✅ compila; `/conoce` no entra al bundle de rutas                                 |
| `/conoce` servido en prod local | ✅ 200 · `text/html` · 61 572 B · CSP intacta                                     |
| Autocontenido                   | ✅ abierto por `file://`, **cero peticiones de red** (instrumentado, no supuesto) |
| Recorrido móvil                 | 5.88 pantallas de scroll (escritorio 4.73) — dentro del presupuesto del molde     |

## El bloqueo que decide el usuario

**La acceptance #10 no puede pasar hoy.** Producción (`app-ds-mauricio-rincon.vercel.app`) responde
**302 → `vercel.com/sso-api`**: Vercel Deployment Protection está activa, así que ni la app ni
`/conoce` son alcanzables sin la sesión del dueño. No lo puede cambiar ninguna sesión de
construcción — es una opción de la cuenta (`Settings → Deployment Protection`); la recomendación
registrada es dejarla **solo para previews**.

**Aviso para no cantar victoria por error:** `app-ds.vercel.app` **sí** responde 200, pero es un
proyecto **ajeno** («Quarksuite App: Design Tokens»). Comprobado y anotado en el BLUEPRINT.

## Decisiones y desviaciones

- **Clímax en negativo** (riesgo registrado del guion): la escena estrella muestra el producto
  dando **malas noticias**. Aprobado en el guion; se juzga en la sala de proyección.
- **`design-sync/` no se toca** (acceptance 11): el brochure **consume** el design system, no le
  añade piezas canónicas ni modifica `design-system.md`. La regla 16 aplica cuando el sprint
  cambia el sistema; aquí solo lo reutiliza — que era justamente la prueba pedida por la
  acceptance 9.
- **`docs/GUIA-DE-PRUEBA.html` no se toca**: el brochure no es una feature de la app y no entra a
  su propio conteo (regla 3 del molde). Su gate es la sala de proyección.
- **Cero cambios** en `engine/`, `pipeline.py`, features o comportamiento — como pedía la orden.

## El gate visual — aprobado, con una salvedad que se declara

El usuario aprobó la preview el 2026-08-15: _"me gustó bastante… está bien adecuada para lo que
tenemos construido y especialmente atractiva"_. **Y dejó dicho que la revisión detallada la hace más
adelante.** Es decir: la dirección está aprobada; la **ronda de corrección en frío** que el molde
describe como parte del gate (proceso, no sí/no) **está pendiente por decisión suya**, no por
omisión. Se anota aquí para que nadie lea "aprobado" como "revisado escena por escena".

## Los checks del PR (§11 — conclusión propia, no ausencia de rojo)

```
quality: SUCCESS      integration: SUCCESS
e2e: SUCCESS          lighthouse: SUCCESS
Vercel: SUCCESS       Vercel Preview Comments: SUCCESS
```

Ninguno `skipped`. **`lighthouse` corrió de verdad** — vale decirlo porque durante todo el ciclo H1
estuvo saltado por colgar de un `quality` en rojo, y el DoD lo daba por cumplido.

## Última milla — CUMPLIDA (2026-08-15)

El usuario quitó la protección de deployment y el link se verificó **desde afuera, sin sesión**
(`curl` limpio, sin cookies):

| Comprobación                                       | Resultado                                                                                                       |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `https://app-ds-mauricio-rincon.vercel.app/conoce` | **200** (antes 302 → `vercel.com/sso-api`)                                                                      |
| Cabeceras                                          | `text/html` · CSP intacta · `nosniff`                                                                           |
| Peso servido                                       | 61 571 B — idéntico al canónico                                                                                 |
| Contenido clave en el HTML                         | titular · «33 funcionalidades» · «NO supera al baseline» · «Esto también te lo decimos» · «Matriz de confusión» |
| Progressive disclosure                             | 4 × `aria-expanded="false"` — las tarjetas llegan cerradas también en producción                                |
| Enlaces externos en el HTML servido                | **cero** (autocontenido de verdad, no solo en local)                                                            |
| Landing de la app                                  | 200, pública                                                                                                    |

**Con ello la acceptance #10 pasa y la entrega queda completa.**

### Desviación registrada: la protección quedó DESACTIVADA, no en «solo previews»

La recomendación era `Only Preview Deployments`. Medido después del cambio, la preview
`app-ds-git-entrega-brochure-conoce-…` **también responde 200 y sirve el contenido**, así que
Vercel Authentication quedó **apagada para todo**, no restringida a previews.

Consecuencia real: **toda preview de PR futura será públicamente alcanzable** — es decir, trabajo
sin revisar, visible antes de su gate. Para esta app el riesgo es bajo (el repo es público y **no
hay datos de usuario en el servidor**: todo corre en el navegador), pero es una decisión de
producto que conviene tomar a propósito y no por omisión. Queda anotada aquí y en el BLUEPRINT.

## Pendiente, por decisión del usuario

- La **ronda de corrección en frío** del gate visual (revisión detallada escena por escena), que él
  difirió explícitamente.
- Opcionalmente, volver la protección a `Only Preview Deployments` si se prefiere que las previews
  sigan cerradas.
