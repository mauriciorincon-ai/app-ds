# Spike de AGRUPAR (S7 F0). Corre en el worker DESPUÉS de pipeline.py, así que usa el
# preprocesamiento REAL del producto (_build_frame, _make_preprocessor) ajustado sobre TODAS las
# filas (agrupar no tiene objetivo ni prueba). No es código de producto: mide.
#
# Por dataset y agrupador:
# - K-Means y GaussianMixture con k en el rango pedido: tiempo de ajuste, silueta (sobre UNA
#   muestra sembrada que comparten todos), inercia y BIC;
# - Agglomerative (ward) con UN `linkage` de scipy cortado con `fcluster` para cada k: el tiempo
#   del linkage aparte (O(n²) en memoria: las sondas `agglo_only` miden desde dónde no cabe);
# - HDBSCAN con varios `min_cluster_size`: k encontrado, cuota de ruido, silueta sin el ruido;
# - el puntaje comparable propuesto: silueta × (1 − cuota de ruido);
# - la ESTABILIDAD por re-muestreo de cada agrupador en su configuración elegida: R submuestras
#   sembradas (fracción f), re-ajuste con el mismo k, ARI contra las etiquetas del ajuste completo
#   sobre las filas compartidas (el ruido de HDBSCAN cuenta como una etiqueta más).
# - DOS preprocesamientos (la humo mostró que el one-hot de las categóricas crea subestructura:
#   K-Means elegía k = 12 en los 3 grupos plantados): «completo» (numéricas + one-hot, el del
#   producto) y «numericas» (solo numéricas escaladas; las categóricas describirían, no formarían);
# - una REFERENCIA NULA por agrupador (estadístico gap): el mismo agrupador, con su k, sobre datos
#   uniformes en la caja de la muestra rotada por PCA; silueta nula y diferencia. La humo mostró que
#   silueta + estabilidad NO separan datos uniformes en 1-D (k = 2, silueta 0,62, ARI 0,98).
#
# Privacidad (regla dura 2): el resultado lleva estadísticas agregadas de datos sintéticos o del
# kit de prueba; jamás filas ni etiquetas por fila.
import json
import time

import numpy as np
from scipy.cluster.hierarchy import fcluster, linkage
from sklearn.cluster import HDBSCAN, KMeans
from sklearn.metrics import adjusted_rand_score, silhouette_score
from sklearn.mixture import GaussianMixture


def _r(x, d=4):
    return None if x is None or not np.isfinite(x) else round(float(x), d)


def run_spike(payload_json, options_json):
    p = json.loads(payload_json)
    opts = json.loads(options_json)
    seed = int(p.get("seed", 42))
    numeric, categorical = list(p["numeric"]), list(p["categorical"])
    df = _build_frame(p["headers"], p["rows"], numeric)
    out = {"n": int(len(df)), "variants": {}}
    variants = [("completo", numeric, categorical)]
    if categorical and numeric and not p.get("agglo_only"):
        variants.append(("numericas", numeric, []))
    for vname, num, cat in variants:
        t = time.perf_counter()
        Z = np.asarray(_make_preprocessor(num, cat).fit_transform(df[num + cat]), dtype=float)
        prep_s = time.perf_counter() - t
        out["variants"][vname] = _algos(Z, p, opts, seed, round(prep_s, 3))
    return json.dumps(out)


def _algos(Z, p, opts, seed, prep_s):
    k_min, k_max = int(opts.get("k_min", 2)), int(opts.get("k_max", 12))
    resamples = int(opts.get("resamples", 10))
    fraction = float(opts.get("fraction", 0.8))
    n_init = int(opts.get("n_init", 5))
    null_draws = int(opts.get("null_draws", 3))
    n, width = Z.shape
    rng = np.random.default_rng(seed)
    S = min(n, int(opts.get("sil_sample", 2000)))
    sample = np.sort(rng.choice(n, S, replace=False))
    out = {"width": int(width), "prep_s": prep_s, "sil_sample": int(S), "algos": {}}

    # Referencia nula: uniforme en la caja de la muestra rotada por PCA (estadístico gap,
    # Tibshirani 2001), mismo tamaño que la muestra; `null_draws` sorteos sembrados.
    Zs = Z[sample]
    mu = Zs.mean(axis=0)
    _, _, Vt = np.linalg.svd(Zs - mu, full_matrices=False)
    rot = (Zs - mu) @ Vt.T
    lo, hi = rot.min(axis=0), rot.max(axis=0)
    null_rng = np.random.default_rng(seed + 2000)
    null_sets = [null_rng.uniform(lo, hi, size=rot.shape) @ Vt + mu for _ in range(null_draws)]

    def null_silhouette(fit_labels):
        sils = []
        for Zn in null_sets:
            labs = fit_labels(Zn)
            keep = labs >= 0
            if keep.sum() < 3 or len(np.unique(labs[keep])) < 2:
                sils.append(0.0)
                continue
            sils.append(float(silhouette_score(Zn[keep], labs[keep])) * float(keep.mean()))
        return _r(float(np.mean(sils)))

    def sil(labels, keep=None):
        idx = sample if keep is None else sample[keep[sample]]
        labs = labels[idx]
        if len(idx) < 3 or len(np.unique(labs)) < 2:
            return None
        t0 = time.perf_counter()
        s = silhouette_score(Z[idx], labs)
        return float(s), time.perf_counter() - t0

    def stability(fit_labels, full_labels):
        """R submuestras sembradas; ARI de cada re-ajuste contra el ajuste completo."""
        r_rng = np.random.default_rng(seed + 1000)
        aris, t0 = [], time.perf_counter()
        for r in range(resamples):
            idx = np.sort(r_rng.choice(n, int(fraction * n), replace=False))
            labels_r = fit_labels(Z[idx], seed + 1 + r)
            aris.append(float(adjusted_rand_score(full_labels[idx], labels_r)))
        return {"aris": [_r(a) for a in aris], "mean": _r(np.mean(aris)), "min": _r(np.min(aris)),
                "mean_first5": _r(np.mean(aris[:5])), "min_first5": _r(np.min(aris[:5])),
                "seconds": round(time.perf_counter() - t0, 3)}

    ks = list(range(k_min, k_max + 1))

    if not p.get("agglo_only"):
        # K-Means: k por silueta máxima (empate → el k menor).
        rows, best = [], None
        for k in ks:
            t0 = time.perf_counter()
            km = KMeans(n_clusters=k, n_init=n_init, random_state=seed).fit(Z)
            fit_s = time.perf_counter() - t0
            s = sil(km.labels_)
            null = null_silhouette(
                lambda X: KMeans(n_clusters=k, n_init=n_init, random_state=seed).fit(X).labels_)
            rows.append({"k": k, "fit_s": round(fit_s, 3), "silhouette": _r(s and s[0]),
                         "sil_s": round(s[1], 3) if s else None, "inertia": _r(km.inertia_, 2),
                         "null": null, "gap": _r(s[0] - null) if s and null is not None else None})
            if s and (best is None or s[0] > best[1]):
                best = (k, s[0], km.labels_)
        entry = {"per_k": rows}
        if best:
            k_b = best[0]
            entry["chosen"] = {"k": k_b, "silhouette": _r(best[1]), "score": _r(best[1]),
                               "null_score": null_silhouette(
                                   lambda X: KMeans(n_clusters=k_b, n_init=n_init,
                                                    random_state=seed).fit(X).labels_)}
            entry["stability"] = stability(
                lambda X, s_: KMeans(n_clusters=k_b, n_init=n_init, random_state=s_).fit(X).labels_,
                best[2])
        out["algos"]["kmeans"] = entry

        # GaussianMixture: k por BIC mínimo (empate → el k menor).
        rows, best = [], None
        for k in ks:
            t0 = time.perf_counter()
            try:
                gm = GaussianMixture(n_components=k, random_state=seed).fit(Z)
            except Exception as e:  # noqa: BLE001 — solo el tipo
                rows.append({"k": k, "error": type(e).__name__})
                continue
            fit_s = time.perf_counter() - t0
            labels = gm.predict(Z)
            bic = float(gm.bic(Z))
            s = sil(labels)
            null = null_silhouette(
                lambda X: GaussianMixture(n_components=k, random_state=seed).fit(X).predict(X))
            rows.append({"k": k, "fit_s": round(fit_s, 3), "bic": _r(bic, 2),
                         "silhouette": _r(s and s[0]), "converged": bool(gm.converged_),
                         "null": null, "gap": _r(s[0] - null) if s and null is not None else None})
            if best is None or bic < best[1]:
                best = (k, bic, labels, s and s[0])
        entry = {"per_k": rows}
        if best:
            k_b = best[0]
            entry["chosen"] = {"k": k_b, "bic": _r(best[1], 2), "silhouette": _r(best[3]),
                               "score": _r(best[3]),
                               "null_score": null_silhouette(
                                   lambda X: GaussianMixture(n_components=k_b,
                                                             random_state=seed).fit(X).predict(X))}
            entry["stability"] = stability(
                lambda X, s_: GaussianMixture(n_components=k_b, random_state=s_).fit(X).predict(X),
                best[2])
        out["algos"]["gmm"] = entry

        # HDBSCAN: sin k; varios min_cluster_size. Ruido = −1 («fuera de todo grupo»).
        rows = []
        auto = max(5, n // 50)
        for mcs in sorted({5, 10, auto, max(5, n // 20)}):
            t0 = time.perf_counter()
            h = HDBSCAN(min_cluster_size=mcs).fit(Z)
            fit_s = time.perf_counter() - t0
            labels = h.labels_
            keep = labels >= 0
            noise = float(1 - keep.mean())
            k_found = int(len(np.unique(labels[keep])))
            s = sil(labels, keep) if k_found >= 2 else None
            score = s[0] * (1 - noise) if s else None
            rows.append({"min_cluster_size": mcs, "fit_s": round(fit_s, 3), "k": k_found,
                         "noise_share": _r(noise), "silhouette_non_noise": _r(s and s[0]),
                         "score": _r(score)})
        entry = {"per_mcs": rows}
        default = next((r for r in rows if r["min_cluster_size"] == auto), rows[-1])
        mcs_b = default["min_cluster_size"]
        entry["chosen"] = {**default, "rule": "min_cluster_size = max(5, n/50)",
                           "null_score": null_silhouette(
                               lambda X: HDBSCAN(min_cluster_size=mcs_b).fit(X).labels_)}
        full = HDBSCAN(min_cluster_size=mcs_b).fit(Z).labels_
        entry["stability"] = stability(lambda X, s_: HDBSCAN(min_cluster_size=mcs_b).fit(X).labels_,
                                       full)
        out["algos"]["hdbscan"] = entry

    # Agglomerative (ward): UN linkage, cortado para cada k. Las sondas `agglo_only` miden el
    # costo del linkage y si cabe; ahí no se corta ni se calcula silueta.
    if p.get("agglo_only") or n <= int(opts.get("agglo_max", 12000)):
        try:
            t0 = time.perf_counter()
            L = linkage(Z, method="ward")
            link_s = time.perf_counter() - t0
            entry = {"linkage_s": round(link_s, 3)}
            if not p.get("agglo_only"):
                rows, best = [], None
                null_links = [linkage(Zn, method="ward") for Zn in null_sets]
                for k in ks:
                    labels = fcluster(L, k, criterion="maxclust") - 1
                    s = sil(labels)
                    nulls = []
                    for Zn, Ln in zip(null_sets, null_links):
                        labs = fcluster(Ln, k, criterion="maxclust") - 1
                        nulls.append(float(silhouette_score(Zn, labs))
                                     if len(np.unique(labs)) >= 2 else 0.0)
                    null = _r(float(np.mean(nulls)))
                    rows.append({"k": k, "silhouette": _r(s and s[0]), "null": null,
                                 "gap": _r(s[0] - null) if s and null is not None else None})
                    if s and (best is None or s[0] > best[1]):
                        best = (k, s[0], labels)
                entry["per_k"] = rows
                if best:
                    k_b = best[0]
                    entry["chosen"] = {"k": k_b, "silhouette": _r(best[1]), "score": _r(best[1]),
                                       "null_score": null_silhouette(
                                           lambda X: fcluster(linkage(X, method="ward"), k_b,
                                                              criterion="maxclust") - 1)}
                    entry["stability"] = stability(
                        lambda X, s_: fcluster(linkage(X, method="ward"), k_b,
                                               criterion="maxclust") - 1,
                        best[2])
            out["algos"]["agglomerative"] = entry
        except Exception as e:  # noqa: BLE001 — MemoryError y similares: solo el tipo
            out["algos"]["agglomerative"] = {"error": type(e).__name__}
    else:
        out["algos"]["agglomerative"] = {"skipped": f"n > agglo_max ({opts.get('agglo_max', 12000)})"}
    return out
