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
"""

import base64
import json
import math
import pickle
import sys
import time
import warnings
import zlib

import numpy as np
import pandas as pd
from sklearn.base import clone
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
    confusion_matrix,
    f1_score,
    mean_absolute_error,
    mean_absolute_percentage_error,
    mean_squared_error,
    median_absolute_error,
    precision_score,
    r2_score,
    recall_score,
    roc_auc_score,
)
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


def _explainability(pipe, X_test, y_test, features, numeric, seed, task="binaria"):
    """Importancia global por permutación sobre TEST (modelo-agnóstica; método
    respaldado — shap no carga en Pyodide, ver decisions/004). Devuelve las
    features ordenadas por importancia descendente, con dirección del efecto.
    S6: en regresión la importancia es cuánto SUBE el MAE al permutar la columna
    (en unidades del objetivo) y la dirección es la de Spearman.
    """
    if task == "numerica":
        scoring, method = "neg_mean_absolute_error", "spearman"
    else:
        scoring = "roc_auc" if len(np.unique(y_test)) > 1 else "accuracy"
        method = "pearson"
    pi = permutation_importance(
        pipe, X_test, y_test,
        n_repeats=10, random_state=seed, scoring=scoring, n_jobs=1,
    )
    directions = _feature_directions(X_test, y_test, numeric, method)
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
}

# Qué métricas primarias admite cada tarea (la elige TS; Python no la re-deriva).
TASK_METRICS = {
    "binaria": ("auc", "f1", "accuracy", "precision", "recall"),
    "numerica": ("mae",),
}


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

# Un roster por tarea. `_FACTORIES` sigue siendo el de clasificación (el S5 lo
# referencia por nombre); este mapa los reúne sin copiarlos.
_FACTORIES_BY_TASK = {"binaria": _FACTORIES, "numerica": _REGRESSORS}


def roster_ids(payload_json="{}"):
    """Ids del roster de una tarea (ordenados) — para la paridad TS↔Python.
    Sin `task`, el de clasificación binaria (lo que el S5 preguntaba)."""
    task = json.loads(payload_json or "{}").get("task", "binaria")
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
    factories = _FACTORIES_BY_TASK[task]
    if p.get("primary_metric") not in TASK_METRICS[task]:
        _contract("primary_metric")
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


def _decimals(text):
    """Decimales escritos en un valor del objetivo (para mostrar predicciones con la
    precisión con que el usuario anotó sus datos). Notación científica ⇒ el tope."""
    if text is None:
        return 0
    value = str(text).strip().lower()
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

    if task == "numerica":
        y = pd.to_numeric(df[p["target"]], errors="coerce").to_numpy(dtype=float)
        # TS valida que todo el objetivo sea numérico; si llega otra cosa, se
        # nombra el campo (sin valores: regla dura 2).
        if not np.all(np.isfinite(y)):
            _contract("target")
        classes = positive = None
        stats = _target_stats(y[train_idx], df[p["target"]].iloc[train_idx].tolist())
    else:
        # Objetivo binario → 0/1. Positiva = la clase MINORITARIA (el evento de interés);
        # empate → la mayor lexicográficamente (determinista).
        target = df[p["target"]].astype("string")
        counts = target.value_counts()
        classes = sorted(counts.index.tolist())
        positive = min(classes, key=lambda c: (counts[c], [-ord(ch) for ch in c]))
        y = (target == positive).astype(int).to_numpy()
        stats = None

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
    splitter = (
        KFold(k, shuffle=True, random_state=ctx["seed"])
        if ctx["task"] == "numerica"
        else StratifiedKFold(k, shuffle=True, random_state=ctx["seed"])
    )
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
    if ctx["task"] == "numerica":
        task_details = {
            "pred_vs_real": _pred_vs_real(ctx["y_test"], y_pred),
            "residuals": _residuals(ctx["y_test"], y_pred),
        }
    else:
        task_details = {
            "confusion_matrix": confusion_matrix(ctx["y_test"], y_pred, labels=[0, 1]).tolist()
        }
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


def _retain(pipe, ctx, target):
    """S3/S4: retener el modelo SELECCIONADO (el que recibe el veredicto) + esquema
    + perfil de train — lo que score_new_data y export_model necesitan."""
    global _MODEL
    if ctx["task"] == "numerica":
        schema = {
            "numeric": ctx["numeric"],
            "categorical": ctx["categorical"],
            "target": target,
            "task": "numerica",
            "target_stats": ctx["target_stats"],
        }
    else:
        schema = {
            "numeric": ctx["numeric"],
            "categorical": ctx["categorical"],
            "target": target,
            "classes": ctx["classes"],
            "positive_class": ctx["positive"],
            "task": "binaria",
        }
    _MODEL = {
        "pipe": pipe,
        "schema": schema,
        "training_profile": _training_profile(
            ctx["X_train"], ctx["numeric"], ctx["categorical"]
        ),
    }


def _elapsed_ms(start):
    return int(round((time.perf_counter() - start) * 1000))


def run_experiment(payload_json, on_progress=None):
    """La liga: CV de cada miembro (en el orden de TS) → selección por un error
    estándar → recién entonces se abre el test, UNA vez, para todos (F0-5: el
    test de los perdedores se calcula en la misma corrida, etiquetado «no sirve
    para elegir»). `on_progress(json)` se llama antes de cada paso (worker → UI).
    """
    started = time.perf_counter()
    p = json.loads(payload_json)
    _validate_payload(p)
    ctx = _prepare(p)
    k = int(p["cv_k"])
    # Binaria: k > clase minoritaria de train ⇒ hay folds sin positivos. Numérica:
    # k > filas de train ⇒ hay folds vacíos. TS ya lo acota; aquí se verifica.
    if ctx["task"] == "numerica":
        if k > len(ctx["train_idx"]):
            _contract("cv_k")
    elif k > int(np.bincount(ctx["y_train"], minlength=2).min()):
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
    X_train, y_train, X_test, y_test = ctx["X_train"], ctx["y_train"], ctx["X_test"], ctx["y_test"]
    baselines = {}
    if ctx["task"] == "numerica":
        # S6 (decisión del usuario en el STOP de la F0): con MAE la constante
        # óptima es la MEDIANA (no la media), y la lineal es el rival estructural.
        for name, estimator in (
            ("median", DummyRegressor(strategy="median")),
            ("linear", LinearRegression()),
        ):
            pipe = Pipeline([("prep", clone(ctx["preprocessor"])), ("model", estimator)])
            pipe.fit(X_train, y_train)  # <-- ajuste SOLO sobre train
            baselines[name] = _reg_metrics(y_test, pipe.predict(X_test))
    else:
        for name, estimator in (
            ("majority", DummyClassifier(strategy="most_frequent")),
            ("logistic", LogisticRegression(max_iter=1000, random_state=ctx["seed"])),
        ):
            _, y_pred, y_score = _fit_score(
                estimator, clone(ctx["preprocessor"]), X_train, y_train, X_test
            )
            baselines[name] = _metrics(y_test, y_pred, y_score)

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

    if ctx["task"] == "numerica":
        task_fields = {"task": "numerica", "target_stats": ctx["target_stats"]}
    else:
        task_fields = {
            "task": "binaria",
            "classes": ctx["classes"],
            "positive_class": ctx["positive"],
            "positive_rate": float(ctx["y"].mean()),
        }
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
    if ctx["task"] == "numerica":
        return _reg_metrics(ctx["y_test"], y_pred)
    return _metrics(ctx["y_test"], y_pred, _scores(pipe, ctx["X_test"]))


def fit_member(payload_json):
    """Elección manual (U1): ajusta UN miembro en train completo y lo retiene en
    lugar del ganador. Mismo split, misma semilla ⇒ reproduce exactamente su fila
    de la liga (determinismo, vigilado por un test). No hay CV: la elección ya la
    hizo el usuario y TS la registra como «elegido por ti»."""
    p = json.loads(payload_json)
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
    # S6: un modelo de regresión devuelve la cantidad estimada, en las unidades del
    # objetivo; no hay clase ni probabilidad que dar (no se inventa).
    if schema.get("task") == "numerica":
        return json.dumps(
            {
                "task": "numerica",
                "predictions": [float(v) for v in pipe.predict(X)],
                "probabilities": None,
                "novelty": novelty,
            }
        )
    pred01 = pipe.predict(X)
    # S5: ridge y el SVM lineal deciden la clase sin dar una probabilidad. No se
    # inventa una (honestidad): `probabilities` viaja null y la UI lo dice.
    proba = pipe.predict_proba(X)[:, 1] if hasattr(pipe, "predict_proba") else None
    positive = schema["positive_class"]
    negative = next(c for c in schema["classes"] if c != positive)

    return json.dumps(
        {
            "task": "binaria",
            "predictions": [positive if v == 1 else negative for v in pred01],
            "probabilities": None if proba is None else [float(v) for v in proba],
            "positive_class": positive,
            "novelty": novelty,
        }
    )


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
    global _MODEL
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
    _MODEL = {
        "pipe": restored["pipe"],
        "schema": restored["schema"],
        "training_profile": restored["training_profile"],
    }
    return json.dumps({"ok": True})


def reset_model(payload_json="{}"):
    """Olvida el modelo retenido (higiene para tests de integración)."""
    global _MODEL
    _MODEL = None
    return json.dumps({"ok": True})
