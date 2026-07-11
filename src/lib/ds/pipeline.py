"""Pipeline de modelado anti-fuga por construcción (corre en Pyodide/WASM).

El preprocesamiento (imputación + escalado + one-hot) se ajusta SOLO sobre las
filas de train (`train_idx`). Es el único camino: no existe función que
preprocese antes del split. Todas las funciones públicas reciben y devuelven
JSON (interop simple y robusta con el worker de TS).

Todas las métricas se calculan sobre TEST, nunca sobre train.

S3 — el modelo se usa: `run_experiment` retiene el pipeline fitted y el perfil
de train en `_MODEL` (nivel de módulo, vive lo que viva el worker);
`score_new_data` puntúa CSV nuevos con reporte honesto de novedad;
`export_model`/`import_model` serializan/restauran el modelo (pickle+zlib+
base64 — ADR-007; el manifiesto y su hash se validan en TS ANTES de llamar
a import_model).
"""

import base64
import json
import pickle
import sys
import zlib

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


# Modelo fitted retenido tras run_experiment/import_model (S3). Vive a nivel de
# módulo dentro del worker: es lo que permite puntuar y exportar sin re-entrenar.
_MODEL = None


def _build_frame(headers, rows, numeric):
    df = pd.DataFrame(rows, columns=headers)
    df = df.replace(
        {"": None, "NA": None, "N/A": None, "null": None, "NaN": None, "nan": None, "none": None, "-": None}
    )
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
            ("onehot", OneHotEncoder(handle_unknown="ignore")),
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


def _fit_score(estimator, preprocessor, X_train, y_train, X_test):
    pipe = Pipeline([("prep", preprocessor), ("model", estimator)])
    pipe.fit(X_train, y_train)  # <-- ajuste SOLO sobre train (garantía anti-fuga)
    y_pred = pipe.predict(X_test)
    if hasattr(pipe, "predict_proba"):
        y_score = pipe.predict_proba(X_test)[:, 1]
    else:
        y_score = y_pred
    return pipe, y_pred, y_score


def _feature_directions(X_test, y_test, numeric):
    """Signo de la asociación univariada feature↔target sobre TEST (solo
    numéricas; y es 0/1, así que la correlación de Pearson es punto-biserial).
    Las categóricas no tienen una dirección única (varía por categoría) → None.
    """
    directions = {}
    y = pd.Series(y_test, index=X_test.index, dtype="float64")
    for col in numeric:
        x = X_test[col]
        if x.notna().sum() < 2 or x.nunique(dropna=True) < 2 or y.nunique() < 2:
            directions[col] = None
            continue
        r = x.corr(y)
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


def _explainability(pipe, X_test, y_test, features, numeric, seed):
    """Importancia global por permutación sobre TEST (modelo-agnóstica; método
    respaldado — shap no carga en Pyodide, ver decisions/004). Devuelve las
    features ordenadas por importancia descendente, con dirección del efecto.
    """
    scoring = "roc_auc" if len(np.unique(y_test)) > 1 else "accuracy"
    pi = permutation_importance(
        pipe, X_test, y_test,
        n_repeats=10, random_state=seed, scoring=scoring, n_jobs=1,
    )
    directions = _feature_directions(X_test, y_test, numeric)
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
                "direction": directions.get(features[i]),
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
    import pyodide
    import sklearn

    return {
        "pyodide": pyodide.__version__,
        "sklearn": sklearn.__version__,
        "python": sys.version.split()[0],
    }


def run_experiment(payload_json):
    global _MODEL
    p = json.loads(payload_json)
    numeric = list(p["numeric"])
    categorical = list(p["categorical"])
    features = numeric + categorical
    seed = int(p.get("seed", 42))

    df = _build_frame(p["headers"], p["rows"], numeric)

    # Objetivo binario → 0/1. Positiva = la clase MINORITARIA (el evento de interés);
    # empate → la mayor lexicográficamente (determinista).
    target = df[p["target"]].astype("string")
    counts = target.value_counts()
    classes = sorted(counts.index.tolist())
    positive = min(classes, key=lambda c: (counts[c], [-ord(ch) for ch in c]))
    y = (target == positive).astype(int).to_numpy()

    X = df[features]
    train_idx = np.array(p["train_idx"], dtype=int)
    test_idx = np.array(p["test_idx"], dtype=int)
    X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
    y_train, y_test = y[train_idx], y[test_idx]

    preprocessor = _make_preprocessor(numeric, categorical)

    models = {
        "majority": DummyClassifier(strategy="most_frequent"),
        "logistic": LogisticRegression(max_iter=1000, random_state=seed),
        "forest": RandomForestClassifier(n_estimators=200, random_state=seed, n_jobs=1),
    }

    results = {}
    forest_pred = None
    forest_pipe = None
    for name, estimator in models.items():
        from sklearn.base import clone

        pipe, y_pred, y_score = _fit_score(clone(estimator), clone(preprocessor), X_train, y_train, X_test)
        results[name] = _metrics(y_test, y_pred, y_score)
        if name == "forest":
            forest_pred = y_pred
            forest_pipe = pipe
            # medianas aprendidas por el imputer numérico (para el test anti-fuga):
            # deben provenir SOLO de train.
            num_imputer = pipe.named_steps["prep"].named_transformers_["num"].named_steps["imputer"]
            learned_medians = {
                col: float(val) for col, val in zip(numeric, num_imputer.statistics_)
            }

    cm = confusion_matrix(y_test, forest_pred, labels=[0, 1]).tolist()

    explainability = _explainability(forest_pipe, X_test, y_test, features, numeric, seed)

    # S3: retener el modelo (forest, el que recibe el veredicto) + esquema +
    # perfil de train — lo que score_new_data y export_model necesitan.
    _MODEL = {
        "pipe": forest_pipe,
        "schema": {
            "numeric": numeric,
            "categorical": categorical,
            "target": p["target"],
            "classes": classes,
            "positive_class": positive,
        },
        "training_profile": _training_profile(X_train, numeric, categorical),
    }

    return json.dumps(
        {
            "n_train": int(len(train_idx)),
            "n_test": int(len(test_idx)),
            "classes": classes,
            "positive_class": positive,
            "positive_rate": float(y.mean()),
            "baselines": {"majority": results["majority"], "logistic": results["logistic"]},
            "model": results["forest"],
            "confusion_matrix": cm,
            "explainability": explainability,
            "preprocessing": {"numeric_medians": learned_medians},
        }
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
    pred01 = pipe.predict(X)
    proba = pipe.predict_proba(X)[:, 1]
    positive = schema["positive_class"]
    negative = next(c for c in schema["classes"] if c != positive)

    return json.dumps(
        {
            "predictions": [positive if v == 1 else negative for v in pred01],
            "probabilities": [float(v) for v in proba],
            "positive_class": positive,
            "novelty": {
                "columns": novelty_columns,
                "affected_rows": int(row_flags.sum()),
                "n_rows": int(len(X)),
            },
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
    ocurre en TS ANTES de llegar aquí (regla del sprint); esto solo
    deserializa y verifica la forma del payload restaurado.
    """
    global _MODEL
    p = json.loads(payload_json)
    blob = zlib.decompress(base64.b64decode(p["payload_b64"]))
    restored = pickle.loads(blob)
    if not isinstance(restored, dict) or not all(
        key in restored for key in ("pipe", "schema", "training_profile")
    ):
        raise RuntimeError("invalid-payload")
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
