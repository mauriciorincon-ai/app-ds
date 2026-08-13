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

## Datos nuevos para puntuar

| Archivo               | Cómo se usa                                                                                                                                                                                                                                                                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clientes-nuevos.csv` | Entrena primero con `marketing-campania.csv` (objetivo `convirtio`), pulsa **«Usar el modelo»** y carga este archivo. Trae **novedad plantada**: `dispositivo` = «holograma» (categoría nunca vista) ×2 y `edad` = 999 (fuera del rango de entrenamiento) ×1 ⇒ el panel de novedad debe avisar de 3 filas afectadas de 8. Mismas columnas que el dataset de entrenamiento. |

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
