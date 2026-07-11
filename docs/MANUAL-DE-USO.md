# Probeta DS — Manual de uso

> **Documento obligatorio y vivo.** Toda feature que llega a `main` se documenta aquí en el mismo
> sprint. Escrito para el **usuario final** en español llano — sin jerga técnica ni referencias al
> código.

## Qué es esta app

Probeta DS te ayuda a construir un modelo de predicción a partir de tus datos y, sobre todo, te dice
**con franqueza si ese modelo sirve o no**. Está pensada para profesionales que no son científicos de
datos: tú traes una tabla, eliges qué quieres predecir, y la app entrena un modelo y te da un
**veredicto honesto**. Todo ocurre **dentro de tu navegador** — tus datos nunca se suben a ningún
servidor.

## Primeros pasos

No hay que instalar nada ni crear una cuenta. Abre la app en el navegador y ya puedes empezar. En la
esquina superior derecha puedes cambiar el idioma entre **Español** e **English**.

## Features

### El veredicto honesto · desde Sprint 001

- **Qué hace:** carga una tabla, entrena un modelo real para predecir una columna de dos opciones
  (por ejemplo _sí/no_), y te dice si el modelo **supera** a una predicción simple de referencia —o
  si **no la supera**, en cuyo caso te lo dice de frente. También te **avisa si detecta una posible
  fuga de datos** (una columna que “hace trampa” porque en realidad ya contiene la respuesta).

- **Cómo se usa:**
  1. **Inicio → elige un dataset.** Puedes **subir tu propio CSV** (arrástralo o haz clic en _Elegir
     archivo_) o probar con uno de los **tres ejemplos** incluidos.
  2. **Configuración → elige qué predecir.** Verás una vista previa de tu tabla y, en el menú _¿Qué
     quieres predecir?_, seleccionas la columna objetivo. Debe tener **exactamente dos categorías**
     (sí/no, 0/1, aprobado/rechazado…). Si alguna columna parece una fecha, la app te avisa (en esta
     versión no se usa para el análisis).
  3. **Pulsa _Entrenar modelo_.** La primera vez tarda unos segundos mientras se prepara el motor de
     análisis; verás el progreso paso a paso.
  4. **Resultados → lee el veredicto.** Arriba, en grande, aparece el veredicto:
     - **▲ El modelo supera al baseline** — tu modelo predice mejor que una regla simple. Se indica
       por cuánto.
     - **＝ Empata con el baseline** — un modelo simple rinde igual; no vale la pena complicarse.
     - **▼ NO supera al baseline** — el modelo no aporta; conviene revisar tus columnas.
     - **⚠ Métricas casi perfectas — sospechoso** — un resultado “perfecto” casi siempre esconde una
       fuga. La app señala la columna sospechosa; **quítala de tu tabla y vuelve a entrenar**.
  5. Debajo verás las **métricas** (exactitud, precisión, sensibilidad, F1, AUC), la **matriz de
     confusión** y los **baselines** de comparación. Todas las cifras se calculan sobre datos que el
     modelo **no vio al entrenar** (el conjunto de prueba), para que sean honestas.
  6. Pulsa _**Nuevo experimento**_ para empezar otra vez.

- **Cómo leer las métricas, en simple:**
  - **Exactitud:** de cada 100 casos, cuántos acierta.
  - **Precisión:** cuando dice “sí”, con qué frecuencia acierta.
  - **Sensibilidad (recall):** de todos los “sí” reales, cuántos encuentra.
  - **F1:** un equilibrio entre precisión y sensibilidad.
  - **AUC:** qué tan bien ordena los casos; 0.5 es como lanzar una moneda, 1.0 es perfecto.

- **Por qué a veces dice “no supera”:** no es un error de la app. Si tus datos no tienen suficiente
  señal, un modelo complejo no puede inventarla. Que te lo diga de frente es justo el objetivo de
  Probeta DS: no inflar resultados.

- **Limitaciones conocidas (Sprint 001):**
  - Solo predicción de **dos categorías** (clasificación binaria).
  - Tamaño máximo del archivo: **5 MB o 50 000 filas**. Por encima, la app avisa (no se cuelga).
  - El chequeo de fuga es una **ayuda honesta, no una garantía**: atrapa los casos evidentes, no
    todos.
  - Las columnas de fecha se **detectan y avisan**, pero aún no se usan para el análisis.
  - Formato admitido: **CSV** (con cabecera). Los valores vacíos, `NA`, `null`, etc. se tratan como
    faltantes.

### El porqué, contado honesto · desde Sprint 002

- **Qué hace:** después de entrenar, la sección **"¿Por qué predice así?"** te muestra qué
  variables pesan más en el modelo (un gráfico de barras con la dirección del efecto) y te lo
  explica **en palabras llanas**. Además puedes descargar una **model card**: un documento con la
  constancia completa de tu experimento.

- **Cómo leer el gráfico de importancia:**
  - Cada barra es una variable; cuanto más larga, más pesa en el modelo.
  - **▲ asociación positiva** significa que a mayor valor de esa variable, más probable el
    resultado; **▼ negativa**, lo contrario; en las variables de categorías el efecto **varía por
    categoría** (no tiene una sola dirección).
  - La importancia se mide **por permutación sobre el conjunto de prueba**: cuánto empeora el
    modelo si se rompe la relación de esa variable con el objetivo. Es honesta pero **global** (no
    explica caso por caso).

- **La explicación en palabras y el badge:**
  - Debajo del gráfico verás un texto que resume el veredicto y las variables clave.
  - Si dice **"Texto estándar"**, lo generó la propia app con tus números (sin IA).
  - Si activas la narración con IA y muestra **"✓ verificada con los números"**, la escribió una
    IA **y la app comprobó, cifra por cifra, que no miente** antes de mostrártela. Si la IA cita
    una variable inexistente o una cifra falsa, esa narración **se descarta** y verás el texto
    estándar. El gráfico siempre queda visible para que compruebes por ti mismo.
  - **Si la narración con IA no pudo generarse, la app te lo dice**: debajo del texto estándar
    aparece un aviso ⚠ con el motivo (el proveedor no respondió · la narración no pasó la
    verificación · la función no está configurada en este despliegue). Para **reintentar**, apaga
    y vuelve a encender _Narrar con IA_.

- **Privacidad de la narración con IA (importante):**
  - Es **opcional y viene apagada**. Si la activas, se envían a un proveedor de IA **solo los
    nombres de tus columnas y estadísticas agregadas** (métricas, importancias).
  - **Tus filas de datos NUNCA se envían.** Sin activarla, no sale nada de tu navegador.
  - Tu elección se recuerda en este navegador; puedes apagarla cuando quieras.

- **La model card:**
  - Pulsa **"Descargar model card (.md)"** en Resultados. Obtienes un documento con: los datos
    usados (forma y tipos), la partición, el método, las métricas sobre prueba, el veredicto, el
    chequeo de fuga, la importancia de variables y los **límites** del experimento.
  - Se genera **completa en tu navegador** y en el idioma activo. Es tu constancia: "no solo hice
    un modelo — tengo un experimento documentado".

- **Limitaciones conocidas (Sprint 002):**
  - La importancia es **global**, no por predicción individual, y puede repartirse entre variables
    correlacionadas.
  - La dirección del efecto es una asociación simple: no captura interacciones entre variables.
  - La narración con IA requiere que el administrador haya configurado un proveedor; si no lo hay,
    siempre verás el texto estándar (que es igual de fiel a los números).

### El modelo se usa · desde Sprint 003

- **Qué hace:** tu modelo deja de ser solo un experimento. Después de entrenar puedes **puntuar
  datos nuevos** (subir otra tabla y obtener la predicción para cada fila) y **guardar el modelo
  como archivo** para volver a usarlo otro día — o en otro computador — **sin re-entrenar**.

- **Puntuar datos nuevos:**
  1. En Resultados, pulsa **"Usar el modelo"**.
  2. Sube un CSV nuevo con **las mismas columnas** que usaste al entrenar (la pantalla te las
     lista), pero **sin la columna que predices** — aquí el modelo responde, no se evalúa. Si la
     incluyes de todos modos, se ignora y se te avisa.
  3. Si a tu archivo le **falta** alguna columna del modelo, la app **se niega a puntuar** y te
     dice exactamente cuáles faltan. Nunca puntúa "a medias" rellenando en silencio.
  4. Antes de descargar verás el **aviso de novedad**: cuántos valores de tu archivo el modelo
     **nunca vio al entrenar** (categorías nuevas, números fuera del rango de entrenamiento) y en
     cuántas filas — _"el modelo está adivinando en el N% de tus filas"_. En esas filas la
     predicción es menos confiable; la app te lo dice de frente en vez de callárselo.
  5. Revisa la **distribución** de predicciones y la **vista previa**, y pulsa **"Descargar CSV
     puntuado"**: tu tabla completa + dos columnas nuevas — la **predicción** (con las etiquetas
     originales de tus datos: sí/no, 0/1…) y la **probabilidad**. Si ya tenías una columna con ese
     nombre, la nueva sale con un sufijo (`_2`) — nunca se pisa nada tuyo.

- **Guardar el modelo (exportar):**
  - En Resultados, pulsa **"Exportar modelo"**. Se descarga un único archivo `.probeta.json`.
  - **Qué contiene, dicho honesto:** lo que el modelo **aprendió** de tus datos (parámetros,
    categorías vistas, medianas, rangos) y su constancia (métricas, veredicto, advertencias) —
    **no tus filas crudas**. Aun así, lo aprendido refleja tus datos: **trátalo como un archivo
    sensible** y compártelo solo con quien compartirías el resultado.

- **Volver a usar un modelo guardado (importar):**
  1. En la pantalla de inicio, pulsa **"Cargar modelo guardado"** y elige tu `.probeta.json`.
  2. La app **valida el archivo antes de abrirlo**: comprueba que es un modelo de Probeta y que su
     contenido está íntegro (una huella digital debe coincidir). Un archivo ajeno, corrupto o
     manipulado se **rechaza con la razón exacta**, sin llegar a abrirse.
  3. Si es válido, verás un **resumen honesto** de lo que trae (dataset, fecha, métrica, veredicto,
     advertencias de fuga) para que decidas con conocimiento. Si el archivo se creó con **otra
     versión** del motor, la app te lo advierte: se carga igual, pero si falla, re-entrena y
     exporta de nuevo.
  4. Confirma con **"Usar este modelo"** y puntúa datos nuevos directamente — sin re-entrenar.

- **Limitaciones conocidas (Sprint 003):**
  - El archivo `.probeta.json` **solo lo entiende Probeta** (no es un formato estándar de
    intercambio). Publicar el modelo para que otros lo usen llegará más adelante.
  - El CSV nuevo tiene los **mismos límites** de siempre: 5 MB o 50 000 filas.
  - El aviso de novedad detecta **valores nunca vistos**; no puede detectar cambios más sutiles
    (por ejemplo, que la relación entre variables haya cambiado con el tiempo).
  - Por seguridad, **carga solo archivos exportados por Probeta**. La app valida la integridad,
    pero el archivo no está cifrado ni firmado.

## Preguntas frecuentes

- **¿Mis datos se suben a algún sitio?** No. Todo el cálculo ocurre en tu navegador; el archivo nunca
  sale de tu equipo.
- **¿Necesito saber programar o de estadística?** No. Eliges la columna a predecir y la app hace el
  resto, explicando el resultado en lenguaje llano.
- **El modelo dio métricas perfectas, ¿genial?** Casi siempre es una señal de alarma, no de éxito.
  Revisa la advertencia de fuga: seguramente hay una columna que ya contiene la respuesta.
- **¿La explicación con IA puede inventarse cosas?** Podría intentarlo — por eso la app **verifica
  cada afirmación contra los números reales** antes de mostrarla. Si no pasa la verificación, se
  descarta y ves el texto estándar. Y el gráfico con las cifras crudas siempre está al lado.
- **¿Qué se envía exactamente si activo la narración con IA?** Los nombres de tus columnas y
  estadísticas agregadas (métricas, importancias, el veredicto). Nunca tus filas de datos, nunca
  valores individuales.

## Historial

| Sprint | Features añadidas a este manual                                                                                                                                 |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 001    | El veredicto honesto (carga CSV/ejemplos, elección de objetivo, entrenamiento, veredicto vs. baseline, advertencia de fuga, métricas en test).                  |
| 002    | El porqué honesto (importancia de variables + dirección, narración con IA verificada contra los números, consentimiento de privacidad, model card descargable). |
