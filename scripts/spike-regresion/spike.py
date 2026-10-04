# Spike de REGRESORES (S6 F0). Corre en el worker DESPUÉS de pipeline.py, así que usa el
# preprocesamiento REAL del producto (_build_frame, _make_preprocessor: imputación + escala +
# one-hot con min_frequency). No es código de producto: mide.
#
# Por (dataset, modelo): CV KFold k=5 (y k=3 en 20.000 filas) con scoring neg_mean_absolute_error
# sobre el Pipeline completo dentro de train · fit en train completo + test (MAE, RMSE, R², MedAE) ·
# avisos de no-convergencia · iteraciones del MLP. Por dataset: baselines (media, mediana, lineal)
# en CV y en test · estadísticas del objetivo en train (sesgo, atípicos) · |Spearman| y η² de cada
# columna contra el objetivo en train (para el umbral de fuga continua) · costo de la
# explicabilidad del ganador (permutation importance con MAE).
#
# Privacidad (regla dura 2): el resultado lleva NOMBRES de columnas sintéticas o del kit de prueba
# (datos de la app, no del usuario) y estadísticas agregadas; jamás filas.
import json
import time
import warnings

import numpy as np
import pandas as pd
from scipy.stats import spearmanr
from sklearn.base import clone
from sklearn.compose import TransformedTargetRegressor
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import (
    ExtraTreesRegressor,
    HistGradientBoostingRegressor,
    RandomForestRegressor,
)
from sklearn.exceptions import ConvergenceWarning
from sklearn.inspection import permutation_importance
from sklearn.linear_model import Lasso, LinearRegression, Ridge
from sklearn.metrics import (
    mean_absolute_error,
    mean_squared_error,
    median_absolute_error,
    r2_score,
)
from sklearn.model_selection import KFold, cross_validate
from sklearn.neighbors import KNeighborsRegressor
from sklearn.neural_network import MLPRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeRegressor
from lightgbm import LGBMRegressor
from xgboost import XGBRegressor


def _scaled(est):
    # Lasso y MLP NO son invariantes a la escala del objetivo (la penalización L1 y el paso de
    # adam se miden en unidades de y): se ajustan sobre y estandarizado y se des-escalan solos.
    return TransformedTargetRegressor(regressor=est, transformer=StandardScaler())


def spike_roster(seed):
    # Orden PROPUESTO de prioridad (del más simple/barato al más caro); el spike lo confirma.
    return {
        "linear": LinearRegression(),
        "ridge": Ridge(),
        "lasso": _scaled(Lasso(alpha=0.01, max_iter=5000, random_state=seed)),
        "decision_tree": DecisionTreeRegressor(random_state=seed, min_samples_leaf=5),
        "knn": KNeighborsRegressor(),
        "hgb": HistGradientBoostingRegressor(random_state=seed),
        "lightgbm": LGBMRegressor(n_estimators=200, n_jobs=1, random_state=seed, verbose=-1),
        "xgboost": XGBRegressor(n_estimators=200, max_depth=6, learning_rate=0.1, n_jobs=1,
                                random_state=seed, verbosity=0, tree_method="hist"),
        "extra_trees": ExtraTreesRegressor(n_estimators=200, random_state=seed, n_jobs=1),
        "forest": RandomForestRegressor(n_estimators=200, random_state=seed, n_jobs=1),
        "mlp": _scaled(MLPRegressor(hidden_layer_sizes=(64,), max_iter=500, early_stopping=True,
                                    n_iter_no_change=10, random_state=seed)),
    }


def spike_variants(seed):
    # Variantes medidas aparte (options.variants): la evidencia de por qué Lasso y MLP escalan y.
    return {
        "lasso_sin_escalar": Lasso(alpha=0.01, max_iter=5000, random_state=seed),
        "mlp_sin_escalar": MLPRegressor(hidden_layer_sizes=(64,), max_iter=500, early_stopping=True,
                                        n_iter_no_change=10, random_state=seed),
        "mlp_sin_parada": _scaled(MLPRegressor(hidden_layer_sizes=(64,), max_iter=300, random_state=seed)),
    }


def _reg_metrics(y_true, y_pred):
    return {
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "rmse": float(np.sqrt(mean_squared_error(y_true, y_pred))),
        "r2": float(r2_score(y_true, y_pred)),
        "medae": float(median_absolute_error(y_true, y_pred)),
    }


def _r(x, d=4):
    return None if x is None or not np.isfinite(x) else round(float(x), d)


def _target_stats(y):
    q1, med, q3 = np.percentile(y, [25, 50, 75])
    iqr = q3 - q1
    mad = float(np.median(np.abs(y - med)))
    robust_z = np.abs(y - med) / (1.4826 * mad) if mad > 0 else np.zeros_like(y)
    sd = float(np.std(y, ddof=1))
    skew = float(np.mean(((y - y.mean()) / np.std(y)) ** 3)) if np.std(y) > 0 else 0.0
    return {
        "mean": _r(y.mean(), 3), "std": _r(sd, 3), "median": _r(med, 3),
        "min": _r(y.min(), 3), "max": _r(y.max(), 3),
        "skew": _r(skew, 3),
        "cv": _r(sd / abs(y.mean()), 3) if y.mean() != 0 else None,
        "share_iqr15": _r(float(np.mean((y < q1 - 1.5 * iqr) | (y > q3 + 1.5 * iqr))), 4),
        "share_iqr3": _r(float(np.mean((y < q1 - 3 * iqr) | (y > q3 + 3 * iqr))), 4),
        "share_robust_z35": _r(float(np.mean(robust_z > 3.5)), 4),
        "zeros": int(np.sum(y == 0)),
    }


def _eta_squared(groups, y, min_support):
    # η² = SS_entre / SS_total, ignorando nulos. Con min_support, las categorías con menos filas
    # que el soporte se agrupan en una sola («rara»), como el min_frequency del preprocesador.
    s = pd.Series(groups)
    keep = s.notna().to_numpy()
    s, yy = s[keep].astype(str), y[keep]
    if len(yy) < 3:
        return None
    if min_support > 1:
        counts = s.value_counts()
        rare = counts[counts < min_support].index
        s = s.where(~s.isin(rare), "__rara__")
    total = float(np.sum((yy - yy.mean()) ** 2))
    if total == 0:
        return None
    between = 0.0
    for _, idx in s.groupby(s).groups.items():
        part = yy[s.index.get_indexer(idx)]
        between += len(part) * (part.mean() - yy.mean()) ** 2
    return between / total


def _column_relations(X_train, y_train, numeric, categorical):
    out = {}
    for col in numeric:
        v = X_train[col].to_numpy(dtype=float)
        ok = np.isfinite(v)
        rho = spearmanr(v[ok], y_train[ok]).statistic if ok.sum() > 2 and np.std(v[ok]) > 0 else None
        out[col] = {"kind": "numeric", "spearman_abs": _r(abs(rho), 4) if rho is not None else None,
                    "distinct": int(pd.Series(v[ok]).nunique())}
    for col in categorical:
        g = X_train[col].to_numpy(dtype=object)
        out[col] = {"kind": "categorical",
                    "eta2": _r(_eta_squared(g, y_train, 1), 4),
                    "eta2_support5": _r(_eta_squared(g, y_train, 5), 4),
                    "distinct": int(pd.Series(g).nunique())}
    return out


def run_spike(payload_json, options_json):
    p = json.loads(payload_json)
    opts = json.loads(options_json)
    seed = int(p.get("seed", 42))
    numeric, categorical = list(p["numeric"]), list(p["categorical"])
    df = _build_frame(p["headers"], p["rows"], numeric)
    y = pd.to_numeric(df[p["target"]], errors="coerce").to_numpy(dtype=float)
    X = df[numeric + categorical]
    tr, te = np.array(p["train_idx"]), np.array(p["test_idx"])
    X_train, X_test, y_train, y_test = X.iloc[tr], X.iloc[te], y[tr], y[te]
    prep = _make_preprocessor(numeric, categorical)
    width = int(clone(prep).fit(X_train).transform(X_train.iloc[:5]).shape[1])

    out = {"n_train": int(len(tr)), "n_test": int(len(te)), "width": width,
           "target_train": _target_stats(y_train), "target_test": _target_stats(y_test),
           "columns": _column_relations(X_train, y_train, numeric, categorical),
           "members": {}, "baselines": {}}

    def cv_of(est, k):
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            t = time.perf_counter()
            cv = cross_validate(Pipeline([("prep", clone(prep)), ("model", clone(est))]),
                                X_train, y_train, cv=KFold(k, shuffle=True, random_state=seed),
                                scoring="neg_mean_absolute_error")
            elapsed = time.perf_counter() - t
        scores = -cv["test_score"]  # MAE en unidades del objetivo (menor es mejor)
        warned = any(issubclass(w.category, ConvergenceWarning) for w in caught)
        return elapsed, scores, warned

    # Baselines: media, mediana y lineal — en CV (misma partición) y en test.
    for name, est in (("mean", DummyRegressor(strategy="mean")),
                      ("median", DummyRegressor(strategy="median")),
                      ("linear", LinearRegression())):
        _, scores, _ = cv_of(est, 5)
        pipe = Pipeline([("prep", clone(prep)), ("model", clone(est))]).fit(X_train, y_train)
        m = _reg_metrics(y_test, pipe.predict(X_test))
        out["baselines"][name] = {"cv5_mean": _r(scores.mean()), "cv5_std": _r(scores.std()),
                                  **{k: _r(v) for k, v in m.items()}}

    roster = spike_variants(seed) if opts.get("variants") else spike_roster(seed)
    for name, est in roster.items():
        row = {}
        try:
            for k in opts["ks"]:
                elapsed, scores, warned = cv_of(est, k)
                row[f"cv{k}_s"] = round(elapsed, 3)
                row[f"cv{k}_mean"] = _r(scores.mean())
                row[f"cv{k}_std"] = _r(scores.std())
                row["convergence_warning"] = row.get("convergence_warning", False) or warned
            t = time.perf_counter()
            pipe = Pipeline([("prep", clone(prep)), ("model", clone(est))]).fit(X_train, y_train)
            row["fit_s"] = round(time.perf_counter() - t, 3)
            t = time.perf_counter()
            pred = pipe.predict(X_test)
            row["test_s"] = round(time.perf_counter() - t, 3)
            row["test"] = {k: _r(v) for k, v in _reg_metrics(y_test, pred).items()}
            inner = pipe.named_steps["model"]
            inner = getattr(inner, "regressor_", inner)
            n_iter = getattr(inner, "n_iter_", None)  # Ridge lo deja en None con su solver por defecto
            if n_iter is not None:
                row["n_iter"] = int(np.max(n_iter)) if np.ndim(n_iter) else int(n_iter)
                row["max_iter"] = int(getattr(inner, "max_iter", 0))
        except Exception as e:  # noqa: BLE001 — el spike registra el TIPO, nunca el mensaje
            row["error"] = type(e).__name__
        out["members"][name] = row

    # Ganador por mínimo de CV (sin regla de 1 EE: esa la aplica tabla.mjs con la prioridad)
    # y costo de su explicabilidad (permutation importance con MAE sobre test, 10 repeticiones).
    k0 = opts["ks"][0]
    ok = {n: r for n, r in out["members"].items() if r.get(f"cv{k0}_mean") is not None}
    if ok and not opts.get("variants"):
        best = min(ok, key=lambda n: ok[n][f"cv{k0}_mean"])
        pipe = Pipeline([("prep", clone(prep)), ("model", roster[best])]).fit(X_train, y_train)
        t = time.perf_counter()
        permutation_importance(pipe, X_test, y_test, scoring="neg_mean_absolute_error",
                               n_repeats=10, random_state=seed)
        out["winner"] = best
        out["explain_s"] = round(time.perf_counter() - t, 3)
    return json.dumps(out)
