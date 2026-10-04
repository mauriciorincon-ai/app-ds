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
     archivo_) o probar con uno de los **ejemplos** incluidos.
  2. **Configuración → elige qué predecir.** Verás una vista previa de tu tabla y, en el menú _¿Qué
     quieres predecir?_, seleccionas la columna objetivo. Desde el Sprint 005 puedes elegir
     **cualquier columna**: la app te dice qué tipo de predicción sería. Esta versión entrena las de
     **dos categorías** (sí/no, 0/1, aprobado/rechazado…) y, desde el Sprint 006, las **cantidades**
     (un precio, un consumo, un tiempo: ver _Estimar una cantidad_). Si alguna columna parece una
     fecha, la app te avisa (en esta versión no se usa para el análisis).
  3. **Pulsa _Entrenar modelos_.** La primera vez tarda unos segundos mientras se prepara el motor
     de análisis; verás el progreso paso a paso.
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
  - Solo predicción de **dos categorías** (clasificación binaria). _Desde el Sprint 006 también se
    estiman cantidades._
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
    **no tus filas crudas**. Aun así, lo aprendido refleja tus datos: **trátalo como un archivo
    sensible** y compártelo solo con quien compartirías el resultado.

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
    intercambio). Publicar el modelo para que otros lo usen llegará más adelante.
  - El CSV nuevo tiene los **mismos límites** de siempre: 5 MB o 50 000 filas.
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

- **Alertas antes de entrenar (exploración de datos):** al elegir el objetivo, la app revisa tus
  columnas y te avisa —con símbolo y texto, nunca solo color— de:
  - una columna que predice el objetivo **casi a la perfección** (posible fuga: un dato que no
    tendrías al predecir de verdad),
  - una columna que **parece un identificador** (aporta poco para generalizar),
  - un **objetivo desbalanceado** (una clase es rara) — por eso el veredicto usa AUC.

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
    por qué (por ejemplo, _«2 valores distintos → clasificación binaria»_). Si es de otro tipo
    (varias categorías), te lo dice: esta versión todavía no la entrena, pero la columna no se
    esconde. _Desde el Sprint 006, las cantidades sí se entrenan._
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
    modelo_ y _Exportar_ esperan.
  - Si el Nivel 2 no pudiera terminar (por ejemplo, por falta de memoria en un móvil), también
    vuelve el resultado anterior y te lo dice.

- **Cuando no se puede comparar con honestidad, la app lo dice con su razón:**
  - Si tu objetivo tiene dos valores escritos de dos formas (por ejemplo «1» y «1.0»), te pide
    unificarlos en tu CSV: para entrenar, cada clase tiene que escribirse igual en todas las filas.
  - Si hay muy pocos ejemplos de una de las clases, la tarjeta del tipo de predicción no muestra ✓:
    remite al motivo, que aparece debajo, y el botón de entrenar espera.
  - Si ningún modelo termina la validación cruzada sin problemas, la app no inventa un ganador: te
    lo dice y te sugiere más filas u otras columnas.

- **Limitaciones conocidas (Sprint 005):**
  - Solo se entrenan objetivos de **dos categorías**; varias categorías y cantidades llegan en una
    próxima versión. _Las cantidades llegaron en el Sprint 006._
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
     - **Categorías** → es una predicción de varias clases, que esta versión todavía no entrena (y
       te lo dice).
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
  - Varias categorías (multiclase) llegan en una próxima versión.

## Diccionario de términos

Las palabras que verás en la app, en una línea cada una. No necesitas memorizarlas: vuelve aquí
cuando una te frene.

**Sobre el resultado**

| Término                    | Qué significa                                                                                                                                                                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Baseline** (línea base)  | Las reglas simples contra las que se mide tu modelo. Al clasificar: responder siempre lo más frecuente (clase mayoritaria) y una regresión logística. Al estimar: adivinar siempre la mediana y una regresión lineal. Si tu modelo no supera a la mejor de las dos, no sirve. |
| **Veredicto**              | La comparación franca entre tu modelo y el mejor de esos baselines: lo supera, empata o pierde.                                                                                                                                                                               |
| **Entrenamiento y prueba** | La app parte tus datos en dos: con tres cuartas partes aprende y con la cuarta parte restante, que nunca vio, se examina. Por eso el número del veredicto es real.                                                                                                            |
| **Liga**                   | Todos los modelos que compiten entre sí. Se elige al ganador sin mirar la prueba; puedes elegir otro, y queda registrado.                                                                                                                                                     |
| **Clase detectada**        | De las dos respuestas posibles, la que el modelo intenta encontrar (normalmente la menos frecuente).                                                                                                                                                                          |

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

**Sobre las advertencias**

| Término                    | Qué significa                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Fuga de datos**          | Una columna que ya contiene la respuesta disfrazada. Infla las métricas y hace inútil el modelo en la vida real. La app la busca y avisa.  |
| **Desbalance de clases**   | Una de las dos respuestas es mucho más rara que la otra. Obliga a mirar AUC en vez de aciertos.                                            |
| **Saneamiento**            | La limpieza que la app hace antes de entrenar (filas repetidas, columnas identificadoras o constantes, celdas basura), siempre con conteo. |
| **Columna identificadora** | Una columna con un valor distinto en cada fila (un código de cliente). No predice nada; se excluye.                                        |
| **Novedad**                | Al puntuar datos nuevos: valores que el modelo nunca vio al entrenar. En esas filas está adivinando, y te lo dice.                         |

**Sobre el porqué**

| Término                           | Qué significa                                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Importancia (por permutación)** | Cuánto empeora el modelo si se desordena esa columna. Mide **cuánto pesa**, no hacia dónde empuja. Importancia 0 = no la usa.   |
| **Dirección**                     | Hacia dónde empuja una variable: a mayor valor, más (o menos) probable la clase detectada. Solo se muestra si la variable pesa. |
| **Model card**                    | La ficha del modelo: con qué datos se entrenó, qué mide, qué advertencias tiene. Para que otro pueda juzgarlo sin creerte a ti. |

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
