"""Puntúa filas nuevas con un modelo de Probeta DS (un archivo `.probeta.json`).

Una sola fuente para el puntuador portátil (corre en Pyodide, en el navegador de quien lo abre) y para el
servicio (CPython): las dos puntúan EXACTAMENTE igual que la app, y una prueba lo comprueba contra ella. No
entrena, no guarda nada y no manda nada a ninguna parte.

Quien llama valida el manifiesto y el SHA-256 del archivo ANTES de llamar a `load_model` (que deserializa un
pickle: solo se abre un archivo cuyo origen conoces).
"""
import base64
import pickle
import zlib

import numpy as np
import pandas as pd

# Las cuatro tareas, y cómo se despacha por ellas: SIEMPRE con las cuatro ramas escritas (espejo de `_by_task` de pipeline.py: una
# tarea sin su rama no puntúa en silencio como otra).
TAREAS = ("binaria", "multiclase", "numerica", "agrupar")


def tarea_de(schema):
    """La tarea de un esquema; un archivo de antes de las varias categorías no la trae y es de dos clases."""
    return schema.get("task", "binaria")


def por_tarea(tarea, ramas):
    if sorted(ramas) != sorted(TAREAS):
        raise RuntimeError("dispatch-incomplete")
    if tarea not in ramas:
        raise ValueError("unsupported-task")
    return ramas[tarea]


# Las mismas celdas que la app trata como vacías (csv.ts / pipeline.py); un test de paridad lo vigila.
NULL_TOKENS = {"", "na", "n/a", "null", "nan", "none", "-"}


def _normalize_cell(value):
    if value is None:
        return None
    text = str(value).strip()
    return None if text.lower() in NULL_TOKENS else text


def _build_frame(headers, rows, numeric):
    df = pd.DataFrame(rows, columns=headers)
    df = df.map(_normalize_cell)
    for col in numeric:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


def load_model(payload_b64, expected_schema=None):
    """El modelo del archivo, listo para `score`. Rechaza (con el tipo, jamás un valor) un payload que no sea de
    Probeta o cuyo esquema no sea el que dice el manifiesto."""
    restored = pickle.loads(zlib.decompress(base64.b64decode(payload_b64)))
    if not isinstance(restored, dict) or not all(
        key in restored for key in ("pipe", "schema", "training_profile")
    ):
        raise ValueError("invalid-payload")
    if expected_schema is not None and restored["schema"] != expected_schema:
        raise ValueError("schema-mismatch")

    def asignacion():
        # un agrupamiento sin su regla de asignación no puede puntuar
        if not isinstance(restored.get("assign"), dict):
            raise ValueError("invalid-payload")

    por_tarea(tarea_de(restored["schema"]), {
        "binaria": lambda: None,
        "multiclase": lambda: None,
        "numerica": lambda: None,
        "agrupar": asignacion,
    })()
    return restored


def columns_of(model):
    """Las columnas que el modelo espera, en el orden en que las usa."""
    schema = model["schema"]
    return list(schema["numeric"]) + list(schema["categorical"])


def score(model, headers, rows):
    """Puntúa `rows` (listas de texto, con `headers`): la etiqueta ORIGINAL de la clase (jamás 0/1) y la
    probabilidad cuando el modelo la da, precedidas del reporte honesto de novedad (cuántos valores nunca vio en
    train). Los nulos no son novedad: los imputa el pipeline, como en train."""
    schema = model["schema"]
    numeric = list(schema["numeric"])
    categorical = list(schema["categorical"])
    features = numeric + categorical
    missing = [c for c in features if c not in headers]
    if missing:
        raise ValueError("missing-columns:" + ",".join(missing))

    df = _build_frame(headers, rows, numeric)
    X = df[features]

    profile = model["training_profile"]
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

    pipe = model["pipe"]
    scored = por_tarea(tarea_de(schema), {
        "binaria": lambda: _score_binary(pipe, X, schema),
        "multiclase": lambda: _score_multiclass(pipe, X, schema),
        "numerica": lambda: _score_numeric(pipe, X),
        "agrupar": lambda: _score_cluster(model, X),
    })()
    return {
        **scored,
        "novelty": {
            "columns": novelty_columns,
            "affected_rows": int(row_flags.sum()),
            "n_rows": int(len(X)),
        },
    }


def _proba(pipe, X):
    return pipe.predict_proba(X) if hasattr(pipe, "predict_proba") else None


def _score_binary(pipe, X, schema):
    pred01 = pipe.predict(X)
    # ridge y el SVM lineal deciden la clase sin dar una probabilidad: no se inventa una
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
    classes = schema["classes"]
    proba = _proba(pipe, X)
    return {
        "task": "multiclase",
        "predictions": [classes[int(v)] for v in pipe.predict(X)],
        "probabilities": None if proba is None else [float(v) for v in proba.max(axis=1)],
    }


def _score_numeric(pipe, X):
    return {
        "task": "numerica",
        "predictions": [float(v) for v in pipe.predict(X)],
        "probabilities": None,
    }


def _nearest(Z, centroids):
    d2 = (Z**2).sum(axis=1)[:, None] - 2.0 * (Z @ centroids.T) + (centroids**2).sum(axis=1)[None, :]
    d2 = np.maximum(d2, 0.0)
    nearest = d2.argmin(axis=1)
    return nearest, np.sqrt(d2[np.arange(len(Z)), nearest])


def _gaussian(rule, Z):
    present = sorted(rule["mapping"])
    proba = rule["gmm"].predict_proba(Z)[:, present]
    proba = proba / proba.sum(axis=1, keepdims=True)
    best = proba.argmax(axis=1)
    groups = np.array([rule["mapping"][present[int(i)]] for i in best], dtype=int)
    return groups, proba.max(axis=1)


def _assign(rule, Z):
    if rule["method"] == "gaussian":
        return _gaussian(rule, Z)[0]
    nearest, distance = _nearest(Z, rule["centroids"])
    if rule["method"] == "centroid-radius":
        nearest = np.where(distance <= rule["radii"][nearest], nearest, -1)
    return nearest


def _score_cluster(model, X):
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
