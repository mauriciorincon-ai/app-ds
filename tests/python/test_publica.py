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

    def test_una_receta_de_otro_formato_se_niega_y_lo_dice(self):
        # S21 (lote 17-4): la receta LEE el formato que declara; con uno que no conoce no finge reproducir
        caso = next(c for c in _matriz() if c["id"] == "binaria__hgb")
        texto = (SALIDA / caso["receta"]).read_text(encoding="utf-8")
        alterada = texto.replace('"formato": "probeta-receta/1"', '"formato": "probeta-receta/9"', 1)
        self.assertNotEqual(alterada, texto)
        with tempfile.TemporaryDirectory() as d:
            ruta = Path(d) / "receta.py"
            ruta.write_text(alterada, encoding="utf-8")
            r = _correr([str(ruta), str(RAIZ / caso["csv"])])
        self.assertEqual(r.returncode, 2, r.stdout + r.stderr)
        self.assertIn("probeta-receta/9", r.stdout)
        self.assertNotRegex(r.stdout, r"✓ (reproduce|reproduces)")

    def test_la_receta_dice_que_app_la_armo(self):
        # S21 (lote 17-4): la declaración trae `app` y la receta lo imprime junto al título
        caso = next(c for c in _matriz() if c["id"] == "binaria__hgb")
        texto = (SALIDA / caso["receta"]).read_text(encoding="utf-8")
        app = re.search(r'"app": "([^"]+)"', texto).group(1)
        r = _correr([str(SALIDA / caso["receta"]), str(RAIZ / caso["csv"])])
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn(app, r.stdout.splitlines()[0])

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

    def test_un_objetivo_con_otro_numero_de_clases_se_dice_en_vez_de_medir(self):
        # AU-S17-10: la receta binaria con un CSV cuyo objetivo trae tres valores no reporta una precisión sin sentido
        caso = next(c for c in _matriz() if c["id"] == "binaria__hgb")
        original = (RAIZ / caso["csv"]).read_text(encoding="utf-8").splitlines()
        columna = original[0].split(",").index("convirtio")
        filas = [original[0]]
        for numero, linea in enumerate(original[1:]):
            celdas = linea.split(",")
            if numero % 7 == 0:
                celdas[columna] = "quizas"
            filas.append(",".join(celdas))
        with tempfile.TemporaryDirectory() as d:
            ruta = Path(d) / "tres-clases.csv"
            ruta.write_text("\n".join(filas) + "\n", encoding="utf-8")
            r = _correr([str(SALIDA / caso["receta"]), str(ruta)])
        self.assertEqual(r.returncode, 2, r.stdout + r.stderr)
        self.assertRegex(r.stdout, r"(dos clases|two classes)")
        self.assertNotIn("reproduce", r.stdout.replace("NO reproduce", ""))

    def test_otro_archivo_se_dice_en_vez_de_inventar(self):
        caso = next(c for c in _matriz() if c["id"] == "binaria__forest")
        r = _correr([str(SALIDA / caso["receta"]), str(RAIZ / "public/datasets/consumo-energia.csv")])
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("✕", r.stdout)  # el archivo de otra tarea se dice, no se inventa


FIXTURE_PARTICION = RAIZ / "tests" / "fixtures" / "particion" / "casos.json"


def _receta_como_modulo():
    """Carga una receta ya armada como módulo (no corre `main`): de ahí salen las funciones de partición que lleva cada receta."""
    import importlib.util

    ruta = SALIDA / _matriz()[0]["receta"]
    especificacion = importlib.util.spec_from_file_location("receta_armada", ruta)
    modulo = importlib.util.module_from_spec(especificacion)
    especificacion.loader.exec_module(modulo)
    return modulo


def _parte(receta, caso):
    if caso["tipo"] == "estratificada":
        return receta.particion_estratificada(caso["etiquetas"], caso["fraccion"], caso["semilla"])
    return receta.particion_por_cuantiles(caso["valores"], caso["fraccion"], caso["semilla"], caso["bandas"])


class TestParticion(unittest.TestCase):
    """AU-S17-02 (ADR 024): la partición de la receta es la de la app, bit a bit. El fixture lo escribe `split.ts`
    (tests/unit/particion-paridad.test.ts lo vigila del lado TypeScript); aquí lo corre la receta ya armada."""

    def test_la_receta_parte_como_split_ts_en_treinta_casos(self):
        receta = _receta_como_modulo()
        casos = json.loads(FIXTURE_PARTICION.read_text(encoding="utf-8"))["casos"]
        self.assertGreaterEqual(len(casos), 30)
        for caso in casos:
            with self.subTest(caso["nombre"]):
                train, test = _parte(receta, caso)
                self.assertEqual(train, caso["train"])
                self.assertEqual(test, caso["test"])

    def test_el_gate_falla_si_la_particion_cambia(self):
        # un gate se demuestra fallando: con otra semilla, al menos un caso grande reparte distinto
        receta = _receta_como_modulo()
        casos = json.loads(FIXTURE_PARTICION.read_text(encoding="utf-8"))["casos"]
        grande = next(c for c in casos if c["nombre"] == "binaria-200-desbalanceada")
        otra = dict(grande, semilla=grande["semilla"] + 1)
        train, test = _parte(receta, otra)
        self.assertNotEqual((train, test), (grande["train"], grande["test"]))


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

    def test_lo_que_llega_mal_formado_da_400_o_413_no_500(self):
        # AU-S17-07: un campo gigante rompe el límite de `csv`; un cuerpo sin tamaño declarado se corta al pasar el tope
        caso = next(c for c in _matriz() if c["id"] == "binaria__forest")
        with tempfile.TemporaryDirectory() as d:
            carpeta = _abrir(caso, d)
            gigante = Path(d) / "gigante.csv"
            gigante.write_text("convirtio\n" + "x" * 200_000 + "\n", encoding="utf-8")
            r = _servicio(carpeta, gigante)
            self.assertEqual(r.returncode, 0, r.stderr)
            respuesta = json.loads(r.stdout.strip().splitlines()[-1])
            self.assertEqual(respuesta["estado"], 400)
            self.assertEqual(respuesta["cuerpo"]["detail"], "csv-invalido")

            grande = Path(d) / "grande.csv"
            grande.write_text("convirtio\n" + "1\n" * 3_000_000, encoding="utf-8")  # ~6 MB: más que MAX_BYTES (5 MB)
            r = _correr([str(AQUI / "cliente_servicio.py"), str(carpeta), str(grande), "por-partes"])
            self.assertEqual(r.returncode, 0, r.stderr)
            respuesta = json.loads(r.stdout.strip().splitlines()[-1])
            self.assertEqual(respuesta["estado"], 413)
            self.assertEqual(respuesta["cuerpo"]["detail"], "cuerpo-demasiado-grande")

    def test_por_defecto_solo_escucha_en_esta_maquina(self):
        # AU-S17-03: sin autenticación, no se abre a la red salvo que quien lo despliega lo pida con HOST
        caso = next(c for c in _matriz() if c["id"] == "binaria__forest")
        with tempfile.TemporaryDirectory() as d:
            texto = (_abrir(caso, d) / "servicio.py").read_text(encoding="utf-8")
        self.assertIn('os.environ.get("HOST", "127.0.0.1")', texto)
        self.assertNotIn('host="0.0.0.0"', texto)


if __name__ == "__main__":
    unittest.main()
