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

## Nota de reproducibilidad

Estos CSV se generan de forma determinista con `node scripts/make-example-datasets.mjs` (semilla
fija). El mismo comando produce siempre los mismos archivos, aquí y en `public/datasets/`.
