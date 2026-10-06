# Kit de prueba — Probeta DS

Archivos de apoyo para seguir la **guía de prueba** (`docs/GUIA-DE-PRUEBA.html`). Todo es
sintético y anonimizado (ninguna persona real); nada de esto sale de tu navegador cuando lo cargas
en la app.

## Datasets de ejemplo (también disponibles como botones en la app)

| Archivo                     | Qué demuestra                                                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `marketing-campania.csv`    | Señal real: el modelo **supera** al baseline (veredicto franco positivo).                                                                            |
| `rotacion-empleados.csv`    | Un caso donde un modelo simple basta (veredicto de empate honesto).                                                                                  |
| `credito-fuga-plantada.csv` | Trae una **fuga plantada** (`monto_recuperado`): mira cómo se detecta.                                                                               |
| `clientes-sucio.csv`        | Datos "reales" sucios: nulos, basura, un ID, una constante y filas duplicadas → mira el **saneamiento transparente** y la alerta de desbalance (S4). |
| `consumo-energia.csv`, `planes-suscripcion.csv`, `segmentos-clientes.csv` | Estimar una cantidad (S6), clasificar en varias categorías y agrupar sin objetivo (S7): ver sus secciones abajo. |

## La liga (Sprint 005)

| Archivo            | Qué demuestra                                                                                                                                                                                                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `liga-mediana.csv` | 5 000 filas sintéticas (objetivo `objetivo`, con categóricas y nulos). Es el tamaño en que la liga completa **ya no cabe** en el primer paso: verás modelos «pendientes» del Nivel 2 y podrás correrlos (y cancelar). Sin nombres reales: `x1…x8` son números, `c1…c3` categorías. Se regenera con `node scripts/kit-de-prueba-liga-mediana.mjs`. |

## Estimar una cantidad (Sprint 006)

| Archivo                       | Qué demuestra                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `consumo-energia.csv`         | 200 viviendas sintéticas con su consumo eléctrico mensual. El objetivo es `consumo_kwh` y el resultado se lee en kWh. La calefacción eléctrica gasta según la superficie y los grados de frío, y el aislamiento la multiplica: hay señal real que un modelo lineal no captura entera. Si eliges `ocupantes` (de 1 a 6) como objetivo, la app te pregunta si son clases o una cantidad.                      |
| `consumo-energia-mediano.csv` | Las mismas columnas, con 5 000 filas. Con este tamaño, la liga de regresión ya no cabe entera en el primer paso: verás modelos del Nivel 2.                                                                                                                                                                                                                                                                 |
| `precio-fuga-plantada.csv`    | 200 viviendas con su precio de venta (`precio_usd`, sesgado a la derecha como los precios reales). Trae una **fuga plantada**: `impuesto_transferencia_usd` se calcula sobre el precio de venta, así que solo existe _después_ de vender. La app la nombra antes de entrenar y, si entrenas igual, marca el resultado como «sospechoso». Quítala de tu tabla y vuelve a entrenar para un veredicto creíble. |

Los tres se regeneran con `node scripts/make-example-datasets.mjs`.

## Varias categorías y agrupar sin objetivo (Sprint 007)

| Archivo                          | Qué demuestra                                                                                                                                                                                                                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `planes-suscripcion.csv`         | 200 suscriptores sintéticos con su plan (`plan`: básico, estándar, premium, empresa, estudiante; de ~40 % a ~8 %, desbalanceado a propósito). Uso en GB al mes, usuarios, antigüedad en meses y llamadas a soporte dan señal real, pero solapada: ninguna columna adivina sola un plan. `region` no tiene relación con el plan. |
| `planes-suscripcion-mediano.csv` | Las mismas columnas, con 5 000 filas: el tamaño en que la liga de varias categorías ya no cabe entera en el primer paso.                                                                                                                                                                                                        |
| `planes-fuga-plantada.csv`       | Igual que `planes-suscripcion.csv`, más una **fuga plantada que delata una sola clase**: `cargo_corporativo_usd` solo tiene valor en el plan «empresa» (se cobra _después_ de contratarlo). La app debe nombrar la columna **y la clase** antes de entrenar; quítala y el ejemplo entrena.                                      |
| `segmentos-clientes.csv`         | 300 clientes sintéticos **sin objetivo**, con tres grupos plantados que se separan por gasto mensual y visitas al mes (`antiguedad_meses` es ruido común a los tres). `cliente_id` es un identificador: al agrupar, la app lo deja fuera y lo dice.                                                                             |
| `sin-grupos.csv`                 | 300 mediciones sintéticas de una sola nube (temperatura, humedad, presión y ruido independientes, y una zona al azar). Sirve para ver qué dice la app cuando **no hay grupos**: la tabla de agrupadores se muestra igual, con su lectura franca.                                                                                |
| `segmentos-grande.csv`           | Los mismos tres grupos de `segmentos-clientes.csv`, con **9 000 filas**. Por encima de 8 000 filas, el agrupamiento jerárquico se ajusta sobre una muestra de 8 000 y asigna el resto al grupo más cercano: la app lo dice antes de agrupar, junto a la lectura y en su fila (prueba I8).                                       |
| `tiendas-ciudades.csv`           | 120 tiendas sintéticas con ventas, visitas y superficie. `ciudad` toma 30 valores que se repiten: demasiados para ser categorías y no es un identificador. Elegida como objetivo, la app dice que no sirve y ofrece **agrupar filas parecidas en su lugar** (prueba I7).                                                         |

`planes-suscripcion.csv` y `segmentos-clientes.csv` también son botones en la app. Se regeneran con
`node scripts/make-example-datasets.mjs` (la versión de 5 000 filas, `segmentos-grande.csv` y
`tiendas-ciudades.csv` viven solo en este kit).

## Datos nuevos para puntuar

| Archivo               | Cómo se usa                                                                                                                                                                                                                                                                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clientes-nuevos.csv` | Entrena primero con `marketing-campania.csv` (objetivo `convirtio`), pulsa **«Usar el modelo»** y carga este archivo. Trae **novedad plantada**: `dispositivo` = «holograma» (categoría nunca vista) ×2 y `edad` = 999 (fuera del rango de entrenamiento) ×1 ⇒ el panel de novedad debe avisar de 3 filas afectadas de 8. Mismas columnas que el dataset de entrenamiento. |

| Archivo            | Cómo se usa                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `casas-nuevas.csv` | (S6) Entrena primero con `consumo-energia.csv` (objetivo `consumo_kwh`), pulsa **«Usar el modelo»** y carga este archivo: 8 viviendas sin el consumo. Trae **novedad plantada**: `superficie_m2` = 900 (fuera del rango de entrenamiento, 42–220) ×1 y `calefaccion` = «geotermia» (categoría nunca vista) ×1 ⇒ el panel de novedad debe avisar de 2 filas afectadas de 8. La columna nueva es `consumo_kwh_estimado`, con un decimal. |

## Archivos que la app debe RECHAZAR con un motivo exacto

Probeta prefiere bloquear y explicar antes que adivinar. Estos archivos existen para que
compruebes ese comportamiento **sin editar nada a mano**:

| Archivo                               | Prueba | Qué debe pasar                                                                                                                                                  |
| ------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ejemplo-exportado-de-excel.csv`      | A7     | CSV guardado desde Excel en español: separa con **punto y coma** y trae BOM. La app lo nombra y dice cómo arreglarlo, en vez de leer mal los datos en silencio. |
| `clientes-nuevos-sin-dispositivo.csv` | D2     | Igual que `clientes-nuevos.csv` pero **sin la columna `dispositivo`**: al puntuar, la app se niega y nombra **solo** esa columna. Nunca puntúa a medias.        |

## Archivos de modelo para probar el rechazo (prueba D5)

La app valida un `.probeta.json` **antes** de abrirlo: forma, versión de formato y SHA-256 del
contenido. Estos dos señuelos existen para que puedas comprobarlo **sin tener que editar un
archivo a mano** (en muchos equipos el `.probeta.json` descargado no se deja abrir en un editor).
Cárgalos en **«Cargar modelo guardado»**:

| Archivo                          | Qué debe pasar                                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `modelo-ajeno.json`              | JSON válido pero de otra herramienta ⇒ se rechaza por **formato inválido**, sin abrirse.                       |
| `modelo-manipulado.probeta.json` | Un `.probeta.json` con **un carácter cambiado** en el contenido ⇒ se rechaza porque **la huella no coincide**. |

En ninguno de los dos casos la app llega a deserializar nada: el rechazo ocurre antes de que el
contenido toque el motor de cómputo.

## Nota de reproducibilidad

Estos CSV se generan de forma determinista con `node scripts/make-example-datasets.mjs` (semilla
fija). El mismo comando produce siempre los mismos archivos, aquí y en `public/datasets/`.
