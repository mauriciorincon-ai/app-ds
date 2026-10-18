// Protocolo DS (S9), etapa 4: un cuaderno editado a mano no gana nada. Lo que el código encontró
// sobre la TABLA (la fuga, los identificadores, las repetidas, la deriva) lo vuelve a calcular la
// compuerta contra la tabla cargada; si no coincide, la etapa vuelve a «por verificar» y la
// siguiente no abre. Se prueba por el camino del usuario: exportar el `.protocolo.json`, editarlo
// y leerlo de nuevo. Lo que NO se puede detectar —la apuesta, que el archivo no recuerda de
// antes de ver— se fija aquí con su prueba, declarado.
import { describe, expect, it } from "vitest";
import { evaluar, registrar } from "@/engine/protocolo/compuerta";
import type { Cuaderno } from "@/engine/protocolo/cuaderno";
import { chequeos4, hallazgos4 } from "@/engine/protocolo/etapa4";
import type { DatosEtapa } from "@/engine/protocolo/etapas";
import { empaquetar, leerArchivo } from "@/lib/protocolo/archivo";
import {
  AHORA,
  ENTRADA_BAJAS,
  HUELLA,
  PROTOCOLO4,
  armar,
  datosBajas,
} from "./protocolo-etapa4-helpers";

const BAJAS = armar("bajas-con-fuga.csv", "binaria", ENTRADA_BAJAS);
const COLUMNAS = hallazgos4(BAJAS.tabla, BAJAS.previas)!.columnas;
const contexto = { huella: HUELLA, tabla: BAJAS.tabla, ahora: AHORA };

/** Un cuaderno honesto con las etapas 1–4 cumplidas sobre bajas-con-fuga.csv. */
function honesto(): Cuaderno {
  const r = registrar(
    PROTOCOLO4,
    BAJAS.cuaderno,
    4,
    datosBajas(BAJAS),
    contexto,
  );
  if (!r.ok) throw new Error(JSON.stringify(r.rechazo));
  return r.cuaderno;
}

type Archivo = { cuaderno: Cuaderno };
type Mutable = Record<string, unknown>;

/** La última evidencia de la etapa 4 del archivo, editable. */
function etapa4(archivo: Archivo): { r: Mutable; c: Mutable } {
  const ev = archivo.cuaderno.evidencias.findLast((e) => e.etapa === 4);
  if (!ev) throw new Error("falta la evidencia de la etapa 4");
  return { r: ev.datos.respuestas as Mutable, c: ev.datos.chequeos as Mutable };
}

/** Exporta el cuaderno, deja que `editar` toque el JSON, y lo lee como si lo importara el usuario. */
function importado(
  cuaderno: Cuaderno,
  editar: (archivo: Archivo) => void = () => undefined,
): Cuaderno {
  const archivo = JSON.parse(empaquetar(cuaderno, AHORA)) as Archivo;
  editar(archivo);
  const lectura = leerArchivo(JSON.stringify(archivo), PROTOCOLO4);
  if (!lectura.ok) throw new Error(JSON.stringify(lectura.rechazo));
  return lectura.cuaderno;
}

function estados(cuaderno: Cuaderno, tabla = BAJAS.tabla) {
  return evaluar(PROTOCOLO4, cuaderno, HUELLA, tabla)
    .slice(0, 5)
    .map((e) => e.estado.tipo);
}

const NO_CUADRA = [
  "cumplida",
  "cumplida",
  "cumplida",
  "por-verificar",
  "no-construida",
];

/** Pone `valor` en la posición de `columna` de una lista alineada de las respuestas. */
function ponerEn(lista: unknown, columna: string, valor: string) {
  (lista as string[])[COLUMNAS.indexOf(columna)] = valor;
}

describe("la etapa 4 de un cuaderno editado a mano no gana nada", () => {
  it("el cuaderno honesto, exportado e importado, sigue cumplido (el ida y vuelta no lo rompe)", () => {
    expect(estados(importado(honesto()))).toEqual([
      "cumplida",
      "cumplida",
      "cumplida",
      "cumplida",
      "no-construida",
    ]);
  });

  it("una fuga escondida: se borra del hallazgo, se pone la columna en «antes + usar» y se quita de las alertas", () => {
    const editado = importado(honesto(), (archivo) => {
      const { r, c } = etapa4(archivo);
      c.fuga_vacios = {};
      c.sorpresas = [];
      c.alertas = (c.alertas as string[]).filter((x) => x !== "motivo_baja");
      ponerEn(r.momento, "motivo_baja", "antes");
      ponerEn(r.estado, "motivo_baja", "usar");
    });
    // El criterio, mirando solo lo que el archivo dice, lo daría por bueno (todo es coherente):
    expect(
      PROTOCOLO4[3]!.construida &&
        PROTOCOLO4[3]!.criterio(
          editado.evidencias.findLast((e) => e.etapa === 4)!.datos,
          BAJAS.previas,
        ).tipo,
    ).toBe("cumple");
    // …y lo que lo frena es volver a mirar la tabla.
    expect(estados(editado)).toEqual(NO_CUADRA);
    const [, , , cuatro] = evaluar(PROTOCOLO4, editado, HUELLA, BAJAS.tabla);
    expect(cuatro?.estado).toMatchObject({
      tipo: "por-verificar",
      motivo: "no-cuadra",
    });
  });

  it.each<[string, (archivo: Archivo) => void]>([
    [
      "las alertas recortadas",
      (a) => {
        etapa4(a).c.alertas = [];
      },
    ],
    [
      "una columna con alerta metida en la acción en bloque",
      (a) => {
        const { r, c } = etapa4(a);
        r.en_bloque = [...(r.en_bloque as string[]), "canal"];
        c.alertas = (c.alertas as string[]).filter((x) => x !== "canal");
      },
    ],
    [
      "aciertos inventados",
      (a) => {
        etapa4(a).c.aciertos = ["motivo_baja"];
      },
    ],
    [
      "las filas repetidas borradas",
      (a) => {
        etapa4(a).c.duplicados_fila = 0;
      },
    ],
    [
      "la unidad + momento repetidos borrados",
      (a) => {
        etapa4(a).c.duplicados_unidad_momento = 0;
      },
    ],
    [
      "un identificador que no está",
      (a) => {
        etapa4(a).c.identificador = {};
      },
    ],
    [
      "un PSI inventado",
      (a) => {
        const { c } = etapa4(a);
        c.deriva_psi = { ...(c.deriva_psi as Mutable), canal: 0.01 };
      },
    ],
    [
      "una deriva «sin fecha» donde sí hay fecha",
      (a) => {
        const { c } = etapa4(a);
        c.deriva_estado = "sin-fecha";
        c.deriva_corte = null;
        c.deriva_psi = {};
        c.deriva_ks = {};
        c.deriva_historico = null;
        c.deriva_reciente = null;
      },
    ],
    [
      "un conteo de filas distinto",
      (a) => {
        etapa4(a).c.filas = 5000;
      },
    ],
  ])("%s: la etapa 4 vuelve a «por verificar»", (_, editar) => {
    const editado = importado(honesto(), editar);
    expect(estados(editado)).toEqual(NO_CUADRA);
    const [, , , cuatro] = evaluar(PROTOCOLO4, editado, HUELLA, BAJAS.tabla);
    expect(cuatro?.estado).toMatchObject({
      tipo: "por-verificar",
      motivo: "no-cuadra",
    });
  });

  it("registrar no confía en los chequeos que le llegan: los vuelve a calcular", () => {
    const honestos = datosBajas(BAJAS);
    const chequeos = { ...honestos.chequeos, fuga_vacios: {} };
    const respuestas = {
      ...honestos.respuestas,
      momento: (honestos.respuestas.momento as string[]).map((m, i) =>
        COLUMNAS[i] === "motivo_baja" ? "antes" : m,
      ),
      estado: (honestos.respuestas.estado as string[]).map((e, i) =>
        COLUMNAS[i] === "motivo_baja" ? "usar" : e,
      ),
    };
    const manipulado: DatosEtapa = { respuestas, chequeos };
    expect(
      registrar(PROTOCOLO4, BAJAS.cuaderno, 4, manipulado, contexto),
    ).toMatchObject({
      ok: false,
      rechazo: { tipo: "datos-invalidos", etapa: 4, campo: "chequeos" },
    });
    expect(
      registrar(PROTOCOLO4, BAJAS.cuaderno, 4, honestos, contexto).ok,
    ).toBe(true);
  });

  it("sin la tabla cargada nada que dependa de los datos se da por bueno, ni se registra", () => {
    const sin = evaluar(PROTOCOLO4, honesto(), HUELLA, null);
    // La etapa 2 ya no se puede verificar, y con ella se cierran la 3 y la 4.
    expect(sin.slice(0, 5).map((e) => e.estado.tipo)).toEqual([
      "cumplida",
      "por-verificar",
      "cerrada",
      "cerrada",
      "no-construida",
    ]);
    expect(sin[1]?.estado).toMatchObject({ motivo: "sin-datos" });
    expect(
      registrar(PROTOCOLO4, BAJAS.cuaderno, 4, datosBajas(BAJAS), {
        ...contexto,
        tabla: null,
      }),
    ).toMatchObject({ ok: false, rechazo: { etapa: 4 } });
  });

  it("listas desalineadas o de más en el archivo se rechazan al importar, nombrando el campo", () => {
    const archivo = JSON.parse(empaquetar(honesto(), AHORA)) as Archivo;
    const { r } = etapa4(archivo);
    r.estado = (r.estado as string[]).slice(1);
    const lectura = leerArchivo(JSON.stringify(archivo), PROTOCOLO4);
    expect(lectura).toMatchObject({
      ok: false,
      rechazo: { tipo: "invalid-format" },
    });
    expect(JSON.stringify(lectura)).toContain("respuestas.estado");
  });

  it("LÍMITE DECLARADO: una apuesta cambiada a mano, con su comparación bien recalculada, pasa", () => {
    // El archivo no recuerda lo que apostaste antes de ver; la compuerta verifica coherencia,
    // no verdad. Por eso la apuesta se fija al revelar en la pantalla (sessionStorage) y esto
    // queda dicho en el manual: no se promete lo que el código no puede saber.
    const h = hallazgos4(BAJAS.tabla, BAJAS.previas)!;
    const editado = importado(honesto(), (archivo) => {
      const { r, c } = etapa4(archivo);
      r.apuesta = ["motivo_baja"];
      r.apuesta_ninguna = false;
      Object.assign(c, chequeos4(h, ["motivo_baja"]));
    });
    expect(estados(editado)).toEqual([
      "cumplida",
      "cumplida",
      "cumplida",
      "cumplida",
      "no-construida",
    ]);
  });
});
