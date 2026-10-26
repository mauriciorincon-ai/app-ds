"""S19 (ADR 027): el SQL del modelo en reglas, EJECUTADO en CPython con `sqlite3`.

Lee tests/integration/.salida-reglas/, que escribe tests/integration/reglas.test.ts con el Pyodide real: por cada tarea (dos clases,
varias clases, estimar una cantidad y agrupar) las filas del modelo, lo que predicen las reglas en Python y el SQL que armó TypeScript;
más un caso con nombres y categorías con comillas y con vacíos y, desde el S20, los casos de «filas subidas» (las reglas de un modelo
entrenado y de uno importado, armadas con las filas de un archivo). Aquí se comprueba que
  · el SQL da EXACTAMENTE la misma predicción que las reglas en cada fila (para las cantidades, el mismo literal);
  · no deja ninguna fila sin hoja (una predicción vacía sería una regla inventada);
  · un SQL alterado SÍ difiere: el gate se demuestra fallando.
Se corre con:  python -m unittest discover -s tests/python -v
"""
import json
import math
import os
import re
import sqlite3
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
SALIDA = RAIZ / "tests" / "integration" / ".salida-reglas"
CASOS = ("binaria", "multiclase", "numerica", "agrupar", "hostil", "subidas-binaria", "subidas-importado")


def _caso(nombre):
    archivo = SALIDA / f"{nombre}.json"
    if not archivo.exists():
        if os.environ.get("CI"):
            raise AssertionError(f"falta {archivo}: la prueba de integración tiene que correr antes")
        raise unittest.SkipTest(f"falta {archivo}: corre antes `pnpm test:integration`")
    return json.loads(archivo.read_text(encoding="utf-8"))


def _identificador(nombre):
    return '"' + nombre.replace('"', '""') + '"'


def _predicciones(caso, sql):
    """Crea la tabla del usuario en SQLite, le pone las filas y corre el SQL; devuelve la predicción de cada fila, en orden."""
    con = sqlite3.connect(":memory:")
    columnas = ", ".join(
        f'{_identificador(c["name"])} {"REAL" if c["kind"] == "numeric" else "TEXT"}' for c in caso["columns"]
    )
    con.execute(f"CREATE TABLE datos ({columnas})")
    con.executemany(
        f"INSERT INTO datos VALUES ({','.join('?' * len(caso['columns']))})", caso["rows"]
    )
    cursor = con.execute(sql.replace('"tu_tabla"', '"datos"').rstrip(";"))
    nombres = [d[0] for d in cursor.description]
    return [fila[nombres.index("prediccion")] for fila in cursor.fetchall()]


def _iguales(a, b):
    if isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool):
        return math.isclose(a, b, rel_tol=1e-12, abs_tol=0.0)
    return a == b


class TestSql(unittest.TestCase):
    def test_el_sql_da_la_misma_prediccion_que_las_reglas_en_cada_fila(self):
        for nombre in CASOS:
            with self.subTest(nombre):
                caso = _caso(nombre)
                self.assertGreater(len(caso["rows"]), 5)
                obtenido = _predicciones(caso, caso["sql"])
                self.assertEqual(len(obtenido), len(caso["esperado"]))
                distintas = [
                    i for i, (a, b) in enumerate(zip(obtenido, caso["esperado"])) if not _iguales(a, b)
                ]
                self.assertEqual(distintas, [], f"{nombre}: filas distintas {distintas[:5]}")

    def test_ninguna_fila_queda_sin_hoja(self):
        for nombre in CASOS:
            with self.subTest(nombre):
                caso = _caso(nombre)
                self.assertNotIn(None, _predicciones(caso, caso["sql"]))

    def test_un_sql_alterado_no_coincide(self):
        # el corte de la primera condición numérica movido: el gate tiene que verlo en alguna fila
        caso = _caso("binaria")
        alterado = re.sub(r"(COALESCE\([^)]*\) <= )([0-9.]+)", lambda m: m.group(1) + str(float(m.group(2)) + 1000), caso["sql"], count=1)
        self.assertNotEqual(alterado, caso["sql"])
        self.assertNotEqual(_predicciones(caso, alterado), caso["esperado"])

    def test_los_nombres_con_comillas_se_escapan(self):
        caso = _caso("hostil")
        self.assertIn('"ed""ad"', caso["sql"])
        self.assertIn("'O''Brien'", caso["sql"])
        self.assertIn("'bajo ''1'''", caso["sql"])


if __name__ == "__main__":
    unittest.main()
