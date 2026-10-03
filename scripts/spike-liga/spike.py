# Spike de costos de la liga (S5 F0). Se ejecuta en el worker DESPUÉS de pipeline.py, así que
# usa el preprocesamiento REAL del producto (_build_frame, _make_preprocessor con one-hot +
# imputación + min_frequency, _metrics, _explainability). No es código de producto: mide.
#
# Por cada (dataset, modelo): CV estratificada k=5 (y k=3 en el dataset grande) sobre el
# Pipeline completo dentro de train · fit en train completo + predicción en test (lo que costaría
# mostrar el test de los perdedores) · avisos de no-convergencia. Por dataset: ancho tras
# one-hot, explicabilidad del ganador, y el antes/después H1→S5 (ganador y veredicto).
import json
import time
import warnings

import numpy as np
from sklearn.base import clone
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import (
    ExtraTreesClassifier,
    HistGradientBoostingClassifier,
    RandomForestClassifier,
)
from sklearn.exceptions import ConvergenceWarning
from sklearn.linear_model import LogisticRegression, RidgeClassifier
from sklearn.model_selection import StratifiedKFold, cross_validate
from sklearn.naive_bayes import GaussianNB
from sklearn.neighbors import KNeighborsClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.svm import LinearSVC
from sklearn.tree import DecisionTreeClassifier
from lightgbm import LGBMClassifier
from xgboost import XGBClassifier

SCORER = {"auc": "roc_auc", "f1": "f1", "accuracy": "accuracy", "precision": "precision", "recall": "recall"}
TIE_EPSILON = 0.01  # espejo de verdict.ts (solo para el antes/después del spike)


def spike_roster(seed):
    return {
        "logistic": LogisticRegression(max_iter=1000, random_state=seed),
        "logistic_balanced": LogisticRegression(max_iter=1000, random_state=seed, class_weight="balanced"),
        "ridge": RidgeClassifier(random_state=seed),
        "naive_bayes": GaussianNB(),
        "knn": KNeighborsClassifier(),
        "linear_svc": LinearSVC(random_state=seed),
        "decision_tree": DecisionTreeClassifier(random_state=seed, min_samples_leaf=5),
        "extra_trees": ExtraTreesClassifier(n_estimators=200, random_state=seed, n_jobs=1),
        "forest": RandomForestClassifier(n_estimators=200, random_state=seed, n_jobs=1),
        "forest_balanced": RandomForestClassifier(n_estimators=200, random_state=seed, n_jobs=1, class_weight="balanced"),
        "hgb": HistGradientBoostingClassifier(random_state=seed),
        "xgboost": XGBClassifier(n_estimators=200, max_depth=6, learning_rate=0.1, n_jobs=1, random_state=seed, verbosity=0, tree_method="hist"),
        "lightgbm": LGBMClassifier(n_estimators=200, n_jobs=1, random_state=seed, verbose=-1),
        "mlp": MLPClassifier(hidden_layer_sizes=(64,), max_iter=300, random_state=seed),
    }


def spike_variants(seed):
    # Variantes medidas aparte (options.variants): candidatas a reemplazar a un miembro que no
    # converge o cuesta demasiado. No entran al antes/después ni al ajuste de costos.
    return {
        "mlp_early_stopping": MLPClassifier(hidden_layer_sizes=(64,), max_iter=500, early_stopping=True,
                                            n_iter_no_change=10, random_state=seed),
        "mlp_adam_500": MLPClassifier(hidden_layer_sizes=(64,), max_iter=500, random_state=seed),
    }


def _scores(pipe, X):
    if hasattr(pipe, "predict_proba"):
        try:
            return pipe.predict_proba(X)[:, 1]
        except AttributeError:
            pass
    return pipe.decision_function(X)


def _verdict(model_score, baseline_score):
    delta = model_score - baseline_score
    return "beats" if delta > TIE_EPSILON else ("loses" if delta < -TIE_EPSILON else "ties")


def run_spike(payload_json, options_json):
    p = json.loads(payload_json)
    opts = json.loads(options_json)
    seed = int(p.get("seed", 42))
    numeric, categorical = list(p["numeric"]), list(p["categorical"])
    df = _build_frame(p["headers"], p["rows"], numeric)
    target = df[p["target"]].astype("string")
    counts = target.value_counts()
    classes = sorted(counts.index.tolist())
    positive = min(classes, key=lambda c: (counts[c], [-ord(ch) for ch in c]))
    y = (target == positive).astype(int).to_numpy()
    X = df[numeric + categorical]
    tr, te = np.array(p["train_idx"]), np.array(p["test_idx"])
    X_train, X_test, y_train, y_test = X.iloc[tr], X.iloc[te], y[tr], y[te]
    metric = p["primary_metric"]
    prep = _make_preprocessor(numeric, categorical)
    width = int(clone(prep).fit(X_train).transform(X_train.iloc[:5]).shape[1])

    out = {"n_train": int(len(tr)), "n_test": int(len(te)), "width": width, "metric": metric, "members": {}}

    # Baselines sobre test (como hoy).
    baselines = {}
    for name, est in (("majority", DummyClassifier(strategy="most_frequent")), ("logistic", LogisticRegression(max_iter=1000, random_state=seed))):
        pipe = Pipeline([("prep", clone(prep)), ("model", est)]).fit(X_train, y_train)
        baselines[name] = _metrics(y_test, pipe.predict(X_test), _scores(pipe, X_test))[metric]
    best_baseline = max(baselines.values())
    out["baselines"] = baselines

    roster = spike_variants(seed) if opts.get("variants") else spike_roster(seed)
    only = opts.get("only")
    for name, est in roster.items():
        if only and name not in only:
            continue
        row = {}
        for k in opts["ks"]:
            t = time.perf_counter()
            try:
                with warnings.catch_warnings(record=True) as caught:
                    warnings.simplefilter("always")
                    cv = cross_validate(
                        Pipeline([("prep", clone(prep)), ("model", clone(est))]),
                        X_train, y_train,
                        cv=StratifiedKFold(k, shuffle=True, random_state=seed),
                        scoring=SCORER[metric],
                    )
                row[f"cv{k}_s"] = round(time.perf_counter() - t, 3)
                row[f"cv{k}_mean"] = round(float(np.mean(cv["test_score"])), 4)
                row[f"cv{k}_std"] = round(float(np.std(cv["test_score"])), 4)
                row["convergence_warning"] = row.get("convergence_warning", False) or any(
                    issubclass(w.category, ConvergenceWarning) for w in caught
                )
            except Exception as e:  # noqa: BLE001 — el spike registra el TIPO, nunca el mensaje
                row[f"cv{k}_s"] = round(time.perf_counter() - t, 3)
                row["error"] = type(e).__name__
        # Fit en train completo + test (lo que cuesta ver el test de los perdedores).
        t = time.perf_counter()
        try:
            pipe = Pipeline([("prep", clone(prep)), ("model", clone(est))]).fit(X_train, y_train)
            row["fit_s"] = round(time.perf_counter() - t, 3)
            t = time.perf_counter()
            row["test"] = round(_metrics(y_test, pipe.predict(X_test), _scores(pipe, X_test))[metric], 4)
            row["test_s"] = round(time.perf_counter() - t, 3)
        except Exception as e:  # noqa: BLE001
            row["error"] = type(e).__name__
        out["members"][name] = row

    # Antes/después: H1 elegía entre forest y hgb por TEST; S5 elige entre todos por CV k=5.
    k0 = opts["ks"][0]
    m = out["members"]
    if "forest" in m and "hgb" in m and "test" in m["forest"] and "test" in m["hgb"]:
        h1 = "forest" if m["forest"]["test"] >= m["hgb"]["test"] else "hgb"
        out["h1"] = {"winner": h1, "test": m[h1]["test"], "verdict": _verdict(m[h1]["test"], best_baseline)}
    ok = {n: r for n, r in m.items() if f"cv{k0}_mean" in r and "error" not in r}
    if ok:
        s5 = max(ok, key=lambda n: ok[n][f"cv{k0}_mean"])  # empate → el primero del roster
        out["s5"] = {"winner": s5, "cv": ok[s5][f"cv{k0}_mean"], "test": m[s5].get("test"), "verdict": _verdict(m[s5].get("test", 0), best_baseline)}
        # Costo de la explicabilidad del ganador (permutation importance sobre test, como hoy).
        source = spike_variants(seed) if opts.get("variants") else spike_roster(seed)
        pipe = Pipeline([("prep", clone(prep)), ("model", source[s5])]).fit(X_train, y_train)
        t = time.perf_counter()
        try:
            _explainability(pipe, X_test, y_test, numeric + categorical, numeric, seed)
            out["s5"]["explain_s"] = round(time.perf_counter() - t, 3)
        except Exception as e:  # noqa: BLE001
            out["s5"]["explain_error"] = type(e).__name__
    return json.dumps(out)
