#!/usr/bin/env python3
"""Receta reproducible de un modelo de Probeta DS · Reproducible recipe of a Probeta DS model.

ES — Con TU CSV, repite lo que hizo la app en tu navegador: lee el archivo, lo sanea como lo hizo (columnas apartadas, filas
repetidas), parte train y prueba con la misma semilla, ajusta el MISMO preprocesador y el MISMO modelo, y mide la prueba. Imprime
las métricas esperadas junto a las obtenidas: «reproduce» si coinciden dentro de la tolerancia, y si no, cuáles difieren y por
cuánto. Nunca dice «reproduce» sin haberlo comprobado. No lleva ni una fila de tus datos: solo nombres de columnas, la semilla,
el modelo y las métricas que midió la app (la clase positiva y las clases las deriva de TU archivo al correr).

EN — With YOUR CSV it repeats what the app did in your browser: it reads the file, sanitises it the way the app did (columns set
aside, repeated rows), splits train and test with the same seed, fits the SAME preprocessor and the SAME model, and measures the
test set. It prints the expected metrics next to the obtained ones: «reproduces» if they agree within the tolerance and, if not,
which differ and by how much. It never says «reproduces» without checking. It carries no row of your data: only column names, the
seed, the model and the metrics the app measured (the positive class and the classes are derived from YOUR file when it runs).

Cómo se corre / How to run (Python 3.14, versiones fijas / pinned versions, see the list below):
    pip install <las versiones de la lista / the versions in the list>      (o / or requirements-receta.txt)
    python receta.py ruta/a/tu.csv

Una parte de este archivo (las fábricas del modelo, el preprocesador y las métricas) se copia, tal cual, del código de Probeta DS
que corrió en el navegador; la otra (leer el CSV, sanear, partir) es la que en la app vive en el navegador y aquí se repite en
Python. Una prueba de la CI comprueba que las dos dan lo mismo. / Part of this file is copied verbatim from the Probeta DS code that
ran in the browser; the rest (reading the CSV, sanitising, splitting) lives in the browser in the app and is repeated here in Python.
"""
# @@IMPORTS@@
import csv

DECLARACION = json.loads(r'''@@DECLARACION@@''')
VERSIONES_FIJAS = json.loads(r'''@@VERSIONES@@''')

# @@PIPELINE@@

_FACTORIES_BY_TASK = {
    "binaria": _FACTORIES,
    "multiclase": _FACTORIES,
    "numerica": _REGRESSORS,
    "agrupar": {},
}

# La tolerancia de «reproduce» (ADR 024): una misma cuenta en otra máquina (otra librería de álgebra lineal, otro orden de
# suma) puede diferir en las últimas cifras; esto es mucho más fino que lo que se lee en pantalla (dos decimales).
TOLERANCIA = 1e-6


class Falla(Exception):
    """Algo que el usuario puede arreglar (su archivo, sus versiones): se dice y se sale con código 2."""


# --- La partición con semilla: el mismo PRNG y el mismo reparto que src/engine/split.ts, bit a bit --------------------

def _imul(a, b):
    r = (a * b) & 0xFFFFFFFF
    return r - 0x100000000 if r & 0x80000000 else r


def _i32(x):
    x &= 0xFFFFFFFF
    return x - 0x100000000 if x & 0x80000000 else x


def mulberry32(seed):
    estado = {"a": seed & 0xFFFFFFFF}

    def rng():
        a = _i32(estado["a"] + 0x6D2B79F5)
        estado["a"] = a
        t = _imul(a ^ ((a & 0xFFFFFFFF) >> 15), 1 | a)
        t = _i32(t + _imul(t ^ ((t & 0xFFFFFFFF) >> 7), 61 | t)) ^ t
        return ((t ^ ((t & 0xFFFFFFFF) >> 14)) & 0xFFFFFFFF) / 4294967296

    return rng


def _barajar(indices, rng):
    arr = list(indices)
    for i in range(len(arr) - 1, 0, -1):
        j = math.floor(rng() * (i + 1))
        arr[i], arr[j] = arr[j], arr[i]
    return arr


def particion_estratificada(etiquetas, fraccion, semilla):
    rng = mulberry32(semilla)
    por_clase = {}
    for indice, etiqueta in enumerate(etiquetas):
        por_clase.setdefault(etiqueta, []).append(indice)
    train, test = [], []
    for indices in por_clase.values():
        barajados = _barajar(indices, rng)
        if len(barajados) >= 2:
            n_test = math.floor(len(barajados) * fraccion + 0.5)  # Math.round de JavaScript
            n_test = min(max(n_test, 1), len(barajados) - 1)
        else:
            n_test = 0
        for posicion, indice in enumerate(barajados):
            (test if posicion < n_test else train).append(indice)
    return sorted(train), sorted(test)


def particion_por_cuantiles(valores, fraccion, semilla, bandas=5):
    orden = sorted(range(len(valores)), key=lambda i: (valores[i], i))
    banda = [0] * len(valores)
    for rango, indice in enumerate(orden):
        banda[indice] = min(bandas - 1, (rango * bandas) // len(valores))
    return particion_estratificada(banda, fraccion, semilla)


# --- Lo que la app hace con el archivo antes de entrenar ------------------------------------------------------------

_NUMERO = re.compile(r"^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$", re.ASCII)


def leer_numero(texto):
    """parseNumber de la app: un número decimal (sin hex/binario/octal), o None."""
    t = texto.strip()
    if not _NUMERO.match(t):
        return None
    valor = float(t)
    return valor if math.isfinite(valor) else None


def leer_csv(ruta):
    """Como la app: comillas dobles RFC 4180, BOM fuera, líneas vacías fuera y todas las filas del ancho de la cabecera."""
    with open(ruta, newline="", encoding="utf-8-sig") as archivo:
        todas = [fila for fila in csv.reader(archivo) if not (len(fila) == 1 and fila[0].strip() == "")]
    if len(todas) < 2:
        raise Falla(t("vacio"))
    cabecera, filas = todas[0], todas[1:]
    for posicion, fila in enumerate(filas):
        if len(fila) != len(cabecera):
            raise Falla(t("ancho", fila=posicion + 2, tiene=len(fila), esperadas=len(cabecera)))
    return cabecera, filas


def sanear(cabecera, filas, excluidas):
    """El saneamiento estructural de la app: filas exactamente repetidas fuera (queda la primera) y las columnas que apartó
    (identificadores y constantes), que aquí se dicen por nombre. La coerción de las numéricas sucias ya la hace
    `_build_frame` con `pd.to_numeric(errors="coerce")`."""
    vistas, unicas = set(), []
    for fila in filas:
        clave = tuple(fila)
        if clave not in vistas:
            vistas.add(clave)
            unicas.append(fila)
    fuera = set(excluidas)
    quedan = [i for i, nombre in enumerate(cabecera) if nombre not in fuera]
    return [cabecera[i] for i in quedan], [[fila[i] for i in quedan] for fila in unicas]


def preparar(decl, cabecera, filas):
    """El payload que la app le manda a su Python (mismo contrato) y el reparto train/prueba."""
    objetivo = decl["objetivo"]
    if objetivo not in cabecera:
        raise Falla(t("falta_objetivo", c=objetivo))
    faltan = [c for c in decl["numericas"] + decl["categoricas"] if c not in cabecera]
    if faltan:
        raise Falla(t("faltan", c=", ".join(faltan)))
    # el orden de las columnas es el de la tabla (así las eligió la app): importa a los árboles con empates
    numericas = [c for c in cabecera if c in set(decl["numericas"])]
    categoricas = [c for c in cabecera if c in set(decl["categoricas"])]
    k = cabecera.index(objetivo)
    filas = [f for f in filas if f[k].strip().lower() not in _NULL_TOKENS]  # sin objetivo no se entrena ni se mide
    tarea = decl["tarea"]
    semilla, fraccion = int(decl["semilla"]), float(decl["fraccion_prueba"])
    payload = {
        "task": tarea,
        "headers": cabecera,
        "rows": filas,
        "target": objetivo,
        "numeric": numericas,
        "categorical": categoricas,
        "seed": semilla,
        "primary_metric": decl["metrica"],
    }

    def dos_clases():
        distintas = len({f[k].strip() for f in filas})
        if distintas != 2:  # otro archivo con otro objetivo: se dice la causa en vez de medir algo sin sentido
            raise Falla(t("clases", c=objetivo, n=distintas))
        return particion_estratificada([f[k] for f in filas], fraccion, semilla)

    def varias_categorias():
        etiquetas = [f[k].strip() for f in filas]
        payload["classes"] = sorted(set(etiquetas))
        return particion_estratificada(etiquetas, fraccion, semilla)

    def una_cantidad():
        valores = [leer_numero(f[k]) for f in filas]
        if any(v is None for v in valores):
            raise Falla(t("no_numero"))
        return particion_por_cuantiles(valores, fraccion, semilla)

    def sin_receta():
        raise Falla(t("tarea", t=tarea))

    payload["train_idx"], payload["test_idx"] = _by_task(tarea, {
        "binaria": dos_clases,
        "multiclase": varias_categorias,
        "numerica": una_cantidad,
        "agrupar": sin_receta,
    })()
    return payload


TEXTOS = {
    "es": {
        "titulo": "Receta de «{miembro}» · {tarea} · objetivo «{objetivo}» · archivo original: {archivo}",
        "filas": "Filas leídas: {leidas} · tras sanear: {saneadas} · entrenamiento: {train} · prueba: {test} · semilla: {semilla}",
        "particion": "✕ NO reproduce: la partición da {train}/{test} y la app tuvo {et}/{ep}. ¿Es el mismo archivo?",
        "cabecera": ("métrica", "esperada", "obtenida", "diferencia"),
        "exacto": "✓ reproduce (tolerancia {tol:g}).",
        "aprox": "≈ reproduce de forma aproximada: la mayor diferencia relativa es {rel:.2%} (tolerancia {trel:.0%} o {tabs:g}). "
        "Este modelo es un bosque de árboles: con diferencias de coma flotante entre máquinas, uno o dos de sus árboles pueden "
        "cambiar. No es una falla de tus datos ni de la receta.",
        "no": "✕ NO reproduce: difieren {cuales} (tolerancia {tol}).",
        "versiones": "⚠ Versiones distintas de las fijas; la cifra podría diferir: {lista}",
        "no_instalado": "no instalado",
        "fija": "fija",
        "uso": "Uso: python receta.py ruta/a/tu.csv",
        "vacio": "el archivo no tiene filas",
        "ancho": "la fila {fila} tiene {tiene} columnas y se esperaban {esperadas}",
        "falta_objetivo": "falta la columna objetivo «{c}»",
        "faltan": "faltan columnas: {c}",
        "no_numero": "el objetivo trae valores que no son números",
        "clases": "el objetivo «{c}» tiene {n} valores distintos y esta receta es de dos clases: ¿es el mismo archivo?",
        "tarea": "tarea no soportada: {t}",
        "ilegible": "no se pudo leer el archivo ({tipo})",
    },
    "en": {
        "titulo": "Recipe of «{miembro}» · {tarea} · target «{objetivo}» · original file: {archivo}",
        "filas": "Rows read: {leidas} · after sanitising: {saneadas} · training: {train} · test: {test} · seed: {semilla}",
        "particion": "✕ does NOT reproduce: the split gives {train}/{test} and the app had {et}/{ep}. Is it the same file?",
        "cabecera": ("metric", "expected", "obtained", "difference"),
        "exacto": "✓ reproduces (tolerance {tol:g}).",
        "aprox": "≈ reproduces approximately: the largest relative difference is {rel:.2%} (tolerance {trel:.0%} or {tabs:g}). "
        "This model is a forest of trees: with floating-point differences between machines, one or two of its trees may change. "
        "It is not a fault of your data or of the recipe.",
        "no": "✕ does NOT reproduce: {cuales} differ (tolerance {tol}).",
        "versiones": "⚠ Versions differ from the pinned ones; the figure could differ: {lista}",
        "no_instalado": "not installed",
        "fija": "pinned",
        "uso": "Usage: python receta.py path/to/your.csv",
        "vacio": "the file has no rows",
        "ancho": "row {fila} has {tiene} columns and {esperadas} were expected",
        "falta_objetivo": "the target column «{c}» is missing",
        "faltan": "missing columns: {c}",
        "no_numero": "the target has values that are not numbers",
        "clases": "the target «{c}» has {n} distinct values and this recipe is for two classes: is it the same file?",
        "tarea": "unsupported task: {t}",
        "ilegible": "the file could not be read ({tipo})",
    },
}


def t(clave, **p):
    idioma = DECLARACION.get("idioma", "es")
    texto = TEXTOS[idioma if idioma in TEXTOS else "es"][clave]
    return texto.format(**p) if isinstance(texto, str) else texto


def avisar_versiones():
    """Con otras versiones la cifra puede cambiar: se avisa, no se oculta ni se impide (la honestidad acompaña)."""
    from importlib import metadata

    distintas = []
    for nombre, fija in VERSIONES_FIJAS.items():
        try:
            instalada = metadata.version(nombre)
        except metadata.PackageNotFoundError:
            instalada = t("no_instalado")
        if instalada != fija:
            distintas.append(f"{nombre} {instalada} ({t('fija')}: {fija})")
    if distintas:
        print(t("versiones", lista="; ".join(distintas)))
    return distintas


def comparar(esperadas, obtenidas, tolerancia):
    """Cada métrica: (nombre, esperada, obtenida, diferencia, exacta, aproximada). La tolerancia aproximada solo existe para los
    modelos que la declaran (los bosques de árboles); para el resto, o es exacta o no reproduce."""
    filas = []
    for nombre, esperada in esperadas.items():
        obtenida = obtenidas.get(nombre)
        if esperada is None or obtenida is None:
            exacta = esperada is None and obtenida is None
            diferencia = None
            aproximada = exacta
        else:
            diferencia = abs(obtenida - esperada)
            exacta = diferencia <= TOLERANCIA * max(1.0, abs(esperada))
            aproximada = exacta or (
                tolerancia["tipo"] == "aproximada"
                and diferencia <= max(tolerancia["relativa"] * abs(esperada), tolerancia["absoluta"])
            )
        filas.append((nombre, esperada, obtenida, diferencia, exacta, aproximada))
    return filas


def _cifra(valor):
    return "—" if valor is None else f"{valor:.6f}"


def correr(ruta):
    decl = DECLARACION
    print(t("titulo", miembro=decl["miembro"], tarea=decl["tarea"], objetivo=decl["objetivo"], archivo=decl["archivo"]))
    avisar_versiones()
    cabecera, filas = leer_csv(ruta)
    leidas = len(filas)
    cabecera, filas = sanear(cabecera, filas, decl["excluidas"])
    payload = preparar(decl, cabecera, filas)
    ctx = _prepare(payload)
    esperado = decl["esperado"]
    n_train, n_test = len(payload["train_idx"]), len(payload["test_idx"])
    print(t("filas", leidas=leidas, saneadas=len(filas), train=n_train, test=n_test, semilla=decl["semilla"]))
    if (n_train, n_test) != (esperado["n_entrenamiento"], esperado["n_prueba"]):
        print(t("particion", train=n_train, test=n_test, et=esperado["n_entrenamiento"], ep=esperado["n_prueba"]))
        return 1
    pipe = _member_pipe(decl["miembro"], ctx).fit(ctx["X_train"], ctx["y_train"])
    obtenidas = _test_metrics(pipe, pipe.predict(ctx["X_test"]), ctx)
    tolerancia = decl["tolerancia"]
    tabla = comparar(esperado["metricas"], obtenidas, tolerancia)
    cab = t("cabecera")
    print(f"{cab[0]:<18}{cab[1]:>12}{cab[2]:>12}{cab[3]:>14}")
    for nombre, esperada, obtenida, diferencia, exacta, aproximada in tabla:
        marca = "✓" if exacta else ("≈" if aproximada else "✕")
        dif = "—" if diferencia is None else f"{diferencia:.2e}"
        print(f"{nombre:<18}{_cifra(esperada):>12}{_cifra(obtenida):>12}{dif:>14}  {marca}")
    if all(f[4] for f in tabla):
        print(t("exacto", tol=TOLERANCIA))
        return 0
    if all(f[5] for f in tabla):
        relativas = [f[3] / max(abs(f[1]), 1e-12) for f in tabla if f[3] is not None]
        print(t("aprox", rel=max(relativas), trel=tolerancia["relativa"], tabs=tolerancia["absoluta"]))
        return 0
    print(t("no", cuales=", ".join(f[0] for f in tabla if not f[5]), tol=TOLERANCIA))
    return 1


def main(argv):
    if len(argv) != 2:
        print(t("uso"))
        return 2
    try:
        return correr(argv[1])
    except Falla as error:
        print(f"✕ {error}")
        return 2
    except OSError as error:
        print(f"✕ {t('ilegible', tipo=type(error).__name__)}")
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
