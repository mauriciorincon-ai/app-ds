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
    for name, estimator in models.items():
        from sklearn.base import clone

        pipe, y_pred, y_score = _fit_score(clone(estimator), clone(preprocessor), X_train, y_train, X_test)
        results[name] = _metrics(y_test, y_pred, y_score)
        if name == "forest":
            forest_pred = y_pred
            # medianas aprendidas por el imputer numérico (para el test anti-fuga):
            # deben provenir SOLO de train.
            num_imputer = pipe.named_steps["prep"].named_transformers_["num"].named_steps["imputer"]
            learned_medians = {
                col: float(val) for col, val in zip(numeric, num_imputer.statistics_)
            }

    cm = confusion_matrix(y_test, forest_pred, labels=[0, 1]).tolist()

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
            "preprocessing": {"numeric_medians": learned_medians},
        }
    )
