# Spike MULTICLASE (S7 F0). Corre en el worker DESPUÉS de pipeline.py, así que usa el
# preprocesamiento REAL del producto (_build_frame, _make_preprocessor) y las MISMAS fábricas del
# roster (_FACTORIES): en sklearn 1.8, xgboost y lightgbm cada una ya tiene su forma multiclase
# nativa (logística multinomial con lbfgs, XGBoost multi:softprob, LightGBM multiclass…). No es
# código de producto: mide.
#
# Por (dataset, miembro): CV estratificada k=5 (y k=3 en 20.000 filas) con DOS puntajes a la vez
# (f1_macro y balanced_accuracy: mismo costo, permite comparar la regla de 1 EE con cada uno) ·
# fit en train + prueba (f1_macro, exactitud balanceada, exactitud, log-loss y AUC uno-contra-resto
# donde hay probabilidades) · avisos de no-convergencia · iteraciones del MLP. Por dataset:
# baselines (mayoritaria y logística multinomial) · la FUGA POR CLASE de cada columna, sobre train
# y uno contra el resto: AUC de rango (numéricas), pureza cruda, pureza normalizada y AUC de la
# tasa por categoría (categóricas), con el SOPORTE de la clase y del resto · el costo de la
# explicabilidad del ganador (permutation importance con f1_macro).
#
# Privacidad (regla dura 2): el resultado lleva NOMBRES de columnas y clases sintéticas o del kit
# de prueba (datos de la app, no del usuario) y estadísticas agregadas; jamás filas.
import json
import time
import warnings

import numpy as np
import pandas as pd
from scipy.stats import rankdata
from sklearn.base import clone
from sklearn.dummy import DummyClassifier
from sklearn.exceptions import ConvergenceWarning
from sklearn.inspection import permutation_importance
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    f1_score,
    log_loss,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedKFold, cross_validate
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import LabelEncoder

SCORING = {"f1_macro": "f1_macro", "balanced_accuracy": "balanced_accuracy"}
RARE_SUPPORT = 5  # ETA_MIN_SUPPORT del S6: categorías con menos filas se agrupan


def _r(x, d=4):
    return None if x is None or not np.isfinite(x) else round(float(x), d)


def _auc_ovr(score, is_c):
    """AUC de rango (Mann-Whitney, empates promediados) de `score` frente a 1[y = c]."""
    n1 = int(is_c.sum())
    n0 = int(len(is_c) - n1)
    if n1 == 0 or n0 == 0:
        return None
    ranks = rankdata(score)
    return (ranks[is_c].sum() - n1 * (n1 + 1) / 2) / (n1 * n0)


def _class_leak(X_train, y_train, numeric, categorical, classes):
    """Fuga por clase, uno contra el resto, con el soporte de cada lado (filas con valor)."""
    out = []
    for col in numeric:
        v = X_train[col].to_numpy(dtype=float)
        ok = np.isfinite(v)
        for c, name in enumerate(classes):
            is_c = y_train[ok] == c
            auc = _auc_ovr(v[ok], is_c)
            out.append({"column": col, "kind": "numeric", "class": name,
                        "n_c": int(is_c.sum()), "n_rest": int((~is_c).sum()),
                        "auc": _r(None if auc is None else max(auc, 1 - auc))})
    for col in categorical:
        s = pd.Series(X_train[col].to_numpy(dtype=object))
        ok = s.notna().to_numpy()
        g = s[ok].astype(str).reset_index(drop=True)
        counts = g.value_counts()
        rare = counts[counts < RARE_SUPPORT].index
        g_grouped = g.where(~g.isin(rare), "__rara__")
        for c, name in enumerate(classes):
            is_c = y_train[ok] == c
            n = len(g)
            n_c = int(is_c.sum())
            if n == 0 or n_c == 0 or n_c == n:
                out.append({"column": col, "kind": "categorical", "class": name,
                            "n_c": n_c, "n_rest": int(n - n_c), "purity": None,
                            "purity_norm": None, "auc_rate": None})
                continue
            frame = pd.DataFrame({"g": g, "gg": g_grouped, "c": is_c})
            # Pureza CRUDA (la fórmula binaria de hoy, uno contra el resto).
            by = frame.groupby("g")["c"].agg(["sum", "count"])
            purity = float(np.maximum(by["sum"], by["count"] - by["sum"]).sum() / n)
            # Normalizada: 0 = lo que da la clase mayoritaria sin mirar la columna; 1 = perfecta.
            base = max(n_c, n - n_c) / n
            purity_norm = (purity - base) / (1 - base) if base < 1 else None
            # AUC de la tasa de la clase por categoría (raras agrupadas), uno contra el resto.
            rate = frame.groupby("gg")["c"].transform("mean").to_numpy(dtype=float)
            auc = _auc_ovr(rate, is_c)
            out.append({"column": col, "kind": "categorical", "class": name,
                        "n_c": n_c, "n_rest": int(n - n_c),
                        "purity": _r(purity), "purity_norm": _r(purity_norm),
                        "auc_rate": _r(None if auc is None else max(auc, 1 - auc)),
                        "categories": int(len(counts))})
    return out


def _null_categorical(seed):
    """Falsas alarmas por AZAR de cada medida categórica: categorías y clases sorteadas al azar,
    sin relación. Por celda (filas de train, cuota de la clase, categorías): la fracción de
    sorteos que alcanzan 0,98 con cada medida."""
    rng = np.random.default_rng(seed)
    cells = []
    for n in (150, 600):
        for share in (0.02, 0.05, 0.1, 0.3):
            for m in (3, 10, 30):
                hits = {"purity": 0, "purity_norm": 0, "auc_rate": 0}
                sims = 300
                for _ in range(sims):
                    g = pd.Series(rng.integers(0, m, n).astype(str))
                    is_c = rng.random(n) < share
                    if is_c.sum() == 0 or is_c.sum() == n:
                        continue
                    counts = g.value_counts()
                    gg = g.where(~g.isin(counts[counts < RARE_SUPPORT].index), "__rara__")
                    frame = pd.DataFrame({"g": g, "gg": gg, "c": is_c})
                    by = frame.groupby("g")["c"].agg(["sum", "count"])
                    purity = float(np.maximum(by["sum"], by["count"] - by["sum"]).sum() / n)
                    base = max(is_c.sum(), n - is_c.sum()) / n
                    pn = (purity - base) / (1 - base)
                    rate = frame.groupby("gg")["c"].transform("mean").to_numpy(dtype=float)
                    auc = _auc_ovr(rate, is_c)
                    hits["purity"] += purity >= 0.98
                    hits["purity_norm"] += pn >= 0.98
                    hits["auc_rate"] += max(auc, 1 - auc) >= 0.98
                cells.append({"n": n, "share": share, "categories": m, "sims": sims,
                              **{k: round(v / sims, 4) for k, v in hits.items()}})
    return cells


def run_spike(payload_json, options_json):
    p = json.loads(payload_json)
    opts = json.loads(options_json)
    seed = int(p.get("seed", 42))
    numeric, categorical = list(p["numeric"]), list(p["categorical"])
    df = _build_frame(p["headers"], p["rows"], numeric)
    raw = df[p["target"]].astype(str).str.strip()
    encoder = LabelEncoder().fit(raw)
    y = encoder.transform(raw)
    classes = [str(c) for c in encoder.classes_]
    K = len(classes)
    X = df[numeric + categorical]
    tr, te = np.array(p["train_idx"]), np.array(p["test_idx"])
    X_train, X_test, y_train, y_test = X.iloc[tr], X.iloc[te], y[tr], y[te]
    prep = _make_preprocessor(numeric, categorical)
    width = int(clone(prep).fit(X_train).transform(X_train.iloc[:5]).shape[1])
    counts = np.bincount(y_train, minlength=K)

    out = {"n_train": int(len(tr)), "n_test": int(len(te)), "width": width, "K": K,
           "class_counts_train": {classes[i]: int(c) for i, c in enumerate(counts)},
           "class_counts_test": {classes[i]: int(c) for i, c in enumerate(np.bincount(y_test, minlength=K))},
           "leak": _class_leak(X_train, y_train, numeric, categorical, classes),
           "members": {}, "baselines": {}}
    if opts.get("null") or p.get("null_sim"):
        out["null_categorical"] = _null_categorical(seed)

    def cv_of(est, k):
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            t = time.perf_counter()
            cv = cross_validate(Pipeline([("prep", clone(prep)), ("model", clone(est))]),
                                X_train, y_train,
                                cv=StratifiedKFold(k, shuffle=True, random_state=seed),
                                scoring=SCORING)
            elapsed = time.perf_counter() - t
        warned = any(issubclass(w.category, ConvergenceWarning) for w in caught)
        return elapsed, cv["test_f1_macro"], cv["test_balanced_accuracy"], warned

    def test_metrics(pipe):
        pred = pipe.predict(X_test)
        m = {"f1_macro": f1_score(y_test, pred, average="macro", labels=range(K), zero_division=0),
             "balanced_accuracy": balanced_accuracy_score(y_test, pred),
             "accuracy": accuracy_score(y_test, pred), "log_loss": None, "auc_ovr": None}
        if hasattr(pipe, "predict_proba"):
            P = pipe.predict_proba(X_test)
            m["log_loss"] = log_loss(y_test, P, labels=range(K))
            try:
                m["auc_ovr"] = roc_auc_score(y_test, P, multi_class="ovr", average="macro",
                                             labels=range(K))
            except ValueError:
                m["auc_ovr"] = None  # una clase sin filas en la prueba
        return {k: _r(v) for k, v in m.items()}

    k_max = int(counts.min())
    ks = [k for k in opts["ks"] if k <= k_max] or ([k_max] if k_max >= 2 else [])
    out["ks"] = ks

    for name, est in (("majority", DummyClassifier(strategy="most_frequent")),
                      ("logistic", _FACTORIES["logistic"](seed))):
        row = {}
        if ks:
            _, f1s, bas, _ = cv_of(est, ks[0])
            row.update({"cv_f1_mean": _r(f1s.mean()), "cv_f1_std": _r(f1s.std()),
                        "cv_bal_mean": _r(bas.mean()), "cv_bal_std": _r(bas.std())})
        pipe = Pipeline([("prep", clone(prep)), ("model", clone(est))]).fit(X_train, y_train)
        row["test"] = test_metrics(pipe)
        out["baselines"][name] = row

    for name, factory in _FACTORIES.items():
        est = factory(seed)
        row = {}
        try:
            for k in ks:
                elapsed, f1s, bas, warned = cv_of(est, k)
                row[f"cv{k}_s"] = round(elapsed, 3)
                row[f"cv{k}_f1_mean"] = _r(f1s.mean())
                row[f"cv{k}_f1_std"] = _r(f1s.std())
                row[f"cv{k}_bal_mean"] = _r(bas.mean())
                row[f"cv{k}_bal_std"] = _r(bas.std())
                row["convergence_warning"] = row.get("convergence_warning", False) or warned
            t = time.perf_counter()
            pipe = Pipeline([("prep", clone(prep)), ("model", clone(est))]).fit(X_train, y_train)
            row["fit_s"] = round(time.perf_counter() - t, 3)
            t = time.perf_counter()
            row["test"] = test_metrics(pipe)
            row["test_s"] = round(time.perf_counter() - t, 3)
            n_iter = getattr(pipe.named_steps["model"], "n_iter_", None)
            if n_iter is not None:
                row["n_iter"] = int(np.max(n_iter)) if np.ndim(n_iter) else int(n_iter)
                row["max_iter"] = int(getattr(pipe.named_steps["model"], "max_iter", 0))
        except Exception as e:  # noqa: BLE001 — el spike registra el TIPO, nunca el mensaje
            row["error"] = type(e).__name__
        out["members"][name] = row

    # Costo de la explicabilidad del ganador por máximo de CV en f1_macro (la regla de 1 EE la
    # aplica tabla.mjs con la prioridad), sobre la prueba, 10 repeticiones.
    k0 = ks[0] if ks else None
    ok = {n: r for n, r in out["members"].items() if k0 and r.get(f"cv{k0}_f1_mean") is not None}
    if ok and p.get("explain"):
        best = max(ok, key=lambda n: ok[n][f"cv{k0}_f1_mean"])
        pipe = Pipeline([("prep", clone(prep)), ("model", _FACTORIES[best](seed))]).fit(X_train, y_train)
        t = time.perf_counter()
        permutation_importance(pipe, X_test, y_test, scoring="f1_macro", n_repeats=10,
                               random_state=seed)
        out["explain"] = {"member": best, "seconds": round(time.perf_counter() - t, 3)}
    return json.dumps(out)
