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
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.svm import LinearSVC
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor


# LightGBM 4.6 registra nombres genéricos de columnas al ajustar; sklearn avisa
# entonces en cada predict que la matriz (numpy, salida del ColumnTransformer) no
# los trae. Es benigno y llenaba la consola del usuario: se silencia SOLO ese aviso.
warnings.filterwarnings(
    "ignore", message="X does not have valid feature names", category=UserWarning
)


# Modelo fitted retenido tras run_experiment/import_model (S3). Vive a nivel de
# módulo dentro del worker: es lo que permite puntuar y exportar sin re-entrenar.
_MODEL = None

# S7 (P13): las etiquetas por fila del agrupamiento retenido viven AQUÍ, fuera de
# todo resultado: ni el JSON de la liga, ni el esquema, ni el archivo exportado las
# llevan. Solo `cluster_labels` las entrega, para el CSV local del usuario.
_CLUSTER_LABELS = None


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


def _make_preprocessor(numeric, categorical):
    numeric_pipe = Pipeline(
        [("imputer", SimpleImputer(strategy="median")), ("scaler", StandardScaler())]
    )
    categorical_pipe = Pipeline(
        [
            ("imputer", SimpleImputer(strategy="most_frequent")),
            # S4 — saneamiento estadístico DENTRO del pipeline (ADR-002 extendido):
            # min_frequency agrupa las categorías raras (count < 2) en un bucket
            # "infrecuente" APRENDIDO SOLO EN TRAIN (el fit del pipeline es train-only
            # ⇒ fuga imposible por construcción). handle_unknown="infrequent_if_exist"
            # manda las categorías nunca vistas a ese mismo bucket. sparse_output=False
            # porque HistGradientBoosting no acepta matrices dispersas.
            (
                "onehot",
                OneHotEncoder(
                    handle_unknown="infrequent_if_exist",
                    min_frequency=2,
                    sparse_output=False,
                ),
            ),
        ]
    )
    return ColumnTransformer(
        [("num", numeric_pipe, numeric), ("cat", categorical_pipe, categorical)],
        remainder="drop",
    )


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
    labels = HDBSCAN(min_cluster_size=mcs).fit(ctx["Z"]).labels_
    return _finish(
        row, labels, _sample_silhouette(ctx, labels),
        lambda Z, seed: HDBSCAN(min_cluster_size=mcs).fit(Z).labels_,
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
    preprocessor = _make_preprocessor(distance_numeric, distance_categorical)
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
    rare = {}
    if ctx["distance_categorical"]:
        onehot = ctx["preprocessor"].named_transformers_["cat"].named_steps["onehot"]
        infreq = getattr(onehot, "infrequent_categories_", None)
        if infreq is not None:
            for col, cats in zip(ctx["distance_categorical"], infreq):
                if cats is not None and len(cats) > 0:
                    rare[col] = sorted(str(c) for c in cats)
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
        "preprocessor": _make_preprocessor(numeric, categorical),
    }


def _member_pipe(name, ctx):
    return Pipeline(
        [("prep", clone(ctx["preprocessor"])), ("model", ctx["factories"][name](ctx["seed"]))]
    )


def _cross_validate(name, ctx, k):
    """CV estratificada DENTRO de train. El preprocesador va DENTRO del Pipeline
    que se valida ⇒ se reajusta en cada fold y jamás ve las filas de validación
    de su fold (el test anti-fuga de la CV lo vigila con un espía). S6: con un
    objetivo continuo no hay clases que estratificar ⇒ KFold barajado; los folds
    de una métrica «menor es mejor» se devuelven en sus unidades (signo invertido)."""
    splitter = _by_task(ctx["task"], {
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
    num_imputer = pipe.named_steps["prep"].named_transformers_["num"].named_steps["imputer"]
    learned_medians = {col: float(val) for col, val in zip(numeric, num_imputer.statistics_)}

    # Categorías raras agrupadas por el OneHotEncoder (min_frequency, train-only).
    rare_categories = {}
    if categorical:
        cat_oh = pipe.named_steps["prep"].named_transformers_["cat"].named_steps["onehot"]
        infreq = getattr(cat_oh, "infrequent_categories_", None)
        if infreq is not None:
            for col, cats in zip(categorical, infreq):
                if cats is not None and len(cats) > 0:
                    rare_categories[col] = sorted(str(c) for c in cats)

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
