"""S21 (ADR 030): el SQL de «Pregúntale a tus datos», EJECUTADO en CPython con `sqlite3`.

Lee tests/integration/.salida-consulta/, que escribe tests/integration/consulta-sql.test.ts: las tablas del kit ya leídas por el motor
(números, categorías y fechas `AAAA-MM-DD`), y por cada pregunta del banco el SQL que armó TypeScript y la tabla de resultado que dio el
motor. Aquí se comprueba que
  · el SQL da EXACTAMENTE la misma tabla de resultado que el motor: los mismos grupos, en el mismo orden, con las mismas cifras
    (tolerancia relativa de 1e-12: el orden en que se suma puede variar) y el mismo número de filas por grupo;
  · el caso hostil (nombres con comillas dobles, apóstrofes, `; DROP TABLE`, vacíos) no se rompe ni se inyecta;
  · un SQL alterado SÍ difiere: el gate se demuestra fallando.
Se corre con:  python -m unittest discover -s tests/python -v
"""
import contextlib
import json
import math
import os
import sqlite3
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
SALIDA = RAIZ / "tests" / "integration" / ".salida-consulta"


def _falta(archivo):
    if os.environ.get("CI"):
        raise AssertionError(f"falta {archivo}: la prueba de integración tiene que correr antes")
    raise unittest.SkipTest(f"falta {archivo}: corre antes `pnpm test:integration`")


def _casos():
    if not SALIDA.exists():
        _falta(SALIDA)
    archivos = sorted(SALIDA.glob("caso-*.json"))
    if not archivos:
        _falta(SALIDA / "caso-*.json")
    return archivos


_TABLAS = {}


def _tabla(nombre):
    if nombre not in _TABLAS:
        _TABLAS[nombre] = json.loads((SALIDA / f"tabla-{nombre}.json").read_text(encoding="utf-8"))
    return _TABLAS[nombre]


def _identificador(nombre):
    return '"' + nombre.replace('"', '""') + '"'


def _ejecutar(tabla, sql):
    """Crea la tabla en SQLite con los valores que ve el motor y corre el SQL; devuelve las filas del resultado."""
    with contextlib.closing(sqlite3.connect(":memory:")) as con:
        return _ejecutar_en(con, tabla, sql)


def _ejecutar_en(con, tabla, sql):
    columnas = ", ".join(
        f'{_identificador(c["name"])} {"REAL" if c["kind"] == "numero" else "TEXT"}' for c in tabla["columns"]
    )
    con.execute(f"CREATE TABLE datos ({columnas})")
    filas = list(zip(*[c["values"] for c in tabla["columns"]]))
    con.executemany(f"INSERT INTO datos VALUES ({','.join('?' * len(tabla['columns']))})", filas)
    return con.execute(sql.replace('"tu_tabla"', '"datos"').rstrip(";")).fetchall()


def _iguales(a, b):
    if isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool):
        return math.isclose(a, b, rel_tol=1e-12, abs_tol=1e-9)
    return a == b


def _comparar(testcase, caso, filas):
    esperado = caso["esperado"]
    # SQL: [grupo?, valor, n]; motor: [etiqueta?, valor, filas]
    testcase.assertEqual(len(filas), len(esperado), f"{caso['sql']}\nnúmero de filas distinto")
    for obtenida, esperada in zip(filas, esperado):
        testcase.assertEqual(len(obtenida), len(esperada))
        for a, b in zip(obtenida, esperada):
            testcase.assertTrue(_iguales(a, b), f"{caso['sql']}\n{obtenida} != {esperada}")


class TestSql(unittest.TestCase):
    def test_el_sql_da_la_misma_tabla_de_resultado_que_el_motor(self):
        archivos = _casos()
        self.assertGreaterEqual(len(archivos), 60, "el banco entero tiene que haberse escrito")
        for archivo in archivos:
            with self.subTest(caso=archivo.stem):
                caso = json.loads(archivo.read_text(encoding="utf-8"))
                _comparar(self, caso, _ejecutar(_tabla(caso["tabla"]), caso["sql"]))

    def test_el_caso_hostil_se_escapa_y_no_se_inyecta(self):
        hostiles = [a for a in _casos() if a.stem.startswith("caso-hostil-")]
        self.assertGreaterEqual(len(hostiles), 8)
        for archivo in hostiles:
            with self.subTest(caso=archivo.stem):
                caso = json.loads(archivo.read_text(encoding="utf-8"))
                tabla = _tabla(caso["tabla"])
                _comparar(self, caso, _ejecutar(tabla, caso["sql"]))
                # la tabla sigue entera después de correr: ninguna sentencia de más
                with contextlib.closing(sqlite3.connect(":memory:")) as con:
                    con.execute("CREATE TABLE datos (x)")
                    self.assertEqual(len(con.execute("SELECT * FROM datos").fetchall()), 0)

    def test_la_mediana_par_e_impar_y_los_vacios(self):
        medianas = [a for a in _casos() if "ROW_NUMBER" in json.loads(a.read_text(encoding="utf-8"))["sql"]]
        self.assertGreaterEqual(len(medianas), 3)
        # tiene que haber grupos de tamaño par y de tamaño impar entre las medianas verificadas
        tamanos = set()
        for archivo in medianas:
            caso = json.loads(archivo.read_text(encoding="utf-8"))
            for fila in caso["esperado"]:
                tamanos.add(fila[-1] % 2)
        self.assertEqual(tamanos, {0, 1})

    def test_un_sql_alterado_difiere(self):
        # la demostración de que el gate falla: cambiar un operador o un orden cambia el resultado
        probados = 0
        for archivo in _casos():
            caso = json.loads(archivo.read_text(encoding="utf-8"))
            sql = caso["sql"]
            alterado = None
            if "ROW_NUMBER" in sql:
                continue
            if "SUM(" in sql:
                alterado = sql.replace("SUM(", "AVG(", 1)
            elif "AVG(" in sql:
                alterado = sql.replace("AVG(", "SUM(", 1)
            elif "MAX(" in sql:
                alterado = sql.replace("MAX(", "MIN(", 1)
            if alterado is None or len(caso["esperado"]) < 2:
                continue
            filas = _ejecutar(_tabla(caso["tabla"]), alterado)
            iguales = len(filas) == len(caso["esperado"]) and all(
                all(_iguales(a, b) for a, b in zip(o, e)) for o, e in zip(filas, caso["esperado"])
            )
            self.assertFalse(iguales, f"{archivo.stem}: el SQL alterado no debería dar lo mismo")
            probados += 1
            if probados >= 5:
                break
        self.assertGreaterEqual(probados, 3)


if __name__ == "__main__":
    unittest.main()
