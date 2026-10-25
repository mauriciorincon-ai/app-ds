"""S17 (ADR 024): la receta y el servicio, EJECUTADOS en CPython con las versiones fijas.

Lee tests/integration/.salida/, que escribe tests/integration/publica.test.ts con el Pyodide real: por cada modelo del roster, la
receta ya armada, el servicio en ZIP y lo que la app puntúa. Aquí se comprueba que
  · la receta del kit REPRODUCE (y que, alterada, dice que NO reproduce: un gate se demuestra fallando);
  · el servicio puntúa el kit como Pyodide (y se niega a arrancar con otras versiones, con un modelo que cambió o con un
    modelo que no se abre en esta máquina);
  · el ZIP lo abre `zipfile` y trae lo prometido.
Se corre con:  python -m unittest discover -s tests/python -v
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
SALIDA = RAIZ / "tests" / "integration" / ".salida"
AQUI = Path(__file__).resolve().parent

# Los bosques de árboles declaran una tolerancia aproximada (ADR 024): una diferencia de coma flotante entre la máquina del
# navegador (32 bits) y CPython de 64 bits puede cambiar uno o dos de sus 200 árboles. La receta tiene que DECIRLO: «reproduce»
# exacto o «reproduce de forma aproximada». Cualquier otro modelo reproduce exacto (1e-6) o la prueba falla.
AZAR_SENSIBLE = {"forest", "forest_balanced", "extra_trees"}


def _matriz():
    archivo = SALIDA / "matriz.json"
    if not archivo.exists():
        if os.environ.get("CI"):
            raise AssertionError(f"falta {archivo}: la prueba de integración tiene que correr antes")
        raise unittest.SkipTest(f"falta {archivo}: corre antes `pnpm test:integration`")
    return json.loads(archivo.read_text(encoding="utf-8"))["casos"]


def _correr(args, **kw):
    return subprocess.run([sys.executable, *args], capture_output=True, text=True, timeout=600, **kw)


class TestReceta(unittest.TestCase):
    def test_cada_receta_reproduce(self):
        casos = _matriz()
        self.assertGreater(len(casos), 30)
        for caso in casos:
            with self.subTest(caso["id"]):
                r = _correr([str(SALIDA / caso["receta"]), str(RAIZ / caso["csv"])])
                self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
                if caso["miembro"] in AZAR_SENSIBLE:
                    self.assertRegex(r.stdout, r"✓ (reproduce|reproduces)|≈ (reproduce de forma aproximada|reproduces approximately)")
                else:
                    self.assertRegex(r.stdout, r"✓ (reproduce|reproduces)")

    def test_una_receta_alterada_dice_que_no_reproduce(self):
        # un modelo EXACTO (hgb) con la AUC esperada movida 0.05: no reproduce, y lo dice nombrando la métrica
        caso = next(c for c in _matriz() if c["id"] == "binaria__hgb")
        r, texto = self._alterada(caso, 0.05)
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertRegex(r.stdout, r"NO reproduce|does NOT reproduce")
        self.assertIn("auc", r.stdout)

    def test_un_bosque_tolera_lo_declarado_y_no_mas(self):
        caso = next(c for c in _matriz() if c["id"] == "binaria__forest")
        chica, _ = self._alterada(caso, 0.02)  # dentro de la tolerancia aproximada: lo dice «aproximado»
        self.assertEqual(chica.returncode, 0, chica.stdout + chica.stderr)
        grande, _ = self._alterada(caso, 0.5)  # fuera: no reproduce
        self.assertEqual(grande.returncode, 1, grande.stdout + grande.stderr)

    def _alterada(self, caso, mas):
        texto = (SALIDA / caso["receta"]).read_text(encoding="utf-8")
        alterada, n = re.subn(r'("auc": )(0\.\d+)', lambda m: f"{m.group(1)}{float(m.group(2)) + mas}", texto, count=1)
        self.assertEqual(n, 1)
        with tempfile.TemporaryDirectory() as d:
            ruta = Path(d) / "receta.py"
            ruta.write_text(alterada, encoding="utf-8")
            return _correr([str(ruta), str(RAIZ / caso["csv"])]), alterada

    def test_otro_archivo_se_dice_en_vez_de_inventar(self):
        caso = next(c for c in _matriz() if c["id"] == "binaria__forest")
        r = _correr([str(SALIDA / caso["receta"]), str(RAIZ / "public/datasets/consumo-energia.csv")])
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("✕", r.stdout)  # el archivo de otra tarea se dice, no se inventa


def _abrir(caso, destino):
    with zipfile.ZipFile(SALIDA / caso["servicio"]) as z:
        assert z.testzip() is None
        z.extractall(destino)
    return Path(destino)


def _servicio(carpeta, csv):
    return _correr([str(AQUI / "cliente_servicio.py"), str(carpeta), str(csv)])


class TestServicio(unittest.TestCase):
    def test_cada_servicio_puntua_como_pyodide(self):
        for caso in _matriz():
            with self.subTest(caso["id"]), tempfile.TemporaryDirectory() as d:
                carpeta = _abrir(caso, d)
                self.assertEqual(
                    sorted(p.name for p in carpeta.iterdir()),
                    ["README.md", "modelo.probeta.json", "puntuar.py", "requirements.txt", "servicio.py"],
                )
                r = _servicio(carpeta, RAIZ / caso["csv"])
                if not caso["servible"]:
                    self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
                    self.assertIn("servicio:", r.stderr)
                    continue
                self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
                respuesta = json.loads(r.stdout.strip().splitlines()[-1])
                self.assertEqual(respuesta["estado"], 200, respuesta)
                esperado = json.loads((SALIDA / caso["esperado"]).read_text(encoding="utf-8"))
                cuerpo = respuesta["cuerpo"]
                self.assertEqual(cuerpo["novelty"], esperado["novelty"])
                self.assertEqual(len(cuerpo["predictions"]), len(esperado["predictions"]))
                if caso["tarea"] == "numerica":
                    for obtenida, dicha in zip(cuerpo["predictions"], esperado["predictions"]):
                        self.assertAlmostEqual(obtenida, dicha, delta=1e-6 * max(1.0, abs(dicha)))
                else:
                    self.assertEqual(cuerpo["predictions"], esperado["predictions"])
                if esperado["probabilities"] is None:
                    self.assertIsNone(cuerpo["probabilities"])
                else:
                    for obtenida, dicha in zip(cuerpo["probabilities"], esperado["probabilities"]):
                        self.assertAlmostEqual(obtenida, dicha, delta=1e-6)

    def test_se_niega_con_otras_versiones(self):
        caso = next(c for c in _matriz() if c["id"] == "binaria__forest")
        with tempfile.TemporaryDirectory() as d:
            carpeta = _abrir(caso, d)
            req = carpeta / "requirements.txt"
            req.write_text(req.read_text(encoding="utf-8").replace("numpy==2.4.3", "numpy==1.0.0"), encoding="utf-8")
            r = _servicio(carpeta, RAIZ / caso["csv"])
        self.assertEqual(r.returncode, 1)
        self.assertIn("versiones distintas", r.stderr)
        self.assertIn("numpy", r.stderr)

    def test_se_niega_si_el_modelo_cambio(self):
        caso = next(c for c in _matriz() if c["id"] == "binaria__forest")
        with tempfile.TemporaryDirectory() as d:
            carpeta = _abrir(caso, d)
            modelo = carpeta / "modelo.probeta.json"
            archivo = json.loads(modelo.read_text(encoding="utf-8"))
            archivo["manifest"]["payload_sha256"] = "0" * 64
            modelo.write_text(json.dumps(archivo), encoding="utf-8")
            r = _servicio(carpeta, RAIZ / caso["csv"])
        self.assertEqual(r.returncode, 1)
        self.assertIn("SHA-256", r.stderr)

    def test_el_servicio_dice_por_que_no_acepta_lo_que_no_entiende(self):
        caso = next(c for c in _matriz() if c["id"] == "binaria__forest")
        with tempfile.TemporaryDirectory() as d:
            carpeta = _abrir(caso, d)
            vacio = Path(d) / "vacio.csv"
            vacio.write_text("convirtio\n1\n", encoding="utf-8")
            r = _servicio(carpeta, vacio)
        self.assertEqual(r.returncode, 0, r.stderr)
        respuesta = json.loads(r.stdout.strip().splitlines()[-1])
        self.assertEqual(respuesta["estado"], 400)
        self.assertTrue(respuesta["cuerpo"]["detail"].startswith("columnas-faltan:"))


if __name__ == "__main__":
    unittest.main()
