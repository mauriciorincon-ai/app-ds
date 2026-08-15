---
tipo: propuesta
ciclo-destino: H2
app: ds
origen: sesión constructora de app-ds, durante el gate ⭐ del Sprint 004
fecha: 2026-08-12
estado: propuesta — requiere decisión de la planeadora
---

# Propuesta H2 — «La liga honesta»

> Ampliar de 4 a ~11 modelos **sin gastar ni un gramo** de la garantía metodológica que
> diferencia a Probeta DS. La clave no es entrenar menos: es dejar de elegir sobre el test.

## Resumen ejecutivo

Hoy la app entrena 4 modelos (2 baselines + 2 candidatos) y elige al ganador por el máximo de la
métrica primaria **sobre el conjunto de prueba**. Ese diseño es el que limita el número de
candidatos a dos: cada competidor extra evaluado sobre test infla el puntaje del ganador (la
_maldición del ganador_) y contamina justo el número que la app promete que es cierto.

La propuesta **mueve la selección a validación cruzada dentro de train**. Con eso el test deja de
participar en la elección, se abre una sola vez para el ganador, y **el número de modelos deja de
estar acotado por la estadística**. La app puede ofrecer una liga de ~11 modelos y seguir siendo
la única cuyo resultado se puede defender.

Efecto de producto: se pasa de _«te doy menos que los demás»_ a _«te doy lo mismo que los demás, y
soy el único cuyo leaderboard puedes creer»_.

## 1. El problema

Cuatro modelos se percibe como una oferta pobre frente a cualquier AutoML del mercado, que exhibe
decenas. Para una app de portafolio, esa percepción es un costo real: sugiere una herramienta de
juguete, no una herramienta seria. El planteamiento vino del usuario durante el gate ⭐ del S4 y
es correcto.

## 2. El hallazgo: qué es realmente escaso

Durante el análisis se identificó una confusión que estaba limitando el diseño — **la cantidad de
modelos y la cantidad de decisiones tomadas sobre el test son cosas distintas, y solo la segunda
es escasa**.

La maldición del ganador no castiga _entrenar_ muchos modelos. Castiga **elegir** entre ellos
mirando el test: el máximo de N puntajes ruidosos es optimista, y esa parte de la ventaja es
suerte, no habilidad. Si la elección ocurre en otro sitio, N puede crecer libremente.

De ahí se siguen dos reglas que ordenan todo el diseño:

| Acción sobre el test                       | ¿Cuesta honestidad?   |
| ------------------------------------------ | --------------------- |
| Entrenar y medir N modelos                 | No                    |
| **Elegir** el mejor de N mirando el test   | **Sí, y crece con N** |
| Reportar el puntaje del ganador ya elegido | No                    |

Corolario aprovechable: **añadir baselines siempre es seguro**. El veredicto compara contra el
baseline más fuerte ([verdict.ts:42](../src/engine/verdict.ts#L42)), así que cada rival nuevo solo
puede subir la vara — el sesgo va en la dirección conservadora.

## 3. El diseño propuesto

### 3.1 Selección por validación cruzada, test tocado una sola vez

1. Todos los modelos del roster compiten con **CV de k folds dentro de train**. El test no se abre.
2. Gana el mejor en CV. **La elección no tocó datos de prueba.**
3. El test se abre **una vez**, solo para el ganador y los baselines, y ese número es el veredicto.

Detalle que reduce mucho el riesgo de implementación: `cross_val_score` sobre el `Pipeline`
**reajusta el preprocesador dentro de cada fold automáticamente**. La garantía anti-fuga del
ADR-002 se mantiene por construcción, sin código nuevo que la sostenga — pero exige un test unit
propio que falle si alguien saca el preprocesador fuera del pipeline.

### 3.2 El roster: ~11 modelos que cubren el espectro tabular

El argumento de fondo: **los leaderboards de 50 modelos son las mismas ocho familias con
hiperparámetros distintos.** Impresionan y no informan. Cubrir familias sí informa.

| Familia              | Modelo                                | Costo CPU       |
| -------------------- | ------------------------------------- | --------------- |
| Trivial              | `DummyClassifier(most_frequent)`      | nulo            |
| Regla legible        | `DecisionTreeClassifier(max_depth=3)` | nulo            |
| Probabilística       | `GaussianNB`                          | nulo            |
| Lineal               | `LogisticRegression`                  | bajo            |
| Lineal regularizada  | `RidgeClassifier`                     | bajo            |
| Margen               | `LinearSVC`                           | bajo            |
| Instancias           | `KNeighborsClassifier`                | bajo al ajustar |
| Bagging aleatorizado | `ExtraTreesClassifier`                | medio           |
| Neuronal ligera      | `MLPClassifier` (1 capa oculta)       | medio           |
| Bagging              | `RandomForestClassifier(200)`         | **alto**        |
| Boosting             | `HistGradientBoostingClassifier`      | **alto**        |

Siete de los once son prácticamente gratis: **el costo real sigue concentrado en los dos que ya se
entrenan hoy.** SVM con kernel RBF quedaría fuera salvo con tope de filas (escala cuadrático o
peor).

Dos notas de encaje con las reglas duras:

- Todo es scikit-learn, ya cargado entero en el runtime
  ([pyodide-runner.js:34](../public/pyodide-runner.js#L34)): **cero dependencias nuevas, cero
  descarga adicional, cero impacto en el presupuesto de bundle** (es Python en el worker).
- El `MLPClassifier` no es una licencia tomada: la constitución ya lo contempla explícitamente
  («el DL son solo redes ligeras entrenables en CPU (MLPs), opcionales y honestamente
  etiquetadas»). Se etiquetaría como tal en la tabla.

### 3.3 Dos niveles de ejecución (para no perder la velocidad actual)

El único límite que sobrevive es real: un hilo, WASM, y la CV multiplica por el número de folds.
Por eso la ejecución se parte en dos:

- **Nivel 1 — automático, siempre.** Los ~7 modelos baratos + los 2 actuales. Sin espera
  perceptible, sin botones. Es el flujo de hoy, con más rivales gratis.
- **Nivel 2 — «Competencia completa», a demanda.** Un botón corre la liga entera con CV, muestra
  la tabla ordenada, y **antes de arrancar declara una estimación honesta de tiempo** («~40 s para
  tus 3.200 filas») con opción de cancelar.

Quien quiere velocidad no paga por la profundidad; quien quiere profundidad sabe lo que pidió.
Nadie espera sin haberlo elegido.

### 3.4 Qué ve el usuario — y la regla que protege la tabla

La tabla de la liga muestra **únicamente puntajes de CV**. El puntaje de test se muestra solo para
el ganador y los baselines.

Esto no es un recorte de información, es la protección central del diseño: publicar el test de los
once perdedores sería entregarle al usuario el sesgo de selección en bandeja («¡pero kNN sacó
más!») e invitarlo al _model shopping_ que la app existe para impedir.

El copy debe hacer explícita la distinción, porque **es el mejor argumento de venta que tiene la
app**:

> La tabla se calcula con validación cruzada — **sirve para elegir**.
> El veredicto se calcula con el conjunto de prueba — **sirve para creer**.

Ningún AutoML del mercado explica esa diferencia. La mayoría ni la respeta.

## 4. Garantías que se mantienen

| Garantía                                  | Cómo sobrevive                                                    |
| ----------------------------------------- | ----------------------------------------------------------------- |
| Anti-fuga por construcción (ADR-002)      | La CV reajusta el preprocesador por fold; test unit dedicado      |
| Métricas solo sobre test                  | El veredicto sigue saliendo del test tocado una vez               |
| El veredicto habla, el usuario no negocia | No hay selector de modelo; la elección es mecánica (argmax en CV) |
| 100% CPU, cero GPU                        | Todo scikit-learn; el MLP es una red ligera declarada             |
| Datos nunca salen del navegador           | Nada cambia: todo ocurre en el worker                             |

Asimetría conocida y deliberada: `pickBestBaseline` sí toma el máximo sobre test entre baselines.
Eso sesga el baseline **hacia arriba**, endureciendo la vara — el sentido seguro.

## 5. Costos y riesgos

| #   | Riesgo                                                                    | Mitigación                                                                                                                                                              |
| --- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Tiempo de cómputo en datasets grandes (k folds × 11 modelos, un hilo)     | Nivel 2 a demanda + estimación previa + cancelación + tope de filas; **k y roster se fijan con medición, no con criterio** (ver F0)                                     |
| R2  | Memoria en el worker con 11 pipelines ajustados                           | Solo se retiene el ganador; los demás se descartan tras medir                                                                                                           |
| R3  | `MLPClassifier`/`LinearSVC` no convergen en datos raros y emiten warnings | Capturar y degradar: el modelo queda «no concluyó», la liga sigue                                                                                                       |
| R4  | La tabla invita al model-shopping                                         | No se muestran puntajes de test de los perdedores (§3.4)                                                                                                                |
| R5  | El veredicto de hoy usa argmax sobre test                                 | Cambia a argmax sobre CV: **el número reportado puede bajar** en algunos datasets. Es lo correcto, y conviene anticiparlo: es la corrección del sesgo, no una regresión |
| R6  | Presupuesto de performance de la landing                                  | Intacto: Pyodide sigue bajo demanda, nada entra al camino del LCP                                                                                                       |

**R5 merece énfasis en la retrospectiva:** al corregir el sesgo, algunos datasets mostrarán
métricas ligeramente peores que en H1. Eso es exactamente lo que la app promete hacer.

## 6. Fases sugeridas

- **F0 — Spike de medición (bloqueante, antes de fijar el diseño).** Medir en el Pyodide real el
  tiempo de CV × roster sobre datasets de ~200 / ~2.000 / ~20.000 filas. **Salida: roster final,
  número de folds y umbral de filas del Nivel 2.** Sin este dato, los números de §3.3 son
  suposiciones.
- **F1 — Motor.** Roster tipado + selección por CV en train (Python) + contrato del worker. Test
  anti-fuga extendido (preprocesador reajustado por fold).
- **F2 — Veredicto y contrato.** Separar «puntaje de elección (CV)» de «puntaje de veredicto
  (test)» en el retorno, el manifiesto y la model card, que además registra **cuántos modelos
  compitieron y con qué criterio se eligió**.
- **F3 — UI.** Tabla de la liga, dos niveles, estimación de tiempo, cancelación.
- **F4 — Honestidad explícita.** Copy CV vs test (ES/EN en el mismo paso), model card, MANUAL.
- **F5 — e2e + a11y + perf** y actualización de la GUIA-DE-PRUEBA.

## 7. Impacto en el backlog H2 ya acordado

Esta propuesta **reordena** la prioridad acordada el 2026-07-20 (bloque A del gate). «La liga
honesta» pasa a ser el ítem grande de H2 porque es el único que mueve **percepción de producto y
credibilidad a la vez**. El resto conserva su orden relativo detrás.

**Además, revisa el matiz de A4.** Lo acordado fue «interruptor que añade `class_weight` como
CANDIDATO a la competencia». Con el análisis de §2, ese matiz es flojo: un candidato más elegido
por argmax sobre test paga el mismo peaje. **Versión corregida:** que sea una **reejecución que el
usuario pide explícitamente** (experimento distinto, no competidor autoseleccionado) — o bien, si
H2 toma esta propuesta primero, entra como un miembro más de la liga y el problema desaparece
solo, porque la selección ya vive en CV.

Recomendación de secuencia para H2:

1. **La liga honesta** (esta propuesta).
2. **A5** — «entrenar sin esta columna» con antes/después.
3. **A1** — mini-dashboard de estadísticas por columna (paga el recorte de O2).
4. **Regresión** (ver §9) — el mayor crecimiento de alcance, pero después de la liga.
5. **A4 / A3** en las versiones ya acordadas, con la corrección de A4 anotada arriba.

## 8. Tensión con la constitución — decisión de producto pendiente

`CLAUDE.md` declara que **el diferenciador no es el AutoML (commodity) sino la honestidad
metodológica automática**. Esta propuesta acerca la app al terreno del AutoML.

Lectura de quien la propone: **el diferenciador sobrevive intacto**, porque nunca fue «pocos
modelos» — era «método honesto». Ser estrecho no es ser honesto; es solo ser estrecho. Pero la
frase toca la constitución, así que **la decisión es de la planeadora y del usuario, no de la
sesión constructora**. Si se aprueba, conviene reformular el párrafo del diferenciador para que
diga qué es lo escaso: no el número de modelos, sino las decisiones tomadas sobre el test.

## 9. Preguntas abiertas para la planeadora

1. **¿Se acepta el movimiento hacia terreno AutoML** con la reformulación del diferenciador (§8)?
2. **¿El Nivel 2 es siempre a demanda**, o automático por debajo de cierto tamaño de dataset?
3. **¿Regresión antes o después de la liga?** Recomendación: **después**. La regresión (4 modelos
   nuevos: `DummyRegressor`, `LinearRegression`, `RandomForestRegressor`,
   `HistGradientBoostingRegressor`) **duplica a quién le sirve la herramienta** — hoy quien llega
   con un objetivo numérico (precio, demanda, consumo) no puede usar la app en absoluto. Pero
   construirla sobre la liga ya hecha es más barato que al revés, porque hereda la selección por
   CV. Multiclase sería el tercer eje, por la misma lógica.
