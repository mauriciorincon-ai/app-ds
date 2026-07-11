"""Pipeline de modelado anti-fuga por construcción (corre en Pyodide/WASM).

El preprocesamiento (imputación + escalado + one-hot) se ajusta SOLO sobre las
filas de train (`train_idx`). Es el único camino: no existe función que
preprocese antes del split. `run_experiment` recibe y devuelve JSON (interop
simple y robusta con el worker de TS).

Todas las métricas se calculan sobre TEST, nunca sobre train.
"""

import json

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


def run_experiment(payload_json):
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
