# Fixture del test de supuestos F0 (Sprint 004). Corre dentro de Pyodide y
# devuelve un JSON que el test de TS aserta. NO es código de producción.
import json

import numpy as np
from sklearn.ensemble import (
    HistGradientBoostingClassifier,
    HistGradientBoostingRegressor,
)
from sklearn.preprocessing import OneHotEncoder

result = {}

# (a) Boosting disponible en este sklearn.
result["hgb_classifier"] = HistGradientBoostingClassifier is not None
result["hgb_regressor"] = HistGradientBoostingRegressor is not None

# (b) OneHotEncoder(min_frequency=2) agrupa categorías raras — aprendido de FIT.
#     Fit sobre a×3, b×2, c×1 ⇒ solo "c" cae por debajo del umbral.
enc = OneHotEncoder(min_frequency=2, handle_unknown="infrequent_if_exist")
x_fit = np.array([["a"], ["a"], ["a"], ["b"], ["b"], ["c"]], dtype=object)
enc.fit(x_fit)

infrequent = enc.infrequent_categories_[0]
result["infrequent_categories"] = (
    [str(c) for c in infrequent] if infrequent is not None else []
)
result["feature_names"] = [str(n) for n in enc.get_feature_names_out()]

# La agrupación proviene SOLO de fit: "c" abunda ahora pero siguió siendo rara en
# fit; "z" nunca se vio. Ambas deben caer al bucket infrecuente.
out_c = enc.transform(np.array([["c"]], dtype=object)).toarray()[0]
out_unseen = enc.transform(np.array([["z"]], dtype=object)).toarray()[0]
result["transform_c"] = [int(v) for v in out_c]
result["transform_unseen"] = [int(v) for v in out_unseen]

json.dumps(result)
