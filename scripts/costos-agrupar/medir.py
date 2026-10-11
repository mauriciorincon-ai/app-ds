# Medición de COSTOS de agrupar (S7 F2) sobre el flujo REAL del producto: corre en el worker
# DESPUÉS de pipeline.py (correr.mjs con SPIKE_PY). Por dataset:
# - cada agrupador con `fit_member` (task «agrupar»): su barrido de k + su lectura (referencia
#   nula + estabilidad) + sus perfiles — lo que costaría si ganara, la cota con que E2 reparte;
# - el flujo entero con `run_experiment` (los cuatro barridos + la lectura del ganador): contra
#   él se verifica la estimación y el techo del Nivel 1.
# Privacidad (regla dura 2): solo tiempos, k y estados; jamás filas ni etiquetas.
import json
import time


def run_spike(payload_json, options_json):
    p = json.loads(payload_json)
    out = {"members": {}}
    for name in p["roster"]:
        q = {k: v for k, v in p.items() if k != "roster"}
        q["member"] = name
        t = time.perf_counter()
        try:
            res = json.loads(fit_member(json.dumps(q)))
            out["members"][name] = {"seconds": round(time.perf_counter() - t, 4), "k": res["k"]}
        except Exception as error:  # noqa: BLE001 — solo el tipo
            out["members"][name] = {
                "seconds": round(time.perf_counter() - t, 4),
                "error": type(error).__name__,
            }
    t = time.perf_counter()
    flow = json.loads(run_experiment(payload_json))
    out["flow"] = {
        "seconds": round(time.perf_counter() - t, 4),
        "winner": flow["winner"],
        "reading": flow["reading"]["level"],
        "k": flow["consensus"]["k"],
        "sweep_ms": {row["name"]: row["elapsed_ms"] for row in flow["league"]},
        "status": {row["name"]: row["status"] for row in flow["league"]},
    }
    out["winner"] = flow["winner"]
    return json.dumps(out)
