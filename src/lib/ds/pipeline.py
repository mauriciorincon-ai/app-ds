"""Pipeline de modelado anti-fuga por construcción (corre en Pyodide/WASM).

El preprocesamiento (imputación + escalado + one-hot) se ajusta SOLO sobre las
filas de train (`train_idx`). Es el único camino: no existe función que
preprocese antes del split. Todas las funciones públicas reciben y devuelven
JSON (interop simple y robusta con el worker de TS).

Las métricas del veredicto se calculan sobre TEST, nunca sobre train; los
puntajes con que la liga ELIGE (S5) son de validación cruzada dentro de train.

S3 — el modelo se usa: `run_experiment` retiene el pipeline fitted y el perfil
de train en `_MODEL` (nivel de módulo, vive lo que viva el worker);
`score_new_data` puntúa CSV nuevos con reporte honesto de novedad;
`export_model`/`import_model` serializan/restauran el modelo (pickle+zlib+
base64 — ADR-007; el manifiesto y su hash se validan en TS ANTES de llamar
a import_model).

S5 — la liga (ADR-009): `run_experiment` hace competir a todos los miembros del
roster que TS envía, con validación cruzada DENTRO de train (el preprocesador
se reajusta en cada fold), elige por la regla de un error estándar y RECIÉN
ENTONCES abre el test (una vez, para todos). `fit_member` ajusta otro miembro
cuando el usuario elige a mano. El payload se valida al entrar
(`_validate_payload`, el lado que LEE del contrato TS → Python).

S6 — estimar una cantidad (ADR-013): el payload trae `task` ("binaria" |
"numerica"). La regresión reusa la mecánica de la liga con su propio roster
(`_REGRESSORS`), KFold, MAE en unidades (menor es mejor) y baselines mediana +
lineal; devuelve además una muestra predicho-vs-real y los cuantiles de residuos
de TODO el test (valores del objetivo: viven solo en el navegador).

S7 — clasificar en varias categorías (ADR 015): `task: "multiclase"` reusa los 14
miembros de la binaria en su forma nativa (sklearn, LightGBM y XGBoost resuelven K
clases solos), con el objetivo codificado 0..K−1 en el orden de `classes` (lo manda
TS y se coteja con los datos), CV estratificada con k ≤ la clase más chica de train,
la exactitud balanceada como métrica primaria (decisión del usuario en el STOP de la
F0) y baselines mayoritaria + logística multinomial. Todo decide por `_by_task`: una
tarea registrada sin sus ramas no corre (S7, P2).

S7 — agrupar sin objetivo (ADR 016): `task: "agrupar"` entra por `run_clustering`
(y `fit_cluster_member`), con su propio payload SIN objetivo ni partición: el
preprocesador se ajusta sobre TODAS las filas (no hay prueba que proteger, y se
declara). Compiten K-Means, Agglomerative (ward), GMM y HDBSCAN; cada uno elige su k
(silueta sobre UNA muestra compartida, BIC, densidad), el ganador sale por CONSENSO
y lo que «sirve para creer» es la lectura contra la referencia nula (el mismo
agrupador sobre datos sin estructura) y la estabilidad por re-muestreo. Las
etiquetas por fila jamás viajan en el resultado (P13).
"""

# plantilla:inicio imports
import base64
import json
import math
import pickle
import re
import sys
import time
import warnings
import zlib

import numpy as np
import pandas as pd
from scipy.cluster.hierarchy import fcluster, linkage
from scipy.stats import chi2_contingency
from sklearn.base import clone
from sklearn.cluster import HDBSCAN, KMeans
from sklearn.compose import ColumnTransformer, TransformedTargetRegressor
from sklearn.dummy import DummyClassifier, DummyRegressor
from sklearn.ensemble import (
    ExtraTreesClassifier,
    ExtraTreesRegressor,
    HistGradientBoostingClassifier,
    HistGradientBoostingRegressor,
    RandomForestClassifier,
    RandomForestRegressor,
)
from sklearn.exceptions import ConvergenceWarning
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import (
    Lasso,
    LinearRegression,
    LogisticRegression,
    Ridge,
    RidgeClassifier,
)
from sklearn.metrics import (
    accuracy_score,
    adjusted_rand_score,
    balanced_accuracy_score,
    confusion_matrix,
    f1_score,
    log_loss,
    mean_absolute_error,
    mean_absolute_percentage_error,
    mean_squared_error,
    median_absolute_error,
    precision_recall_fscore_support,
    precision_score,
    r2_score,
    recall_score,
    roc_auc_score,
    silhouette_score,
)
from sklearn.mixture import GaussianMixture
from sklearn.model_selection import KFold, StratifiedKFold, cross_validate
from sklearn.naive_bayes import GaussianNB
from sklearn.neighbors import KNeighborsClassifier, KNeighborsRegressor
from sklearn.neural_network import MLPClassifier, MLPRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, QuantileTransformer, StandardScaler
from sklearn.svm import LinearSVC
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor
# plantilla:fin imports


# LightGBM 4.6 registra nombres genéricos de columnas al ajustar; sklearn avisa
# entonces en cada predict que la matriz (numpy, salida del ColumnTransformer) no
# los trae. Es benigno y llenaba la consola del usuario: se silencia SOLO ese aviso.
warnings.filterwarnings(
    "ignore", message="X does not have valid feature names", category=UserWarning
)
# S18: QuantileTransformer avisa si el pliegue tiene menos filas que sus 1000 cuantiles y se ajusta solo a las que hay
# (que es lo correcto): el aviso es ruido en la consola del usuario.
warnings.filterwarnings("ignore", message="n_quantiles", category=UserWarning)


# Modelo fitted retenido tras run_experiment/import_model (S3). Vive a nivel de
# módulo dentro del worker: es lo que permite puntuar y exportar sin re-entrenar.
_MODEL = None

# S7 (P13): las etiquetas por fila del agrupamiento retenido viven AQUÍ, fuera de
# todo resultado: ni el JSON de la liga, ni el esquema, ni el archivo exportado las
# llevan. Solo `cluster_labels` las entrega, para el CSV local del usuario.
_CLUSTER_LABELS = None


# plantilla:inicio base
# Espejo EXACTO de NULL_TOKENS/isNullToken de csv.ts (paridad TS↔Python,
# auditoría H1) — el test unit null-token-parity falla si divergen. Antes se
# reemplazaban solo literales exactos: "si " y "si" eran clases distintas y
# "None"/"NULL" categorías reales, divergiendo de lo que TS validó.
_NULL_TOKENS = {"", "na", "n/a", "null", "nan", "none", "-"}


def _normalize_cell(value):
    if value is None:
        return None
    text = str(value).strip()
    return None if text.lower() in _NULL_TOKENS else text


def _build_frame(headers, rows, numeric):
    df = pd.DataFrame(rows, columns=headers)
    df = df.map(_normalize_cell)
    for col in numeric:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


def _one_hot():
    # S4 — saneamiento estadístico DENTRO del pipeline (ADR-002 extendido):
    # min_frequency agrupa las categorías raras (count < 2) en un bucket
    # "infrecuente" APRENDIDO SOLO EN TRAIN (el fit del pipeline es train-only
    # ⇒ fuga imposible por construcción). handle_unknown="infrequent_if_exist"
    # manda las categorías nunca vistas a ese mismo bucket. sparse_output=False
    # porque HistGradientBoosting no acepta matrices dispersas.
    return OneHotEncoder(
        handle_unknown="infrequent_if_exist",
        min_frequency=2,
        sparse_output=False,
    )


def _make_preprocessor(numeric, categorical, limpieza=None):
    """S18 (ADR 026): `limpieza` es el plan de limpieza que el usuario aprobó, SOLO con nombres de columnas:
    `indicador_vacio` (una marca de «estaba vacío» junto a la mediana), `cuantiles` (la columna pasa a su posición
    entre las demás) y `sin_dato` (el vacío de una categórica es una categoría más). Todo se ajusta con las filas de
    train, como el resto del preprocesador. Sin `limpieza` el preprocesador es el de siempre."""
    spec = limpieza or {}
    indicador = set(spec.get("indicador_vacio", ()))
    cuantiles = set(spec.get("cuantiles", ()))
    sin_dato = set(spec.get("sin_dato", ()))

    def numeric_pipe(con_marca, por_cuantiles):
        pasos = [("imputer", SimpleImputer(strategy="median", add_indicator=con_marca))]
        if por_cuantiles:
            # random_state fijo: con más de 10 000 filas el ajuste usa una submuestra
            pasos.append(("quantil", QuantileTransformer(output_distribution="normal", random_state=0)))
        else:
            pasos.append(("scaler", StandardScaler()))
        return Pipeline(pasos)

    def categorical_pipe(vacio_es_categoria):
        imputer = (
            SimpleImputer(strategy="constant", fill_value="(sin dato)")
            if vacio_es_categoria
            else SimpleImputer(strategy="most_frequent")
        )
        return Pipeline([("imputer", imputer), ("onehot", _one_hot())])

    if not (indicador or cuantiles or sin_dato):
        transformers = [
            ("num", numeric_pipe(False, False), numeric),
            ("cat", categorical_pipe(False), categorical),
        ]
    else:
        transformers = []
        for nombre, con_marca, por_cuantiles in (
            ("num", False, False),
            ("num_marca", True, False),
            ("num_cuantiles", False, True),
            ("num_marca_cuantiles", True, True),
        ):
            columnas = [
                c for c in numeric if (c in indicador) == con_marca and (c in cuantiles) == por_cuantiles
            ]
            transformers.append((nombre, numeric_pipe(con_marca, por_cuantiles), columnas))
        transformers.append(("cat", categorical_pipe(False), [c for c in categorical if c not in sin_dato]))
        transformers.append(("cat_sin_dato", categorical_pipe(True), [c for c in categorical if c in sin_dato]))
    return ColumnTransformer(transformers, remainder="drop")
# plantilla:fin base


def _aprendido_por_columna(pre):
    """S18: lo que el preprocesador AJUSTADO aprendió de cada columna —la mediana de las numéricas y las categorías raras de las
    categóricas—, recorriendo TODOS sus transformadores. Con un plan de limpieza aprobado las columnas se reparten en varios
    (`num`, `num_marca`, `num_cuantiles`, `cat_sin_dato`…) y alguno puede quedar sin columnas (entonces no se ajusta)."""
    medianas, raras = {}, {}
    for _nombre, transformador, columnas in pre.transformers_:
        if isinstance(columnas, str) or not len(columnas) or not hasattr(transformador, "named_steps"):
            continue
        columnas = list(columnas)
        pasos = transformador.named_steps
        if "onehot" in pasos:
            infrecuentes = getattr(pasos["onehot"], "infrequent_categories_", None)
            if infrecuentes is not None:
                for col, cats in zip(columnas, infrecuentes):
                    if cats is not None and len(cats) > 0:
                        raras[col] = sorted(str(c) for c in cats)
        elif "imputer" in pasos and hasattr(pasos["imputer"], "statistics_"):
            for col, valor in zip(columnas, pasos["imputer"].statistics_):
                medianas[col] = float(valor)
    return medianas, raras


# plantilla:inicio metricas
def _metrics(y_true, y_pred, y_score):
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "f1": float(f1_score(y_true, y_pred, zero_division=0)),
        "auc": float(roc_auc_score(y_true, y_score)) if len(np.unique(y_true)) > 1 else 0.5,
    }


def _reg_metrics(y_true, y_pred):
    """S6: métricas de regresión sobre TEST, en las unidades del objetivo (salvo R²).
    MAPE solo si el objetivo no tiene ceros (con un cero es infinita): null y se dice."""
    return {
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "rmse": float(np.sqrt(mean_squared_error(y_true, y_pred))),
        "r2": float(r2_score(y_true, y_pred)),
        "medae": float(median_absolute_error(y_true, y_pred)),
        "mape": (
            None
            if bool(np.any(y_true == 0))
            else float(mean_absolute_percentage_error(y_true, y_pred))
        ),
    }


def _scores(pipe, X):
    """Puntaje continuo para el AUC: probabilidad de la clase positiva si el
    modelo la da; si no (ridge, SVM lineal), su función de decisión — el AUC
    solo necesita ORDENAR, no una probabilidad."""
    if hasattr(pipe, "predict_proba"):
        return pipe.predict_proba(X)[:, 1]
    return pipe.decision_function(X)


# plantilla:fin metricas


def _fit_score(estimator, preprocessor, X_train, y_train, X_test):
    pipe = Pipeline([("prep", preprocessor), ("model", estimator)])
    pipe.fit(X_train, y_train)  # <-- ajuste SOLO sobre train (garantía anti-fuga)
    y_pred = pipe.predict(X_test)
    return pipe, y_pred, _scores(pipe, X_test)


def _feature_directions(X_test, y_test, numeric, method="pearson"):
    """Signo de la asociación univariada feature↔target sobre TEST (solo
    numéricas; y es 0/1, así que la correlación de Pearson es punto-biserial).
    Las categóricas no tienen una dirección única (varía por categoría) → None.
    S6: con un objetivo continuo la dirección es la de Spearman (monótona, sin
    suponer linealidad), con la misma banda de ruido.
    """
    directions = {}
    y = pd.Series(y_test, index=X_test.index, dtype="float64")
    for col in numeric:
        x = X_test[col]
        if x.notna().sum() < 2 or x.nunique(dropna=True) < 2 or y.nunique() < 2:
            directions[col] = None
            continue
        r = x.corr(y, method=method)
        # Umbral honesto ~ banda nula al 95%: con n observaciones, una
        # correlación de puro ruido fluctúa ~2/sqrt(n). Por debajo, poner una
        # flecha sería vestir el ruido de señal → "sin dirección clara".
        n_valid = int(x.notna().sum())
        threshold = max(0.05, 2.0 / (n_valid**0.5))
        if pd.isna(r) or abs(r) < threshold:
            directions[col] = None
        else:
            directions[col] = "positive" if r > 0 else "negative"
    return directions


def _explainability(pipe, X_test, y_test, features, numeric, seed, task):
    """Importancia global por permutación sobre TEST (modelo-agnóstica; método
    respaldado — shap no carga en Pyodide, ver decisions/004). Devuelve las
    features ordenadas por importancia descendente, con dirección del efecto.
    S6: en regresión la importancia es cuánto SUBE el MAE al permutar la columna
    (en unidades del objetivo) y la dirección es la de Spearman.
    """
    # S7: con K clases no hay UNA dirección («sube la probabilidad de…» depende de la
    # clase): la importancia se mide con la primaria y la dirección no se afirma.
    scoring, method = _by_task(task, {
        "binaria": lambda: (
            "roc_auc" if len(np.unique(y_test)) > 1 else "accuracy",
            "pearson",
        ),
        "multiclase": lambda: ("balanced_accuracy", None),
        "numerica": lambda: ("neg_mean_absolute_error", "spearman"),
        "agrupar": _supervised_only,
    })()
    pi = permutation_importance(
        pipe, X_test, y_test,
        n_repeats=10, random_state=seed, scoring=scoring, n_jobs=1,
    )
    directions = {} if method is None else _feature_directions(X_test, y_test, numeric, method)
    numeric_set = set(numeric)
    order = np.argsort(pi.importances_mean)[::-1]
    return {
        "method": "permutation_importance",
        "scoring": scoring,
        "n_repeats": 10,
        "features": [
            {
                "name": features[i],
                "kind": "numeric" if features[i] in numeric_set else "categorical",
                "importance": float(pi.importances_mean[i]),
                "std": float(pi.importances_std[i]),
                # Honestidad (gate ⭐ S4, hallazgo en E2): la dirección se calcula
                # univariadamente, INDEPENDIENTE de la importancia. Si la importancia
                # no llega ni a mostrarse (redondea a 0.000 con los 3 decimales de la
                # UI) o es negativa, el modelo NO obtiene nada de esa variable:
                # afirmar entonces "a mayor valor, menos probable la clase" describiría
                # un comportamiento del modelo que la medición no respalda.
                "direction": (
                    directions.get(features[i])
                    if round(float(pi.importances_mean[i]), 3) > 0
                    else None
                ),
            }
            for i in order
        ],
    }


def _training_profile(X_train, numeric, categorical):
    """Perfil de TRAIN (jamás de test/total): rango visto por numérica y
    categorías vistas por categórica. Es la base del reporte de novedad — un
    valor que solo aparece en test ES novedad para el modelo (honestidad).
    """
    profile = {"numeric": {}, "categorical": {}}
    for col in numeric:
        series = X_train[col].dropna()
        if len(series) == 0:
            profile["numeric"][col] = {"min": None, "max": None}
        else:
            profile["numeric"][col] = {
                "min": float(series.min()),
                "max": float(series.max()),
            }
    for col in categorical:
        series = X_train[col].dropna()
        profile["categorical"][col] = sorted(str(v) for v in series.unique())
    return profile


def _runtime_versions():
    import lightgbm
    import pyodide
    import sklearn
    import xgboost

    return {
        "pyodide": pyodide.__version__,
        "sklearn": sklearn.__version__,
        "python": sys.version.split()[0],
        # S5: el pickle de un booster exige su paquete (y versión) al importar.
        "xgboost": xgboost.__version__,
        "lightgbm": lightgbm.__version__,
    }


# --- S5: la liga (ADR-009) ---------------------------------------------------

# Métrica primaria (la decide TS, verdict.ts) → scorer de sklearn para la CV.
SCORER = {
    "auc": "roc_auc",
    "f1": "f1",
    "accuracy": "accuracy",
    "precision": "precision",
    "recall": "recall",
    # S6: sklearn maximiza; el signo se invierte al leer los folds ⇒ cv.mean es el
    # MAE en las unidades del objetivo (menor es mejor).
    "mae": "neg_mean_absolute_error",
    # S7: la primaria de varias categorías (cuenta cada clase por igual).
    "balanced_accuracy": "balanced_accuracy",
}

# Espejo de METRIC_RULES (engine/verdict.ts): la dirección de cada métrica primaria.
# Paridad vigilada en tests/unit/roster.test.ts.
METRIC_DIRECTION = {
    "auc": "higher",
    "f1": "higher",
    "accuracy": "higher",
    "precision": "higher",
    "recall": "higher",
    "mae": "lower",
    "balanced_accuracy": "higher",
}

# Qué métricas primarias admite cada tarea (la elige TS; Python no la re-deriva).
# S6 (AU-S6-08): filas mínimas de PRUEBA para estimar una cantidad. Espejo de
# MIN_REGRESSION_TEST_ROWS en src/lib/experiment.ts (tripwire en regresion-motor).
MIN_REGRESSION_TEST_ROWS = 2

TASK_METRICS = {
    "binaria": ("auc", "f1", "accuracy", "precision", "recall"),
    "multiclase": ("balanced_accuracy",),
    "numerica": ("mae",),
}

# S7: cuántas clases admite una tarea de varias categorías. Espejo de
# MULTICLASS_MAX_CLASSES en engine/tarea.ts (paridad en tests/unit/roster.test.ts);
# con dos es binaria.
MULTICLASS_MIN_CLASSES = 3
MULTICLASS_MAX_CLASSES = 20


# plantilla:inicio fabricas
def _xgboost(seed):
    from xgboost import XGBClassifier

    return XGBClassifier(
        n_estimators=200, max_depth=6, learning_rate=0.1, tree_method="hist",
        n_jobs=1, random_state=seed, verbosity=0,
    )


def _lightgbm(seed):
    from lightgbm import LGBMClassifier

    return LGBMClassifier(n_estimators=200, n_jobs=1, random_state=seed, verbose=-1)


# El roster: id → fábrica con hiperparámetros FIJOS, semilla y un solo hilo
# (determinismo entre navegadores, medido en la F0). El ORDEN de la liga no vive
# aquí: lo manda TS (engine/roster.ts, del más simple al más caro) y Python no lo
# re-deriva. Paridad de ids TS↔Python: tests/unit/roster.test.ts.
_FACTORIES = {
    "logistic": lambda seed: LogisticRegression(max_iter=1000, random_state=seed),
    "logistic_balanced": lambda seed: LogisticRegression(
        max_iter=1000, random_state=seed, class_weight="balanced"
    ),
    "ridge": lambda seed: RidgeClassifier(random_state=seed),
    "naive_bayes": lambda seed: GaussianNB(),
    "linear_svc": lambda seed: LinearSVC(random_state=seed),
    "decision_tree": lambda seed: DecisionTreeClassifier(
        random_state=seed, min_samples_leaf=5
    ),
    "knn": lambda seed: KNeighborsClassifier(),
    "hgb": lambda seed: HistGradientBoostingClassifier(random_state=seed),
    "lightgbm": _lightgbm,
    "xgboost": _xgboost,
    "extra_trees": lambda seed: ExtraTreesClassifier(
        n_estimators=200, random_state=seed, n_jobs=1
    ),
    "forest": lambda seed: RandomForestClassifier(
        n_estimators=200, random_state=seed, n_jobs=1
    ),
    "forest_balanced": lambda seed: RandomForestClassifier(
        n_estimators=200, random_state=seed, n_jobs=1, class_weight="balanced"
    ),
    # F0-4: con max_iter=300 no convergía en NINGÚN dataset medido; con parada
    # temprana converge siempre y cuesta ~8× menos.
    "mlp": lambda seed: MLPClassifier(
        hidden_layer_sizes=(64,), max_iter=500, early_stopping=True,
        n_iter_no_change=10, random_state=seed,
    ),
}


def _xgboost_regressor(seed):
    from xgboost import XGBRegressor

    return XGBRegressor(
        n_estimators=200, max_depth=6, learning_rate=0.1, tree_method="hist",
        n_jobs=1, random_state=seed, verbosity=0,
    )


def _lightgbm_regressor(seed):
    from lightgbm import LGBMRegressor

    return LGBMRegressor(n_estimators=200, n_jobs=1, random_state=seed, verbose=-1)


def _scaled_target(estimator):
    # S6 F0 (spike): Lasso y el MLP NO son invariantes a la escala del objetivo
    # (la penalización L1 y el paso de adam se miden en unidades de y). Sin esto el
    # MLP no convergía (MAE 290 frente a 32 en consumo) y predecía ≈ 0 en precio.
    return TransformedTargetRegressor(regressor=estimator, transformer=StandardScaler())


# S6 (ADR-013): el roster de REGRESIÓN. Mismos ids que en clasificación donde el
# modelo es el mismo (comparten ficha); `linear` y `lasso` son nuevos. Hiperparámetros
# fijos, semilla y un hilo, medidos en el spike de la F0 del S6.
_REGRESSORS = {
    "linear": lambda seed: LinearRegression(),
    "ridge": lambda seed: Ridge(),
    "lasso": lambda seed: _scaled_target(
        Lasso(alpha=0.01, max_iter=5000, random_state=seed)
    ),
    "decision_tree": lambda seed: DecisionTreeRegressor(
        random_state=seed, min_samples_leaf=5
    ),
    "knn": lambda seed: KNeighborsRegressor(),
    "hgb": lambda seed: HistGradientBoostingRegressor(random_state=seed),
    "lightgbm": _lightgbm_regressor,
    "xgboost": _xgboost_regressor,
    "extra_trees": lambda seed: ExtraTreesRegressor(
        n_estimators=200, random_state=seed, n_jobs=1
    ),
    "forest": lambda seed: RandomForestRegressor(
        n_estimators=200, random_state=seed, n_jobs=1
    ),
    "mlp": lambda seed: _scaled_target(
        MLPRegressor(
            hidden_layer_sizes=(64,), max_iter=500, early_stopping=True,
            n_iter_no_change=10, random_state=seed,
        )
    ),
}

# plantilla:fin fabricas


# --- S7: agrupar sin objetivo (ADR 016) --------------------------------------
#
# Sin objetivo no hay prueba que proteger: el preprocesador se ajusta sobre TODAS
# las filas (la UI y la model card lo declaran). Lo que «sirve para creer» es la
# lectura del ganador contra la REFERENCIA NULA (el mismo agrupador, con su k, sobre
# datos uniformes en la caja de la muestra rotada por PCA: estadístico gap,
# Tibshirani 2001) y la ESTABILIDAD por re-muestreo. Constantes fijadas en el STOP
# de la F0 con el spike (sprints/SPRINT_007-spike-catalogo.md §2.2 y §3); espejo en
# engine/verdict.ts y engine/roster.ts, paridad en tests/unit/roster.test.ts.

CLUSTER_K_MIN = 2
CLUSTER_K_MAX = 10
# Con al menos tantas numéricas, la distancia usa SOLO las numéricas: en el spike el
# one-hot de las categóricas fabricaba grupos. Las categóricas describen los perfiles.
CLUSTER_MIN_NUMERIC = 2
# HDBSCAN: tamaño mínimo de grupo = max(5, n/50) (spike: 3 de 3 plantados).
HDBSCAN_MIN_CLUSTER_SIZE = 5
HDBSCAN_ROWS_PER_MIN_CLUSTER = 50
KMEANS_N_INIT = 5
# La silueta se mide sobre UNA muestra sembrada que comparten todos los agrupadores
# y todos los k (O(n²) en memoria sobre todas las filas).
SILHOUETTE_SAMPLE = 2000
STABILITY_RUNS = 10
STABILITY_FRACTION = 0.8
NULL_DRAWS = 3
# La lectura: «los grupos existen» si el gap ≥ 0,10 y el ARI medio ≥ 0,7;
# «frágiles» si el gap alcanza y el ARI no; «no hay estructura» si el gap no alcanza.
CLUSTER_GAP_MIN = 0.10
CLUSTER_STABILITY_MIN = 0.7
# Por encima, Agglomerative (O(n²) en memoria) se ajusta sobre una muestra sembrada
# de este tamaño y asigna el resto al grupo más cercano — etiquetado, nunca oculto
# (decisión 8 del STOP de la F0).
AGGLO_MAX_ROWS = 8000
# Cuántas columnas «que más separan» se nombran (de mostrar, no de decidir).
SEPARATING_TOP = 3


def _hdbscan_min_size(n):
    return max(HDBSCAN_MIN_CLUSTER_SIZE, n // HDBSCAN_ROWS_PER_MIN_CLUSTER)


def _k_cap(n):
    """El k más alto que la estabilidad puede medir: la submuestra (f·n filas)
    necesita al menos k + 1 filas para la silueta y el ARI."""
    return min(CLUSTER_K_MAX, int(STABILITY_FRACTION * n) - 1)


def _relabel_by_size(labels):
    """Grupos 0..k−1 del más grande al más chico (empate: el de etiqueta menor); el
    ruido (−1) se queda. Devuelve las etiquetas nuevas y old→new."""
    groups = [g for g in np.unique(labels) if g >= 0]
    order = sorted(groups, key=lambda g: (-int((labels == g).sum()), int(g)))
    mapping = {int(old): new for new, old in enumerate(order)}
    out = np.array([mapping.get(int(v), -1) for v in labels], dtype=int)
    return out, mapping


def _sample_silhouette(ctx, labels):
    """Silueta sobre la muestra compartida, sin el ruido. None si no hay dos grupos."""
    idx = ctx["sample"]
    labs = labels[idx]
    keep = labs >= 0
    idx, labs = idx[keep], labs[keep]
    groups = len(np.unique(labs))
    if groups < 2 or groups >= len(idx):
        return None
    return float(silhouette_score(ctx["Z"][idx], labs))


def _sizes(labels):
    return [int((labels == g).sum()) for g in range(int(labels.max()) + 1)] if (labels >= 0).any() else []


def _cluster_row(name, k_by):
    return {
        "name": name,
        "status": "ok",
        "error_type": None,
        "k": None,
        "k_by": k_by,
        "silhouette_by_k": None,
        "bic_by_k": None,
        "silhouette": None,
        "noise_share": None,
        "score": None,
        "sizes": None,
        "sample_rows": None,
    }


def _finish(row, labels, silhouette, refit, rows, extra=None):
    """Cierra la fila de un agrupador con su configuración elegida."""
    labels, mapping = _relabel_by_size(labels)
    noise = float((labels < 0).mean())
    k = int(len([g for g in np.unique(labels) if g >= 0]))
    row["k"] = k
    row["sizes"] = _sizes(labels)
    row["silhouette"] = silhouette
    if row["k_by"] == "density":
        row["noise_share"] = noise
    if k < 2 or silhouette is None:
        row["status"] = "no-structure"
    else:
        row["score"] = silhouette * (1.0 - noise)
    return {
        "row": row,
        "labels": labels,
        "mapping": mapping,
        "refit": refit,
        "stability_rows": rows,
        **(extra or {}),
    }


def _sweep_kmeans(ctx):
    """K-Means: k por silueta máxima (empate → el k menor)."""
    row = _cluster_row("kmeans", "silhouette")
    by_k, best = [], None
    for k in ctx["ks"]:
        labels = KMeans(n_clusters=k, n_init=KMEANS_N_INIT, random_state=ctx["seed"]).fit(
            ctx["Z"]
        ).labels_
        s = _sample_silhouette(ctx, labels)
        by_k.append({"k": k, "silhouette": s})
        if s is not None and (best is None or s > best[1]):
            best = (k, s, labels)
    row["silhouette_by_k"] = by_k
    if best is None:
        row["status"] = "no-structure"
        return {"row": row}
    k_b = best[0]
    return _finish(
        row, best[2], best[1],
        lambda Z, seed: KMeans(n_clusters=k_b, n_init=KMEANS_N_INIT, random_state=seed).fit(Z).labels_,
        np.arange(ctx["n"]),
    )


def _ward_labels(Z, k):
    return fcluster(linkage(Z, method="ward"), k, criterion="maxclust") - 1


def _nearest(Z, centroids):
    """Índice del centroide más cercano (euclídea) y su distancia, por fila. Con la
    forma expandida ‖z‖² − 2 z·c + ‖c‖²: memoria filas × grupos, no × columnas."""
    d2 = (Z**2).sum(axis=1)[:, None] - 2.0 * (Z @ centroids.T) + (centroids**2).sum(axis=1)[None, :]
    d2 = np.maximum(d2, 0.0)
    nearest = d2.argmin(axis=1)
    return nearest, np.sqrt(d2[np.arange(len(Z)), nearest])


def _group_centroids(Z, labels, k):
    return np.array([Z[labels == g].mean(axis=0) for g in range(k)])


def _sweep_agglomerative(ctx):
    """Agglomerative (ward): UN linkage, cortado para cada k (silueta máxima). Con
    más de AGGLO_MAX_ROWS filas, el linkage se ajusta sobre una muestra sembrada de
    ese tamaño y el resto va al centroide más cercano — `sample_rows` lo declara."""
    row = _cluster_row("agglomerative", "silhouette")
    Z, n = ctx["Z"], ctx["n"]
    if n > AGGLO_MAX_ROWS:
        rng = np.random.default_rng(ctx["seed"] + 3000)
        base = np.sort(rng.choice(n, AGGLO_MAX_ROWS, replace=False))
        row["sample_rows"] = AGGLO_MAX_ROWS
    else:
        base = np.arange(n)
    L = linkage(Z[base], method="ward")
    by_k, best = [], None
    for k in ctx["ks"]:
        base_labels = fcluster(L, k, criterion="maxclust") - 1
        if len(base) == n:
            labels = base_labels
        else:
            found = int(base_labels.max()) + 1
            labels = _nearest(Z, _group_centroids(Z[base], base_labels, found))[0]
            labels[base] = base_labels
        s = _sample_silhouette(ctx, labels)
        by_k.append({"k": k, "silhouette": s})
        if s is not None and (best is None or s > best[1]):
            best = (k, s, labels)
    row["silhouette_by_k"] = by_k
    if best is None:
        row["status"] = "no-structure"
        return {"row": row}
    k_b = best[0]
    # La estabilidad re-muestrea dentro de las filas del linkage (en modo muestra,
    # la muestra): re-ajustar sobre más no cabría.
    return _finish(row, best[2], best[1], lambda Zr, seed: _ward_labels(Zr, k_b), base)


def _sweep_gmm(ctx):
    """Mezcla gaussiana: k por BIC mínimo (empate → el k menor). Un k que no se
    puede ajustar (covarianza degenerada) se salta; sin ninguno, el miembro falla."""
    row = _cluster_row("gmm", "bic")
    by_k, best, last_error = [], None, None
    for k in ctx["ks"]:
        try:
            gm = GaussianMixture(n_components=k, random_state=ctx["seed"]).fit(ctx["Z"])
        except Exception as error:  # noqa: BLE001 — solo el tipo
            last_error = error
            continue
        bic = float(gm.bic(ctx["Z"]))
        by_k.append({"k": k, "bic": bic})
        if best is None or bic < best[1]:
            best = (k, bic, gm)
    if best is None:
        raise last_error
    row["bic_by_k"] = by_k
    k_b, _, gm = best
    labels = gm.predict(ctx["Z"])
    swept = _finish(
        row, labels, _sample_silhouette(ctx, labels),
        lambda Z, seed: GaussianMixture(n_components=k_b, random_state=seed).fit(Z).predict(Z),
        np.arange(ctx["n"]),
        {"gmm": gm},
    )
    if row["status"] == "ok" and not gm.converged_:
        row["status"] = "no-converge"
    return swept


def _sweep_hdbscan(ctx):
    """HDBSCAN: sin k que elegir; los grupos los da la densidad, con tamaño mínimo
    max(5, n/50). El ruido (−1) es «fuera de todo grupo» y el puntaje lo castiga:
    silueta sin el ruido × (1 − cuota de ruido)."""
    row = _cluster_row("hdbscan", "density")
    mcs = _hdbscan_min_size(ctx["n"])
    # S7 (AU-S7-02, decisión 1 del usuario): la regla de tamaño max(5, n/50) se aplica a las
    # filas de CADA ajuste —el barrido, la referencia nula y cada re-muestreo—. Con el tamaño
    # del total, la nula (sobre la muestra de 2.000) no encontraba ningún grupo, valía 0 y la
    # lectura «existen» se daba sin comparar contra datos sin estructura.
    refit = lambda Z, seed: HDBSCAN(min_cluster_size=_hdbscan_min_size(len(Z))).fit(Z).labels_
    if ctx["n"] < mcs:
        # S7 (AU-S7-30): menos filas que el tamaño mínimo de un grupo: todas quedan fuera de
        # todo grupo («sin estructura»), en vez de un error de sklearn.
        return _finish(row, np.full(ctx["n"], -1), None, refit, np.arange(ctx["n"]))
    labels = HDBSCAN(min_cluster_size=mcs).fit(ctx["Z"]).labels_
    return _finish(
        row, labels, _sample_silhouette(ctx, labels),
        refit,
        np.arange(ctx["n"]),
    )


# Los agrupadores, con su barrido. El ORDEN lo manda TS (engine/roster.ts).
_CLUSTERERS = {
    "kmeans": _sweep_kmeans,
    "agglomerative": _sweep_agglomerative,
    "gmm": _sweep_gmm,
    "hdbscan": _sweep_hdbscan,
}


def select_consensus(league):
    """El ganador entre agrupadores (decisión 4 del STOP de la F0; espejo EXACTO de
    selectClusterWinner en engine/verdict.ts, que lo recalcula): el k en el que
    coinciden más agrupadores `ok` (empate → el k cuyo mejor miembro tiene más
    puntaje; luego el k menor) y, entre ellos, el de mayor puntaje (empate → el
    primero del orden). Sin ninguno `ok`, la liga está vacía."""
    eligible = [row for row in league if row["status"] == "ok"]
    if not eligible:
        raise RuntimeError("league-empty")
    by_k = {}
    for row in eligible:
        by_k.setdefault(row["k"], []).append(row)
    k = max(by_k, key=lambda k: (len(by_k[k]), max(r["score"] for r in by_k[k]), -k))
    winner = None
    for row in by_k[k]:
        if winner is None or row["score"] > winner["score"]:
            winner = row
    return {"k": k, "votes": len(by_k[k]), "voters": len(eligible), "winner": winner["name"]}


def _reading_level(gap, ari_mean):
    """Espejo EXACTO de computeClusterReading (engine/verdict.ts)."""
    if gap >= CLUSTER_GAP_MIN and ari_mean >= CLUSTER_STABILITY_MIN:
        return "exist"
    if gap >= CLUSTER_GAP_MIN:
        return "fragile"
    return "none"


def _null_score(ctx, refit):
    """El mismo agrupador, con su configuración, sobre NULL_DRAWS conjuntos uniformes
    en la caja de la muestra rotada por PCA (mismo tamaño que la muestra)."""
    Zs = ctx["Z"][ctx["sample"]]
    mu = Zs.mean(axis=0)
    _, _, Vt = np.linalg.svd(Zs - mu, full_matrices=False)
    rot = (Zs - mu) @ Vt.T
    lo, hi = rot.min(axis=0), rot.max(axis=0)
    rng = np.random.default_rng(ctx["seed"] + 2000)
    scores = []
    for _ in range(NULL_DRAWS):
        Zn = rng.uniform(lo, hi, size=rot.shape) @ Vt + mu
        labels = refit(Zn, ctx["seed"])
        keep = labels >= 0
        groups = len(np.unique(labels[keep]))
        if keep.sum() < 3 or groups < 2 or groups >= keep.sum():
            scores.append(0.0)
            continue
        scores.append(float(silhouette_score(Zn[keep], labels[keep])) * float(keep.mean()))
    return float(np.mean(scores))


def _stability(ctx, swept):
    """STABILITY_RUNS submuestras sembradas (fracción STABILITY_FRACTION de las filas
    del ajuste), cada una re-ajustada con la misma configuración; ARI contra las
    etiquetas del ajuste completo en las filas compartidas (el ruido es una etiqueta)."""
    base = swept["stability_rows"]
    rng = np.random.default_rng(ctx["seed"] + 1000)
    aris = []
    for r in range(STABILITY_RUNS):
        idx = base[np.sort(rng.choice(len(base), int(STABILITY_FRACTION * len(base)), replace=False))]
        labels = swept["refit"](ctx["Z"][idx], ctx["seed"] + 1 + r)
        aris.append(float(adjusted_rand_score(swept["labels"][idx], labels)))
    return {
        "ari_mean": float(np.mean(aris)),
        "ari_min": float(np.min(aris)),
        "runs": STABILITY_RUNS,
        "fraction": STABILITY_FRACTION,
    }


def _eta_squared(values, labels):
    """Parte de la varianza de una numérica que explican los grupos (0..1)."""
    keep = ~np.isnan(values)
    x, g = values[keep], labels[keep]
    if len(x) < 2 or len(np.unique(g)) < 2:
        return 0.0
    total = float(((x - x.mean()) ** 2).sum())
    if total <= 0:
        return 0.0
    between = sum(
        float((g == v).sum()) * (float(x[g == v].mean()) - float(x.mean())) ** 2
        for v in np.unique(g)
    )
    return min(1.0, between / total)


def _cramers_v(values, labels):
    """Asociación de una categórica con los grupos (V de Cramér, 0..1)."""
    keep = values.notna().to_numpy()
    if keep.sum() < 2:
        return 0.0
    table = pd.crosstab(labels[keep], values[keep].to_numpy())
    if min(table.shape) < 2:
        return 0.0
    chi2 = chi2_contingency(table.to_numpy(), correction=False)[0]
    return float(min(1.0, math.sqrt(chi2 / (table.to_numpy().sum() * (min(table.shape) - 1)))))


def _cluster_profiles(ctx, labels):
    """Perfil de cada grupo en las unidades del usuario (medias y modas sobre los
    valores CRUDOS, no los escalados) y las columnas que más lo separan. Son datos
    del usuario: viven solo en el navegador (regla dura 2)."""
    df, n = ctx["df"], ctx["n"]
    numeric, categorical = ctx["profile_numeric"], ctx["profile_categorical"]
    groups = []
    for g in range(int(labels.max()) + 1 if (labels >= 0).any() else 0):
        mask = labels == g
        size = int(mask.sum())
        num = {}
        for col in numeric:
            values = df[col].to_numpy(dtype=float)[mask]
            values = values[~np.isnan(values)]
            num[col] = float(values.mean()) if len(values) else None
        cat = {}
        for col in categorical:
            values = df[col][mask].dropna()
            if len(values) == 0:
                cat[col] = None
                continue
            counts = values.astype(str).value_counts()
            # La más frecuente; a igual cuenta, la primera en orden (determinista).
            top = sorted(counts.index, key=lambda v: (-int(counts[v]), v))[0]
            cat[col] = {"mode": str(top), "share": float(counts[top] / len(values))}
        groups.append({"group": g, "size": size, "share": size / n, "numeric": num, "categorical": cat})
    noise_size = int((labels < 0).sum())
    keep = labels >= 0
    strengths = [
        {"column": col, "kind": "numeric",
         "strength": _eta_squared(df[col].to_numpy(dtype=float)[keep], labels[keep])}
        for col in numeric
    ] + [
        {"column": col, "kind": "categorical",
         "strength": _cramers_v(df[col][keep].reset_index(drop=True), labels[keep])}
        for col in categorical
    ]
    separating = sorted(strengths, key=lambda s: -s["strength"])[:SEPARATING_TOP]
    return {
        "groups": groups,
        "noise": {"size": noise_size, "share": noise_size / n} if noise_size else None,
        "separating": separating,
    }


_ASSIGN_METHOD = {
    "kmeans": "nearest-centroid",
    "agglomerative": "nearest-centroid",
    "gmm": "gaussian",
    "hdbscan": "centroid-radius",
}


def _cluster_rule(name, ctx, swept):
    """La regla con que se asigna una fila nueva (P12), sin filas de entrenamiento:
    K-Means y Agglomerative, el centroide más cercano; GMM, su mezcla gaussiana;
    HDBSCAN, el centroide más cercano SI la fila cae dentro del radio de ese grupo
    (el miembro más lejano en el ajuste) — si no, «fuera de todo grupo» (−1)."""
    Z, labels = ctx["Z"], swept["labels"]
    k = swept["row"]["k"]
    centroids = _group_centroids(Z, labels, k)
    method = _ASSIGN_METHOD[name]
    radii = None
    if method == "centroid-radius":
        radii = np.array([
            float(np.sqrt(((Z[labels == g] - centroids[g]) ** 2).sum(axis=1)).max())
            for g in range(k)
        ])
    rule = {
        "method": method,
        "centroids": centroids,
        "radii": radii,
        "gmm": swept.get("gmm"),
        # GMM predice sus componentes originales: se re-etiquetan como el ajuste.
        "mapping": swept["mapping"] if method == "gaussian" else None,
        "sample_rows": swept["row"]["sample_rows"],
    }
    return rule


def _gaussian(rule, Z):
    """La mezcla gaussiana restringida a los componentes que tuvieron filas en el
    ajuste (uno vacío no es un grupo): el grupo más probable y su probabilidad."""
    present = sorted(rule["mapping"])
    proba = rule["gmm"].predict_proba(Z)[:, present]
    proba = proba / proba.sum(axis=1, keepdims=True)
    best = proba.argmax(axis=1)
    groups = np.array([rule["mapping"][present[int(i)]] for i in best], dtype=int)
    return groups, proba.max(axis=1)


def _assign(rule, Z):
    """Aplica la regla de asignación: grupos 0..k−1 y −1 = fuera de todo grupo."""
    if rule["method"] == "gaussian":
        return _gaussian(rule, Z)[0]
    nearest, distance = _nearest(Z, rule["centroids"])
    if rule["method"] == "centroid-radius":
        nearest = np.where(distance <= rule["radii"][nearest], nearest, -1)
    return nearest


def _cluster_validate(p, *, league=True):
    """Valida el payload de agrupar (el lado que LEE del contrato TS → Python): sin
    objetivo ni partición — si alguno llega, se rechaza nombrándolo."""
    if not isinstance(p, dict):
        _contract("payload")
    for key in ("target", "train_idx", "test_idx", "primary_metric", "cv_k", "classes"):
        if key in p:
            _contract(key)
    for key in ("headers", "rows", "numeric", "categorical"):
        if not isinstance(p.get(key), list):
            _contract(key)
    for key in ("numeric", "categorical"):
        if any(not isinstance(c, str) or c not in p["headers"] for c in p[key]):
            _contract(key)
    if not _is_int(p.get("seed")):
        _contract("seed")
    # TS decide qué columnas forman la distancia; Python no la re-deriva, la coteja.
    numeric_distance = len(p["numeric"]) >= CLUSTER_MIN_NUMERIC
    expected = "numeric" if numeric_distance else "all"
    if p.get("distance") != expected or len(p["numeric"]) + len(p["categorical"]) == 0:
        _contract("distance")
    k_range = p.get("k_range")
    if not (
        isinstance(k_range, list)
        and len(k_range) == 2
        and all(_is_int(v) for v in k_range)
        and CLUSTER_K_MIN <= k_range[0] <= k_range[1] <= _k_cap(len(p["rows"]))
    ):
        _contract("k_range")
    if not _is_int(p.get("stability_runs")) or p["stability_runs"] != STABILITY_RUNS:
        _contract("stability_runs")
    if league:
        roster = p.get("roster")
        if (
            not isinstance(roster, list)
            or len(roster) == 0
            or len(set(roster)) != len(roster)
            or any(name not in _CLUSTERERS for name in roster)
        ):
            _contract("roster")
    elif p.get("member") not in _CLUSTERERS:
        _contract("member")


def _cluster_prepare(p):
    """Frame, distancia y muestra de la silueta. El preprocesador se ajusta sobre
    TODAS las filas: agrupar no tiene prueba (declarado)."""
    numeric, categorical = list(p["numeric"]), list(p["categorical"])
    df = _build_frame(p["headers"], p["rows"], numeric)
    distance_numeric = numeric
    distance_categorical = [] if p["distance"] == "numeric" else categorical
    features = distance_numeric + distance_categorical
    preprocessor = _make_preprocessor(
        distance_numeric,
        distance_categorical,
        _limpieza_of(p, distance_numeric, distance_categorical, filtrar=True),
    )
    Z = np.asarray(preprocessor.fit_transform(df[features]), dtype=float)
    n = len(df)
    rng = np.random.default_rng(int(p["seed"]))
    sample = np.sort(rng.choice(n, min(n, SILHOUETTE_SAMPLE), replace=False))
    return {
        "df": df,
        "Z": Z,
        "n": n,
        "seed": int(p["seed"]),
        "ks": list(range(p["k_range"][0], p["k_range"][1] + 1)),
        "sample": sample,
        "preprocessor": preprocessor,
        "distance_numeric": distance_numeric,
        "distance_categorical": distance_categorical,
        "profile_numeric": numeric,
        "profile_categorical": categorical,
    }


def _cluster_details(name, ctx, swept):
    """Lo que solo se calcula para el agrupador RETENIDO (el ganador o el elegido):
    la lectura, los perfiles y la regla de asignación. Puede lanzar: se llama ANTES
    de retener (AU-S5-07)."""
    score = swept["row"]["score"]
    null = _null_score(ctx, swept["refit"])
    stability = _stability(ctx, swept)
    gap = score - null
    rule = _cluster_rule(name, ctx, swept)
    agreement = float((_assign(rule, ctx["Z"]) == swept["labels"]).mean())
    _medianas, raras = _aprendido_por_columna(ctx["preprocessor"])
    rare = {col: raras[col] for col in ctx["distance_categorical"] if col in raras}
    return {
        "reading": {
            "level": _reading_level(gap, stability["ari_mean"]),
            "score": score,
            "null_score": null,
            "gap": gap,
            "stability": stability,
        },
        "profiles": _cluster_profiles(ctx, swept["labels"]),
        "assignment": {
            "method": rule["method"],
            "train_agreement": agreement,
            "sample_rows": rule["sample_rows"],
        },
        "preprocessing": {"rare_categories": rare},
        "_rule": rule,
    }


def _retain_cluster(ctx, swept, details):
    """Retiene el agrupador: el preprocesador, la regla de asignación (sin filas de
    entrenamiento) y el perfil de las columnas. Las etiquetas, aparte (P13)."""
    global _MODEL, _CLUSTER_LABELS
    rule = details["_rule"]
    schema = {
        "numeric": ctx["distance_numeric"],
        "categorical": ctx["distance_categorical"],
        "task": "agrupar",
        "groups": swept["row"]["k"],
        "noise": rule["method"] == "centroid-radius",
        "assign": {
            "method": rule["method"],
            "centroids": [[float(v) for v in c] for c in rule["centroids"]],
            "radii": None if rule["radii"] is None else [float(v) for v in rule["radii"]],
            "sample_rows": rule["sample_rows"],
        },
    }
    _MODEL = {
        "pipe": ctx["preprocessor"],
        "schema": schema,
        "training_profile": _training_profile(
            ctx["df"], ctx["distance_numeric"], ctx["distance_categorical"]
        ),
        "assign": {
            "method": rule["method"],
            "centroids": rule["centroids"],
            "radii": rule["radii"],
            "gmm": rule["gmm"],
            "mapping": rule["mapping"],
            "sample_rows": rule["sample_rows"],
        },
    }
    _CLUSTER_LABELS = [int(v) for v in swept["labels"]]


def _public(details):
    return {key: value for key, value in details.items() if not key.startswith("_")}


def run_clustering(p, on_progress=None):
    """Agrupar: cada agrupador barre su k sobre las MISMAS filas preprocesadas → el
    ganador por consenso → recién entonces su lectura (referencia nula +
    estabilidad), sus perfiles y su regla de asignación. Un agrupador que falla no
    tumba la liga (solo viaja el TIPO de error: regla dura 2)."""
    started = time.perf_counter()
    _cluster_validate(p)
    ctx = _cluster_prepare(p)
    order = list(p["roster"])
    total = len(order)

    def progress(phase, index, name):
        if on_progress is not None:
            on_progress(
                json.dumps({"phase": phase, "member": name, "index": index, "total": total})
            )

    league, swept_by_name = [], {}
    for index, name in enumerate(order):
        progress("cluster", index, name)
        t = time.perf_counter()
        try:
            swept = _CLUSTERERS[name](ctx)
            swept_by_name[name] = swept
            row = swept["row"]
        except Exception as error:  # noqa: BLE001 — se registra el TIPO, nunca el mensaje
            row = _cluster_row(name, _CLUSTER_K_BY[name])
            row["status"] = "error"
            row["error_type"] = type(error).__name__
        row["elapsed_ms"] = _elapsed_ms(t)
        league.append(row)

    consensus = select_consensus(league)
    winner = consensus.pop("winner")
    progress("stability", order.index(winner), winner)
    details = _cluster_details(winner, ctx, swept_by_name[winner])
    _retain_cluster(ctx, swept_by_name[winner], details)
    return json.dumps(
        {
            "task": "agrupar",
            "n_rows": ctx["n"],
            "distance": p["distance"],
            "silhouette_sample": int(len(ctx["sample"])),
            "k_range": list(p["k_range"]),
            "league": league,
            "consensus": consensus,
            "winner": winner,
            "model_name": winner,
            **_public(details),
            "elapsed_ms": _elapsed_ms(started),
        }
    )


_CLUSTER_K_BY = {
    "kmeans": "silhouette",
    "agglomerative": "silhouette",
    "gmm": "bic",
    "hdbscan": "density",
}


def fit_cluster_member(p):
    """Elección manual al agrupar (U1): re-barre UN agrupador con la misma semilla
    (reproduce su fila de la liga) y lo retiene con su lectura, sus perfiles y su
    regla. TS lo registra como «elegido por ti»."""
    _cluster_validate(p, league=False)
    ctx = _cluster_prepare(p)
    name = p["member"]
    swept = _CLUSTERERS[name](ctx)
    if swept["row"]["status"] not in ("ok", "no-converge"):
        raise RuntimeError("member-without-groups")
    details = _cluster_details(name, ctx, swept)
    _retain_cluster(ctx, swept, details)
    return json.dumps(
        {
            "task": "agrupar",
            "model_name": name,
            "k": swept["row"]["k"],
            "score": swept["row"]["score"],
            **_public(details),
        }
    )


def cluster_labels(payload_json="{}"):
    """S7 (P13): las etiquetas por fila del agrupamiento retenido, SOLO para el CSV
    local del usuario (jamás en un resultado, un esquema o un archivo exportado)."""
    if _CLUSTER_LABELS is None:
        raise RuntimeError("no-labels")
    return json.dumps({"labels": _CLUSTER_LABELS})


def _score_cluster(model, X):
    """S7: el grupo de cada fila nueva con la regla del modelo (−1 = fuera de todo
    grupo). Solo la mezcla gaussiana da una probabilidad (la del grupo asignado)."""
    Z = np.asarray(model["pipe"].transform(X), dtype=float)
    rule = model["assign"]
    groups = _assign(rule, Z)
    probabilities = None
    if rule["method"] == "gaussian":
        probabilities = [float(v) for v in _gaussian(rule, Z)[1]]
    return {
        "task": "agrupar",
        "predictions": [int(v) for v in groups],
        "probabilities": probabilities,
    }


# Un roster por tarea. `_FACTORIES` sigue siendo el de clasificación (el S5 lo
# referencia por nombre); este mapa los reúne sin copiarlos. S7: la multiclase usa
# los MISMOS 14 clasificadores (cada uno resuelve K clases en su forma nativa).
_FACTORIES_BY_TASK = {
    "binaria": _FACTORIES,
    "multiclase": _FACTORIES,
    "numerica": _REGRESSORS,
    # S7 (ADR 016): los agrupadores (su sección, justo arriba).
    "agrupar": _CLUSTERERS,
}


def roster_ids(payload_json="{}"):
    """Ids del roster de una tarea (ordenados) — para la paridad TS↔Python.
    Sin `task`, el de clasificación binaria (lo que el S5 preguntaba)."""
    task = _task_of(json.loads(payload_json or "{}"))
    return json.dumps(sorted(_FACTORIES_BY_TASK[task]))


def metric_directions(payload_json="{}"):
    """METRIC_DIRECTION + TASK_METRICS — para la paridad con engine/verdict.ts."""
    return json.dumps(
        {"direction": METRIC_DIRECTION, "task_metrics": {k: list(v) for k, v in TASK_METRICS.items()}}
    )


# plantilla:inicio despacho
def _contract(field):
    # El lado que LEE del contrato rechaza NOMBRANDO el campo (regla 15). Nunca
    # lleva valores del payload: solo el nombre del campo, que es de la app.
    raise ValueError(f"contract:{field}")


def _task_of(record):
    """EL único «sin tarea = binaria» de este archivo (espejo de `taskOf` en
    engine/despacho.ts): los payloads y esquemas del S5 no la traían."""
    return record.get("task", "binaria")


def _by_task(task, branches):
    """Despacho EXHAUSTIVO por tarea (S7, P2; espejo de engine/despacho.ts). Cada
    sitio escribe la rama de TODAS las tareas de `_FACTORIES_BY_TASK`: si falta
    una, falla aunque la pedida sea otra — registrar «multiclase» sin escribir sus
    ramas rompe la primera corrida de cualquier tarea en vez de binarizar en
    silencio (ds S6, AU-S6-03). La tarea pedida sin rama es un error de contrato
    que NOMBRA el campo, jamás la binaria por descarte; por eso se mira primero."""
    if task not in branches:
        _contract("task")
    if set(branches) != set(_FACTORIES_BY_TASK):
        raise RuntimeError("dispatch-incomplete")
    return branches[task]


def _supervised():
    """Rama de una tarea con objetivo donde no hay nada que hacer."""


def _supervised_only():
    """La rama de agrupar en un camino supervisado: inalcanzable (run_experiment y
    fit_member despachan antes por tarea); si llega igual, se nombra la tarea."""
    _contract("task")


# plantilla:fin despacho


def _route_task(p):
    """La tarea con que se despacha un payload ENTRANTE. Sin `task` (o con uno que
    no es texto), la rama supervisada lo valida y lo rechaza nombrando el campo."""
    task = _task_of(p) if isinstance(p, dict) else None
    return task if isinstance(task, str) else _task_of({})


def _is_int(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _validate_payload(p, *, league=True):
    """Valida el payload TS → Python antes de tocar los datos."""
    if not isinstance(p, dict):
        _contract("payload")
    for key in ("headers", "rows", "numeric", "categorical", "train_idx", "test_idx"):
        if not isinstance(p.get(key), list):
            _contract(key)
    if not isinstance(p.get("target"), str) or p["target"] not in p["headers"]:
        _contract("target")
    if not _is_int(p.get("seed")):
        _contract("seed")
    # S6: la tarea manda sobre todo lo demás (qué métricas y qué roster valen).
    task = p.get("task")
    if not isinstance(task, str) or task not in _FACTORIES_BY_TASK:
        _contract("task")
    # S7: agrupar no tiene objetivo ni prueba; su payload entra por run_clustering.
    _by_task(task, {
        "binaria": _supervised,
        "multiclase": _supervised,
        "numerica": _supervised,
        "agrupar": _supervised_only,
    })()
    factories = _FACTORIES_BY_TASK[task]
    if p.get("primary_metric") not in TASK_METRICS[task]:
        _contract("primary_metric")
    # S6 (AU-S6-08): con menos filas de prueba no hay métricas que creer (el R² de
    # una sola fila es NaN y rompe el JSON). TS lo rechaza antes con su propio texto.
    # La binaria no tenía tope propio (su texto vive en TS): 0 conserva la conducta.
    min_test = _by_task(task, {
        "binaria": 0,
        "multiclase": 0,
        "numerica": MIN_REGRESSION_TEST_ROWS,
        "agrupar": 0,
    })
    if len(p["test_idx"]) < min_test:
        _contract("test_idx")
    # S7: las clases viajan SOLO con varias categorías (TS las calcula y Python las
    # coteja con los datos en _multiclass_target).
    _by_task(task, {
        "binaria": lambda: "classes" in p and _contract("classes"),
        "multiclase": lambda: _validate_classes(p.get("classes")),
        "numerica": lambda: "classes" in p and _contract("classes"),
        "agrupar": _supervised_only,
    })()
    if league:
        roster = p.get("roster")
        if (
            not isinstance(roster, list)
            or len(roster) == 0
            or len(set(roster)) != len(roster)
            or any(name not in factories for name in roster)
        ):
            _contract("roster")
        if not _is_int(p.get("cv_k")) or p["cv_k"] < 2:
            _contract("cv_k")
    elif p.get("member") not in factories:
        _contract("member")


def _validate_classes(classes):
    """S7: una lista de 3 a MULTICLASS_MAX_CLASSES textos, antes de tocar los datos.
    Que sean distintas, en orden y LAS de los datos lo exige _multiclass_target (son
    exactamente los valores distintos ordenados): repetirlo aquí no podría fallar
    nunca por sí solo («¿puede fallar siquiera?»)."""
    if (
        not isinstance(classes, list)
        or not all(isinstance(c, str) for c in classes)
        or not MULTICLASS_MIN_CLASSES <= len(classes) <= MULTICLASS_MAX_CLASSES
    ):
        _contract("classes")


# plantilla:inicio objetivos
def _decimals(text):
    """Decimales escritos en un valor del objetivo (para mostrar predicciones con la
    precisión con que el usuario anotó sus datos). Notación científica ⇒ el tope."""
    if text is None:
        return 0
    value = str(text).strip().lower()
    # Notación científica: los decimales que de verdad escribe («1.5e2» = 150 →
    # 0; «1.5e-3» = 0,0015 → 4), no el tope (AU-S6-31).
    scientific = re.fullmatch(r"[+-]?\d*(?:\.(\d*))?e([+-]?\d+)", value)
    if scientific:
        written = len(scientific.group(1) or "") - int(scientific.group(2))
        return min(max(written, 0), TARGET_DECIMALS_MAX)
    if "e" in value:
        return TARGET_DECIMALS_MAX
    return min(len(value.split(".", 1)[1]), TARGET_DECIMALS_MAX) if "." in value else 0


TARGET_DECIMALS_MAX = 6


def _target_stats(y_train, raw_train):
    """S6: el objetivo en TRAIN (jamás test): para el veredicto en unidades y para
    formatear las predicciones. Vive solo en el navegador (regla dura 2)."""
    return {
        "mean": float(np.mean(y_train)),
        "std": float(np.std(y_train, ddof=1)) if len(y_train) > 1 else 0.0,
        "min": float(np.min(y_train)),
        "max": float(np.max(y_train)),
        "median": float(np.median(y_train)),
        "decimals": int(max((_decimals(v) for v in raw_train), default=0)),
    }


def _binary_target(df, p):
    """Objetivo binario → 0/1. Positiva = la clase MINORITARIA (el evento de
    interés); empate → la mayor lexicográficamente (determinista)."""
    target = df[p["target"]].astype("string")
    counts = target.value_counts()
    classes = sorted(counts.index.tolist())
    positive = min(classes, key=lambda c: (counts[c], [-ord(ch) for ch in c]))
    y = (target == positive).astype(int).to_numpy()
    return y, classes, positive, None


def _multiclass_target(df, p):
    """S7: el objetivo 0..K−1 en el orden de `classes` (XGBoost exige esa forma).
    Las clases las manda TS; si los datos traen otras, el contrato se rompe
    nombrando el campo (sin valores: regla dura 2)."""
    target = df[p["target"]].astype("string")
    classes = list(p["classes"])
    if sorted(target.dropna().unique().tolist()) != classes:
        _contract("classes")
    index = {c: i for i, c in enumerate(classes)}
    y = target.map(index).astype(int).to_numpy()
    return y, classes, None, None


def _numeric_target(df, p, train_idx):
    """S6: el objetivo en sus unidades (float) y su resumen en TRAIN."""
    y = pd.to_numeric(df[p["target"]], errors="coerce").to_numpy(dtype=float)
    # TS valida que todo el objetivo sea numérico; si llega otra cosa, se nombra
    # el campo (sin valores: regla dura 2).
    if not np.all(np.isfinite(y)):
        _contract("target")
    stats = _target_stats(y[train_idx], df[p["target"]].iloc[train_idx].tolist())
    return y, None, None, stats


def _limpieza_of(p, numeric, categorical, filtrar=False):
    """S18: el plan de limpieza aprobado que manda la app, validado (nombra el campo, jamás valores) o None.
    Con `filtrar` (agrupar: la distancia puede dejar fuera las categóricas) se quedan solo las columnas que se usan."""
    spec = p.get("limpieza")
    if spec is None:
        return None
    claves = ("indicador_vacio", "sin_dato", "cuantiles")
    if not isinstance(spec, dict) or set(spec) != set(claves):
        _contract("limpieza")
    for clave in claves:
        if not isinstance(spec[clave], list) or not all(isinstance(c, str) for c in spec[clave]):
            _contract("limpieza")
    if filtrar:
        return {
            "indicador_vacio": [c for c in spec["indicador_vacio"] if c in numeric],
            "cuantiles": [c for c in spec["cuantiles"] if c in numeric],
            "sin_dato": [c for c in spec["sin_dato"] if c in categorical],
        }
    if (
        not set(spec["indicador_vacio"]) <= set(numeric)
        or not set(spec["cuantiles"]) <= set(numeric)
        or not set(spec["sin_dato"]) <= set(categorical)
    ):
        _contract("limpieza")
    return spec


def _prepare(p):
    """Frame, objetivo y partición — compartido por la liga y fit_member. Binaria:
    objetivo 0/1. Numérica (S6): el objetivo en sus unidades (float)."""
    numeric = list(p["numeric"])
    categorical = list(p["categorical"])
    features = numeric + categorical
    df = _build_frame(p["headers"], p["rows"], numeric)
    task = p["task"]
    train_idx = np.array(p["train_idx"], dtype=int)
    test_idx = np.array(p["test_idx"], dtype=int)

    y, classes, positive, stats = _by_task(task, {
        "binaria": lambda: _binary_target(df, p),
        "multiclase": lambda: _multiclass_target(df, p),
        "numerica": lambda: _numeric_target(df, p, train_idx),
        "agrupar": _supervised_only,
    })()

    X = df[features]
    return {
        "task": task,
        "target_stats": stats,
        "factories": _FACTORIES_BY_TASK[task],
        "numeric": numeric,
        "categorical": categorical,
        "features": features,
        "classes": classes,
        "positive": positive,
        "y": y,
        "train_idx": train_idx,
        "test_idx": test_idx,
        "X_train": X.iloc[train_idx],
        "X_test": X.iloc[test_idx],
        "y_train": y[train_idx],
        "y_test": y[test_idx],
        "seed": int(p["seed"]),
        "metric": p["primary_metric"],
        "preprocessor": _make_preprocessor(numeric, categorical, _limpieza_of(p, numeric, categorical)),
    }


def _member_pipe(name, ctx):
    return Pipeline(
        [("prep", clone(ctx["preprocessor"])), ("model", ctx["factories"][name](ctx["seed"]))]
    )


# plantilla:fin objetivos


def _cross_validate(name, ctx, k, splits=None):
    """CV estratificada DENTRO de train. El preprocesador va DENTRO del Pipeline
    que se valida ⇒ se reajusta en cada fold y jamás ve las filas de validación
    de su fold (el test anti-fuga de la CV lo vigila con un espía). S6: con un
    objetivo continuo no hay clases que estratificar ⇒ KFold barajado; los folds
    de una métrica «menor es mejor» se devuelven en sus unidades (signo invertido).
    S12: con `splits` (pares de índices de entrenamiento y validación que arma el
    Protocolo según el esquema sellado) se usan esos pliegues; sin ellos, igual que
    siempre."""
    splitter = splits if splits is not None else _by_task(ctx["task"], {
        "binaria": lambda: StratifiedKFold(k, shuffle=True, random_state=ctx["seed"]),
        "multiclase": lambda: StratifiedKFold(k, shuffle=True, random_state=ctx["seed"]),
        "numerica": lambda: KFold(k, shuffle=True, random_state=ctx["seed"]),
        "agrupar": _supervised_only,
    })()
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        cv = cross_validate(
            _member_pipe(name, ctx),
            ctx["X_train"],
            ctx["y_train"],
            cv=splitter,
            scoring=SCORER[ctx["metric"]],
            error_score="raise",
        )
    sign = -1.0 if METRIC_DIRECTION[ctx["metric"]] == "lower" else 1.0
    folds = [sign * float(v) for v in cv["test_score"]]
    if not all(math.isfinite(v) for v in folds):
        raise ArithmeticError("non-finite-cv-score")
    converged = not any(issubclass(w.category, ConvergenceWarning) for w in caught)
    return {"mean": float(np.mean(folds)), "std": float(np.std(folds)), "folds": folds}, converged


def select_one_se(league, k, direction="higher"):
    """Regla de un error estándar (ESL §7.10; desviación D8 del plan, medida en la
    F0): entre los miembros `ok` que quedan a menos de un error estándar del mejor
    puntaje de CV, gana el PRIMERO del orden recibido (el más simple). `league`
    viene en el orden de TS. Espejo exacto: engine/roster.ts `selectOneSe` (TS
    rechaza el resultado si su cálculo no coincide). Devuelve (mejor, ganador, ee).
    S6: `direction` = "lower" para el MAE (el mejor es el mínimo y el umbral suma).
    """
    eligible = [row for row in league if row["status"] == "ok"]
    if not eligible:
        raise RuntimeError("league-empty")
    pick = min if direction == "lower" else max
    best = pick(eligible, key=lambda row: row["cv"]["mean"])  # empate → el primero
    se = best["cv"]["std"] / math.sqrt(k)
    if direction == "lower":
        threshold = best["cv"]["mean"] + se
        winner = next(row for row in eligible if row["cv"]["mean"] <= threshold)
    else:
        threshold = best["cv"]["mean"] - se
        winner = next(row for row in eligible if row["cv"]["mean"] >= threshold)
    return best["name"], winner["name"], se


# S6 (P6): puntos predicho-vs-real que viajan para el gráfico (tope de despliegue).
# Los cuantiles de residuos se calculan sobre TODO el test, no sobre la muestra.
PRED_VS_REAL_MAX = 200


def _pred_vs_real(y_true, y_pred):
    """Muestra DETERMINISTA del test, ordenada por el valor real: si hay más puntos
    que el tope, se toman a rangos equiespaciados (cubre todo el recorrido)."""
    order = np.argsort(y_true, kind="stable")
    n = len(order)
    if n > PRED_VS_REAL_MAX:
        order = order[np.unique(np.round(np.linspace(0, n - 1, PRED_VS_REAL_MAX)).astype(int))]
    return {
        "real": [float(v) for v in y_true[order]],
        "predicted": [float(v) for v in y_pred[order]],
        "n_total": int(n),
    }


def _residuals(y_true, y_pred):
    """Residuo = predicho − real, sobre TODO el test: la descripción textual del
    gráfico («la mitad de los errores está entre…») sale de aquí."""
    r = np.asarray(y_pred, dtype=float) - np.asarray(y_true, dtype=float)
    p05, p25, p50, p75, p95 = (float(v) for v in np.percentile(r, [5, 25, 50, 75, 95]))
    return {
        "p05": p05, "p25": p25, "p50": p50, "p75": p75, "p95": p95,
        "abs_p90": float(np.percentile(np.abs(r), 90)),
    }


def _selected_details(pipe, y_pred, ctx):
    """Lo que solo se calcula para el modelo SELECCIONADO: matriz de confusión
    (binaria) o predicho-vs-real y residuos (numérica), explicabilidad y lo que
    el preprocesamiento aprendió (de train)."""
    numeric, categorical = ctx["numeric"], ctx["categorical"]
    task_details = _by_task(ctx["task"], {
        "binaria": lambda: {
            "confusion_matrix": confusion_matrix(ctx["y_test"], y_pred, labels=[0, 1]).tolist()
        },
        "multiclase": lambda: _multiclass_details(ctx["y_test"], y_pred, len(ctx["classes"])),
        "numerica": lambda: {
            "pred_vs_real": _pred_vs_real(ctx["y_test"], y_pred),
            "residuals": _residuals(ctx["y_test"], y_pred),
        },
        "agrupar": _supervised_only,
    })()
    explainability = _explainability(
        pipe, ctx["X_test"], ctx["y_test"], ctx["features"], numeric, ctx["seed"], ctx["task"]
    )

    # Medianas del imputer numérico (para el test anti-fuga: deben provenir SOLO
    # de train — son idénticas entre miembros, mismo preprocesador).
    medianas, raras = _aprendido_por_columna(pipe.named_steps["prep"])
    learned_medians = {col: medianas[col] for col in numeric if col in medianas}

    # Categorías raras agrupadas por el OneHotEncoder (min_frequency, train-only).
    rare_categories = {col: raras[col] for col in categorical if col in raras}

    return {
        **task_details,
        "explainability": explainability,
        "preprocessing": {
            "numeric_medians": learned_medians,
            "rare_categories": rare_categories,
        },
    }


def _multiclass_details(y_true, y_pred, n_classes):
    """S7: la matriz K×K (filas = clase real, columnas = predicha, en el orden de
    `classes`) y las métricas de cada clase sobre TEST."""
    labels = list(range(n_classes))
    precision, recall, f1, support = precision_recall_fscore_support(
        y_true, y_pred, labels=labels, zero_division=0
    )
    return {
        "confusion_matrix": confusion_matrix(y_true, y_pred, labels=labels).tolist(),
        "per_class": [
            {
                "precision": float(precision[i]),
                "recall": float(recall[i]),
                "f1": float(f1[i]),
                "support": int(support[i]),
            }
            for i in labels
        ],
    }


def _retain(pipe, ctx, target):
    """S3/S4: retener el modelo SELECCIONADO (el que recibe el veredicto) + esquema
    + perfil de train — lo que score_new_data y export_model necesitan."""
    global _MODEL, _CLUSTER_LABELS
    _CLUSTER_LABELS = None
    schema = _by_task(ctx["task"], {
        "binaria": lambda: {
            "numeric": ctx["numeric"],
            "categorical": ctx["categorical"],
            "target": target,
            "classes": ctx["classes"],
            "positive_class": ctx["positive"],
            "task": "binaria",
        },
        "multiclase": lambda: {
            "numeric": ctx["numeric"],
            "categorical": ctx["categorical"],
            "target": target,
            "classes": ctx["classes"],
            "task": "multiclase",
        },
        "numerica": lambda: {
            "numeric": ctx["numeric"],
            "categorical": ctx["categorical"],
            "target": target,
            "task": "numerica",
            "target_stats": ctx["target_stats"],
        },
        "agrupar": _supervised_only,
    })()
    _MODEL = {
        "pipe": pipe,
        "schema": schema,
        "training_profile": _training_profile(
            ctx["X_train"], ctx["numeric"], ctx["categorical"]
        ),
        # S17: lo que la prueba de estrés lee (la prueba ya abierta y la escala de train). Vive solo en
        # memoria: export_model arma las claves del pickle una a una y esta no entra (vigilado por un test).
        "eval": _stress_eval(ctx),
    }


def _binary_baselines(ctx):
    """Los rivales honestos de la binaria: la clase mayoritaria y una logística."""
    baselines = {}
    for name, estimator in (
        ("majority", DummyClassifier(strategy="most_frequent")),
        ("logistic", LogisticRegression(max_iter=1000, random_state=ctx["seed"])),
    ):
        _, y_pred, y_score = _fit_score(
            estimator, clone(ctx["preprocessor"]), ctx["X_train"], ctx["y_train"], ctx["X_test"]
        )
        baselines[name] = _metrics(ctx["y_test"], y_pred, y_score)
    return baselines


def _multiclass_baselines(ctx):
    """S7: la clase mayoritaria y la logística multinomial — la MISMA fábrica que el
    miembro `logistic`, así su puntaje de prueba como miembro es el del baseline (TS
    lo coteja, como la lineal del S6)."""
    baselines = {}
    for name, estimator in (
        ("majority", DummyClassifier(strategy="most_frequent")),
        ("logistic", _FACTORIES["logistic"](ctx["seed"])),
    ):
        pipe = Pipeline([("prep", clone(ctx["preprocessor"])), ("model", estimator)])
        pipe.fit(ctx["X_train"], ctx["y_train"])  # <-- ajuste SOLO sobre train
        baselines[name] = _multiclass_metrics(
            ctx["y_test"], pipe.predict(ctx["X_test"]), _proba(pipe, ctx["X_test"]),
            len(ctx["classes"]),
        )
    return baselines


# plantilla:inicio metricas-multi
def _proba(pipe, X):
    """La matriz de probabilidades, o None si el modelo decide sin darlas (ridge, SVM
    lineal): no se inventan (S5)."""
    return pipe.predict_proba(X) if hasattr(pipe, "predict_proba") else None


def _multiclass_metrics(y_true, y_pred, proba, n_classes):
    """S7: métricas de TEST con K clases (las del spike de la F0). `log_loss` y
    `auc_ovr` necesitan probabilidades (null sin ellas); el AUC uno contra el resto,
    además, que la prueba tenga filas de todas las clases."""
    labels = list(range(n_classes))
    metrics = {
        "balanced_accuracy": float(balanced_accuracy_score(y_true, y_pred)),
        "f1_macro": float(
            f1_score(y_true, y_pred, average="macro", labels=labels, zero_division=0)
        ),
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "log_loss": None,
        "auc_ovr": None,
    }
    if proba is not None:
        metrics["log_loss"] = float(log_loss(y_true, proba, labels=labels))
        if len(np.unique(y_true)) == n_classes:
            metrics["auc_ovr"] = float(
                roc_auc_score(y_true, proba, multi_class="ovr", average="macro", labels=labels)
            )
    return metrics


# plantilla:fin metricas-multi


def _regression_baselines(ctx):
    """S6 (decisión del usuario en el STOP de la F0): con MAE la constante óptima es
    la MEDIANA (no la media), y la lineal es el rival estructural."""
    baselines = {}
    for name, estimator in (
        ("median", DummyRegressor(strategy="median")),
        ("linear", LinearRegression()),
    ):
        pipe = Pipeline([("prep", clone(ctx["preprocessor"])), ("model", estimator)])
        pipe.fit(ctx["X_train"], ctx["y_train"])  # <-- ajuste SOLO sobre train
        baselines[name] = _reg_metrics(ctx["y_test"], pipe.predict(ctx["X_test"]))
    return baselines


def _elapsed_ms(start):
    return int(round((time.perf_counter() - start) * 1000))


def run_experiment(payload_json, on_progress=None):
    """La entrada del comando «train»: la liga de una tarea con objetivo, o (S7)
    agrupar sin objetivo. El despacho es por tarea y exhaustivo."""
    p = json.loads(payload_json)
    return _by_task(_route_task(p), {
        "binaria": lambda: _run_league(p, on_progress),
        "multiclase": lambda: _run_league(p, on_progress),
        "numerica": lambda: _run_league(p, on_progress),
        "agrupar": lambda: run_clustering(p, on_progress),
    })()


def _run_league(p, on_progress=None):
    """La liga: CV de cada miembro (en el orden de TS) → selección por un error
    estándar → recién entonces se abre el test, UNA vez, para todos (F0-5: el
    test de los perdedores se calcula en la misma corrida, etiquetado «no sirve
    para elegir»). `on_progress(json)` se llama antes de cada paso (worker → UI).
    """
    started = time.perf_counter()
    _validate_payload(p)
    ctx = _prepare(p)
    k = int(p["cv_k"])
    # Binaria: k > clase minoritaria de train ⇒ hay folds sin positivos. Numérica:
    # k > filas de train ⇒ hay folds vacíos. TS ya lo acota; aquí se verifica.
    # Multiclase (S7): k > la clase más chica de train ⇒ hay folds sin esa clase.
    k_max = _by_task(ctx["task"], {
        "binaria": lambda: int(np.bincount(ctx["y_train"], minlength=2).min()),
        "multiclase": lambda: int(
            np.bincount(ctx["y_train"], minlength=len(ctx["classes"])).min()
        ),
        "numerica": lambda: len(ctx["train_idx"]),
        "agrupar": _supervised_only,
    })()
    if k > k_max:
        _contract("cv_k")
    order = list(p["roster"])
    total = len(order)

    def progress(phase, index, name):
        if on_progress is not None:
            on_progress(
                json.dumps({"phase": phase, "member": name, "index": index, "total": total})
            )

    # 1) Validación cruzada DENTRO de train. Un miembro que falla no tumba la
    #    liga: queda «error» con SOLO el tipo de la excepción (el mensaje puede
    #    traer valores del dataset — regla dura 2).
    league = []
    for index, name in enumerate(order):
        progress("cv", index, name)
        t = time.perf_counter()
        row = {"name": name, "status": "ok", "cv": None, "test": None, "error_type": None}
        try:
            row["cv"], converged = _cross_validate(name, ctx, k)
            if not converged:
                row["status"] = "no-converge"
        except Exception as error:  # noqa: BLE001 — se registra el TIPO, nunca el mensaje
            row["status"] = "error"
            row["error_type"] = type(error).__name__
        row["elapsed_ms"] = _elapsed_ms(t)
        league.append(row)

    # 2) Selección: solo con los puntajes de CV. El test todavía no se abrió.
    best, winner, se = select_one_se(league, k, METRIC_DIRECTION[ctx["metric"]])

    # 3) Recién ahora se abre el test: baselines (rivales honestos) y cada miembro
    #    ajustado en train completo. Solo el pipeline del ganador queda en memoria.
    X_train, y_train, X_test = ctx["X_train"], ctx["y_train"], ctx["X_test"]
    baselines = _by_task(ctx["task"], {
        "binaria": lambda: _binary_baselines(ctx),
        "multiclase": lambda: _multiclass_baselines(ctx),
        "numerica": lambda: _regression_baselines(ctx),
        "agrupar": _supervised_only,
    })()

    winner_pipe = winner_pred = None
    for index, row in enumerate(league):
        if row["status"] == "error":
            continue
        progress("test", index, row["name"])
        t = time.perf_counter()
        try:
            pipe = _member_pipe(row["name"], ctx).fit(X_train, y_train)
            y_pred = pipe.predict(X_test)
            row["test"] = _test_metrics(pipe, y_pred, ctx)
            if row["name"] == winner:
                winner_pipe, winner_pred = pipe, y_pred
        except Exception as error:  # noqa: BLE001
            if row["name"] == winner:
                raise RuntimeError("winner-fit-failed") from None
            # El estado de la CV NO cambia (la selección ya se hizo con él y TS la
            # recalcula); queda sin test y con el tipo del error.
            row["error_type"] = type(error).__name__
            row["test"] = None
        row["elapsed_ms"] += _elapsed_ms(t)

    winner_row = next(row for row in league if row["name"] == winner)
    # Los detalles pueden lanzar: se calculan ANTES de retener, para que el
    # modelo retenido sea siempre el del resultado que se devuelve (AU-S5-07).
    details = _selected_details(winner_pipe, winner_pred, ctx)
    _retain(winner_pipe, ctx, p["target"])

    task_fields = _by_task(ctx["task"], {
        "binaria": lambda: {
            "task": "binaria",
            "classes": ctx["classes"],
            "positive_class": ctx["positive"],
            "positive_rate": float(ctx["y"].mean()),
        },
        "multiclase": lambda: {"task": "multiclase", "classes": ctx["classes"]},
        "numerica": lambda: {"task": "numerica", "target_stats": ctx["target_stats"]},
        "agrupar": _supervised_only,
    })()
    return json.dumps(
        {
            **task_fields,
            "n_train": int(len(ctx["train_idx"])),
            "n_test": int(len(ctx["test_idx"])),
            "baselines": baselines,
            "model": winner_row["test"],
            # Compat S4 (manifiesto y UI): el modelo que `model` representa.
            "model_name": winner,
            "winner": winner,
            "league": league,
            "cv": {
                "k": k,
                "scoring": SCORER[ctx["metric"]],
                "rule": "one-se",
                "best": best,
                "se": se,
            },
            "elapsed_ms": _elapsed_ms(started),
            **details,
        }
    )


# plantilla:inicio prueba
def _test_metrics(pipe, y_pred, ctx):
    """Métricas de TEST según la tarea (binaria: necesita el puntaje continuo)."""
    return _by_task(ctx["task"], {
        "binaria": lambda: _metrics(ctx["y_test"], y_pred, _scores(pipe, ctx["X_test"])),
        "multiclase": lambda: _multiclass_metrics(
            ctx["y_test"], y_pred, _proba(pipe, ctx["X_test"]), len(ctx["classes"])
        ),
        "numerica": lambda: _reg_metrics(ctx["y_test"], y_pred),
        "agrupar": _supervised_only,
    })()


# plantilla:fin prueba


def fit_member(payload_json):
    """La entrada del comando «fit-member»: un miembro elegido a mano (U1), con
    objetivo o (S7) agrupando."""
    p = json.loads(payload_json)
    return _by_task(_route_task(p), {
        "binaria": lambda: _fit_league_member(p),
        "multiclase": lambda: _fit_league_member(p),
        "numerica": lambda: _fit_league_member(p),
        "agrupar": lambda: fit_cluster_member(p),
    })()


def _fit_league_member(p):
    """Elección manual (U1): ajusta UN miembro en train completo y lo retiene en
    lugar del ganador. Mismo split, misma semilla ⇒ reproduce exactamente su fila
    de la liga (determinismo, vigilado por un test). No hay CV: la elección ya la
    hizo el usuario y TS la registra como «elegido por ti»."""
    _validate_payload(p, league=False)
    ctx = _prepare(p)
    name = p["member"]
    pipe = _member_pipe(name, ctx).fit(ctx["X_train"], ctx["y_train"])
    y_pred = pipe.predict(ctx["X_test"])
    metrics = _test_metrics(pipe, y_pred, ctx)
    # Puede lanzar: ANTES de retener. Si falla, el modelo activo sigue siendo el
    # anterior y la UI lo dice así (AU-S5-07).
    details = _selected_details(pipe, y_pred, ctx)
    _retain(pipe, ctx, p["target"])
    return json.dumps(
        {"task": ctx["task"], "model": metrics, "model_name": name, **details}
    )


# --- S3: puntuar datos nuevos + export/import (ADR-007) ----------------------


def score_new_data(payload_json):
    """Puntúa un CSV nuevo con el modelo retenido. Devuelve la etiqueta
    ORIGINAL de la clase (jamás 0/1) + probabilidad de la clase positiva por
    fila, precedidas del reporte honesto de novedad: cuántos valores por
    columna el modelo nunca vio en train (categorías nuevas / numéricos fuera
    de rango). Los nulos no son novedad (los imputa el pipeline, como en train).
    """
    if _MODEL is None:
        raise RuntimeError("no-model")
    p = json.loads(payload_json)
    schema = _MODEL["schema"]
    numeric = list(schema["numeric"])
    categorical = list(schema["categorical"])
    features = numeric + categorical

    df = _build_frame(p["headers"], p["rows"], numeric)
    X = df[features]

    profile = _MODEL["training_profile"]
    novelty_columns = []
    row_flags = np.zeros(len(X), dtype=bool)
    for col in numeric:
        bounds = profile["numeric"].get(col)
        if not bounds or bounds["min"] is None:
            continue
        values = X[col]
        mask = values.notna() & ((values < bounds["min"]) | (values > bounds["max"]))
        count = int(mask.sum())
        if count:
            novelty_columns.append({"column": col, "kind": "numeric", "count": count})
            row_flags |= mask.to_numpy()
    for col in categorical:
        seen = profile["categorical"].get(col, [])
        values = X[col]
        mask = values.notna() & ~values.isin(list(seen))
        count = int(mask.sum())
        if count:
            novelty_columns.append({"column": col, "kind": "categorical", "count": count})
            row_flags |= mask.to_numpy()

    pipe = _MODEL["pipe"]
    novelty = {
        "columns": novelty_columns,
        "affected_rows": int(row_flags.sum()),
        "n_rows": int(len(X)),
    }
    scored = _by_task(_task_of(schema), {
        "binaria": lambda: _score_binary(pipe, X, schema),
        "multiclase": lambda: _score_multiclass(pipe, X, schema),
        "numerica": lambda: _score_numeric(pipe, X),
        "agrupar": lambda: _score_cluster(_MODEL, X),
    })()
    return json.dumps({**scored, "novelty": novelty})


def _score_binary(pipe, X, schema):
    """La etiqueta ORIGINAL de la clase (jamás 0/1) y la probabilidad de la positiva."""
    pred01 = pipe.predict(X)
    # S5: ridge y el SVM lineal deciden la clase sin dar una probabilidad. No se
    # inventa una (honestidad): `probabilities` viaja null y la UI lo dice.
    proba = pipe.predict_proba(X)[:, 1] if hasattr(pipe, "predict_proba") else None
    positive = schema["positive_class"]
    negative = next(c for c in schema["classes"] if c != positive)
    return {
        "task": "binaria",
        "predictions": [positive if v == 1 else negative for v in pred01],
        "probabilities": None if proba is None else [float(v) for v in proba],
        "positive_class": positive,
    }


def _score_multiclass(pipe, X, schema):
    """S7: la etiqueta ORIGINAL de la clase predicha y la probabilidad de ESA clase
    (null si el modelo no da probabilidades: no se inventa)."""
    classes = schema["classes"]
    proba = _proba(pipe, X)
    return {
        "task": "multiclase",
        "predictions": [classes[int(v)] for v in pipe.predict(X)],
        "probabilities": None if proba is None else [float(v) for v in proba.max(axis=1)],
    }


def _score_numeric(pipe, X):
    """S6: la cantidad estimada, en las unidades del objetivo; no hay clase ni
    probabilidad que dar (no se inventa)."""
    return {
        "task": "numerica",
        "predictions": [float(v) for v in pipe.predict(X)],
        "probabilities": None,
    }


def export_model(payload_json="{}"):
    """Serializa el modelo retenido como payload único: pickle(protocolo 5) →
    zlib → base64. El payload incluye esquema y perfil de train, así el import
    restaura TODO sin depender de campos del manifiesto (que es la cara humana
    del archivo y se valida en TS con su hash ANTES de deserializar).
    """
    if _MODEL is None:
        raise RuntimeError("no-model")
    blob = pickle.dumps(
        {
            "pipe": _MODEL["pipe"],
            "schema": _MODEL["schema"],
            "training_profile": _MODEL["training_profile"],
            # S7: agrupar puntúa con su regla de asignación (centroides, radios o
            # la mezcla gaussiana). Jamás las etiquetas de entrenamiento (P13).
            **_by_task(_task_of(_MODEL["schema"]), {
                "binaria": dict,
                "multiclase": dict,
                "numerica": dict,
                "agrupar": lambda: {"assign": _MODEL["assign"]},
            })(),
        },
        protocol=5,
    )
    return json.dumps(
        {
            "payload_b64": base64.b64encode(zlib.compress(blob)).decode("ascii"),
            "versions": _runtime_versions(),
            "schema": _MODEL["schema"],
            "training_profile": _MODEL["training_profile"],
        }
    )


def import_model(payload_json):
    """Restaura un modelo exportado. La validación de manifiesto + SHA-256
    ocurre en TS ANTES de llegar aquí (regla del sprint); esto deserializa,
    verifica la forma del payload restaurado y coteja su esquema contra el del
    manifiesto (auditoría H1): la UI gatea columnas con el esquema del
    MANIFIESTO, pero quien puntúa es el del pickle — si no coinciden, el
    archivo miente y se rechaza en vez de puntuar con otro esquema.
    """
    global _MODEL, _CLUSTER_LABELS
    p = json.loads(payload_json)
    blob = zlib.decompress(base64.b64decode(p["payload_b64"]))
    restored = pickle.loads(blob)
    if not isinstance(restored, dict) or not all(
        key in restored for key in ("pipe", "schema", "training_profile")
    ):
        raise RuntimeError("invalid-payload")
    expected = p.get("expected_schema")
    if expected is not None and restored["schema"] != expected:
        raise RuntimeError("schema-mismatch")

    def assign():
        # S7: un archivo de agrupar sin su regla de asignación no puede puntuar.
        if not isinstance(restored.get("assign"), dict):
            raise RuntimeError("invalid-payload")
        return {"assign": restored["assign"]}

    _MODEL = {
        "pipe": restored["pipe"],
        "schema": restored["schema"],
        "training_profile": restored["training_profile"],
        **_by_task(_task_of(restored["schema"]), {
            "binaria": dict,
            "multiclase": dict,
            "numerica": dict,
            "agrupar": assign,
        })(),
    }
    # Un modelo importado no trae etiquetas de entrenamiento (P13).
    _CLUSTER_LABELS = None
    return json.dumps({"ok": True})


def reset_model(payload_json="{}"):
    """Olvida el modelo retenido (higiene para tests de integración)."""
    global _MODEL, _CLUSTER_LABELS
    _MODEL = None
    _CLUSTER_LABELS = None
    return json.dumps({"ok": True})


# --- S12 (Protocolo DS, etapa 7): la liga SOLO con el entrenamiento ---------------------------
#
# Una entrada aparte de run_experiment: el flujo de Probeta no cambia. Aquí la prueba NO EXISTE: el
# payload trae solo las filas del entrenamiento sellado en la etapa 6 y los pliegues que arma TS
# (src/engine/protocolo/pliegues.ts) según el esquema, como posiciones dentro de esas filas. Si llega
# `test_idx` o `train_idx`, el contrato se rompe nombrándolos: este modo no tiene con qué abrir la
# prueba. Devuelve la liga (validación cruzada en esos pliegues y selección por un error estándar),
# las predicciones fuera de pliegue del ganador (TS las mide con la moneda de la decisión) y la
# prueba de permutación del ganador con los mismos pliegues. Errores: solo el tipo, nunca un valor.

VALIDATION_TASKS = ("binaria", "multiclase", "numerica")
# Tope de permutaciones que el contrato admite (TS pide entre 20 y 200).
PERMUTATIONS_MAX = 1000


def _validate_validation_payload(p):
    """Valida el payload de la etapa 7 antes de tocar los datos."""
    if not isinstance(p, dict):
        _contract("payload")
    # S13: la prueba sale solo por el comando de la prueba (run_test): ni sus índices ni sus filas
    for key in ("test_idx", "train_idx", "test", "train"):
        if key in p:
            _contract(key)
    for key in ("headers", "rows", "numeric", "categorical", "folds", "roster"):
        if not isinstance(p.get(key), list):
            _contract(key)
    if not isinstance(p.get("target"), str) or p["target"] not in p["headers"]:
        _contract("target")
    if not _is_int(p.get("seed")):
        _contract("seed")
    task = p.get("task")
    if not isinstance(task, str) or task not in VALIDATION_TASKS:
        _contract("task")
    if p.get("primary_metric") not in TASK_METRICS[task]:
        _contract("primary_metric")
    if len(p["numeric"]) + len(p["categorical"]) == 0:
        _contract("features")
    factories = _FACTORIES_BY_TASK[task]
    roster = p["roster"]
    if (
        len(roster) == 0
        or len(set(roster)) != len(roster)
        or any(name not in factories for name in roster)
    ):
        _contract("roster")
    n = len(p["rows"])
    folds = p["folds"]
    if len(folds) < 2:
        _contract("folds")
    for fold in folds:
        if not isinstance(fold, dict) or set(fold) != {"train", "val"}:
            _contract("folds")
        train, val = fold["train"], fold["val"]
        if not isinstance(train, list) or not isinstance(val, list):
            _contract("folds")
        if len(train) < 2 or len(val) < 1:
            _contract("folds")
        if not all(_is_int(i) and 0 <= i < n for i in train + val):
            _contract("folds")
        if len(set(train)) != len(train) or len(set(val)) != len(val) or set(train) & set(val):
            _contract("folds")

    def binary():
        if "classes" in p:
            _contract("classes")
        if not isinstance(p.get("positive"), str):
            _contract("positive")

    def other(check_classes):
        def run():
            if "positive" in p:
                _contract("positive")
            check_classes()
        return run

    _by_task(task, {
        "binaria": binary,
        "multiclase": other(lambda: _validate_classes(p.get("classes"))),
        "numerica": other(lambda: "classes" in p and _contract("classes")),
        "agrupar": _supervised_only,
    })()
    perm = p.get("permutations")
    if (
        not isinstance(perm, dict)
        or set(perm) != {"budget_ms", "min", "max"}
        or not all(_is_int(perm[key]) and perm[key] >= 0 for key in perm)
        or perm["min"] > perm["max"]
        or perm["max"] > PERMUTATIONS_MAX
    ):
        _contract("permutations")


def _prepare_validation(p):
    """El frame y el objetivo de las filas de entrenamiento. Binaria: 1 = la clase que la etapa 2
    dijo que significa «hay que actuar» (no la minoritaria, como en Probeta)."""
    numeric = list(p["numeric"])
    categorical = list(p["categorical"])
    features = numeric + categorical
    df = _build_frame(p["headers"], p["rows"], numeric)
    task = p["task"]

    def binary():
        target = df[p["target"]].astype("string")
        classes = sorted(target.dropna().unique().tolist())
        if target.isna().any() or len(classes) != 2 or p["positive"] not in classes:
            _contract("positive")
        return (target == p["positive"]).astype(int).to_numpy(), classes, p["positive"]

    def multiclass():
        y, classes, _, _ = _multiclass_target(df, p)
        return y, classes, None

    def numeric_target():
        y = pd.to_numeric(df[p["target"]], errors="coerce").to_numpy(dtype=float)
        if not np.all(np.isfinite(y)):
            _contract("target")
        return y, None, None

    y, classes, positive = _by_task(task, {
        "binaria": binary,
        "multiclase": multiclass,
        "numerica": numeric_target,
        "agrupar": _supervised_only,
    })()
    return {
        "task": task,
        "factories": _FACTORIES_BY_TASK[task],
        "numeric": numeric,
        "categorical": categorical,
        "features": features,
        "classes": classes,
        "positive": positive,
        "y": y,
        "X_train": df[features],
        "y_train": y,
        "seed": int(p["seed"]),
        "metric": p["primary_metric"],
        "preprocessor": _make_preprocessor(numeric, categorical),
    }


def _positive_proba(pipe, X):
    """Binaria: la probabilidad de «hay que actuar», o None si el modelo no la da (ridge, SVM
    lineal): no se inventa; TS decide entonces con la clase que predice."""
    if not hasattr(pipe, "predict_proba"):
        return None
    return [float(v) for v in pipe.predict_proba(X)[:, 1]]


def _finite(values):
    if not all(math.isfinite(v) for v in values):
        raise ArithmeticError("non-finite-prediction")
    return values


def _out_of_fold(name, ctx, splits):
    """Las predicciones del ganador en la validación de cada pliegue, entrenado SOLO con el
    entrenamiento de ese pliegue (el preprocesador también). Una lista por pliegue, alineada con
    sus índices de validación."""
    X, y = ctx["X_train"], ctx["y_train"]
    out = []
    for train, val in splits:
        pipe = _member_pipe(name, ctx).fit(X.iloc[train], y[train])
        pred = pipe.predict(X.iloc[val])

        def binary_fold():
            proba = _positive_proba(pipe, X.iloc[val])
            return {
                "pred": [int(v) for v in pred],
                "proba": None if proba is None else _finite(proba),
            }

        out.append(
            _by_task(ctx["task"], {
                "binaria": binary_fold,
                "multiclase": lambda: {
                    "pred": [ctx["classes"][int(v)] for v in pred],
                    "proba": None,
                },
                "numerica": lambda: {"pred": _finite([float(v) for v in pred]), "proba": None},
                "agrupar": _supervised_only,
            })()
        )
    return out


def _permutation(name, ctx, splits, cfg, cv_ms, step):
    """¿Hay señal o solo azar? Se barajan las etiquetas DEL ENTRENAMIENTO y se vuelve a correr la
    CV del ganador con los mismos pliegues. Cuántas veces: el presupuesto de tiempo dividido por lo
    que tardó su CV, entre el mínimo y el máximo pedidos. Una permutación que no se puede puntuar
    (un pliegue sin una de las clases) no cuenta y se dice cuántas fueron."""
    n = int(min(cfg["max"], max(cfg["min"], cfg["budget_ms"] // max(int(cv_ms), 1))))
    rng = np.random.default_rng(ctx["seed"])
    scores = []
    failed = 0
    for index in range(n):
        step(index, n)
        shuffled = {**ctx, "y_train": rng.permutation(ctx["y_train"])}
        try:
            cv, _ = _cross_validate(name, shuffled, len(splits), splits)
            scores.append(cv["mean"])
        except Exception:  # noqa: BLE001 — se cuenta, sin mensaje (puede traer valores)
            failed += 1
    return {"n": n, "failed": failed, "scores": scores}


def run_validation(payload_json, on_progress=None):
    """La entrada del comando «validate» (S12, etapa 7 del Protocolo DS)."""
    started = time.perf_counter()
    p = json.loads(payload_json)
    _validate_validation_payload(p)
    ctx = _prepare_validation(p)
    splits = [
        (np.asarray(fold["train"], dtype=int), np.asarray(fold["val"], dtype=int))
        for fold in p["folds"]
    ]
    k = len(splits)
    order = list(p["roster"])

    def progress(phase, index, total, name):
        if on_progress is not None:
            on_progress(
                json.dumps({"phase": phase, "member": name, "index": index, "total": total})
            )

    league = []
    for index, name in enumerate(order):
        progress("cv", index, len(order), name)
        t = time.perf_counter()
        row = {"name": name, "status": "ok", "cv": None, "test": None, "error_type": None}
        try:
            row["cv"], converged = _cross_validate(name, ctx, k, splits)
            if not converged:
                row["status"] = "no-converge"
        except Exception as error:  # noqa: BLE001 — se registra el TIPO, nunca el mensaje
            row["status"] = "error"
            row["error_type"] = type(error).__name__
        row["elapsed_ms"] = _elapsed_ms(t)
        league.append(row)

    best, winner, se = select_one_se(league, k, METRIC_DIRECTION[ctx["metric"]])
    winner_row = next(row for row in league if row["name"] == winner)
    oof = _out_of_fold(winner, ctx, splits)
    permutation = _permutation(
        winner,
        ctx,
        splits,
        p["permutations"],
        winner_row["elapsed_ms"],
        lambda index, total: progress("perm", index, total, winner),
    )
    task_fields = _by_task(ctx["task"], {
        "binaria": lambda: {"classes": ctx["classes"], "positive_class": ctx["positive"]},
        "multiclase": lambda: {"classes": ctx["classes"]},
        "numerica": dict,
        "agrupar": _supervised_only,
    })()
    return json.dumps(
        {
            "task": ctx["task"],
            **task_fields,
            "n_rows": int(len(ctx["y_train"])),
            "league": league,
            "winner": winner,
            "cv": {
                "k": k,
                "scoring": SCORER[ctx["metric"]],
                "rule": "one-se",
                "best": best,
                "se": se,
            },
            "oof": oof,
            "permutation": {**permutation, "observed": winner_row["cv"]["mean"]},
            "elapsed_ms": _elapsed_ms(started),
        }
    )


# --- S13 (Protocolo DS, etapa 8): la prueba, abierta una vez ----------------------------------
#
# La ÚNICA entrada que recibe filas de la prueba. TS la arma solo cuando el sello que da la tabla hoy es
# el que se selló en la etapa 6 (src/lib/protocolo/prueba8.ts); aquí el sello no se puede rehacer (su
# receta vive en TS), así que se valida su forma y se devuelve para que TS compruebe el eco. El ganador de
# la etapa 7 se ajusta con TODO el entrenamiento y predice la prueba: por fila, la predicción y la
# probabilidad cuando el modelo la da, más la métrica de la liga en la prueba (para el optimismo de la
# selección). Nunca devuelve un valor de la tabla. Las claves del payload son un conjunto cerrado: una de
# más rompe el contrato nombrándola. Errores: solo el tipo, nunca un valor.

TEST_KEYS = frozenset(
    (
        "task",
        "headers",
        "train",
        "test",
        "target",
        "numeric",
        "categorical",
        "seed",
        "winner",
        "primary_metric",
        "huella",
        "sello",
        "positive",
        "classes",
    )
)

# S19 (ADR 027): el mismo envío SIN la prueba. `fit-winner` lo recibe para volver a ajustar al ganador con el
# entrenamiento: una clave `test` (o cualquiera fuera de este conjunto) rompe el contrato nombrándola.
FIT_KEYS = TEST_KEYS - {"test"}


def _hex64(value):
    return isinstance(value, str) and len(value) == 64 and all(c in "0123456789abcdef" for c in value)


def _validate_test_payload(p, *, with_test=True):
    """Valida el payload de la etapa 8 antes de tocar los datos. S19: con `with_test=False` valida el de `fit-winner`
    (sin la prueba): ahí `test` es una clave de más y rompe el contrato."""
    if not isinstance(p, dict):
        _contract("payload")
    for key in p:
        if key not in (TEST_KEYS if with_test else FIT_KEYS):
            _contract(key)
    for key in ("headers", "train", "numeric", "categorical") + (("test",) if with_test else ()):
        if not isinstance(p.get(key), list):
            _contract(key)
    headers = p["headers"]
    if not all(isinstance(h, str) for h in headers) or len(set(headers)) != len(headers):
        _contract("headers")
    if not isinstance(p.get("target"), str) or p["target"] not in headers:
        _contract("target")
    features = list(p["numeric"]) + list(p["categorical"])
    if (
        not features
        or len(set(features)) != len(features)
        or any(not isinstance(c, str) or c not in headers or c == p["target"] for c in features)
    ):
        _contract("features")
    for key, minimum in (("train", 2),) + ((("test", 1),) if with_test else ()):
        rows = p[key]
        if len(rows) < minimum or any(not isinstance(r, list) or len(r) != len(headers) for r in rows):
            _contract(key)
    if not _is_int(p.get("seed")):
        _contract("seed")
    task = p.get("task")
    if task not in VALIDATION_TASKS:
        _contract("task")
    if p.get("primary_metric") not in TASK_METRICS[task]:
        _contract("primary_metric")
    if p.get("winner") not in _FACTORIES_BY_TASK[task]:
        _contract("winner")
    for key in ("huella", "sello"):
        if not _hex64(p.get(key)):
            _contract(key)

    def binary():
        if "classes" in p:
            _contract("classes")
        if not isinstance(p.get("positive"), str):
            _contract("positive")

    def multiclass():
        if "positive" in p:
            _contract("positive")
        _validate_classes(p.get("classes"))

    def numeric():
        for key in ("positive", "classes"):
            if key in p:
                _contract(key)

    _by_task(task, {
        "binaria": binary,
        "multiclase": multiclass,
        "numerica": numeric,
        "agrupar": _supervised_only,
    })()


def _test_targets(train, test, p):
    """El objetivo del entrenamiento y de la prueba, codificado igual que en la etapa 7. S19: con `test=None`
    (`fit-winner`) solo codifica el entrenamiento y devuelve `None` en el lugar de la prueba."""
    target = p["target"]

    def binary():
        y_train = train[target].astype("string")
        classes = sorted(y_train.dropna().unique().tolist())
        if y_train.isna().any() or len(classes) != 2 or p["positive"] not in classes:
            _contract("positive")
        positive = p["positive"]
        y_test = None
        if test is not None:
            y_test = test[target].astype("string")
            if y_test.isna().any() or not set(y_test.unique().tolist()) <= set(classes):
                _contract("test")
            y_test = (y_test == positive).astype(int).to_numpy()
        return (y_train == positive).astype(int).to_numpy(), y_test, classes

    def multiclass():
        classes = list(p["classes"])
        index = {c: i for i, c in enumerate(classes)}
        y_train = train[target].astype("string")
        if sorted(y_train.dropna().unique().tolist()) != classes:
            _contract("classes")
        y_test = None
        if test is not None:
            y_test = test[target].astype("string")
            if y_test.isna().any() or not set(y_test.unique().tolist()) <= set(classes):
                _contract("test")
            y_test = y_test.map(index).astype(int).to_numpy()
        return y_train.map(index).astype(int).to_numpy(), y_test, classes

    def numeric_target():
        y_train = pd.to_numeric(train[target], errors="coerce").to_numpy(dtype=float)
        if not np.all(np.isfinite(y_train)):
            _contract("target")
        y_test = None
        if test is not None:
            y_test = pd.to_numeric(test[target], errors="coerce").to_numpy(dtype=float)
            if not np.all(np.isfinite(y_test)):
                _contract("test")
        return y_train, y_test, None

    return _by_task(p["task"], {
        "binaria": binary,
        "multiclase": multiclass,
        "numerica": numeric_target,
        "agrupar": _supervised_only,
    })()


def run_test(payload_json):
    """La entrada del comando «test» (S13, etapa 8 del Protocolo DS)."""
    started = time.perf_counter()
    p = json.loads(payload_json)
    _validate_test_payload(p)
    numeric = list(p["numeric"])
    categorical = list(p["categorical"])
    features = numeric + categorical
    train = _build_frame(p["headers"], p["train"], numeric)
    test = _build_frame(p["headers"], p["test"], numeric)
    y_train, y_test, classes = _test_targets(train, test, p)
    task = p["task"]
    ctx = {
        "factories": _FACTORIES_BY_TASK[task],
        "seed": int(p["seed"]),
        "preprocessor": _make_preprocessor(numeric, categorical),
    }
    X_train, X_test = train[features], test[features]
    try:
        pipe = _member_pipe(p["winner"], ctx).fit(X_train, y_train)
        y_pred = pipe.predict(X_test)
    except Exception:  # noqa: BLE001 — el mensaje podría traer valores; se dice solo qué falló
        raise RuntimeError("winner-fit-failed") from None
    metric = p["primary_metric"]

    def binary():
        proba = _positive_proba(pipe, X_test)
        value = _metrics(y_test, y_pred, _scores(pipe, X_test))[metric]
        return (
            [int(v) for v in y_pred],
            None if proba is None else _finite(proba),
            value,
            {"classes": classes, "positive_class": p["positive"]},
        )

    def multiclass():
        proba = _proba(pipe, X_test)
        value = _multiclass_metrics(y_test, y_pred, proba, len(classes))[metric]
        # la confianza de la clase predicha: lo que se calibra cuando hay varias opciones
        confidence = None if proba is None else _finite([float(v) for v in proba.max(axis=1)])
        return [classes[int(v)] for v in y_pred], confidence, value, {"classes": classes}

    def numeric_out():
        pred = _finite([float(v) for v in y_pred])
        return pred, None, _reg_metrics(y_test, y_pred)[metric], {}

    pred, proba, value, task_fields = _by_task(task, {
        "binaria": binary,
        "multiclase": multiclass,
        "numerica": numeric_out,
        "agrupar": _supervised_only,
    })()
    return json.dumps(
        {
            "task": task,
            **task_fields,
            "winner": p["winner"],
            "n_train": int(len(y_train)),
            "n_test": int(len(y_test)),
            "pred": pred,
            "proba": proba,
            "metric": {"name": metric, "value": float(value)},
            "huella": p["huella"],
            "sello": p["sello"],
            "elapsed_ms": _elapsed_ms(started),
        }
    )


# --- S17: la prueba de estrés (ADR 023) ---------------------------------------------------------------
#
# «¿Cuánto aguanta?»: el MISMO modelo, sin reentrenar, sobre la prueba que ya se abrió, perturbada de tres
# maneras con semilla fija: (a) ruido gaussiano en las numéricas a un 5, 10 y 20 % de su desviación en train;
# (b) cada columna barajada, una a una; (c) las tres numéricas más afectadas por (b) corridas +0,5 y +1
# desviación, como lo que pasa con el tiempo. La métrica es la primaria del veredicto. No elige nada ni abre
# la prueba otra vez: lee las mismas filas. Devuelve nombres de columnas y números, jamás un valor del
# dataset. Agrupar no tiene objetivo ni prueba: `not-applicable`. Errores: solo el tipo.

STRESS_NOISE_LEVELS = (0.05, 0.10, 0.20)
STRESS_SHIFT_LEVELS = (0.5, 1.0)
STRESS_SHUFFLE_REPEATS = 5
STRESS_SHIFT_COLUMNS = 3


def _train_sigma(X_train, numeric):
    """La desviación de cada numérica EN TRAIN (la escala del ruido y del corrimiento)."""
    sigma = {}
    for col in numeric:
        value = float(X_train[col].std(ddof=0))
        sigma[col] = value if math.isfinite(value) and value > 0 else 0.0
    return sigma


def _stress_eval(ctx):
    classes = ctx["classes"]
    return {
        "X_test": ctx["X_test"],
        "y_test": ctx["y_test"],
        "numeric": list(ctx["numeric"]),
        "features": list(ctx["features"]),
        "sigma": _train_sigma(ctx["X_train"], ctx["numeric"]),
        "metric": ctx["metric"],
        "n_classes": len(classes) if classes else 0,
        "seed": int(ctx["seed"]),
    }


def _stress_value(task, metric, pipe, X, y, n_classes):
    """La métrica primaria sobre X (la misma cuenta que la liga, solo la que se pide)."""
    y_pred = pipe.predict(X)
    value = _by_task(task, {
        "binaria": lambda: _metrics(y, y_pred, _scores(pipe, X))[metric],
        "multiclase": lambda: float(balanced_accuracy_score(y, y_pred)),
        "numerica": lambda: float(mean_absolute_error(y, y_pred)),
        "agrupar": _supervised_only,
    })()
    if not math.isfinite(value):
        raise ArithmeticError("non-finite-metric")
    return float(value)


def _stress_core(task, pipe, ev):
    """Las tres perturbaciones sobre la prueba de `ev`. Determinista: cada paso tiene su propio generador
    derivado de la semilla, así que el orden de los pasos no cambia las cifras."""
    X_test, y_test = ev["X_test"], ev["y_test"]
    metric, n_classes, seed = ev["metric"], ev["n_classes"], ev["seed"]
    numeric, features, sigma = ev["numeric"], ev["features"], ev["sigma"]
    direction = METRIC_DIRECTION[metric]
    n = len(X_test)

    def value(X):
        return _stress_value(task, metric, pipe, X, y_test, n_classes)

    base = value(X_test)

    noise = []
    for level_index, level in enumerate(STRESS_NOISE_LEVELS if numeric else ()):
        rng = np.random.default_rng([seed, 1, level_index])
        X = X_test.copy()
        for col in numeric:
            if sigma[col] > 0:
                X[col] = X_test[col].to_numpy(dtype=float) + rng.normal(0.0, level * sigma[col], size=n)
        noise.append({"level": level, "value": value(X)})

    numeric_set = set(numeric)
    shuffled = []
    for col_index, col in enumerate(features):
        values = []
        for repeat in range(STRESS_SHUFFLE_REPEATS):
            rng = np.random.default_rng([seed, 2, col_index, repeat])
            X = X_test.copy()
            X[col] = X_test[col].iloc[rng.permutation(n)].to_numpy()
            values.append(value(X))
        shuffled.append(
            {
                "column": col,
                "kind": "numeric" if col in numeric_set else "categorical",
                "value": float(np.mean(values)),
            }
        )

    def worsening(entry):
        return base - entry["value"] if direction == "higher" else entry["value"] - base

    # lo que más duele primero; el empate lo desempata el orden de las columnas (sorted es estable)
    shuffled.sort(key=lambda entry: -worsening(entry))

    shift_columns = [
        e["column"] for e in shuffled if e["kind"] == "numeric" and sigma[e["column"]] > 0
    ][:STRESS_SHIFT_COLUMNS]
    shift = []
    for level in STRESS_SHIFT_LEVELS if shift_columns else ():
        X = X_test.copy()
        for col in shift_columns:
            X[col] = X_test[col].to_numpy(dtype=float) + level * sigma[col]
        shift.append({"level": level, "columns": list(shift_columns), "value": value(X)})

    return {
        "task": task,
        "metric": {"name": metric, "direction": direction},
        "base": base,
        "n_test": int(n),
        "seed": int(seed),
        "noise": noise,
        "shuffle": shuffled,
        "shift": shift,
    }


def _stress_not_applicable():
    raise RuntimeError("not-applicable")


def run_stress(payload_json="{}"):
    """«Estrésalo» en Probeta: el modelo retenido y la prueba de su corrida. Un modelo importado no trae
    prueba (`no-eval`); agrupar no la tiene (`not-applicable`)."""
    started = time.perf_counter()
    if _MODEL is None:
        raise RuntimeError("no-model")
    task = _task_of(_MODEL["schema"])
    _by_task(task, {
        "binaria": _supervised,
        "multiclase": _supervised,
        "numerica": _supervised,
        "agrupar": _stress_not_applicable,
    })()
    ev = _MODEL.get("eval")
    if ev is None:
        raise RuntimeError("no-eval")
    result = _stress_core(task, _MODEL["pipe"], ev)
    result["elapsed_ms"] = _elapsed_ms(started)
    return json.dumps(result)


def run_interval(payload_json="{}"):
    """S18: lo que el intervalo de la métrica necesita de la prueba retenida: lo real, lo predicho y, en dos clases, el
    puntaje por fila. SOLO números (las clases viajan como 0..K−1): ninguna columna, ningún nombre. El bootstrap lo hace TS
    (src/engine/intervalo.ts) con la semilla del experimento. Un modelo importado no trae la prueba (`no-eval`) y agrupar
    no la tiene (`not-applicable`)."""
    if _MODEL is None:
        raise RuntimeError("no-model")
    task = _task_of(_MODEL["schema"])
    _by_task(task, {
        "binaria": _supervised,
        "multiclase": _supervised,
        "numerica": _supervised,
        "agrupar": _stress_not_applicable,
    })()
    ev = _MODEL.get("eval")
    if ev is None:
        raise RuntimeError("no-eval")
    pipe = _MODEL["pipe"]
    X, y = ev["X_test"], ev["y_test"]
    pred = pipe.predict(X)
    cast = _by_task(task, {
        "binaria": lambda: int,
        "multiclase": lambda: int,
        "numerica": lambda: float,
        "agrupar": _supervised_only,
    })()
    score = _by_task(task, {
        "binaria": lambda: [float(v) for v in _scores(pipe, X)],
        "multiclase": lambda: None,
        "numerica": lambda: None,
        "agrupar": _supervised_only,
    })()
    if score is not None and not all(math.isfinite(v) for v in score):
        raise ArithmeticError("non-finite-metric")
    return json.dumps({
        "task": task,
        "metric": ev["metric"],
        "n": int(len(y)),
        "seed": int(ev["seed"]),
        "y": [cast(v) for v in y],
        "pred": [cast(v) for v in pred],
        "score": score,
    })


# --- S19: «¿qué pasaría si?» y el ajuste del ganador del Protocolo (ADR 027) -----------------------------------
#
# `simulate` puntúa DOS veces las mismas filas con el modelo retenido —como están y con UNA columna cambiada— y entrega
# lo que el dinero necesita: la predicción y, cuando el modelo las da, las probabilidades COMPLETAS (el comando `score`
# solo da la de la clase elegida en varias categorías). No lee el objetivo y no devuelve ningún valor de la tabla.
# `fit-winner` es el único camino que deja al ganador del Protocolo en `_MODEL`: lo ajusta con el ENTRENAMIENTO y
# nada más —su payload es el de la etapa 8 sin la prueba, y una clave `test` rompe el contrato nombrándola—, así que
# no abre la prueba ni cuenta como apertura.

SIMULATE_MAX_ROWS = 5000
SIMULATE_KEYS = frozenset(("headers", "rows", "column", "values"))


def _validate_simulate_payload(p, schema):
    """Valida el envío del simulador contra el esquema del modelo retenido, nombrando el campo que falla."""
    if not isinstance(p, dict):
        _contract("payload")
    for key in p:
        if key not in SIMULATE_KEYS:
            _contract(key)
    features = list(schema["numeric"]) + list(schema["categorical"])
    headers, rows, values = p.get("headers"), p.get("rows"), p.get("values")
    if (
        not isinstance(headers, list)
        or not all(isinstance(h, str) for h in headers)
        or len(set(headers)) != len(headers)
        or any(f not in headers for f in features)
    ):
        _contract("headers")
    if (
        not isinstance(rows, list)
        or not 1 <= len(rows) <= SIMULATE_MAX_ROWS
        or any(not isinstance(r, list) or len(r) != len(headers) for r in rows)
    ):
        _contract("rows")
    if not isinstance(p.get("column"), str) or p["column"] not in features:
        _contract("column")
    if not isinstance(values, list) or len(values) != len(rows):
        _contract("values")


def _simulate_one(task, pipe, X, schema):
    """La predicción de unas filas y sus probabilidades completas (None si el modelo decide sin darlas)."""
    def binary():
        scored = _score_binary(pipe, X, schema)
        proba = scored["probabilities"]
        return scored["predictions"], None if proba is None else _finite(proba)

    def multiclass():
        classes = schema["classes"]
        proba = _proba(pipe, X)
        matrix = None if proba is None else [_finite([float(v) for v in row]) for row in proba]
        return [classes[int(v)] for v in pipe.predict(X)], matrix

    def numeric():
        return _finite([float(v) for v in pipe.predict(X)]), None

    def cluster():
        scored = _score_cluster(_MODEL, X)
        return scored["predictions"], None

    pred, proba = _by_task(task, {
        "binaria": binary,
        "multiclase": multiclass,
        "numerica": numeric,
        "agrupar": cluster,
    })()
    return {"pred": pred, "proba": proba}


def _outside_profile(series, column, numeric, profile):
    """Cuántas filas tienen en `column` un valor que el entrenamiento nunca vio (fuera del rango o categoría nueva)."""
    if column in numeric:
        bounds = profile["numeric"].get(column)
        if not bounds or bounds["min"] is None:
            return 0
        return int((series.notna() & ((series < bounds["min"]) | (series > bounds["max"]))).sum())
    seen = profile["categorical"].get(column, [])
    return int((series.notna() & ~series.isin(list(seen))).sum())


def run_simulate(payload_json):
    """S19: el simulador «¿qué pasaría si?». `values` es la columna `column` con el cambio ya aplicado (TS lo calcula); aquí
    solo se puntúa lo de antes y lo de después. SOLO números y etiquetas de la clase: ninguna fila vuelve a TS."""
    started = time.perf_counter()
    if _MODEL is None:
        raise RuntimeError("no-model")
    schema = _MODEL["schema"]
    p = json.loads(payload_json)
    _validate_simulate_payload(p, schema)
    task = _task_of(schema)
    numeric = list(schema["numeric"])
    features = numeric + list(schema["categorical"])
    column = p["column"]
    base = _build_frame(p["headers"], p["rows"], numeric)[features]
    at = p["headers"].index(column)
    moved_rows = []
    for row, value in zip(p["rows"], p["values"]):
        moved = list(row)
        moved[at] = value
        moved_rows.append(moved)
    moved = _build_frame(p["headers"], moved_rows, numeric)[features]
    pipe = _MODEL["pipe"]
    profile = _MODEL["training_profile"]
    result = {
        "task": task,
        "n": int(len(base)),
        "column": column,
        "base": _simulate_one(task, pipe, base, schema),
        "changed": _simulate_one(task, pipe, moved, schema),
        "outside": {
            "before": _outside_profile(base[column], column, numeric, profile),
            "after": _outside_profile(moved[column], column, numeric, profile),
        },
        "elapsed_ms": _elapsed_ms(started),
    }
    result.update(_by_task(task, {
        "binaria": lambda: {"positive_class": schema["positive_class"]},
        "multiclase": lambda: {"classes": list(schema["classes"])},
        "numerica": dict,
        "agrupar": dict,
    })())
    return json.dumps(result)


def run_fit_winner(payload_json):
    """S19 (ADR 027): vuelve a ajustar al ganador del Protocolo con el ENTRENAMIENTO sellado y lo deja en `_MODEL`
    (sin `eval`: no hay prueba). El envío es el de la etapa 8 sin la prueba. Devuelve el eco de lo que TS cotejará."""
    global _MODEL, _CLUSTER_LABELS
    started = time.perf_counter()
    p = json.loads(payload_json)
    _validate_test_payload(p, with_test=False)
    numeric = list(p["numeric"])
    categorical = list(p["categorical"])
    features = numeric + categorical
    train = _build_frame(p["headers"], p["train"], numeric)
    y_train, _, classes = _test_targets(train, None, p)
    task = p["task"]
    ctx = {
        "factories": _FACTORIES_BY_TASK[task],
        "seed": int(p["seed"]),
        "preprocessor": _make_preprocessor(numeric, categorical),
    }
    X_train = train[features]
    try:
        pipe = _member_pipe(p["winner"], ctx).fit(X_train, y_train)
    except Exception:  # noqa: BLE001 — el mensaje podría traer valores; se dice solo qué falló
        raise RuntimeError("winner-fit-failed") from None
    target = p["target"]
    schema = _by_task(task, {
        "binaria": lambda: {
            "numeric": numeric,
            "categorical": categorical,
            "target": target,
            "classes": classes,
            "positive_class": p["positive"],
            "task": "binaria",
        },
        "multiclase": lambda: {
            "numeric": numeric,
            "categorical": categorical,
            "target": target,
            "classes": classes,
            "task": "multiclase",
        },
        "numerica": lambda: {
            "numeric": numeric,
            "categorical": categorical,
            "target": target,
            "task": "numerica",
            "target_stats": _target_stats(y_train, train[target].tolist()),
        },
        "agrupar": _supervised_only,
    })()
    _CLUSTER_LABELS = None
    _MODEL = {
        "pipe": pipe,
        "schema": schema,
        "training_profile": _training_profile(X_train, numeric, categorical),
    }
    return json.dumps(
        {
            "task": task,
            "winner": p["winner"],
            "n_train": int(len(y_train)),
            "huella": p["huella"],
            "sello": p["sello"],
            "elapsed_ms": _elapsed_ms(started),
        }
    )


def run_stress_test(payload_json):
    """«Estrésalo» en la etapa 8 del Protocolo: el mismo envío que abrió la prueba (`TEST_KEYS`); el ganador
    se vuelve a ajustar con el entrenamiento como en `run_test` y se estresa la MISMA prueba. No es una
    apertura nueva: TS solo lo pide con el sello y la huella de la apertura registrada, y no devuelve filas."""
    started = time.perf_counter()
    p = json.loads(payload_json)
    _validate_test_payload(p)
    numeric = list(p["numeric"])
    categorical = list(p["categorical"])
    features = numeric + categorical
    train = _build_frame(p["headers"], p["train"], numeric)
    test = _build_frame(p["headers"], p["test"], numeric)
    y_train, y_test, classes = _test_targets(train, test, p)
    task = p["task"]
    ctx = {
        "factories": _FACTORIES_BY_TASK[task],
        "seed": int(p["seed"]),
        "preprocessor": _make_preprocessor(numeric, categorical),
    }
    X_train, X_test = train[features], test[features]
    try:
        pipe = _member_pipe(p["winner"], ctx).fit(X_train, y_train)
    except Exception:  # noqa: BLE001 — el mensaje podría traer valores; se dice solo qué falló
        raise RuntimeError("winner-fit-failed") from None
    bctx = {
        "X_train": X_train,
        "y_train": y_train,
        "X_test": X_test,
        "y_test": y_test,
        "seed": int(p["seed"]),
        "preprocessor": ctx["preprocessor"],
        "classes": classes,
    }
    ev = {
        "X_test": X_test,
        "y_test": y_test,
        "numeric": numeric,
        "features": features,
        "sigma": _train_sigma(X_train, numeric),
        "metric": p["primary_metric"],
        "n_classes": len(classes) if classes else 0,
        "seed": int(p["seed"]),
    }
    result = _stress_core(task, pipe, ev)
    # el rival a batir en la MISMA métrica y la misma prueba (los de la liga: la mayoritaria/mediana y la logística/lineal)
    metric = p["primary_metric"]
    rivals = _by_task(task, {
        "binaria": lambda: _binary_baselines(bctx),
        "multiclase": lambda: _multiclass_baselines(bctx),
        "numerica": lambda: _regression_baselines(bctx),
        "agrupar": _supervised_only,
    })()
    pick = max if METRIC_DIRECTION[metric] == "higher" else min
    rival = pick(rivals, key=lambda name: rivals[name][metric])
    result.update(
        {
            "baseline": {"name": rival, "value": float(rivals[rival][metric])},
            "winner": p["winner"],
            "huella": p["huella"],
            "sello": p["sello"],
            "elapsed_ms": _elapsed_ms(started),
        }
    )
    return json.dumps(result)
