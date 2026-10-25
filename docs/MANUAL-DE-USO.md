# Probeta DS — Manual de uso

> **Documento obligatorio y vivo.** Toda feature que llega a `main` se documenta aquí en el mismo
> sprint. Escrito para el **usuario final** en español llano — sin jerga técnica ni referencias al
> código.

## Qué es esta app

Probeta DS te ayuda a construir un modelo de predicción a partir de tus datos y, sobre todo, te dice
**con franqueza si ese modelo sirve o no**. Está pensada para profesionales que no son científicos de
datos: tú traes una tabla, eliges qué quieres predecir, y la app entrena un modelo y te da un
**veredicto honesto**. Si no tienes nada que predecir, también puede **encontrar grupos de filas
parecidas** y decirte cuánto creerles. Y si prefieres ir despacio, **Protocolo DS** te lleva por
etapas con compuertas, con tus propios datos. Todo ocurre **dentro de tu navegador** — tus datos
nunca se suben a ningún servidor.

## Primeros pasos

No hay que instalar nada ni crear una cuenta. Abre la app en el navegador y ya puedes empezar. Puedes traer un **CSV o un Excel (`.xlsx`)**. En la
esquina superior derecha puedes cambiar el idioma entre **Español** e **English**. La página abre en español. La primera vez que eliges **English**, tu navegador baja el diccionario en inglés, que es un archivo aparte; mientras llega, la página sigue en español.

## Features

### El veredicto honesto · desde Sprint 001

- **Qué hace:** carga una tabla, entrena un modelo real para predecir una columna de dos opciones
  (por ejemplo _sí/no_), y te dice si el modelo **supera** a una predicción simple de referencia —o
  si **no la supera**, en cuyo caso te lo dice de frente. También te **avisa si detecta una posible
  fuga de datos** (una columna que “hace trampa” porque en realidad ya contiene la respuesta).

- **Cómo se usa:**
  1. **Inicio → elige un dataset.** Puedes **subir tu propio CSV** (arrástralo o haz clic en _Elegir
     archivo_) o probar con uno de los **ejemplos** incluidos.
  2. **Configuración → elige qué predecir.** Verás una vista previa de tu tabla y, en el menú _¿Qué
     quieres predecir?_, seleccionas la columna objetivo. Desde el Sprint 005 puedes elegir
     **cualquier columna**: la app te dice qué tipo de predicción sería. Se entrenan las de **dos
     categorías** (sí/no, 0/1, aprobado/rechazado…), desde el Sprint 006 las **cantidades** (un
     precio, un consumo, un tiempo: ver _Estimar una cantidad_) y desde el Sprint 007 las de **varias
     categorías** (ver _Clasificar en varias categorías_). Y si no quieres predecir nada, la primera
     opción del menú es **agrupar filas parecidas** (ver _Agrupar filas parecidas, sin objetivo_). Si
     alguna columna parece una fecha, la app te avisa: las fechas no se usan para el análisis.
  3. **Pulsa _Entrenar modelos_.** La primera vez tarda unos segundos mientras se prepara el motor
     de análisis; verás el progreso paso a paso.
  4. **Resultados → lee el veredicto.** Arriba, en grande, aparece el veredicto:
     - **▲ El modelo supera al baseline** — tu modelo predice mejor que una regla simple. Se indica
       por cuánto.
     - **＝ Empata con el baseline** — un modelo simple rinde igual; no vale la pena complicarse.
     - **▼ NO supera al baseline** — el modelo no aporta; conviene revisar tus columnas.
     - **⚠ Posible fuga de datos — sospechoso** — una columna predice el objetivo casi a la
       perfección: casi siempre es una fuga, y las cifras pueden estar infladas aunque no parezcan
       perfectas. La app señala la columna sospechosa; **quítala de tu tabla y vuelve a entrenar**.
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
  - Solo predicción de **dos categorías** (clasificación binaria). _Desde el Sprint 006 también se
    estiman cantidades, y desde el Sprint 007 se clasifica en varias categorías y se agrupa sin
    objetivo._
  - Tamaño máximo del archivo: **5 MB o 50,000 filas**. Por encima, la app avisa (no se cuelga).
  - El chequeo de fuga es una **ayuda honesta, no una garantía**: atrapa los casos evidentes, no
    todos.
  - Las columnas de fecha se **detectan y avisan**, pero no se usan para el análisis.
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

- **Debajo del gráfico hay dos textos, en bloques separados:**
  - **"Texto estándar"** — lo genera la propia app con tus números, **sin IA y sin internet**.
    Siempre está ahí. Te dice el veredicto, **qué mide la métrica principal y en qué rango vive**
    (por ejemplo, en AUC: 0.50 sería azar y 1.00 perfecto), las variables con más peso y las
    señales del informe (fuga, desbalance, identificadores).
  - **"Narración con IA"** — un bloque aparte con un botón **"Narrar con IA"**. Solo se pide
    cuando **tú lo pulsas**. Si aparece **"✓ verificada con los números"**, la escribió una IA
    **y la app comprobó, cifra por cifra, que no miente** antes de mostrártela. Si la IA cita una
    variable inexistente o una cifra falsa, esa narración **se descarta** y no la verás.
  - Los dos textos conviven: la IA **nunca reemplaza** al texto honesto de la app, y el gráfico
    siempre queda visible para que compruebes por ti mismo.
  - **Si la narración con IA no pudo generarse, la app te lo dice** con un aviso ⚠ y el motivo
    (el proveedor no respondió · no pasó la verificación · no está configurada en este
    despliegue). Para reintentar, pulsa **"Narrar de nuevo"**.

- **Privacidad de la narración con IA (importante):**
  - **No se pide sola nunca.** Solo viaja algo cuando pulsas el botón, y solo para ese
    experimento: si cargas otro dataset, el bloque vuelve a estar en reposo.
  - Al pulsarlo se envían a un proveedor de IA **solo los nombres de tus columnas y estadísticas
    agregadas** (métricas, importancias, alertas). **Tus filas de datos NUNCA se envían.**
  - La app **no guarda** ninguna decisión tuya sobre esto en el navegador.

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
     nombre, la nueva sale con un sufijo (`_2`) — nunca se pisa nada tuyo. Desde el Sprint 005, si
     el modelo es uno de los que **deciden la clase sin dar una probabilidad** (Ridge, SVM lineal),
     la columna de probabilidad no se incluye y la pantalla te lo dice: la app no inventa una.
     Desde el Sprint 006, si una celda empieza con `=`, `+`, `-` o `@` y no es un número, el
     archivo descargado la escribe con un apóstrofo delante (`'=…`): así la hoja de cálculo la
     muestra como texto y no la ejecuta como fórmula. Los números negativos quedan como están.

- **Guardar el modelo (exportar):**
  - En Resultados, pulsa **"Exportar modelo"**. Se descarga un único archivo `.probeta.json`.
  - **Qué contiene, dicho honesto:** lo que el modelo **aprendió** de tus datos (parámetros,
    categorías vistas, medianas, rangos) y su constancia (métricas, veredicto, advertencias) —
    **no tus filas crudas**, con una excepción: el modelo de **vecinos más cercanos** guarda **filas
    de tu entrenamiento** (ya transformadas) para poder comparar. Aun así, lo aprendido refleja tus
    datos: **trátalo como un archivo sensible** y compártelo solo con quien compartirías el resultado.

- **Volver a usar un modelo guardado (importar):**
  1. En la pantalla de inicio, pulsa **"Cargar modelo guardado"** y elige tu `.probeta.json`.
  2. La app **valida el archivo antes de abrirlo**: comprueba que es un modelo de Probeta y que su
     contenido está íntegro (una huella digital debe coincidir). Un archivo ajeno, corrupto o
     manipulado se **rechaza con la razón exacta**, sin llegar a abrirse.
  3. Si es válido, verás un **resumen honesto** de lo que trae (dataset, fecha, métrica, veredicto,
     advertencias de fuga, cómo se eligió el modelo y, si lo elegiste a mano, la etiqueta
     **◆ Elegido por ti**) para que decidas con conocimiento. Si el archivo se creó con **otra
     versión** del motor, la app te lo advierte: se carga igual, pero si falla, re-entrena y
     exporta de nuevo.
  4. Confirma con **"Usar este modelo"** y puntúa datos nuevos directamente — sin re-entrenar.

- **Limitaciones conocidas (Sprint 003):**
  - El archivo `.probeta.json` **solo lo entiende Probeta** (no es un formato estándar de
    intercambio): quien quiera usar tu modelo necesita abrirlo en Probeta.
  - El CSV nuevo tiene los **mismos límites** de siempre: 5 MB o 50,000 filas.
  - El aviso de novedad detecta **valores nunca vistos**; no puede detectar cambios más sutiles
    (por ejemplo, que la relación entre variables haya cambiado con el tiempo).
  - Por seguridad, **carga solo archivos exportados por Probeta**. La app valida la integridad,
    pero el archivo no está cifrado ni firmado.

### Sobrevive datos reales · desde Sprint 004

- **Qué hace:** la app deja de asumir datos "de laboratorio". Ahora aguanta CSV reales —con
  huecos, basura, columnas inútiles y filas repetidas— **saneándolos de frente** y avisándote de
  las señales de riesgo antes de entrenar.

- **Saneamiento transparente:** al cargar un CSV, verás un recuadro con lo que la app hizo antes de
  entrenar (o, si tus datos venían limpios, un franco **"nada que sanear"**). Con conteos exactos:
  - **Filas duplicadas exactas eliminadas** (dos filas idénticas cayendo una en entrenamiento y
    otra en prueba inflarían las métricas — se quitan por seguridad).
  - **Columnas excluidas:** una columna con **un valor distinto por fila** (un identificador, como
    un número de cliente) o **con un solo valor** (una constante) no ayuda a predecir; se aparta.
  - **Celdas basura convertidas a vacío:** si una columna es casi toda numérica pero tiene algún
    `"error"` suelto, esas celdas se vacían (contadas) y la columna se trata como número.

- **Un CSV separado por punto y coma:** es lo que guarda Excel en español. La app no adivina el
  separador: te dice que tu archivo separa con punto y coma (;) y que lo vuelvas a guardar como «CSV
  (delimitado por comas)». Adivinarlo podría convertir columnas numéricas en categorías sin avisarte.

- **Alertas antes de entrenar (exploración de datos):** al elegir el objetivo, la app revisa tus
  columnas y te avisa —con símbolo y texto, nunca solo color— de:
  - una columna que predice el objetivo **casi a la perfección** (posible fuga: un dato que no
    tendrías al predecir de verdad),
  - una columna que **parece un identificador** (aporta poco para generalizar),
  - un **objetivo desbalanceado** (una respuesta es mucho más rara que las otras): con dos
    categorías, por eso el veredicto usa el AUC; con varias, la alerta nombra la categoría más chica
    y el veredicto usa la exactitud balanceada.

- **Boosting que compite:** además del Random Forest, la app entrenaba un **HistGradientBoosting**,
  con el mismo preprocesamiento y el mismo veredicto. _Desde el Sprint 005 esto cambió:_ compiten
  todos los modelos que el navegador puede entrenar, se elige con validación cruzada y puedes elegir
  otro a mano — ver **«La liga honesta»**.

- **Limitaciones conocidas (Sprint 004):**
  - El saneamiento es **honesto, no mágico**: arregla lo estructural (duplicados, basura,
    identificadores) pero no adivina el valor "correcto" de un dato faltante — lo rellena con la
    mediana o la categoría más común del **entrenamiento**, y lo dice.
  - Las alertas son una **ayuda, no una garantía**: la de fuga marca los casos evidentes, no todos.
  - El boosting corre en CPU (como toda la app): entrenar un dataset grande puede tardar un poco.

### La liga honesta · desde Sprint 005

- **Qué hace:** en vez de dos modelos, la liga reúne **todos los que tu navegador puede entrenar**
  (14: modelos lineales, árboles, vecinos, boosting como XGBoost y LightGBM, bosques y una red
  neuronal pequeña). Primero compiten los que caben en unos segundos (**Nivel 1**); el resto, si
  quieres, en el **Nivel 2**, y algunos quedan «fuera» con su razón, como recomendación. La app
  elige al ganador **sin mirar el conjunto de prueba**, y solo después lo abre para darte el
  veredicto. Así puede ofrecerte muchos modelos sin inflar el resultado.

- **Antes de entrenar (Configuración):**
  - **Tipo de predicción:** al elegir la columna, una tarjeta te dice qué tipo de predicción sería y
    por qué (por ejemplo, _«2 valores distintos → clasificación binaria»_). En el Sprint 005 solo se
    entrenaban las de dos categorías; la columna de otro tipo no se escondía, y la tarjeta lo decía.
    _Desde el Sprint 006 se entrenan las cantidades y desde el Sprint 007 las varias categorías. Una
    columna que no sirve como objetivo (un solo valor, o tantos valores distintos que parece un
    identificador) ofrece **«Agrupar filas parecidas en su lugar»**._
  - **Quién compite:** otra tarjeta reparte los modelos en tres grupos, cada uno con su razón:
    - **Nivel 1 · ahora:** los que caben en unos 5 segundos de cálculo en un computador de
      escritorio (en un móvil puede tardar el doble o más).
    - **Nivel 2 · después, si quieres:** los que no caben en ese primer paso, con lo que costaría
      cada uno.
    - **Fuera · recomendación:** los que la app recomienda no correr con tus datos, con la razón
      medida (por ejemplo, una red neuronal con menos de 500 filas no aprende nada estable). **Es
      una recomendación, no una prohibición**: puedes incluirlos en el Nivel 2.

- **Mientras entrena:** la pantalla te dice cuánto debería tardar (la misma estimación de
  Configuración) y qué modelo está compitiendo en cada momento, con una barra de avance: primero la
  validación cruzada de todos y, al final, el conjunto de prueba.

- **La tabla de la liga (Resultados):** una fila por modelo, ordenada por su puntaje de **validación
  cruzada** (media ± variación entre pliegues).
  - **★ Ganador (validación cruzada)** — el que eligió la app. Entre los que quedan prácticamente
    empatados con el mejor puntaje (a menos de un _error estándar_), gana **el más simple**: entre
    empatados, quedarse con el máximo premia la suerte. Por eso a veces gana uno que no tiene el
    número más alto, y la tabla te lo explica.
  - **▲ mejor puntaje** y **≈ empata con el mejor** te muestran quiénes estaban en ese empate.
  - **⚠ no convergió** / **✕ no concluyó** — el modelo tuvo problemas; se dice, no se esconde.
  - Los modelos del **Nivel 2** pendientes y los **fuera** también aparecen, con su razón.
  - Arriba de la tabla, la regla en una frase: _«La tabla se calcula con validación cruzada: sirve
    para elegir. El veredicto se calcula con el conjunto de prueba: sirve para creer.»_

- **Ver puntajes de prueba (no sirven para elegir):** el botón abre una columna en ámbar con el
  puntaje de cada modelo en el conjunto de prueba. Existen y puedes verlos, pero **no para elegir**:
  si eliges el modelo mirando la prueba, el número del veredicto puede ser optimista. La app te lo
  advierte al abrirla.

- **Elegir otro modelo a mano:** cada fila tiene **«Elegir»**. Al elegir, la app ajusta ese modelo
  (unos segundos) y el veredicto pasa a hablar de él con la etiqueta **«◆ Elegido por ti, no por la
  validación cruzada»**. El ganador sigue marcado con ★, y **«Volver al ganador»** lo restituye. La
  model card y el archivo exportado registran que lo elegiste tú.

- **La ficha de cada modelo:** el nombre de cada modelo (y de los dos baselines) es un botón con el
  icono ⓘ. Abre su ficha: **qué es · cuándo sirve · cuándo no · qué mirar · cuánto cuesta**, y qué
  pasó con él en esta liga (ganador, puesto, pendiente o fuera y por qué). Se cierra con **Cerrar**
  o con la tecla Esc.

- **El Nivel 2 (la liga completa):** si quedaron modelos pendientes, o quieres incluir alguno de los
  que estaban fuera, la tarjeta **«Nivel 2: la liga completa»** te dice cuáles se suman y **cuánto
  tardaría en tu equipo** (la app lo estima con lo que tardó el primer paso). Al pulsar **«Correr el
  Nivel 2»** vuelve a correr la liga entera con la misma validación cruzada.
  - **Puedes cancelar mientras corre** («Cancelar el Nivel 2»): vuelves al resultado anterior sin
    perder nada. La app tarda unos segundos en recuperar el modelo; mientras tanto, _Usar el
    modelo_ y _Exportar_ esperan. Al agrupar hay una excepción: mira «Tus filas con su grupo».
  - Si el Nivel 2 no pudiera terminar (por ejemplo, por falta de memoria en un móvil), también
    vuelve el resultado anterior y te lo dice (al agrupar, con la misma excepción).

- **Cuando no se puede comparar con honestidad, la app lo dice con su razón:**
  - Si tu objetivo tiene dos valores escritos de dos formas (por ejemplo «1» y «1.0»), te pide
    unificarlos en tu CSV: para entrenar, cada clase tiene que escribirse igual en todas las filas.
  - Si hay muy pocos ejemplos de una de las clases, la tarjeta del tipo de predicción no muestra ✓:
    remite al motivo, que aparece debajo, y el botón de entrenar espera.
  - Si ningún modelo termina la validación cruzada sin problemas, la app no inventa un ganador: te
    lo dice y te sugiere más filas u otras columnas.

- **Limitaciones conocidas (Sprint 005):**
  - En el Sprint 005 solo se entrenaban objetivos de **dos categorías**. _Las cantidades llegaron en
    el Sprint 006 y las varias categorías en el Sprint 007._
  - Con **muestras pequeñas** (menos de 200 filas) los puntajes de validación cruzada varían mucho;
    la app lo avisa.
  - Los tiempos son **estimaciones**: tu equipo puede tardar distinto, sobre todo un móvil.
  - Con datos grandes (decenas de miles de filas) el Nivel 2 puede tardar minutos.

### Estimar una cantidad · desde Sprint 006

- **Qué hace:** si la columna que quieres predecir es un **número que se mide** —un precio, un
  consumo en kWh, un tiempo en minutos—, la app ya no te dice «llega en una próxima versión»: arma la
  misma liga honesta del Sprint 005 y te dice **cuánto se equivoca en promedio, en las unidades de
  tu columna**, comparado con adivinar siempre el mismo número.

- **Cómo se usa:**
  1. **Elige la columna.** La tarjeta dice _«Vas a estimar una cantidad, en kWh»_. La unidad la lee
     del final del nombre de la columna (`_kwh`, `_usd`, `_min`, `_kg`, `_m2`…). Si el nombre no
     trae una unidad que reconozca, no la inventa: te dice que las cifras irán «en las unidades de»
     tu columna.
  2. **Si la columna tiene pocos números distintos** (por ejemplo, _ocupantes_ de 1 a 6), la app no
     puede saber si son **categorías** (como una nota del 1 al 5) o **una cantidad**, y te lo
     **pregunta**, con la lectura más probable marcada con ★ _Sugerida_:
     - **Una cantidad** → se entrena la liga que estima el número.
     - **Categorías** → se entrena la liga de varias categorías (desde el Sprint 007: ver
       _Clasificar en varias categorías_).
     - Puedes **cambiar la respuesta** cuando quieras.
  3. **Pulsa _Entrenar modelos_.** La liga de estimar reúne 11 modelos (los mismos árboles, boosting,
     vecinos y red neuronal de la liga, más tres rectas: lineal, Ridge y Lasso). Como al clasificar,
     primero compiten los que caben en el Nivel 1, y con menos de 500 filas la red neuronal queda
     «fuera» con su razón (en el ejemplo de consumo compiten 10). Misma validación cruzada y misma
     regla del más simple entre empatados.

- **Cómo leer el resultado:**
  - **El veredicto, en unidades:** _«En promedio se equivoca por ±33.5 kWh; una regresión lineal se
    equivoca por ±43.8 kWh: un 23 % menos de error.»_ El rival es el **mejor de dos baselines**:
    adivinar siempre la **mediana** (el valor del medio de tu columna) o una **regresión lineal**
    (la recta más simple). Si tu modelo se equivoca prácticamente lo mismo (menos de un 1 % de
    diferencia), **empata**; si se equivoca más, **NO supera**, y te lo dice de frente.
  - **Las métricas:** el **MAE** (cuánto se equivoca en promedio) decide; el **RMSE**, el **R²** y
    la **MedAE** se muestran para leer mejor. Una línea te dice cuál mirar y por qué.
  - **La tabla de la liga:** igual que al clasificar, pero aquí **menor es mejor** (es un error), y
    lo dice arriba de la tabla.
  - **El gráfico _Estimado frente a real_:** cada punto es una fila de la prueba; en horizontal, el
    valor real; en vertical, lo que estimó el modelo. La **diagonal** es la estimación perfecta y la
    **franja** alrededor marca ±MAE. Los puntos **dentro** de la franja son discos rellenos; los de
    **fuera**, anillos: se distinguen por la forma, no solo por el color.
  - **Cómo se reparten los errores:** debajo del gráfico, en palabras y en una tabla: entre qué
    valores cae la mitad de los errores, por cuánto se equivocan 9 de cada 10, y si el modelo tiende
    a estimar de más o de menos. Esto usa **todas** las filas de la prueba (el gráfico muestra hasta
    200).
  - **El porqué:** las barras de importancia y la dirección se leen contra tu cantidad («a mayor
    valor, mayor consumo»). La **narración con IA no se ofrece al estimar**: solo cubre la
    clasificación en dos categorías. El texto estándar, que sale de los mismos números, sí está.

- **Antes de entrenar, la app te avisa si:**
  - una columna **casi copia** al objetivo (una posible fuga, como un impuesto que se calcula del
    precio). La nombra antes de entrenar y en el resultado;
  - el objetivo está **muy sesgado** (unos pocos valores muy grandes pesan mucho en el error);
  - hay **valores muy lejos del resto** (pueden ser errores de captura).

- **Usar el modelo:** al puntuar un CSV nuevo, la columna nueva se llama **`<tu columna>_estimado`**
  (por ejemplo `consumo_kwh_estimado`) y trae los **mismos decimales** con que escribiste tu
  objetivo. No hay columna de probabilidad: estimar no la da. Arriba verás el **mínimo, la mediana y
  el máximo** de lo estimado. El archivo exportado (`.probeta.json`) recuerda que estima una
  cantidad; al importarlo, el resumen lo dice.

- **Limitaciones conocidas (Sprint 006):**
  - La unidad sale **solo del nombre** de la columna; si no la reconoce, no la inventa.
  - Árboles, bosques y vecinos **no estiman por fuera** del rango que vieron al entrenar.
  - La narración con IA no cubre estimar (sí el texto estándar).
  - _Las varias categorías llegaron en el Sprint 007._

### Clasificar en varias categorías · desde Sprint 007

- **Qué hace:** si la columna que quieres predecir tiene **entre 3 y 20 categorías** —un plan
  (básico, estándar, premium…), una región, un tipo de producto—, la app arma la misma liga honesta y te
  dice si el modelo acierta **en cada categoría** mejor que una regla simple, y **dónde se confunde**.

- **Cómo se usa:**
  1. **Elige la columna** (o pulsa el ejemplo **«Planes de suscripción»** en el inicio). La tarjeta
     dice _«5 categorías distintas → clasificación en varias categorías»_ y _«Vas a clasificar en 5
     categorías»_. Si la columna tiene **más de 20** valores distintos, la app no la toma por
     categorías (parece un identificador o texto libre) y te ofrece **agrupar filas parecidas** en su
     lugar.
  2. Si la app te preguntó **«¿categorías o una cantidad?»** y respondes **Categorías**, también
     llegas aquí.
  3. **Pulsa _Entrenar modelos_.** Compiten los mismos 14 modelos de la liga, cada uno en su forma
     para varias categorías, con la misma validación cruzada y la misma regla del más simple entre
     empatados.

- **Cómo leer el resultado:**
  - **La métrica que decide es la exactitud balanceada:** de cada categoría, qué parte acierta, en
    promedio. Cada categoría pesa igual aunque tenga pocas filas, así que el modelo no puede ganar
    acertando solo la más común. La pantalla te dice cuánto daría **adivinar al azar** (con 5
    categorías, 0.20) y que 1.00 sería acertar siempre.
  - **El veredicto:** compara tu modelo con dos baselines, **la categoría más frecuente** y una
    **regresión logística**. Si la diferencia es menor que 0.01, **empata**; si pierde, **NO
    supera**, y te lo dice de frente.
  - **Las otras métricas:** el **F1 macro**, la **exactitud** a secas (que puede engañar si una
    categoría domina), la **pérdida logarítmica** y el **AUC**. Los modelos que deciden la categoría
    sin dar probabilidades (Ridge y el SVM lineal) muestran «—» en las dos últimas: la app no inventa
    una cifra.
  - **La matriz de confusión:** cada fila es la categoría real y cada columna la que predijo el
    modelo. Los aciertos (la diagonal) llevan **✓**; todo lo demás son confusiones. Con muchas
    categorías, la tabla se desplaza dentro de su propio recuadro. El nombre de cada fila se lee
    entero, y cada columna lleva delante el número de su fila (_«2·»_ arriba es la fila _«2·»_ de la
    izquierda), porque en la columna un nombre largo se recorta. Debajo, una frase te dice **la confusión más
    frecuente**, con su conteo: _«filas de “A” que el modelo tomó por “B”»_.
  - **Por categoría:** una tabla con cómo le va al modelo en cada categoría y cuántas filas de
    prueba tiene. Todo esto se calcula sobre el **conjunto de prueba**.
  - **El porqué:** las barras miden cuánto baja la exactitud balanceada si se rompe la relación de
    cada variable con el objetivo. Con varias categorías una variable **no empuja en una sola
    dirección** (puede volver más probable una categoría y menos otra), y la app lo dice en vez de
    dibujar una flecha. La **narración con IA no se ofrece** con varias categorías: el texto estándar,
    que sale de los mismos números, sí está.

- **La fuga, por categoría:** la app busca columnas que separan **una categoría** del resto casi a
  la perfección y nombra las dos. En el kit de prueba, por ejemplo: _«La columna
  “cargo_corporativo_usd” separa casi a la perfección la categoría “empresa” del resto»_. Para no dar falsas alarmas con pocas filas, solo mira una
  categoría si **ella y el resto tienen al menos 5 filas con valor** en esa columna. _Desde el Sprint
  007, la clasificación en dos categorías usa la misma regla._

- **Antes de entrenar,** la app te avisa si una columna separa casi a la perfección **una** categoría
  del resto (nombra la columna y la categoría) y si una categoría es mucho más rara que las demás (la
  nombra, con su porcentaje).

- **Si una categoría tiene muy pocas filas:** la validación cruzada necesita al menos **2 filas de
  cada categoría** en el entrenamiento. Si alguna no llega, la app no entrena y te dice **cuál** es:
  prueba con más filas o junta las categorías más raras en una sola.

- **Usar el modelo:** al puntuar un CSV nuevo se suman dos columnas: **`<tu columna>_predicho`** (la
  categoría) y **`<tu columna>_probabilidad`** (qué tan seguro está el modelo de **esa** categoría).
  Con varias categorías esa probabilidad puede ser baja aunque la predicha sea la más probable, y la
  pantalla lo explica. Si el modelo no da probabilidades, la segunda columna no se incluye. Exportar e
  importar funcionan igual que siempre; el resumen del import dice cuántas categorías trae.

- **Limitaciones conocidas (Sprint 007):**
  - De **3 a 20 categorías**. Más de 20 valores distintos no se toman por categorías.
  - La narración con IA no cubre varias categorías (sí el texto estándar).

### Agrupar filas parecidas, sin objetivo · desde Sprint 007

- **Qué hace:** a veces no hay nada que predecir: quieres saber si tus clientes, productos o casos
  **forman grupos** y qué distingue a cada uno. La app prueba cuatro formas de agrupar, elige cuántos
  grupos hay y, sobre todo, te dice **si esos grupos existen de verdad** o si solo son una manera de
  partir la tabla.

- **Cómo se usa:**
  1. **Elige _«Sin objetivo: agrupar filas parecidas»_**, la primera opción del menú _¿Qué quieres
     predecir?_ (o pulsa el ejemplo **«Segmentos de clientes»** en el inicio). Si elegiste una
     columna que no sirve como objetivo, la tarjeta te ofrece **«Agrupar filas parecidas en su
     lugar»**.
  2. **Revisa el plan.** Una tarjeta te dice **con qué columnas se mide el parecido** (las numéricas,
     si hay al menos dos; si no, todas), cuáles **solo describen** los grupos (las de categorías) y
     cuáles **no entran** y por qué (un identificador, una fecha).
  3. **Quién compite:** K-Means, el jerárquico y la mezcla gaussiana prueban de **2 a 10 grupos** y
     eligen cuántos (con la silueta o el BIC); HDBSCAN los encuentra por densidad. Cada uno dice cómo
     eligió.
     **K-Means** y el **jerárquico** eligen cuántos grupos con la _silueta_; la **mezcla gaussiana**
     (GMM), con el _BIC_; **HDBSCAN** no necesita que se lo digan: los encuentra por densidad.
  4. **Pulsa _Agrupar filas_.**

- **Cómo leer el resultado:**
  - **Arriba, la lectura, que sirve para creer.** Al agrupar **no hay conjunto de prueba ni
    veredicto contra un baseline**: no hay respuesta correcta con la que comparar. La app hace dos
    cosas en su lugar:
    - **Compara con datos sin estructura.** Agrupa con el mismo agrupador datos al azar en la misma
      caja que los tuyos, y exige que tus filas se separen mejor por al menos **0.10** de puntaje.
    - **Repite el agrupamiento.** Vuelve a agrupar el **80 %** de tus filas **10 veces** y mira si
      salen los mismos grupos: tienen que parecerse en al menos **0.7 de 1**.

    Con eso dice una de tres cosas, con su símbolo: **● «Los grupos existen»** (pasan las dos),
    **⚠ «Hay k grupos, pero son frágiles»** (se separan, pero cambian al repetir: léelos como una
    partición posible, no como un hallazgo) o **○ «No hay estructura de grupos»** (no se separan
    mejor que el azar; los grupos de abajo son una forma de partir la tabla, no un hallazgo).
  - **Qué distingue a cada grupo:** una tarjeta por grupo con su tamaño, **las columnas que más lo
    separan** y su valor en las unidades de tus columnas, junto al promedio de los grupos. Cuánto
    separa una columna se mide de 0 a 1 (con _η²_ en las numéricas y la _V de Cramér_ en las de
    categorías). Las demás columnas están en **«Ver las otras columnas»**.
  - **Fuera de todo grupo:** HDBSCAN puede dejar filas que no caen en ninguna zona densa, sin
    forzarlas a un grupo. Aparecen en su propia tarjeta.
  - **La tabla de los agrupadores, que sirve para elegir:** cuántos grupos encontró cada uno y cómo
    los eligió, su **silueta** (de −1 a 1: cuánto más cerca está cada fila de su grupo que del grupo
    vecino), la parte de filas **fuera de grupo** y su **puntaje** = silueta × (1 − la parte fuera de
    grupo), para que HDBSCAN no gane dejando fuera las filas difíciles.
  - **★ Ganador por consenso:** gana el número de grupos en el que **coinciden más agrupadores** y,
    entre ellos, el de mayor puntaje. Si cada agrupador encontró un número distinto de grupos, no hay
    consenso: gana el de mayor puntaje y la marca dice **★ Ganador por puntaje**. Puedes **elegir
    otro**: la lectura pasa a ser la suya, con la etiqueta **◆ Elegido por ti**, y **«Volver al
    ganador»** lo restituye.

- **Con más de 8,000 filas, el jerárquico usa una muestra:** se ajusta sobre **8,000 filas al azar**
  (siempre las mismas para tus datos) y asigna el resto al grupo más cercano. Lo hace para no agotar
  la memoria del navegador, sobre todo en un teléfono, sin cerrar la pestaña. Los demás agrupadores
  usan todas tus filas. La app te lo dice **antes de agrupar**, junto a la lectura si el jerárquico gana,
  en su fila de la tabla, en la model card y en el archivo exportado. Con datos grandes, el
  jerárquico puede quedar para el **Nivel 2**.

- **Tus filas con su grupo:** **«Descargar filas con su grupo»** te da tu tabla con una columna más,
  **`grupo`**, con el número de grupo de cada fila (desde 1) o «fuera de todo grupo». Se arma en tu
  navegador en el momento y no se guarda en ningún otro lado: ni en el resultado, ni en la model card,
  ni en el archivo exportado. Si corres el Nivel 2 y lo cancelas cuando ya está agrupando, o no llega
  a terminar, vuelves al resultado anterior, pero para descargar tus filas con su grupo hay que volver
  a agrupar: la app te lo dice.

- **Asignar filas nuevas:** pulsa **«Asignar filas nuevas»** y sube un CSV con las columnas que
  forman el parecido (no hay objetivo que quitar). Cada fila recibe su grupo con una regla que la app
  te dice:
  - K-Means y el jerárquico: el grupo cuyo **centro está más cerca**;
  - la mezcla gaussiana: el grupo **más probable**, con su probabilidad (columna
    `grupo_probabilidad`);
  - HDBSCAN: el centro más cerca, salvo que la fila quede **más lejos que el miembro más lejano** de
    ese grupo: entonces queda «fuera de todo grupo».

  La app también te dice qué parte de tus propias filas cae en el mismo grupo con esa regla. El
  archivo exportado lleva el preprocesamiento y la regla (los centros de los grupos), **sin ninguna
  de tus filas**.

- **Limitaciones conocidas (Sprint 007):**
  - Los grupos **describen** tus filas: no prueban que haya una causa detrás, ni que se repitan en
    otros datos.
  - La silueta se mide sobre una **muestra de hasta 2,000 filas**, la misma para todos los
    agrupadores.
  - Con más de 8,000 filas, el jerárquico se ajusta sobre una muestra (ver arriba).
  - Las fechas no se usan para agrupar.
  - La fuga no aplica (no hay objetivo que una columna pueda delatar) y la narración con IA no se
    ofrece; la model card lo dice.

### Protocolo DS, el camino lento · desde Sprint 008

- **Qué hace:** Probeta es el laboratorio rápido: cargas un CSV y en minutos tienes un veredicto.
  **Protocolo DS** es lo contrario: un camino lento, por etapas, para quien quiere un modelo que
  pueda defender. Cada etapa te pide una tarea **con tus propios datos**, comprueba que la cumpliste
  y **solo entonces abre la siguiente**. No hay botón para saltar una etapa: se cumple o se corrige.
  Todo lo que verifica es código que corre en tu navegador, sin inteligencia artificial.

- **Cómo se usa:**
  1. **Entra.** En el inicio, la tarjeta **«¿Prefieres el camino lento?»** tiene el enlace **«Abrir el
     Protocolo DS»**. El Protocolo no trae ejemplos: se trabaja con tus datos.
  2. **Etapa 1 · La decisión y lo que cuesta equivocarse.** Escribes qué decisión cambia con el
     modelo, quién la toma y cómo es (**sí o no**, **elegir entre varias opciones** o **cuánto**), y
     cuánto te cuesta cada error, en tu unidad (dólares, horas, clientes…). De ahí sale lo que de
     verdad te conviene: con dos opciones, **a partir de qué probabilidad actuar** (no siempre 0.5);
     con una cantidad, **qué cuantil estimar** (si quedarte corto cuesta más que pasarte, no el
     promedio). Esta etapa no usa tus datos.
  3. **Carga tu CSV** (arriba, en «Tus datos»). Tiene el mismo límite que Probeta. El archivo **no se
     guarda**: se guarda su **huella**, un código que sale de su contenido exacto.
  4. **Etapa 2 · El objetivo y la unidad, con su momento.** Eliges la columna que quieres predecir; la
     app dice qué tipo de problema es y comprueba que **coincide con la decisión de la etapa 1**. Con
     dos valores, dices cuál es el caso «hay que actuar». Dices **qué es una fila** (cada fila, o una
     columna que identifica a la misma persona, tienda o cliente) y **en qué momento se hace la
     predicción** (una columna de fecha, o lo escribes). La app cuenta cuántas filas tiene cada
     unidad, lee tus fechas **sin adivinar** (si «05/06/2026» puede ser día/mes o mes/día, **te
     pregunta**) y calcula cuánto cuesta **no hacer nada**, que es contra lo que tiene que ganar el
     modelo. Si **no tienes una columna objetivo**, el Protocolo se detiene y te lleva a «agrupar» de
     Probeta.
  5. **Etapa 3 · ¿Predecir o explicar? y el diseño.** Si lo que buscas es **una causa** (qué provoca
     qué), el Protocolo se detiene y te lo dice: un modelo predictivo no responde eso, hace falta un
     experimento; puedes reformular la pregunta como predicción. Si es predecir, escribes la
     **población**, el **periodo** y las **exclusiones**, y la app calcula **cuántas filas hacen falta**
     para el número de variables que tienes (la cuenta de Riley y colaboradores) y lo compara con las
     tuyas. Si no alcanzan, **no te lo impide**: te pide **escribir tu aviso**, y queda en el cuaderno.
  6. **Etapa 4 · ¿Existe al decidir?, columna por columna.** Primero **apuestas**: marcas las columnas
     que crees que filtran el resultado (las que se llenan o se conocen después de que ocurre), o
     «ninguna». Mientras no apuestas, la app no te muestra nada de lo que encontró; **sin apuesta no hay
     revelación**. Al revelar, tu apuesta **queda fija** y ves lo que encontró el código: columnas que
     casi adivinan el resultado, columnas que solo se llenan cuando ocurre, columnas que parecen un
     identificador, filas repetidas y, si elegiste una columna de fecha en la etapa 2, el **cambio entre
     periodos**. Una comparación te dice qué acertaste, qué te sorprendió y qué apostaste y la app no
     marca. Después, **columna por columna** dices quién o qué la produce (la **procedencia**), si se
     llena **antes** de decidir, **después** o **no sabes**, y si la **usas**, **excluyes** o **no
     sabes**. Lo que se llena después solo se puede excluir; lo que no sabes **no entra al modelo**. Las
     columnas que tienen alguna alerta se responden **una por una**. Las que no tienen ninguna pueden
     marcarse **en bloque**, pero solo si declaras que se llenan antes de decidir: esa declaración queda
     en el cuaderno, y se puede deshacer.
  7. **Etapa 5 · La línea base sin modelo y la regla de hoy.** Antes de abrir cualquier modelo, la app
     te muestra **lo que ya se logra sin modelo**, en la moneda de tu decisión. Con **sí o no**: nunca
     actuar y siempre actuar (la clase más frecuente queda marcada). Con **varias opciones**: decir siempre
     la clase más frecuente y elegir siempre la opción fija más barata con tus costos. Con **una cantidad**:
     estimar siempre la mediana, el promedio y, si tus costos son distintos, el cuantil de tus costos; y, si
     la etapa 2 registró una unidad que se repite y leyó tus fechas, repetir el último valor de la misma
     unidad. Cada fila dice el **costo por cada 100 decisiones** y la métrica estándar (exactitud balanceada
     en las clasificaciones, error medio en una cantidad), y los aciertos de cada 100 cuando hay clases.
     Después escribes **la regla que tu gente aplica hoy**: hasta dos condiciones (columna, operador y valor)
     unidas por «y» u «o», o dices que **no hay regla**. Solo puedes usar las columnas que dejaste en
     **«usar»** en la etapa 4. La app mide la regla en tus filas y la añade a la tabla como **«Tu regla de
     hoy»**. Con sí o no, la salida es fija: si la regla se cumple, se actúa; si no, no. Con varias opciones o
     una cantidad, eliges qué se hace en cada caso. Es una **referencia**, no un resultado: se mide sobre
     todas tus filas, y la **etapa 8** la vuelve a medir sobre la prueba.
  8. **Etapa 6 · La prueba sellada.** Antes de entrenar, la app aparta una parte de tus datos como **prueba**: la etapa 7 entrena y compara solo dentro del entrenamiento, con pliegues, y la etapa 8 la abre una sola vez. La app **sugiere** el esquema con lo que registraste en la etapa 2: si tienes una **fecha** y una **unidad que se repite**, te pregunta si el modelo se usará con **unidades nuevas** o con las que ya conoces; si solo tienes fecha, reparte **por tiempo**; si solo tienes una unidad que se repite, **por grupo**; si no tienes ninguna, **estratificada** (al azar, guardando la proporción de cada clase). Puedes elegir otro esquema, pero escribes **por qué**: el cuaderno guarda el sugerido, el que elegiste y tu razón. Después eliges el **tamaño** de la prueba (de cada 100 filas, entre 10 y 40; se sugiere 20) y, en los esquemas por tiempo, el **horizonte**: cuánto tarda en conocerse el resultado, en días o en meses. No tiene valor por omisión: lo escribes tú, y 0 significa que el resultado se conoce al decidir. La tabla **«Cómo quedan tus filas»** cuenta por lado (entrenamiento, hueco, prueba y fuera): filas, unidades, fechas y clases. **No muestra ninguna fila de la prueba**, solo conteos y rangos. Las filas que no entran a ningún lado se cuentan por motivo: sin objetivo, sin fecha (en los esquemas por tiempo), sin unidad (en los de grupo), en el hueco o de unidades que están en la prueba. La **verificación** vuelve a contar sobre tu tabla que ninguna fila esté en los dos lados, que ninguna unidad esté en los dos lados y, por tiempo, que ninguna fila de entrenamiento caiga dentro del horizonte. **Registrar la etapa 6 la sella**: el sello son 64 caracteres que salen de tu huella, del esquema, de sus parámetros, de la semilla y de qué filas son la prueba; la pantalla muestra los primeros doce. Al recargar y volver a cargar tu CSV, el sello **se vuelve a calcular**: si cuadra, la etapa sigue cumplida; si no, queda por verificar y la 7 no abre. El contador cuenta **pruebas distintas** selladas: volver a registrar la misma no suma.
  9. **Etapa 7 · El ganador, con la prueba cerrada.** La app parte **solo tu entrenamiento** en pliegues, con el mismo esquema que sellaste en la etapa 6: cada pliegue entrena con unas filas y valida con otras que no vio, y ninguna fila cae en los dos lados. La tabla **«Lo que hereda»** dice qué columnas usa la liga, con qué partición y cuántas filas entrenan; tu prueba **no entra** a esta etapa. Después **«Correr la liga»** compite los modelos en esos pliegues y muestra cada puntaje con su **medida de selección**: el número con que se eligió al ganador, optimista porque ganó justo en esos pliegues. Si otro modelo más simple queda a menos de un error estándar del mejor, gana ese, y **«Por qué ganó»** lo explica. Luego el ganador se compara con la **línea base de cada pliegue** (la de la etapa 5), en costo por cada 100 decisiones, con un intervalo del 95 %: si el intervalo entero queda por encima de cero dice **«Supera»**; si toca o cruza el cero, **«No supera»**. Los dos son resultados válidos. Por último, la **prueba de permutación** baraja las etiquetas del entrenamiento y vuelve a validar al ganador muchas veces, para ver si encuentra algo que el azar también encuentra; te da su valor p y la **resolución** de ese valor. **Registrar la etapa 7** se activa al terminar la liga. Corre en tu navegador: con muchas filas puede tardar unos minutos, y tus datos no viajan a ningún servidor.
  10. **Etapa 8 · La prueba, abierta una vez.** Ahora la app abre la prueba que sellaste en la etapa 6,
     **una sola vez**, con el ganador de la etapa 7: lo entrena con todas tus filas de entrenamiento y
     predice la prueba. Antes de abrirla lees qué se va a abrir (las columnas en «usar» y cuántas filas
     de prueba hay). Si el sello que da tu tabla hoy no es el que registraste en la etapa 6, la prueba
     **no se abre**. Al abrirla ves:
     - **La medida en la prueba:** el ganador, la línea base sin modelo y tu regla de hoy, en costo por
       cada 100 decisiones, con un intervalo del 95 %. El intervalo remuestrea **unidades o fechas
       enteras** si tu esquema es por grupo o por tiempo (las filas de una misma unidad no son
       independientes), y filas sueltas si es estratificada. Con la misma semilla, el mismo archivo da
       siempre el mismo intervalo.
     - **El optimismo de la selección:** la medida de la etapa 7 menos el mismo número en la prueba.
     - **El error por segmento:** la prueba se corta en periodos (por mes, o por trimestre si pasa de
       12 meses), en valores de cada categoría de 2 a 8 valores y en cuartiles de cada columna numérica.
       Cada segmento dice sus filas y, con dos clases, sus casos de la clase menos frecuente. Un segmento
       sin soporte se muestra, pero **nunca es el peor**. El peor se marca con símbolo, texto y color.
     - **La calibración:** si el modelo da probabilidades, una tabla por tramos de igual ancho (5 tramos
       con menos de 200 filas, 10 desde ahí) con lo que dijo y lo que pasó, el **Brier** junto al de decir
       siempre la tasa base, y una frase con el tramo más desajustado. Con varias clases se calibra la
       confianza de la clase que eligió. Si el modelo no da probabilidades, la pantalla dice que no se
       puede medir; si estimas una cantidad, no aplica.
     - **Los peores casos:** las 10 filas más caras de la prueba. Se ven **solo en tu pantalla**: no se
       guardan en el cuaderno, no se exportan y no salen de tu navegador.
     Luego escribes **tu patrón de fallo** (hasta 500 caracteres): con tus palabras, en qué se parecen los
     peores casos. Sin él no se puede registrar la etapa. El cuaderno guarda tu texto y cuántos peores
     casos se mostraron, nunca las filas. Si abres la prueba otra vez con otra configuración, el cuaderno lo
     cuenta y lo rotula; la app no te lo impide. Abrir lo mismo otra vez no suma. Corre en tu navegador:
     tus datos no viajan a ningún servidor.
  11. **Etapa 9 · ¿Sirve para la decisión?** Ahora la app convierte lo medido en una decisión **sin volver a abrir la prueba**: lee lo que la etapa 8 guardó de ella (conteos por umbral, sin filas) y tus costos de la etapa 1. Si la etapa 8 se registró antes de guardar esa tabla, la pantalla lo dice y te pide volver a registrarla; la prueba se vuelve a abrir, y solo cuenta como apertura nueva si cambió la configuración, con su rótulo.
     - **El umbral:** por defecto es el de tus costos. Si actuar sin que hiciera falta cuesta 10 y no actuar cuando sí hacía falta cuesta 50, el umbral es 0.17: conviene actuar desde esa probabilidad. Puedes moverlo para leer la curva, pero la pantalla lo rotula **«Elegido mirando la prueba: optimista»** y te pide una razón escrita; sin razón no se registra. Un modelo que no da probabilidades no tiene umbral que mover: decide con la clase que predice.
     - **Las cifras:** con el umbral que usas, por cada 100 casos, cuántas alertas salen, cuántas son falsas alarmas (por cada 100 alertas), cuánto cuesta decidir (por cada 100 decisiones) y el beneficio neto. Se comparan con **no hacer nada** (cero), con **actuar con todos** y con tu regla de hoy si la hay. La marca **«· lo de hoy»** señala lo que hoy se hace. El intervalo solo aparece con el umbral de tus costos: es el de la etapa 8.
     - **Lo que tu equipo alcanza:** escribes de cada 100 casos cuántos puede atender. Si el umbral da más alertas que eso, la pantalla dice cuántas sobran y muestra el umbral de tu capacidad con su costo.
     - **La curva de decisión:** el beneficio neto en cada umbral, con una gráfica y una tabla con las mismas cifras cada 0.05. El umbral de tus costos sale marcado con ◆ y el que elegiste con ●. Donde el modelo queda por debajo de actuar con todos o de cero, no aporta.
     - **Con una cantidad** (estimar un número): no hay umbral, capacidad ni curva. Ves el costo del modelo por cada 100 decisiones frente a lo de hoy y el **cuantil** que conviene apuntar con tus costos: quedarse corto y pasarse no cuestan lo mismo.
     - **Tu decisión:** **Usarlo**, **Iterar** (mejorarlo antes de decidir) o **No usarlo**, con una razón escrita. **No usarlo es un resultado válido**: queda en el cuaderno con sus números.
  12. **Etapa 10 · La ficha del modelo y su vigilancia (Sprint 015).** Ahora la app arma la **ficha del
     modelo** sola, con lo que el cuaderno ya guardó en las etapas 1 a 9: nada se recalcula y la prueba
     no se vuelve a abrir. Se abre con la etapa 9 cumplida. Para cumplirla **nombras a quien responde**
     por el modelo (una persona o un rol) y, según tu decisión de la etapa 9:
     - **Usarlo:** escribes **cada cuántos meses se reentrena** (de 1 a 60). Si la prueba se hizo cortando
       por tiempo, la app te propone los meses que esa prueba respalda; si alargas esa cadencia, escribe tu
       razón. Si la prueba no se hizo por tiempo, la cadencia la escribes tú. Ves el **plan de vigilancia**:
       la deriva de las columnas del modelo y el piso de la decisión.
     - **Tú eliges qué columnas de texto se vigilan.** Las columnas numéricas del modelo se vigilan siempre
       (se guardan rangos redondeados y conteos). De una columna de **texto**, la app solo guarda los nombres
       de sus categorías (las que tienen 5 filas o más) si **tú la marcas**. Vienen **sin marcar**: lo que no
       marques no deja ningún nombre en el cuaderno, y la ficha, el aviso de la etapa y el chequeo dicen que
       esa columna quedó **sin vigilar**. Si el modelo solo usa columnas de texto, tienes que marcar al
       menos una.
     - **Iterar o no usarlo:** escribes **qué tendría que cambiar** para que sirva. Es un resultado válido,
       con su ficha.
     - Puedes escribir también **para qué NO usarlo**, con tus palabras.
     - **La ficha:** por secciones, con lo que midió la prueba, la decisión con sus números, los límites y
       lo que el modelo cumplió. Cada línea dice de qué etapa, qué fecha y qué huella sale. Lo que se deriva
       no se edita; lo que escribiste va marcado como tuyo. Antes de registrar hay una vista previa.
     - **Descargar la ficha** baja un archivo Markdown en el idioma que estés usando. No trae ninguna fila de
       tu CSV.
     - **Chequeo de deriva (solo con «usar»):** cargas un CSV nuevo con las columnas del modelo y la app dice,
       columna por columna, si sigue **estable**, tuvo un **cambio moderado** o dio **alerta**. El veredicto
       del plan es **sigue**, **revisa** o **reentrena**. Mide si las entradas de hoy se parecen a las del
       entrenamiento; **no mide si el modelo sigue acertando**. El archivo nuevo no se guarda.
     - Cuando las diez etapas están cumplidas, la página dice **«Protocolo completo»**.
  13. **Lee «En tus datos».** Cada etapa te muestra lo que acaba de evitar, calculado con tus datos:
     «tu unidad se repite: 361 filas para 100 unidades», «con tus costos actúas desde 0.17, no
     desde 0.5».
  14. **Corrige cuando quieras.** En una etapa cumplida, **«Corregir»** abre su formulario. Lo corregido
     queda como una entrada nueva; las etapas que se construyeron sobre la anterior vuelven a
     **«Por verificar»**.

- **El cuaderno:** cada vez que cumples una etapa, el cuaderno anota **qué se verificó, cuándo, con qué
  archivo y con qué números**. Solo crece: corregir una etapa añade una entrada y no borra la
  anterior (importar otro cuaderno, o empezar uno nuevo, sí lo reemplaza). Se guarda **en este
  navegador** y, al volver, sigue ahí. Lo ves al final de la página.
  - **Al volver:** cargas de nuevo tu CSV. Si es el mismo, la **huella coincide** y las etapas que usan
    los datos siguen cumplidas. Si es otro, la app **pregunta** si es **otra versión de los mismos
    datos** (las etapas que los usan vuelven a verificarse) o **otro proyecto** (cuaderno nuevo).
  - **Exportar cuaderno** baja un archivo `.protocolo.json`: es tu respaldo y lo que llevas a otra
    máquina. **Importar cuaderno** lo devuelve. Un archivo que no es un cuaderno válido se rechaza
    **diciendo qué campo falla**.
  - **Qué lleva el archivo:** no trae las filas de tu CSV, pero sí datos que salen de él: los nombres de
    tus columnas, los valores del objetivo con sus conteos, medias, la fecha mínima y la máxima, el
    nombre del archivo y su huella, además de tus respuestas. Desde la etapa 4 suma también los puntajes
    por columna que encontró la app y tu procedencia y tus estados por columna. Desde la etapa 6 suma el sello de la prueba y sus conteos, pero no qué filas son la prueba. Desde la etapa 7 suma los puntajes de la liga por pliegue, el veredicto y la permutación, pero no tus filas. Desde la etapa 8 suma los agregados de la prueba (el costo y el número de filas de cada segmento, con el nombre de sus categorías, los tramos de la calibración, el Brier y cada apertura de la prueba con su fecha), tu patrón de fallo y el número de peores casos, pero no las filas de la prueba ni los peores casos. Desde la etapa 9 suma tu decisión y tus razones, el umbral que usaste y tu capacidad, con los conteos y costos que los sostienen, pero no filas. Desde la etapa 10 suma quién responde, tu cadencia y tu razón, y la referencia de deriva de las columnas del modelo: los cortes de cuantiles, los conteos y los nombres de las categorías con al menos 5 filas. Nunca filas. Trátalo con el cuidado que le darías a
    tus datos.
  - **Ventana privada:** el navegador no deja guardar. La página lo avisa («Exporta tu cuaderno antes de
    irte»): si cierras la pestaña, se pierde.
  - **Lo que reemplaza el cuaderno siempre pide confirmar:** **Empezar otro cuaderno**, **importar**
    un cuaderno cuando el actual ya tiene entradas, y **«Otro proyecto»** al cargar otro CSV (que pide un
    segundo sí). Escape o un clic fuera del diálogo cancelan; nada se reemplaza sin tu sí.

- **Los estados de cada etapa:** **Cerrada** (falta cumplir la anterior), **Abierta** (puedes
  trabajarla), **Cumplida**, **Por verificar** (tus datos cambiaron o corregiste una etapa anterior),
  **Detenida** (el criterio paró el Protocolo, p. ej. buscas una causa) y **Sin construir** (se ve su criterio, pero no abre; hoy ninguna etapa está en ese estado).

- **Glosario:** al final de la página hay un glosario con definiciones breves de los términos de las
  compuertas; cada término de una etapa enlaza a su entrada. Donde existe, **«Leer más en el glosario
  de Google»** lleva a la entrada del glosario de aprendizaje automático de Google (CC BY 4.0).

- **Privacidad:** tus respuestas, tus costos, los nombres de tus columnas y tus fechas **no salen de tu
  navegador**: viven en el cuaderno de este navegador (el almacenamiento del propio navegador, que sigue ahí
  al cerrar la pestaña) y en el archivo que tú bajas. Tu **apuesta de la etapa 4** (los nombres de las
  columnas que marcaste) vive aparte, en la memoria de la pestaña (`sessionStorage`), y se borra al
  cerrarla. A Sentry solo llega el número de la etapa y el resultado (registrada, cerrada…), nunca un
  valor.

- **Limitaciones conocidas (Sprints 008 a 016):**
  - Hoy están construidas las diez etapas. Ninguna etapa aparece «Sin construir»: la 10 abre con la 9 cumplida.
  - El Protocolo cubre las tres tareas **con objetivo** (dos clases, varias o una cantidad); **sin
    objetivo** no aplica y se va a «agrupar» en Probeta.
  - El tamaño de muestra **dice sus supuestos** junto al cálculo: con dos clases, el R² de Nagelkerke que
    supone (0.15, el valor de Riley cuando no hay otra información: un supuesto, no algo medido en tus
    datos), y con varias clases, que toma una categoría contra todas las demás y manda la que más filas
    pide. Si declaras menos parámetros de los que la app cuenta en tus columnas, una advertencia te muestra
    los dos números. Con varias clases el cálculo es una **aproximación**: se calcula «una contra el
    resto» y se toma la que pide más filas. Con una cantidad, el **R² anticipado** lo pones tú
    (0.2 es una apuesta prudente si no tienes uno mejor).
  - Las fechas se leen en ISO (2026-01-31) y como día/mes/año o mes/día/año con cuatro cifras de año;
    una fecha imposible (30 de febrero) queda como «sin leer», no se corrige.
  - Hay **un cuaderno por navegador**: para trabajar en paralelo, exporta uno y empieza otro.
  - Un cuaderno modificado a mano **no gana nada**: con tus datos cargados, lo que las etapas 2 y 4 a 10
    calcularon sobre ellos (los hallazgos de la 4, las cifras de la línea base, el sello de la prueba, los
    pliegues, la medida de la prueba, las cifras de la decisión) se vuelve a calcular, y si no coincide la
    etapa pasa a «por verificar» y la siguiente no abre. Los criterios de las etapas 1 y 3 se calculan de
    tus respuestas y se recalculan siempre.
  - Un costo puede llegar hasta **un billón** (1 000 000 000 000) por unidad: más allá, la cuenta deja de
    ser un número que se pueda comparar y la etapa 1 lo rechaza diciendo el tope.
  - Los números se escriben **sin separador de miles**, con punto o coma decimal (`1500` o `1500.5`).
    `1,500` o `1.500` no se leen, porque no se sabe si son uno y medio o mil quinientos; el campo te
    lo dice.
  - **Etapa 4, límites (Sprint 009):**
    - La fuga se busca **una columna a la vez**: lo que filtra solo en combinación con otras no se
      encuentra. Que la app no marque una columna **no prueba** que no filtre.
    - Tu apuesta se fija al revelar y se recuerda **mientras la pestaña siga abierta**: recargar no la
      cambia; cerrar la pestaña o empezar otro cuaderno sí. No se puede saber si la editaste a mano
      en el archivo exportado.
    - La compuerta verifica que el inventario **cuadra con los datos** y que cada columna tiene su
      estado; no puede saber si tus respuestas sobre la procedencia o el momento son **verdad**.
    - El cambio entre periodos solo se mide si elegiste una columna de fecha en la etapa 2, y no se
      mide sobre el objetivo, la fecha, la unidad ni los identificadores. Los umbrales del PSI (0,10 y
      0,25) son una **convención**, no una prueba estadística; el D de Kolmogorov-Smirnov es solo
      informativo.
    - Con pocas filas por periodo, el cambio **no se mide** y la app lo dice: no inventa una cifra.
    - Un identificador numérico se detecta solo si son enteros casi todos distintos **y en secuencia**
      (1, 2, 3…, con pocos huecos). Un código numérico disperso al azar **no se detecta**: ciérralo tú
      en el inventario («excluir»).

  - **Etapa 5, límites (Sprint 010):**
    - Es una **referencia**, no un resultado. Se mide sobre tus filas con objetivo, no sobre la prueba: que tu
      regla gane aquí no prueba nada sobre datos nuevos.
    - Una celda vacía **no cumple** la condición, tampoco «distinto de» ni «no es»; la pantalla dice en
      cuántas filas pasa. En una columna numérica, una celda que no se lee como número tampoco la cumple.
    - El texto se compara **exacto**: las mayúsculas y los espacios dentro del valor cuentan («Informal» no es
      «informal»); los espacios de los extremos, no.
    - La app **no sabe** qué hace tu gente: que escribas una regla y la midas no prueba que la usen.
    - Con una cantidad, el último valor por unidad usa la **mediana** para la primera fila de cada unidad y
      para las filas sin unidad o sin fecha; la pantalla dice cuántas son.
    - Lo que escribes en la regla, incluidos los valores que eliges de tu columna (como «informal»), queda en
      tu cuaderno y en el archivo que bajas. No sale de tu navegador.
    - Los números se escriben con punto o coma decimal y sin separador de miles, igual que en las etapas 1 y 3
      (`1.5` o `1,5`; `1,500` no se lee y el campo lo dice). Lo que escribes como `1,5` se guarda como `1.5`.
  - **Etapa 6, límites (Sprint 011):**
    - **El sello es higiene y trazabilidad, no una promesa.** Dice si la prueba que describe el cuaderno es la que sale de tus datos con esos parámetros. No dice que la prueba sea buena ni que nadie la haya mirado antes.
    - Un cuaderno editado a mano **con el sello y los parámetros coherentes** no se detecta: la app recalcula que los números cuadran con tus datos, no quién los escribió. Si cambias un parámetro y no el sello, sí se detecta.
    - Las **filas idénticas** pueden caer una en cada lado: no se quitan duplicados. La etapa 4 dice cuántas hay.
    - Las filas **sin fecha** (en los esquemas por tiempo) o **sin unidad** (en los de grupo) quedan fuera, contadas. No se reparten en silencio.
    - **El horizonte lo pones tú.** La app no lo infiere: si lo escribes corto, la verificación se cumple con un hueco que quizá no alcance.
    - Con **dos clases**, cada lado necesita casos de las dos. Con varias, una clase que falta en la prueba es un aviso, no un bloqueo.
    - El aviso de **pocos casos** (menos de 10 de una clase en un lado) es una **convención** del programa, no una prueba estadística.
    - La partición es determinista: el mismo archivo y los mismos parámetros dan siempre la misma prueba y el mismo sello.
    - La razón admite 500 caracteres. Queda en tu cuaderno y en el archivo que bajas; no sale de tu navegador.
  - **Etapa 7, límites (Sprint 012):**
    - **La medida de selección es optimista.** El ganador se eligió mirando esos mismos pliegues, así que su puntaje ahí exagera. La medida sin sesgo es la prueba, y solo la etapa 8 la abre, una vez.
    - **«No supera» también es un resultado.** La etapa se cumple igual: queda escrito en el cuaderno, y la etapa 8 medirá los dos modelos en la prueba.
    - **El intervalo depende de cuántos pliegues tengas.** Con tres o menos, la pantalla avisa que es ancho: es lo honesto con tan pocas mediciones.
    - **Los modelos son los de la liga de Probeta, con hiperparámetros fijos.** No se afinan: ganar la liga no significa haber encontrado el mejor modelo posible.
    - **La permutación tiene resolución finita.** Con N permutaciones, el valor p más chico posible es 1 entre N+1. El umbral de 0,05 es una **convención**, no una prueba.
    - **El número de permutaciones depende de tu navegador:** se calcula con lo que tardó la liga en tu equipo, entre 20 y 200. Por eso puede cambiar de un equipo a otro.
    - **Los números de la liga, el veredicto y la permutación los calcula tu navegador y se guardan en el cuaderno.** La app comprueba que el veredicto y el valor p cuadren con esos números, pero no puede volver a correr la liga: un cuaderno con esos números editados de forma coherente no se detecta.
    - **Los pliegues son los de tu partición sellada.** Si cambias el esquema o la prueba en la etapa 6, la 7 no abre con los pliegues viejos.

  - **Etapa 8, límites (Sprint 013):**
    - **La prueba se abre una vez, y eso la vuelve honesta.** Abrirla con otra configuración queda rotulado en el cuaderno. Desde la segunda apertura, la medida ya no es sin sesgo: elegiste después de verla.
    - **La etapa 8 mide, no recalibra.** Si las probabilidades están descalibradas, lo dice y lo cuantifica; no las corrige.
    - **La medida no decide.** No eliges umbral ni revisas costos aquí: eso es de la etapa 9.
    - **Los umbrales de soporte son una convención.** 10 filas por segmento y 3 casos de la clase menos frecuente no son una prueba estadística. Con una prueba chica, casi todo queda «sin soporte», y la trampa lo dice.
    - **Con menos de 100 filas de prueba, los intervalos son anchos.** La trampa lo dice; es lo honesto con tan pocas.
    - **El intervalo depende de tus conglomerados.** Con pocas unidades o fechas, el intervalo se vuelve ancho, aunque remuestree bien.
    - **El cuaderno no guarda la prueba fila por fila.** Guarda solo agregados: el costo y el número de filas de cada segmento, los tramos de la calibración, el Brier, los intervalos, tu patrón y cuántos peores casos viste. La app comprueba que el resto cuadre (la partición, el sello, los segmentos, la línea base), pero no puede volver a abrir la prueba para comprobar esas cifras.
    - **El peor segmento y el optimismo se recalculan** cada vez que se revisa el cuaderno, con lo que hay guardado.
    - **Los peores casos no quedan guardados.** Si cierras la pantalla, para verlos otra vez tienes que volver a abrir la prueba, y eso cuenta como apertura solo si cambió la configuración.
  - **Etapa 9, límites (Sprint 014):**
    - **Las cifras salen de la prueba, y la prueba se abrió una vez.** El umbral de tus costos se fija sin mirarla. Moverlo leyendo la curva sí la mira: por eso sale optimista y queda rotulado.
    - **El intervalo es el de la etapa 8, y solo con tu umbral de costos.** Si lo mueves, la pantalla no muestra intervalo.
    - **Una prueba chica decide con poca base.** Con menos de 100 filas de prueba, la pantalla lo rotula: con pocos casos, un solo caso cambia mucho el beneficio.
    - **Un umbral de costos con mala calibración no es fiable.** Si la etapa 8 vio probabilidades descalibradas, el umbral de tus costos se rotula «poco fiable» y la curva queda a la vista.
    - **La etapa 9 no recalibra ni reentrena.** Decide con lo que hay; si el modelo no sirve, la decisión lo dice con «no usarlo».
    - **Lo que guarda el cuaderno no tiene filas.** Guarda tu decisión, tus razones, el umbral, tu capacidad y los conteos y costos que los sostienen; ninguna fila de tu CSV.
  - **Etapa 10, límites (Sprint 015):**
    - **La ficha sale del cuaderno, y no lo corrige.** Si una etapa anterior cambia, la ficha se rehace con lo nuevo. Lo que escribe el dueño no lo revisa la app.
    - **El chequeo mide las entradas, no el desempeño.** Un CSV nuevo puede parecerse al de entrenamiento y el modelo fallar igual. Para vigilar el desempeño hacen falta los resultados nuevos y el modelo guardado, y eso no está en esta versión.
    - **Sin con qué comparar, el chequeo lo dice.** Una columna de texto marcada cuyas categorías no
      juntan 5 filas, o una numérica con menos de 25 filas con valor, no tiene referencia: el chequeo la
      marca **«sin referencia»**, no «estable». Un «sigue» solo habla de las columnas que sí se pudieron medir.
    - **La referencia de deriva guarda solo agregados.** Para las columnas numéricas, cortes de cuantiles redondeados y conteos; para las de texto que **tú marcas**, los nombres de las categorías con al menos 5 filas y cuántas filas tiene cada una: nunca filas. De una columna de texto que no marcas no se guarda nada y el chequeo no la vigila: el «sigue» solo habla de las columnas vigiladas. Con pocas filas en el CSV nuevo, la app dice «pocas filas para medir» en vez de dar un número. Todo queda en tu navegador; viaja en el archivo del cuaderno solo si lo exportas.
    - **Las convenciones de deriva no son una prueba.** Un cambio moderado desde un PSI de 0,10 y una alerta desde 0,25 vienen de la etapa 4.
    - **La cadencia es tuya, salvo con partición por tiempo.** Con una prueba por tiempo, la app propone los meses que respalda; sin ella, la cadencia la escribes tú y la ficha lo dice.
    - **La app no supone quién responde.** El campo empieza vacío. Puedes poner al decisor de la etapa 1 con un clic, y la compuerta exige que haya un nombre.

### Estrésalo: ¿cuánto aguanta tu modelo? · desde Sprint 017

- **Qué hace:** en Resultados, el botón **"Estrésalo"** le hace a tu modelo una pregunta que el
  veredicto no responde: *si los datos cambian un poco, ¿cuánto de ese veredicto sobrevive?* Mide el
  **mismo modelo, sin reentrenarlo**, sobre la **misma prueba que ya se abrió**, perturbada de tres
  maneras. No elige nada ni cambia nada: es una lectura.

- **Cómo se usa:** pulsa **"Estrésalo"**; no se mide nada hasta que lo pulsas. Mientras trabaja dice
  "Estresando el modelo…". La lectura trae una frase, el criterio y tres tablas:
  - **La frase**, con tus números: «Con 10 % de ruido en los números, tu AUC cae de 0.91 a 0.74».
    Con la exactitud, el F1 o la sensibilidad también cae; con el error medio (al estimar una
    cantidad) **sube**, en las unidades de tu columna.
  - **Ruido en los números** (5, 10 y 20 %): a cada columna numérica se le suma ruido, en proporción a
    lo que varía en el entrenamiento.
  - **Una columna revuelta**: se revuelven los valores de una columna a la vez; lo que pierde el
    modelo es cuánto dependía de ella. Salen las cinco que más duelen.
  - **Un corrimiento, como el paso del tiempo**: las tres columnas numéricas que más pesan se corren
    media y una desviación hacia arriba.
  - Cada fila de las tablas lleva su símbolo **y** su palabra: **▼ peor**, **● casi igual**,
    **▲ mejor**. El color nunca va solo.

- **El ✓ y el ⚠:** la pregunta es si, **con 10 % de ruido, el modelo sigue ganándole a su mejor rival
  sin modelo** (la línea base del veredicto), con la misma regla del veredicto. **✓** dice que sí;
  **⚠** dice que ya no, con las cifras a la vista. Si el modelo **ya no le ganaba antes del ruido**,
  lo dice así, para no culpar al ruido. Tampoco hay un umbral nuevo: se usa la regla de siempre.

- **En el Protocolo (etapa 8):** la etapa 8 trae su propio **"Estrésalo"** sobre la prueba **que ya
  abriste**. **No es una apertura nueva** (la cuenta de aperturas no cambia): usa el mismo sello y el
  mismo ganador. Es **opcional**: no hay compuerta. Si lo corres antes de registrar la etapa, la
  cifra con 10 % de ruido y el rival sin modelo quedan en el cuaderno, y la **ficha** de la etapa 10
  gana una línea en «Lo que este modelo cumplió»: *«Robustez medida (etapa 8)…»* si sigue ganando,
  *«Robustez (etapa 8)…»* si deja de ganar, o *«Robustez: no se midió»* si no la corriste. Si abres la
  prueba otra vez, la lectura se pierde y se vuelve a pedir.

- **Limitaciones:**
  - Es **una lectura de esta prueba, no una garantía**: con otros datos o con otro ruido puede dar
    otra cifra. La semilla es fija (se muestra), así que repetirlo da lo mismo.
  - El ruido y el corrimiento solo tocan las columnas **numéricas**; a las de categorías solo se las
    revuelve. Si el modelo no usa numéricas, la lectura lo dice.
  - Con una prueba chica, que algo "mejore" con ruido es **azar**, y se escribe así.
  - **Agrupar** no tiene objetivo ni prueba: la app lo dice en vez de ofrecer el botón. Un modelo
    **importado** de un archivo no trae la prueba con la que se midió: estrésalo en la corrida donde
    lo entrenaste.
  - Cuesta más cuanto más filas y columnas: son unas cinco predicciones del modelo por columna.

### Llévatelo: la receta, el puntuador y el servicio · desde Sprint 017

- **Qué hace:** en Resultados, la sección **"Llévatelo"** te da tres archivos para usar el modelo
  **fuera de Probeta**. **Probeta no despliega nada ni guarda credenciales**: los archivos se
  quedan en tu equipo y tú decides dónde van.

- **Antes de descargar, la app te dice qué lleva cada uno** (con un ⚠ y la palabra, a la vista, sin
  que pulses nada). El puntuador y el servicio llevan el **modelo entrenado y su manifiesto**: los
  rangos y las categorías que vio al entrenar, el **nombre de tu archivo de datos** y las métricas de
  su prueba. Un modelo de **vecinos más cercanos** lleva además **filas de tu entrenamiento**. La
  receta **no lleva ni una fila**. Comparte el modelo solo con quien puedas darle eso.

- **Receta reproducible (`receta-….py`):** un archivo de Python que, **con tu CSV**, repite lo que
  hizo la app: lee el archivo, lo sanea igual (las columnas que apartó, las filas repetidas), parte
  entrenamiento y prueba con la misma semilla, ajusta el mismo preprocesador y el mismo modelo, y
  escribe las **métricas esperadas junto a las obtenidas**.
  - Se corre con Python 3.14 y las **versiones fijas** que trae en su encabezado:
    `python receta.py tu-archivo.csv`.
  - Dice **"✓ reproduce"** si coinciden (dentro de una millonésima); si no, dice **"✕ NO
    reproduce"** y cuáles métricas difieren y por cuánto. Nunca dice "reproduce" sin haberlo comprobado.
  - Los **bosques de árboles** son la excepción medida: entre el navegador y un Python de 64 bits, una
    diferencia de coma flotante puede cambiar uno o dos de sus 200 árboles. Su receta declara una
    tolerancia mayor y dice **"≈ reproduce de forma aproximada"**, con la diferencia y el porqué.
  - Está en el idioma de la app cuando la descargas. Lleva solo nombres de columnas, la semilla, el
    modelo y las métricas: la clase positiva y las clases las toma de **tu** archivo al correr.
  - No se ofrece al **agrupar** (no hay partición ni prueba, así que no hay cifra que reproducir).

- **Puntuador portátil (`puntuador-….html`):** un solo archivo con el modelo adentro. Quien lo abre
  **arrastra un CSV y su propio navegador lo puntúa**: costo cero, sin servidor, y las filas no salen
  de ese navegador. Necesita internet **la primera vez** (baja el motor de Pyodide, unos 35 MB, del
  CDN público). Antes de abrir nada comprueba que el archivo no cambió (SHA-256) y que la versión del
  motor es la del modelo; si no, se niega y lo dice. Puntúa las cuatro tareas, y el CSV que descarga
  trae la predicción y la probabilidad (o el grupo, al agrupar) junto a tus columnas.

- **Plantilla de servicio (`servicio-….zip`):** un `.zip` con un servicio **FastAPI** de dos
  rutas (`GET /salud` y `POST /puntuar` con un CSV o filas JSON), el modelo, las **versiones fijas** y
  un README (en español y en inglés) con cómo mantener el **costo predecible**: el servicio no guarda
  nada, y el README aconseja desplegarlo donde escale a cero y poner tope de instancias y de gasto. El
  costo real depende de tu proveedor, no de Probeta. Lo despliegas tú donde quieras. **No trae
  autenticación:** por defecto solo escucha en tu máquina (`HOST=0.0.0.0` lo abre a la red, detrás de la
  autenticación y el HTTPS de tu proveedor).
  - Al arrancar comprueba el SHA-256 del modelo, que las versiones instaladas sean las fijas y que el
    modelo puntúe en esa máquina; si algo no cuadra, **se niega a arrancar y dice qué**.
  - Abre el modelo con `pickle`: ábrelo solo si conoces su origen.
  - **No se ofrece para el modelo de vecinos más cercanos** (guarda su estructura con enteros de 32
    bits y no se abre fuera del navegador) **ni al agrupar**; el puntuador portátil sí los sirve.

- **Limitaciones:** el puntuador necesita internet la primera vez; el servicio es una plantilla (la
  autenticación, el HTTPS y los permisos de origen —CORS— los pones tú); y si cambias la versión de
  Pyodide o de scikit-learn, el modelo de antes ya no se abre en lo nuevo: se vuelve a exportar.

### Traer un Excel · desde Sprint 018

- **Qué hace:** además del CSV, la pantalla de inicio acepta un libro de **Excel (`.xlsx`)**. Se lee en tu
  navegador, al instante, sin subir nada, con **los mismos límites que un CSV** (5 MB y 50 000 filas) y sigue
  el mismo camino: saneamiento, objetivo, liga y veredicto. También sirve para **puntuar un archivo nuevo**
  con un modelo ya entrenado.

- **Cómo se lee:** la app toma **la primera hoja visible**, con los títulos de las columnas en su primera fila
  con datos, y te dice cuál leyó («Se leyó la hoja “Datos” de tu Excel; las otras 2 hojas se ignoraron»). Una
  fórmula se lee por **el último valor que guardó Excel**; las fechas y las horas se vuelven fechas ISO
  (`2026-10-25`); un verdadero/falso queda como `true`/`false`; una celda con error queda vacía. Si un
  título está en blanco sobre datos, la columna se llama `col_3` (por su posición).

- **Lo que no hace, y te dice:**
  - Un libro **con contraseña o cifrado** se rechaza diciendo que está protegido: quítale la protección o
    guárdalo como CSV.
  - Un **Excel antiguo (`.xls`)** no se lee: guárdalo como «Libro de Excel (.xlsx)» o como CSV.
  - Un archivo **dañado** se rechaza como dañado, no se carga a medias.
  - **Las celdas combinadas no se expanden** (la primera celda lleva el valor; las demás quedan vacías), y
    una fórmula que nadie calculó (un libro generado sin abrirse en Excel) llega vacía.
  - El **Protocolo DS** lee CSV: su huella cuenta los bytes del archivo y su cuaderno guarda esa huella.

- **¿Por qué no usa una librería?** Un `.xlsx` es un archivo comprimido de texto; el navegador ya sabe
  descomprimirlo. Leerlo sin dependencia nueva evita heredar avisos de seguridad y no suma nada al peso con
  que abre la app: el lector llega solo cuando eliges un Excel.

### Datos personales y plan de limpieza · desde Sprint 018

- **Qué hace:** al cargar tu archivo, la app **avisa de posibles datos personales** y, aparte, **propone un
  plan de limpieza** que tú apruebas o rechazas **paso a paso**. Ninguna de las dos cosas bloquea: es un aviso
  y una propuesta.

- **El aviso de datos personales:** busca, por el contenido y por el nombre de la columna (en español y en
  inglés), correos, teléfonos (escritos con «+» o con separadores, no un número corrido), documentos de
  identidad con su dígito de control (DNI, NIE, RUT, CURP, un número de seguro social con formato) y nombres de
  persona. Dice **la columna, el tipo y cómo lo supo** («por su contenido», «por el nombre de la columna»).
  **Nunca muestra un valor** —ni un correo, ni un teléfono— y no envía nada a ningún lado. Si el saneamiento ya
  apartó la columna (un correo distinto en cada fila se aparta como identificador), el aviso lo dice.
  Es **aproximado**: no encuentra todo, y puede señalar una columna que no lo es.

- **El plan de limpieza:** cada paso lleva **una frase de qué hace, cuántas celdas toca y cómo se deshace**.
  Tiene **Aprobar** y **Rechazar**; volver a pulsar el botón activo lo deja **sin decidir**. **Lo que no
  apruebas, no se aplica.** Hasta 12 pasos, los de más alcance primero. Cinco tipos:
  - **Marca de «estaba vacío»** (una columna numérica con entre 5 y 60 % de vacíos): los vacíos se rellenan con
    la mediana del **entrenamiento** y se agrega una columna que marca cuáles estaban vacíos.
  - **«Sin dato» como categoría** (una columna de texto con vacíos): el vacío pasa a ser una categoría más, en
    lugar de rellenar con la más común.
  - **Valores muy lejanos por cuantiles** (tres o más valores a más de tres rangos intercuartílicos): la columna
    pasa a ser la posición de cada valor entre los demás. A los árboles no les cambia nada; a los modelos
    lineales y de distancia, sí.
  - **Un código como categoría** (números enteros con pocos valores y un nombre como «código», «tipo» o
    «zona»): se trata como categoría, no como cantidad.
  - **Quitar la columna** que el aviso señaló como posibles datos personales.

- **Cómo se evita la fuga:** nada de lo que apruebas toca tu tabla antes de partirla. La mediana, las
  posiciones por cuantiles y las categorías raras se calculan **solo con las filas de entrenamiento**, dentro
  del modelo, y viajan con él: el puntuador, el servicio y la receta hacen lo mismo con tus datos nuevos.

- **Dónde queda el registro:** la **ficha del modelo** gana una sección «Plan de limpieza» con cada paso y su
  decisión (aplicado, rechazado, sin decidir, o aprobado pero no aplicado y por qué: era la columna que
  predices, la columna se quitó, o pasó a ser categoría). También va en el archivo del modelo
  (`.probeta.json`, que sigue siendo versión 1: un archivo anterior se abre igual) y la receta repite lo que
  se aplicó. El plan se aplica igual en las cuatro tareas.

- **Limitaciones:**
  - **No recupera números escritos con símbolo o separador de miles** (`$1,200`, `12 %`): esas celdas se
    vuelven vacías, con aviso, como antes. Arréglalos en la hoja de cálculo.
  - Un paso sobre **la columna que quieres predecir** no se aplica (el registro lo dice).
  - Los umbrales son fijos y están escritos en el código: no se ajustan.

### Entender los datos y confiar en la cifra · desde Sprint 018

- **Explora tus datos** (en la pantalla de configuración, botón **«Explorar»**): no calcula nada hasta que lo
  pulsas. Trae:
  - **Un resumen escrito** que dice cuántas filas y columnas hay, cuáles están muy sesgadas, cuáles tienen muchos
    vacíos, qué dos columnas numéricas se mueven más juntas y qué dos de texto se asocian más. Va con la
    insignia **«Verificado contra tus números»**: cada cifra se recalculó aparte desde tu tabla; si el texto no
    cuadra, **no se muestra** y se dice, y quedan las tablas.
  - **Cómo se reparte cada columna:** casillas de igual ancho en las numéricas y conteo en las de texto, con la
    cifra escrita junto a cada barra.
  - **La matriz de correlaciones de Pearson** (de −1 a 1) entre las numéricas, con el signo escrito en cada
    celda (hasta 15 columnas; si hay más, lo dice) y las **asociaciones entre columnas de texto** (V de Cramér, de
    0 a 1; las de entre 2 y 20 categorías).
  - Una correlación fuerte **no dice que una columna cause la otra**, y el resumen lo recuerda.

- **El margen de error de la cifra** (en Resultados, bajo las métricas): el veredicto da UNA cifra; el margen
  dice cuánto podría moverse. La app remuestrea **1 000 veces las filas de la prueba** y muestra el **intervalo
  del 95 %** de la métrica del veredicto —AUC, F1, exactitud, exactitud balanceada o el error medio— con la
  **semilla** del experimento: repetirlo da lo mismo. Es el margen por tener **esa** prueba; no incluye entrenar
  con otras filas ni un cambio en tus datos (eso es «Estrésalo»). Con **menos de 50 filas de prueba** avisa de
  que el intervalo es muy ancho. En **agrupar** no hay prueba: lo dice. Un modelo **importado** no trae la
  prueba con que se midió: el margen se calcula en la corrida donde lo entrenaste. No va a la ficha del modelo.

- **Explicaciones verificadas, en las cuatro tareas:** el texto estándar de «por qué» (dos clases, varias
  categorías y estimar una cantidad) y la descripción de cada grupo (agrupar) pasan una comprobación antes de
  mostrarse: **las cifras son las de tu resultado** y **las columnas que más pesan aparecen en el orden en que
  el modelo las pesó**. Si pasa, lleva la insignia **«Verificada contra tus números»**; si no, se muestra un
  texto mínimo con las cifras y se dice. Al agrupar, cada grupo se describe frente a **su media y al promedio de
  todos los grupos** (en las unidades de tu tabla), con las columnas que más separan. Es una comprobación del
  texto, no una garantía de que el modelo sea bueno. La explicación con IA de dos clases sigue como estaba
  (a demanda, con su propia verificación); **no hay ninguna llamada nueva a una IA**.

- **La liga, contra lo prometido:** un chequeo automático cruza los modelos que se prometen (regresión lineal y
  logística, Ridge y Lasso, Naive Bayes, KNN, árboles, Random Forest, ExtraTrees, HistGradientBoosting, XGBoost,
  LightGBM, una red neuronal ligera, K-Means) con los que compiten en cada tarea: si uno falta, el código
  tiene que decir por qué (Lasso, por ejemplo, es una regresión: para clasificar compite la logística).

## Diccionario de términos

Las palabras que verás en la app, en una línea cada una. No necesitas memorizarlas: vuelve aquí
cuando una te frene.

**Sobre el resultado**

| Término                    | Qué significa                                                                                                                                                                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Baseline** (línea base)  | Las reglas simples contra las que se mide tu modelo. Al clasificar (en dos o en varias categorías): responder siempre lo más frecuente (clase mayoritaria) y una regresión logística. Al estimar: adivinar siempre la mediana y una regresión lineal. Si tu modelo no supera a la mejor de las dos, no sirve. Al agrupar no hay baseline: no hay respuesta que adivinar. |
| **Veredicto**              | La comparación franca entre tu modelo y el mejor de esos baselines: lo supera, empata o pierde.                                                                                                                                                                               |
| **Entrenamiento y prueba** | La app parte tus datos en dos: con tres cuartas partes aprende y con la cuarta parte restante, que nunca vio, se examina. Por eso el número del veredicto es real.                                                                                                            |
| **Liga**                   | Todos los modelos que compiten entre sí. Se elige al ganador sin mirar la prueba; puedes elegir otro, y queda registrado.                                                                                                                                                     |
| **Clase detectada**        | De las dos respuestas posibles, la que el modelo intenta encontrar (normalmente la menos frecuente).                                                                                                                                                                          |
| **Prueba de estrés**       | Medir el mismo modelo, sin reentrenarlo, sobre la prueba perturbada: con ruido, con una columna revuelta y con un corrimiento. Dice cuánto aguanta; no es una garantía.                |
| **Receta reproducible**    | Un archivo de Python que, con tu CSV, repite lo que hizo la app y compara sus métricas con las que midió. Dice "reproduce", "reproduce de forma aproximada" o "NO reproduce".          |
| **Puntuador portátil**     | Un solo archivo `.html` con el modelo adentro: quien lo abre arrastra un CSV y su navegador lo puntúa, sin servidor.                                                                   |
| **Margen de error (intervalo del 95 %)** | El rango en que podría estar la cifra del veredicto si la prueba hubiera sido otra muestra de las mismas filas: se remuestrean las filas de la prueba 1 000 veces, con semilla fija, y se descarta el 2,5 % más bajo y el 2,5 % más alto. |
| **Explicación verificada** | Un texto cuyas cifras y orden de columnas se comprobaron contra tu resultado antes de mostrarse. Si no cuadra, se muestra solo lo que sí: las cifras. |
| **Plan de limpieza** | Los pasos que el código propone para tus datos y que tú apruebas o rechazas uno a uno. Lo que no apruebas no se aplica, y lo que depende de los datos se calcula solo con el entrenamiento. |
| **Posibles datos personales** | Una columna que parece guardar correos, teléfonos, documentos o nombres de personas. Es un aviso aproximado: nombra la columna y el tipo, nunca un valor. |
| **Correlación (Pearson)** | Cuánto se mueven juntas dos columnas numéricas en línea recta, de −1 (una sube cuando la otra baja) a 1 (suben juntas). 0 es que no se mueven juntas en línea recta. No dice que una cause la otra. |
| **V de Cramér** | Cuánto se asocian dos columnas de texto, de 0 (no se asocian) a 1 (una decide la otra). |

**Sobre la liga** (desde Sprint 005)

| Término                | Qué significa                                                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Validación cruzada** | Dentro del entrenamiento, la app parte los datos en 5 trozos (3 si son muy grandes; menos si una de las clases tiene muy pocos ejemplos) y examina cada modelo con cada trozo. Sirve para elegir. |
| **Ganador (★)**        | El modelo que eligió la validación cruzada: el más simple entre los prácticamente empatados con el mejor puntaje.                                                                                 |
| **Error estándar (≈)** | Cuánto podría moverse un puntaje por azar. Los que quedan a menos de eso del mejor «empatan con el mejor».                                                                                        |
| **Elegido por ti (◆)** | Un modelo que elegiste a mano en lugar del ganador. El veredicto habla de él, con esa etiqueta.                                                                                                   |
| **Nivel 1 / Nivel 2**  | El primer paso (lo que cabe en unos segundos) y la liga completa (lo que falta, si quieres correrlo).                                                                                             |
| **Encarrilador**       | La regla fija de la app que decide qué tipo de predicción es una columna y qué modelos corren en cada nivel, con su razón.                                                                        |
| **Fuera**              | Un modelo que la app recomienda no correr con tus datos, con su razón. Puedes incluirlo de todos modos en el Nivel 2.                                                                             |
| **Ficha del modelo**   | La explicación corta de cada modelo: qué es, cuándo sirve, cuándo no, qué mirar y cuánto cuesta.                                                                                                  |

**Sobre las métricas** — la app siempre te dice cuál es la principal y por qué

| Término                   | Qué significa                                                               |
| ------------------------- | --------------------------------------------------------------------------- |
| **Exactitud** (accuracy)  | Proporción de aciertos sobre el total, de 0 a 1.                            |
| **Precisión**             | De los casos que marcó como positivos, cuántos lo eran de verdad, de 0 a 1. |
| **Sensibilidad** (recall) | De los casos positivos reales, cuántos logró detectar, de 0 a 1.            |
| **F1**                    | Equilibrio entre precisión y sensibilidad, de 0 a 1.                        |
| **AUC**                   | Qué tan bien separa las dos clases: 0.50 sería azar y 1.00 perfecto.        |

**Sobre estimar una cantidad** (desde Sprint 006)

| Término                        | Qué significa                                                                                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MAE** (error absoluto medio) | Cuánto se equivoca el modelo en promedio, en las unidades de tu columna. Es la métrica que decide: menor es mejor.                                  |
| **RMSE**                       | Otro promedio del error que castiga más los errores grandes. Si es mucho mayor que el MAE, de vez en cuando falla por mucho.                        |
| **R²**                         | Qué parte de la variación de tu columna explica el modelo: 1 es toda; 0, lo mismo que adivinar el promedio; negativo, peor que adivinarlo.          |
| **MedAE**                      | El error típico: la mitad de las estimaciones se equivoca menos que esto. No le pesan los casos extremos.                                           |
| **La mediana como baseline**   | Adivinar siempre el valor del medio de tu columna. Es la constante que menos se equivoca en promedio, por eso es el rival honesto (no el promedio). |
| **Estimado frente a real**     | El gráfico que pone cada fila de la prueba según su valor real y lo que estimó el modelo. Cuanto más cerca de la diagonal, mejor.                   |
| **Unidad**                     | La que la app lee del final del nombre de tu columna (`_kwh`, `_usd`…). Si no la reconoce, no la inventa.                                           |

**Sobre varias categorías** (desde Sprint 007)

| Término                   | Qué significa                                                                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Exactitud balanceada**  | De cada categoría, qué parte acierta el modelo, en promedio. Cada categoría pesa igual aunque tenga pocas filas. Es la métrica que decide.          |
| **Azar**                  | Lo que daría adivinar sin mirar los datos: con k categorías, la exactitud balanceada del azar es 1/k (con 5, 0.20).                                  |
| **F1 macro**              | El F1 de cada categoría, promediado sin pesar por su tamaño.                                                                                          |
| **Pérdida logarítmica**   | Cuánto castiga el modelo estar muy seguro y equivocarse. Menor es mejor. Solo existe si el modelo da probabilidades.                                 |
| **Matriz de confusión**   | La tabla de categoría real (filas) contra categoría predicha (columnas). La diagonal (✓) son los aciertos; el resto, las confusiones.                |
| **Fuga por categoría**    | Una columna que separa casi a la perfección **una** categoría del resto. Se mira solo si esa categoría y el resto tienen al menos 5 filas con valor. |

**Sobre agrupar** (desde Sprint 007)

| Término                         | Qué significa                                                                                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Agrupador**                   | Un método que reparte las filas en grupos de filas parecidas. La app usa cuatro: K-Means, el jerárquico, la mezcla gaussiana (GMM) y HDBSCAN.                |
| **Silueta**                     | De −1 a 1: cuánto más cerca está cada fila de su grupo que del grupo vecino. Cerca de 0, los grupos se tocan.                                                |
| **BIC**                         | La medida con que la mezcla gaussiana elige cuántos grupos: premia explicar bien los datos y castiga usar más grupos de los necesarios.                      |
| **Densidad**                    | Cómo HDBSCAN encuentra los grupos: busca zonas donde las filas se amontonan, sin que le digas cuántas hay.                                                    |
| **Fuera de todo grupo**         | Las filas que HDBSCAN no pone en ningún grupo porque no caen en ninguna zona densa. No se fuerzan.                                                            |
| **Puntaje**                     | Silueta × (1 − la parte de filas fuera de grupo). Sirve para comparar agrupadores sin premiar al que deja fuera las filas difíciles.                         |
| **Consenso**                    | El número de grupos en el que coinciden más agrupadores (al menos dos). Entre ellos gana el de mayor puntaje (★). Si no coinciden, gana el de mayor puntaje. |
| **Datos sin estructura**        | Datos al azar en la misma caja que los tuyos. Si tus filas no se separan mejor que ellos (por al menos 0.10 de puntaje), no hay estructura de grupos.        |
| **Estabilidad**                 | Si al volver a agrupar el 80 % de tus filas, 10 veces, salen los mismos grupos. Se mide de 0 a 1; hace falta al menos 0.7.                                   |
| **η² y V de Cramér**            | De 0 a 1: cuánto de la variación de una columna se explica por el grupo. η² en las numéricas, V de Cramér en las de categorías.                              |
| **Muestra del jerárquico**      | Con más de 8,000 filas, el jerárquico se ajusta sobre 8,000 al azar y asigna el resto al grupo más cercano, para no agotar la memoria del navegador.        |

**Sobre las advertencias**

| Término                    | Qué significa                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Fuga de datos**          | Una columna que ya contiene la respuesta disfrazada. Infla las métricas y hace inútil el modelo en la vida real. La app la busca y avisa.  |
| **Desbalance de clases**   | Una de las respuestas es mucho más rara que las otras. Obliga a mirar una métrica que no se deje engañar: el AUC con dos categorías, la exactitud balanceada con varias. |
| **Saneamiento**            | La limpieza que la app hace antes de entrenar (filas repetidas, columnas identificadoras o constantes, celdas basura), siempre con conteo. |
| **Columna identificadora** | Una columna con un valor distinto en cada fila (un código de cliente). No predice nada; se excluye.                                        |
| **Novedad**                | Al puntuar datos nuevos: valores que el modelo nunca vio al entrenar. En esas filas está adivinando, y te lo dice.                         |

**Sobre el porqué**

| Término                           | Qué significa                                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Importancia (por permutación)** | Cuánto empeora el modelo si se desordena esa columna. Mide **cuánto pesa**, no hacia dónde empuja. Importancia 0 = no la usa.   |
| **Dirección**                     | Hacia dónde empuja una variable: a mayor valor, más (o menos) probable la clase detectada. Solo se muestra si la variable pesa. |
| **Model card**                    | La ficha del modelo: con qué datos se entrenó, qué mide, qué advertencias tiene. Para que otro pueda juzgarlo sin creerte a ti. |

**Sobre el Protocolo** (desde Sprint 008)

| Término                   | Qué significa                                                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Compuerta**             | El criterio que una etapa debe cumplir para que se abra la siguiente. No se salta: se cumple o se corrige.                                     |
| **Cuaderno**              | La lista de lo que cada etapa verificó, con fecha y números. Solo crece. Se exporta como `.protocolo.json`.                                    |
| **Huella**                | Un código que sale del contenido exacto de tu archivo. Si cambia un solo byte, cambia: así se sabe si vuelves con los mismos datos.            |
| **Unidad de análisis**    | Qué es una fila: un cliente, una visita, un mes de una tienda. Si la misma unidad aparece en varias filas, no se puede repartir al azar.       |
| **Existe al decidir**     | Una columna existe al decidir si, cuando el modelo tiene que responder, ya está llena y se conoce. Si se llena después del resultado, el modelo la vería al entrenar y no la tendría en la vida real. |
| **Procedencia**           | Quién o qué produce el valor de una columna: una persona al registrar, un sensor, otro sistema. De ahí sale cuándo se llena y cuánto confiar en ella. |
| **Columna identificador** | Una columna cuyos valores casi nunca se repiten (un folio, un correo). Sirve para reconocer filas, no para predecir. |
| **Fila duplicada**        | Una fila idéntica a otra, o la misma unidad registrada dos veces en el mismo momento. Si una copia cae en entrenar y otra en probar, el puntaje se ve mejor de lo que es. |
| **Deriva**                | Que los datos de ahora ya no se parecen a los de antes. Se mide con el PSI entre dos periodos; menos de 0,10 es estable, de 0,10 a 0,25 moderado y desde 0,25 alerta (una convención, no una prueba). |
| **Umbral**                | La probabilidad a partir de la cual actúas. Con tus costos sale una cifra concreta.                                                            |
| **Tasa base**             | Con qué frecuencia ocurre el caso en tus datos, sin modelo.                                                                                    |
| **Parámetros candidatos** | Cuántos números distintos puede aprender el modelo de tus columnas: uno por columna numérica y una menos que las categorías por cada columna de texto. |
| **Partición por tiempo** | Separar entrenamiento y prueba por fecha: la prueba son tus filas más recientes y el modelo aprende de las anteriores. Es como se usará: con el pasado, para decidir lo que viene. |
| **Partición por grupo** | Separar por unidad (cliente, tienda, paciente): todas las filas de una unidad caen del mismo lado. Si no, el modelo se evalúa con unidades que ya vio. |
| **Horizonte** | Cuánto tarda en conocerse el resultado desde que decides. En una partición por tiempo, ese tiempo es el hueco entre entrenamiento y prueba. Lo escribes tú. |
| **Hueco** | Las filas entre el entrenamiento y la prueba, de la duración del horizonte. No entran a ningún lado: su resultado todavía no se conoce al decidir. |
| **Prueba sellada** | La parte de tus datos que se aparta antes de entrenar y se marca con un sello, un código que sale de qué filas son. Si la prueba cambia, el sello no cuadra. Es higiene y trazabilidad, no una promesa. |
| **Pliegue** | Una de las partes en que se reparte el entrenamiento para validar: el modelo aprende de las demás y se mide en ella, una vez cada una. Sigue el mismo esquema que tu prueba sellada. |
| **Regla de un error estándar** | Entre los modelos a menos de un error estándar del mejor, gana el más simple: una diferencia más chica que el ruido entre pliegues no justifica algo más complicado. |
| **Medida de selección** | El puntaje con que se eligió al ganador. Es optimista: ganó justo porque ese número salió alto en esos pliegues. La medida sin sesgo es la prueba, que abre la etapa 8. |
| **Prueba de permutación** | Se barajan las etiquetas del entrenamiento y se vuelve a validar muchas veces. Si lo logra igual con etiquetas al azar, lo que encontró no es señal. El valor p es la fracción de esos barajados que lo hizo igual o mejor. |
| **Optimismo de la selección** | Cuánto exageró la medida de selección: el puntaje con que se eligió al ganador menos el mismo puntaje en la prueba. Que salga positivo es lo esperado. |
| **Segmento con soporte** | Una parte de la prueba con filas suficientes para leerla sola: al menos 10 y, con dos clases, 3 casos de la clase menos frecuente. Lo que no llega se muestra, pero nunca es el peor. |
| **Calibración** | Que las probabilidades signifiquen lo que dicen: de los casos en que el modelo dice 70 %, ocurre más o menos el 70 %. Se lee con una curva por tramos y con el Brier. |
| **Brier** | El error cuadrático medio de las probabilidades: 0 es perfecto. Se compara con el de decir siempre la tasa base, que es lo que logra quien no sabe nada. |
| **Beneficio neto** | Lo que gana una forma de decidir, contado en casos: las alertas que aciertan, menos las falsas pesadas por lo que cuesta cada una frente a un caso que se escapa. «No hacer nada» vale 0. |
| **Falsas alarmas por cada 100 alertas** | De cada 100 veces que el modelo dice «actúa», cuántas no hacía falta. Es lo que vive tu equipo: con 60, más de la mitad del trabajo que le llega no servía. |
| **Ficha del modelo del Protocolo** | Distinta de la explicación corta de cada modelo de la liga. Es el documento que resume el modelo para quien lo hereda: con qué datos, para qué sirve, para qué no, qué compuertas pasó y quién responde. Sale del cuaderno: cada línea dice de qué etapa, fecha y huella viene, y lo que escribes tú va marcado como tuyo. |
| **Plan de vigilancia** | Lo que se mira después de usar el modelo y cuándo se deja de usar: las columnas que se revisan por deriva, el piso de la decisión, cada cuánto se reentrena y quién responde. Mide las entradas; vigilar el desempeño pide resultados nuevos, y no está aquí. |
| **Capacidad de atención** | Cuántos casos de cada 100 alcanza a atender tu equipo. Un umbral que da más alertas que eso no se puede cumplir: sube el umbral, crece el equipo, o las alertas que sobran se quedan sin atender. |

## Preguntas frecuentes

- **¿Mis datos se suben a algún sitio?** No. Todo el cálculo ocurre en tu navegador; el archivo nunca
  sale de tu equipo.
- **Cargué datos sucios y la app cambió mis columnas, ¿por qué?** Antes de entrenar, la app sanea el
  dataset y te lo dice de frente en un recuadro (filas duplicadas, columnas identificadoras o
  constantes, celdas basura). Nunca lo hace en silencio: cada acción viene con su conteo.
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
- **¿Por qué bajó mi puntaje desde la versión anterior?** Antes, la app elegía entre sus modelos
  mirando el conjunto de prueba, y el número que te mostraba era el del que tuvo más suerte en esa
  prueba. Ahora elige con validación cruzada y abre la prueba una sola vez, al final. El número
  puede ser un poco más bajo, pero es **el que puedes esperar con datos nuevos**. No es que el
  modelo empeorara: dejó de estar inflado.
- **¿Por qué no ganó el modelo con el puntaje más alto?** Porque entre puntajes prácticamente
  empatados la diferencia es azar, y la app se queda con el más simple. La tabla marca con ▲ el de
  mejor puntaje y con ≈ los empatados. Si quieres otro, **elígelo**: queda registrado como «elegido
  por ti».
- **¿Puedo ver cómo le fue a cada modelo en la prueba?** Sí: «Ver puntajes de prueba». Están
  etiquetados «no sirven para elegir» porque elegir mirándolos hace optimista el veredicto.
- **Un modelo dice «Fuera», ¿no puedo usarlo?** Sí puedes: en la tarjeta del Nivel 2 marca
  «Incluir de todos modos». La app te dice por qué lo dejaba fuera y lo marca en la tabla como
  «lo incluiste tú».
- **¿Por qué el R² puede ser negativo?** El R² compara tu modelo con adivinar siempre el promedio de
  la columna: 0 significa «igual que adivinar», 1 significa «perfecto». Si el modelo se equivoca
  **más** que adivinar el promedio, el R² baja de 0. No es un error de la app: es la forma honesta de
  decir que, con esas columnas, el modelo empeora una regla trivial.
- **¿Por qué la app me pregunta si mi columna son categorías o una cantidad?** Porque con pocos
  números distintos (por ejemplo, del 1 al 6) los datos no alcanzan para saberlo: puede ser una nota
  (categorías) o un conteo (una cantidad). Tú conoces la columna; la app sugiere la lectura más
  probable, pero no adivina por ti.
- **¿Por qué el baseline es la mediana y no el promedio?** Porque el veredicto mide cuánto se
  equivoca en promedio (el MAE), y para esa medida la constante que menos se equivoca es la mediana.
  Comparar contra el promedio le regalaría al modelo una victoria contra un rival más débil.

- **¿Por qué no hay veredicto contra un baseline al agrupar?** Porque no hay una respuesta correcta
  con la que comparar: sin objetivo, no hay nada que «adivinar» y, por lo tanto, ningún conjunto de
  prueba ni regla simple que superar. Lo que sirve para creer es otra cosa: que tus filas se separen
  **mejor que datos sin estructura** y que los grupos **se repitan** al volver a agrupar partes de tus
  filas. Si no pasa lo primero, la app te dice «no hay estructura de grupos»; si no pasa lo segundo,
  que los grupos son frágiles.
- **¿Por qué el jerárquico usa una muestra si tengo más de 8,000 filas?** Porque el agrupamiento
  jerárquico compara cada fila con todas las demás: con muchas filas necesita más memoria de la que
  un navegador puede dar, sobre todo en un teléfono, y la pestaña se cerraría. Por eso se ajusta sobre
  8,000 filas al azar (siempre las mismas para tus datos) y asigna el resto al grupo más cercano. Los
  demás agrupadores usan todas tus filas, y la app te lo dice antes de agrupar y donde se lee el
  resultado.
- **«Los grupos existen», ¿quiere decir que son reales?** Quiere decir que tus filas forman grupos
  que se separan mejor que el azar y que se repiten. No dice **por qué** existen ni que vayan a
  aparecer en otros datos: eso lo juzgas tú, mirando qué distingue a cada grupo.
- **¿Por qué al clasificar en varias categorías decide la exactitud balanceada y no la exactitud?**
  Porque si una categoría es mucho más común, un modelo que la responde siempre tiene buena
  exactitud sin aprender nada. La exactitud balanceada pesa igual cada categoría, así que eso no le
  alcanza.
- **La app me dice que una categoría tiene muy pocas filas, ¿qué hago?** La validación cruzada
  necesita al menos dos filas de cada categoría en el entrenamiento para comparar modelos con
  honestidad. Consigue más filas de esa categoría o júntala con otra parecida en tu CSV.

**Protocolo DS**

- **¿Por qué el Protocolo no me deja saltar una etapa?** Porque cada etapa se apoya en la anterior: el
  umbral de la 9 sale de los costos de la 1, la prueba de la 8 solo es creíble si la 6 la selló antes de
  tocar el modelo. Lo que no se pueda cumplir se corrige o se detiene; no hay botón de «saltar» ni una
  excepción con justificación.
- **¿Dónde se guarda mi cuaderno y qué pasa si borro los datos del navegador?** En el almacenamiento de
  este navegador, solo ahí. Si lo borras, el cuaderno se va con él: **exporta** el cuaderno cuando termines
  una etapa importante, y vuelve a **importarlo** (te pide un sí si ya hay entradas). El archivo no lleva
  ni una fila de tu CSV.
- **Cargué otro CSV y la app me preguntó si es otra versión o otro proyecto, ¿qué elijo?** Si es el mismo
  trabajo con datos nuevos, **«Otra versión de los mismos datos»**: lo que dependía de los datos viejos vuelve
  a «por verificar». Si es otro trabajo, **«Otro proyecto: cuaderno nuevo»**, que pide un segundo sí porque
  reemplaza el cuaderno.
- **¿Por qué la prueba solo se abre una vez?** Porque cada vez que miras la prueba y cambias algo, el
  número deja de ser el que puedes esperar con datos nuevos. El cuaderno cuenta cada apertura **distinta**
  y la ficha lo dice; abrir lo mismo dos veces cuenta una.
- **Mi decisión fue «no usarlo», ¿fracasé?** No: es un resultado válido. Queda en el cuaderno con sus
  números y la ficha dice qué tendría que cambiar para volver a intentarlo.
- **¿Qué hago con la ficha?** Descárgala en Markdown y compártela con quien responda por el modelo. Cada
  línea trae su etapa, su fecha y la huella del archivo; lo que escribió el dueño va rotulado así.
- **¿El chequeo de deriva me dice si el modelo sigue funcionando?** No: mide si las **entradas** de hoy se
  parecen a las del entrenamiento. Un modelo puede fallar con entradas parecidas; para vigilar el desempeño
  hacen falta los resultados nuevos, y eso no está en esta versión.

- **¿"Estrésalo" cambia mi modelo o mi veredicto?** No. Mide el mismo modelo sobre la misma prueba
  perturbada; no reentrena, no elige nada y, en el Protocolo, no cuenta como abrir la prueba otra vez.
- **¿La receta me da exactamente mis cifras?** En el kit de prueba, con casi todos los modelos, sí:
  dentro de una millonésima (se midió en Linux x86-64, con Python 3.14.0 y las versiones fijas); con los
  bosques de árboles, **aproximadamente**, y te lo dice con la diferencia. En otra máquina, con otra
  librería de álgebra, algún modelo puede diferir en las últimas cifras: la receta lo dice, no lo calla.
  Si no reproduce, dice cuáles métricas difieren.
- **¿Probeta publica mi modelo o lo despliega?** No. "Llévatelo" arma archivos que se quedan en tu
  equipo. Probeta no despliega nada ni guarda credenciales; tú decides dónde ponerlos.
- **¿Qué lleva el archivo que comparto?** El puntuador y el servicio llevan el modelo y su manifiesto
  (rangos, categorías vistas, nombre de tu archivo, métricas) y, con vecinos más cercanos, filas de tu
  entrenamiento. La receta no lleva filas. La app lo dice antes de descargar.

- **¿Puedo traer un Excel?** Sí, un `.xlsx`: se lee en tu navegador con los mismos límites que un CSV y la
  app te dice qué hoja leyó. Un libro con contraseña, un `.xls` antiguo o uno dañado se rechazan diciendo por
  qué; en esos casos, guárdalo como CSV.
- **¿La app guarda o muestra mis correos y teléfonos?** No. El aviso de posibles datos personales nombra la
  columna y el tipo, nunca un valor, y no sale de tu navegador. Si no necesitas esa columna para predecir,
  puedes quitarla en el plan de limpieza; si la dejas, el archivo del modelo que exportes puede llevar las
  categorías que vio (la app lo avisa antes de descargar).
- **¿Por qué el plan no rellena todo de una vez?** Porque rellenar con una mediana calculada con TODAS tus
  filas dejaría que la prueba influyera en el entrenamiento. Por eso cada paso se calcula dentro del modelo,
  solo con el entrenamiento, y por eso lo apruebas tú.
- **Aprobé un paso y no se aplicó, ¿por qué?** El registro del plan (en la ficha del modelo) dice el motivo:
  era la columna que predices, la columna se quitó con otro paso, o pasó a ser una categoría.
- **¿Qué significa el intervalo de mi AUC?** Que con esta prueba la cifra podría haber salido un poco más
  alta o más baja por azar. Cuanto más ancho, menos dice la cifra; con pocas filas de prueba es muy ancho.
- **¿La insignia «verificada» quiere decir que el modelo es bueno?** No. Quiere decir que el **texto** coincide
  con tus números. Si el modelo es bueno o no lo dice el veredicto.

## Historial

| Sprint | Features añadidas a este manual                                                                                                                                                                                                                                                                                      |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 001    | El veredicto honesto (carga CSV/ejemplos, elección de objetivo, entrenamiento, veredicto vs. baseline, advertencia de fuga, métricas en test).                                                                                                                                                                       |
| 002    | El porqué honesto (importancia de variables + dirección, narración con IA verificada contra los números, consentimiento de privacidad, model card descargable).                                                                                                                                                      |
| 003    | El modelo se usa (puntuar datos nuevos con aviso de novedad, exportar el modelo como archivo `.probeta.json`, volver a importarlo y puntuar sin re-entrenar).                                                                                                                                                        |
| 004    | Sobrevive datos reales (saneamiento transparente con conteos, alertas EDA de fuga/identificador/desbalance, boosting HistGradientBoosting compitiendo con el mismo veredicto).                                                                                                                                       |
| 004    | **Diccionario de términos** (pedido en el gate ⭐, prueba E3) + aviso de CSV con punto y coma.                                                                                                                                                                                                                       |
| 005    | La liga honesta (14 modelos con validación cruzada, ganador por la regla de un error estándar, prueba a pedido y etiquetada, elección manual «elegido por ti», tipo de predicción de cada columna, quién compite por nivel, ficha de cada modelo, Nivel 2 cancelable).                                               |
| 006    | Estimar una cantidad (liga de 11 modelos que estiman, veredicto en las unidades de la columna contra la mediana y la regresión lineal, gráfico estimado frente a real, la pregunta «¿categorías o una cantidad?», `<columna>_estimado` al puntuar, avisos de sesgo y atípicos) + diccionario y preguntas de estimar. |
| 007    | Clasificar en varias categorías (de 3 a 20 categorías, la liga en exactitud balanceada, matriz de confusión con ✓, fuga que nombra la columna y la categoría, `<columna>_predicho` y `_probabilidad`) y agrupar filas parecidas sin objetivo (cuatro agrupadores, ganador por consenso, lectura contra datos sin estructura y estabilidad, qué distingue a cada grupo, «fuera de todo grupo», la muestra del jerárquico, tus filas con su grupo, asignar filas nuevas) + dos ejemplos en el inicio, diccionario y preguntas de las dos. |
| 008    | Protocolo DS, el camino lento (etapas 1 a 3 con compuertas que no se saltan, cuaderno que sobrevive a cerrar la pestaña y se exporta e importa, glosario consultable).                                                                                                                                                                                                                                                                                                                                                                  |
| 009    | Protocolo DS, etapa 4 «¿existe al decidir?» (apuesta antes de revelar, lo que encontró la app: fuga por valores y por vacíos, identificadores, filas repetidas y cambio entre periodos; inventario por columna con procedencia, momento y estado; acción en bloque con declaración; confirmaciones al reemplazar el cuaderno).
| 010    | Protocolo DS, etapa 5 «La línea base sin modelo y la regla de hoy» (lo que ya se logra sin modelo, en la moneda de tu decisión y con la métrica estándar, rotulado como referencia; la regla de hoy escrita con hasta dos condiciones y medida en tus filas; el resumen del cuaderno). Además: los radios se leen en tema oscuro, y un identificador numérico se detecta en la etapa 4.)
| 011    | Protocolo DS, etapa 6 «La prueba sellada» (la sugerencia del esquema con su porqué, cuatro esquemas, la pregunta de unidades nuevas o conocidas, el horizonte y el hueco en días o meses, la tabla por lado sin filas, la verificación de solape y el sello que se recalcula al recargar y cuenta pruebas distintas). Además: el inglés se descarga al elegirlo; la etapa 5 acepta «1,5» como número en una salida numérica y su resumen muestra vacíos, métricas y aciertos.
| 012    | Protocolo DS, etapa 7 «El ganador, con la prueba cerrada» (la liga corre sobre los pliegues del entrenamiento, con el esquema sellado y sin la prueba; el puntaje del ganador se rotula «medida de selección»; la comparación contra la línea base pliegue por pliegue con su intervalo del 95 %, «Supera» o «No supera»; la permutación con su resolución; y el cuaderno que se vuelve a comprobar al recargar). Además: una clase llamada «constructor» o «__proto__» ya no se pierde al partir la tabla, y la etapa 6 precarga tu esquema elegido solo cuando difiere de la sugerencia de hoy. |
| 013    | Protocolo DS, etapa 8 «La prueba, abierta una vez» (la prueba sellada se abre una sola vez y solo con el sello verificado; la medida en la prueba con su intervalo bootstrap por conglomerados, la línea base y tu regla, el optimismo de la selección, el error por segmento con soporte y su peor segmento, la calibración con su Brier, los peores casos solo en pantalla, y tu patrón de fallo. Las aperturas se cuentan y se rotulan, sin bloquear). Además: la etapa 7 dice si la prueba seguía cerrada o se abrió antes o después de su selección. |
| 014    | Protocolo DS, etapa 9 «¿Sirve para la decisión?» (la decisión con números, sin volver a abrir la prueba: el umbral de tus costos con sus falsas alarmas por cada 100 alertas, el costo y el beneficio neto frente a no hacer nada, actuar con todos y tu regla de hoy; la capacidad de tu equipo; la curva de decisión; y tu decisión, usar, iterar o no usar, con razón. «No usarlo» pasa la compuerta. Con un número, el costo y el cuantil de tus costos). Además: el peor segmento exige que el error supere al total, y la etapa 8 deja de recalcularse a cada tecla de tu patrón. |
| 015    | Protocolo DS, etapa 10 «La ficha del modelo y su vigilancia» (la ficha sale solo del cuaderno, cada línea con su etapa, fecha y huella; quién responde; con «usar», la cadencia de reentreno que respalda la prueba y el plan de vigilancia con un chequeo de deriva de un CSV nuevo que mide las entradas, y las columnas de texto que vigilas las eliges tú; con «no usar» o «iterar», qué cambiar; la ficha se descarga en Markdown; «Protocolo completo» cuando las diez etapas están cumplidas).
| 016    | El producto completo (cierre de H-2: las diez etapas, la ficha y Probeta se recorren enteras con el teclado; el tamaño de muestra dice sus supuestos; el chequeo de deriva dice «sin referencia» en vez de «estable» cuando no hay con qué comparar; nota junto a «Exportar cuaderno»; costos con tope; la prueba no cuenta dos veces la misma apertura; preguntas frecuentes del Protocolo).                                                                                                        |
| 017    | Estrésalo (¿cuánto aguanta tu modelo? el mismo modelo sobre la misma prueba con ruido, una columna revuelta y un corrimiento; en la etapa 8 del Protocolo sin abrir la prueba otra vez, con la línea de robustez en la ficha) y Llévatelo (la receta reproducible, el puntuador portátil y la plantilla de servicio, con el aviso de lo que lleva cada archivo antes de descargar). |
| 018    | Probeta completa (un Excel `.xlsx` además del CSV, el aviso de posibles datos personales que nunca muestra un valor, el plan de limpieza que apruebas paso a paso y que se calcula solo con el entrenamiento, la exploración con distribuciones, correlaciones y un resumen verificado, el margen de error de la cifra del veredicto, las explicaciones verificadas en las cuatro tareas y la liga contra lo prometido). |
