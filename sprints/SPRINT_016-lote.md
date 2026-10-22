---
sprint: 016
app: ds
anexo: lote de medios y bajos del S8 al S15 (cada punto confirmado en `main` antes de tocarlo)
---

# S16 — el lote, punto por punto

Estados: **pagado** (commit del área) · **ya estaba** (lo pagó un sprint anterior; se cita la línea o la prueba) · **cerrado** (con razón y sitio).
Commits `[F1]`: `f2c6729` motor y datos · `7625768` pantallas · `b9b911f` textos · `5892f2d` CI · `63b0648`, `da06884`, `ed31732` pruebas.
Cada pago tiene una prueba que **falla sobre el código del S15** (`5091937`, copia con las pruebas nuevas encima: de 376 pruebas de 18 archivos, 56 fallan; en `protocolo-lote-motor` se sustituyeron `COSTO_MAX`, `esIdGuardado` y `CSV_ERROR`, que no existían). Las filas marcadas «solo prueba» son huecos de prueba, no de código.

## Pagados

| Punto | Qué era | Dónde quedó | Prueba que falla antes |
|---|---|---|---|
| S8 B2 | un costo de `1e308` sumaba `Infinity` | `valores.ts:28` `COSTO_MAX` (1e12) | `protocolo-lote-motor` «S8 B2» |
| S8 B3 | una clave inventada se repetía entera en el mensaje | `archivo.ts:108-125` (`acortar` el campo que nombra un lector; `ruta` corta cada tramo a 60) | `protocolo-archivo` «S8 B3» ×2 (a nivel cuaderno y dentro de una evidencia) |
| S8 B4 | los textos de las etapas 1 y 3 no topaban al largo que acepta la compuerta | `Etapa1Form.tsx:109` (×5), `Etapa3Form.tsx` (×4) | `protocolo-lote-ui` «S8 B4» |
| S8 B6 | regex de claves cableado a diez etapas | `archivo.ts:33` `claveDeEtapa` derivada de `ETAPA_IDS` | `protocolo-archivo` «S8 B6» |
| S8 B8 | el término del glosario bajaba a 32 px desde `sm` | `Glosario.tsx:19` (`min-h-11` a cualquier ancho) | `protocolo-lote-ui` «S8 B8» |
| S8 B9 | el aviso escrito con la muestra corta viajaba al alcanzar | `Etapa3Form.tsx:268` | `protocolo-lote-ui` «S8 M1 y B9» |
| S8 B10 | `un-pr-vivo` fallaba al PR más antiguo cuando se abría un complementario | `un-pr-vivo.yml:26-31` | `un-pr-vivo.test.ts` (6 escenarios y una lectura del bloque; 1 falla con el workflow viejo) |
| S8 M1 | el R² supuesto y «uno contra el resto» no se decían | `Etapa3Form.tsx:74,204` nota `protocolo-supuesto` | `protocolo-lote-ui` «S8 M1 y B9» |
| S8 M6 | P declarado menor que el contado pasaba | `etapa3.ts:258` trampa `parametros-menos` | `protocolo-lote-motor` «S8 M6» |
| S9 B1 | «(1 entradas)» | plural `_one` en los dos diálogos; `CargaDatos`/`CuadernoPanel` pasan `count` | `protocolo-lote-ui` «S9 B1» ×5, `protocolo-dialogos` |
| S9 B4 | un PSI de 0,2496 se redondeaba a 0,25 y cambiaba de banda | `formato.ts:60` `psiTexto` | `protocolo-formato` ×7 |
| S9 B5 | dos columnas con el mismo encabezado repetían la clave de React | `campos.tsx:237` | `protocolo-lote-ui` «S9 B5» |
| S9 B9 | nada decía qué lleva el archivo al exportar | `CuadernoPanel.tsx:796` nota `protocolo-exportar-nota` | `protocolo-lote-ui` «S9 B9» |
| S11 caché | la caché de particiones crecía sin tope | `particion.ts:647,672` `RESULTADOS_MAX` (24) | `protocolo-particion` |
| S11 `time-bad` | el texto existía y nunca se pintaba | `Etapa6Form.tsx:540` | `protocolo-etapa6-solape` |
| S11 `nombre("")` | un esquema vacío mostraba la clave cruda | `CuadernoPanel.tsx:497-499` (`ResumenEtapa6`) «—» | `protocolo-lote-ui` «S11» |
| S11 sellos | la trampa de sellos hablaba en futuro («el próximo») | texto en tiempo neutro (`b9b911f`) | `protocolo-etapa6-ui` |
| S12 pliegues | la razón de k decía «pocos casos» ante cualquier obstáculo | `pliegues.ts:274` `porqueNoSirven` | `protocolo-pliegues` |
| S12 corrida | el resultado de la liga seguía valiendo con otro plan | `Etapa7Form.tsx:74` ata la corrida al plan | `protocolo-etapa7-ui` |
| S12 liga vacía | una liga vacía caía en error del worker | `liga7.ts:83` → `null` | `protocolo-liga7-vacia` |
| S12 `why.*` | el puntaje de la liga sin rótulo | `etapa7.{es,en}.json` «puntaje de selección» | `protocolo-lote-ui` «S12» |
| S13 B1 | `leer` de la 8 aceptaba ids libres e intervalos invertidos | `etapa8.ts:793-800` `esIdGuardado` + cotas | `protocolo-etapa8` ×5 |
| S13 B2 | «ninguna fila» era falso | texto `worst.empty` en `messages/etapas/etapa8.{es,en}.json:93` (`b9b911f`) | `protocolo-lote-ui` «S13 B2» |
| S13 B4 | `.sort()` sin `byCodePoint` | `liga7.ts:7`, `prueba8.ts:8` | `protocolo-lote-motor` «S13 B4» ×2 |
| S13 B5 | `aperturas` sin tope ni dedupe | `cuaderno.ts:109` `APERTURAS_MAX`; `archivo.ts` `maxLength` | `protocolo-archivo` «S13 B5», `protocolo-etapa8.spec` (cuenta 1, no 2) |
| S13 C3 | `messages/es.json:1412-1413` hablaba de medir una clase en la etapa 8 | las tres trampas de clase (`clase-rara`, `clase-escasa`, `clase-ausente`) dicen que la 8 lee por segmento y en conjunto (`b9b911f` y la auditoría) | `protocolo-lote-ui` «S12 · lo que la etapa 8 mide» |
| S14 etapa 9 | `ganador`/`base_id`/`hoy_id` libres | `etapa9.ts:499` + `REFERENCIA_IDS` (`:37`) | `protocolo-etapa9` ×3 |
| S14 umbrales | tabla de la 8 no monótona | `etapa8.ts` (al subir el umbral no suben `vp` ni `fp`) | `protocolo-etapa9` ×2 |
| S14 multiclase | `protocolo-etapa9-ui` sin multiclase | caso nuevo | **solo prueba** |
| S15 M2/B1 | el chequeo decía «estable» sin con qué comparar | `chequeo-deriva.ts:25` estado `sin-referencia`; `referencia-deriva.ts` cortes con ≥ 25 filas | `protocolo-chequeo-deriva` ×2, `protocolo-referencia-deriva` |
| S15 B2 | `chequeo-deriva` importaba el hook entero | `csv-error.ts:3` | `protocolo-lote-motor` «S15 B2» |
| S15 B3 | ninguna prueba de que la ficha no lleve la referencia | caso nuevo | **solo prueba** (`protocolo-ficha`) |
| S15 B4 | `findLast` con target ES2017 | `ficha.ts:186` | `protocolo-lote-motor` «S15 B4» |
| S15 B5 | una razón vacía borraba la línea | `ficha.ts` `?? ""` | `protocolo-ficha` |
| S15 B6 | el e2e de «iterar» no existía | `protocolo-etapa10.spec.ts` | **solo prueba** (corre en las dos pantallas) |

## Pagados en la F2 (documentales) y por la auditoría

| Punto | Qué era | Dónde quedó | Prueba o gate |
|---|---|---|---|
| S8 B11 | `design-system.md` sin los patrones del Protocolo | sección «Añadidos Sprint 008–016» y tarjeta `design-sync/components/componentes/protocolo.html` | revisión en la auditoría; `/design-sync` publica la tarjeta |
| S9 M2 | el manual no decía que la etapa 4 también se recalcula | `MANUAL-DE-USO.md` (límites): «las etapas 2 y 4 a 10» | revisión en la auditoría |
| S9 B2 | `sessionStorage` sin mencionar en privacidad | `MANUAL-DE-USO.md` (privacidad) | revisión en la auditoría |
| S9 B8 | fecha del S9 en la guía (18 contra 17) | la guía v13 dice 2026-10-17, la del cierre | revisión en la auditoría |
| S10 B5–B13 (9) | el texto original no se recuperó; la auditoría recorrió las seis superficies | H-10 (e2e de privacidad con cada celda de las 200 filas, `protocolo-etapa5.spec.ts`) · H-11 (trampas `regla-peor` e `regla-igual`) · H-14 (`NO_ACTUAR`) · H-15 (plurales) · H-16 («con objetivo») · H-17 (manual) | `protocolo-lote-ui` «S9 B1 · plurales de la etapa 5» y «S12», e2e de la etapa 5 |

## Ya estaba pagado (con su sitio)

S8 M2, M3, B1, B13 y el título de la guía (pagados en el S9) · S9 M1 y D1 (`color-scheme`, S10) · S10 B2, B3, B4 («1,5» con razón, el manual con coma, los campos que llegan al cuaderno) y `dictionaries.ts` (S11) · S11 precarga del esquema (`Etapa6Form.tsx:89,107`) y «la etapa 7 no abre» (S12) · S11 clase «constructor» (`particion.ts:577`; prueba «clases con nombre de propiedad heredada» en `protocolo-pliegues.test.ts`) · S11 `sellosDistintos` (el texto cuenta «contando esta», `b9b911f`) · S12 M1 (`protocolo-etapa7.test.ts:194-221` fija que «no supera» pasa la compuerta) y B1 (`etapa7.ts` acota los números del worker, S13) · S12 «import doble» (`CuadernoPanel.tsx`, un solo import de `por100`) · S12 `useValidacion.ts:47-50` (la liga vacía ya no llega al worker: `envio7` devuelve `null`, ver arriba) · S13 C1 y M1/M2 (S14) · S15 claves del texto «Sin construir» (S16 F1, `b9b911f`). Las ~60 líneas de reformateo ajenas del S12 (`contract.ts`, `protocol.ts`, `split.ts`) ya están en `main`: no son un defecto del árbol.

## Cerrados con razón y sitio

| Punto | Razón | Sitio |
|---|---|---|
| S9 D2 | los hallazgos corren en el hilo principal (≈ 2,1 s con 50 000 × 79) | H-3 (rendimiento con datos grandes) |
| S8 M4 | dos pestañas: la última escritura gana | H-3 (persistencia definitiva) |
| S8 B7 / S9 B7 | efectos dentro de `setEstado` (idempotentes) | H-3: reescribir `useProtocolo.ts` toca la persistencia |
| S9 B3 | importar con solo cargas no pierde trabajo (se recarga). **Desviación del plan:** el plan lo ponía entre los que se pagan; al confirmarlo en `main` no hay trabajo que perder, y se cierra aquí | decisión aceptada (declarada en el cierre) |
| S9 B6, D3 | decisión aceptada del S9 | — |
| S8 B12 | no existe en ningún documento de deuda | — |
| S13 C2 | «la prueba todavía está cerrada» es verdad en la etapa 7 | — |
| claves muertas `not-built` / `no-construida` | son un estado del contrato (lo ejerce `protocolo-compuerta` y lo exige `protocolo-contenido`) | — |
| S8 B5 `preguntas` | declarativo; gate nuevo | `protocolo-lote-motor` «S8 B5» |
| S10 B5–B13 (9) | el texto original no es recuperable | **auditoría de la F2** recorre sus 6 superficies |

## Auditoría de una pasada (Sonnet 5.5 · high, solo lectura): 33 hallazgos, ninguno Crítico ni Alto

Tiempo propio de la F2: 20 min (21:39 a 21:59 del 2026-10-21). Todos los medios y bajos se pagaron en el mismo PR salvo tres anotados.

| Id | Sev. | Qué era | Estado |
|---|---|---|---|
| H-01 | M | el anexo citaba líneas y una prueba que no existen | pagado: citas corregidas y prueba «S13 B2» nueva |
| H-02 | M | S13 C3 pagado a medias (`clase-escasa`, `clase-ausente`) | pagado: las tres trampas de clase dicen lo mismo, con prueba |
| H-03 | M | S8 B3: la clave larga dentro de una evidencia salía entera | pagado: `archivo.ts` `acortar`, con prueba |
| H-04 | M | el anexo no contaba todos los puntos del § 2 ni declaraba S9 B3 | pagado: secciones «F2», «Ya estaba» y la desviación de S9 B3 |
| H-05 | M | guía R10 pedía recargar y dejaba las etapas «Por verificar» | pagado: «no hace falta recargar» |
| H-06 | M | la ruta suma 70 min contra 40 | pagado: la caja dice «unos 70 minutos» (dos tandas) y una prueba ata la suma; **desviación del plan, declarada en el cierre** |
| H-07 | M | la nota de «Exportar» declaraba menos de lo que lleva | pagado: nombra los cuatro orígenes, ES y EN, con prueba |
| H-08 | M | el recorrido no veía un botón con `tabindex="-1"` | pagado: `teclado.ts` y caso inyectado nuevo |
| H-09 | M | dos métricas «medidas» viejas en el export | pagado: recuentos del 2026-10-21 |
| H-10 | M | el e2e de privacidad de la etapa 5 comparaba filas enteras | pagado: cada celda numérica de las 200 filas, en el archivo y en la red |
| H-11 | M | trampas `regla-peor` e `regla-igual` falsas con «último valor» | pagado, con prueba |
| H-12 | M | el recorrido nombraba un selector sin etiqueta con sus opciones | pagado: caso inyectado nuevo |
| H-13 | M | el +401 B de `/` rompe «nada sube el peso inicial» | anotado en las desviaciones del cierre |
| H-14 a H-17 | B | `NO_ACTUAR`, plurales, «todas tus filas», dos reglas sin declarar en el manual | pagado, con prueba (H-15, H-16) |
| H-18 | B | `ciclo: "H2"` en el export | pagado: `"H-2"` |
| H-19 | B | `estado: inicial` y `sprints_cerrados` antes del ensayo | anotado en el cierre: la planeadora decide `sellado` tras el sí |
| H-20, H-21 | B | línea larga y docblocks huérfanos | pagado |
| H-22, H-23 | B | comentarios y README que prometen etapas «sin construir» | pagado |
| H-24 | B | guía: «dos recorridos» y «ciclo H2» ambiguo | pagado |
| H-25 | B | ADR 005 y 007 con promesas «en H2» | pagado: nota de estado con su sitio (H-4 o descartado) |
| H-26, H-27 | B | rótulo «008 a 015» y número de casos de `un-pr-vivo` | pagado |
| H-28 | B | pruebas por texto de fuente y un título que prometía cinco campos | pagado el título (ahora mira los cinco); las dos de fuente se quedan: el ancho táctil y el tope de campo no se miden en jsdom |
| H-29 | B | el foco visible aceptaba `box-shadow` | pagado: solo contorno |
| H-30 | B | «se abre una sola vez» sin la cuenta | pagado en el export y el brochure |
| H-31 | B | backticks literales y un comentario de «cuatro puertas» | pagado |
| H-32 | B | sin gate para 37 = 22 + 8 + 7, 18 chips y r1–r11 | pagado: `tests/unit/documentos-s16.test.ts` |
| H-33 | B | «iterar» corre en móvil y escritorio (+40 s por proyecto) | anotado: es el único e2e de «iterar»; se queda en los dos |

## Peso (réplica de la CI, sin `.env.local`, build limpio, LHCI ×3 mediana; `main@5091937` contra la rama `ed31732`)

| Ruta | script `main` | script rama | LCP `main` (corridas · mediana) | LCP rama |
|---|---|---|---|---|
| `/protocolo` | 321 322 B | 321 035 B (−287) | 2749/3529/2727 · 2749 ms | 2861/3371/3371 · 3371 ms |
| `/` | 248 332 B | 248 733 B (+401) | 2269/2923/2950 · 2923 ms | 2926/2926/2929 · 2926 ms |

`/` sube 401 B porque el diccionario base `messages/es.json` pesa 439 B más (gzip) por los textos nuevos de las etapas 1–3 y del cuaderno; el tope es 307 200 B. Diferir esas tres etapas como las 4–10 es H-3. El LCP de `/protocolo` es bimodal (2,7 o 3,4 s) en `main` y en la rama: no hay regresión que atribuir al lote.
