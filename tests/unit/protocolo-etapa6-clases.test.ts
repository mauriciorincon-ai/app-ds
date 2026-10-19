// Protocolo DS (S12), deuda del S11 (bajo): una clase que se llama como una propiedad heredada del objeto
// («constructor», «__proto__», «toString») es una clase como cualquiera. El conteo por lado usaba un objeto
// plano con `??=` y `+=`: «constructor» dejaba 'function Object() { [native code] }1' y la etapa no se podía
// registrar; «__proto__» desaparecía del conteo sin avisar.
import { describe, expect, it } from "vitest";
import type { DatosEtapa } from "@/engine/protocolo/etapas";
import { chequeos1 } from "@/engine/protocolo/etapa1";
import {
  ENTRADA_6_VACIA,
  ETAPA_6,
  datosEtapa6,
} from "@/engine/protocolo/etapa6";
import { contarLado, disenoDe } from "@/engine/protocolo/particion";
import {
  ENTRADA_CREDITO,
  HUELLA,
  armar,
  csv,
  etapa1De,
} from "./protocolo-etapa4-helpers";

const NOMBRES = ["constructor", "__proto__", "toString", "a"] as const;

function tablaDeClases() {
  const lineas = ["id,x,clase"];
  for (let i = 0; i < 120; i++) lineas.push(`${i},${i % 7},${NOMBRES[i % 4]}`);
  return csv(...lineas);
}

const ENTRADA = { ...ENTRADA_CREDITO, objetivo: "clase", positivo: "" };

// La etapa 1 con un costo por clase, con las claves puestas por Object.fromEntries (un literal con
// `__proto__:` asignaría el prototipo en vez de crear la clave).
function etapa1Clases(): DatosEtapa {
  const base = etapa1De("multiclase");
  const respuestas = {
    ...base.respuestas,
    opciones: [...NOMBRES],
    costos: Object.fromEntries(NOMBRES.map((n, i) => [n, i + 1])),
  } as DatosEtapa["respuestas"];
  return { respuestas, chequeos: chequeos1(respuestas) ?? {} };
}

describe("clases con nombre de propiedad heredada", () => {
  const tabla = tablaDeClases();
  const { previas } = armar(
    "clases.csv",
    "multiclase",
    ENTRADA,
    tabla,
    etapa1Clases(),
  );
  const d = disenoDe(tabla, "multiclase", previas[2]!.respuestas)!;

  it("contarLado cuenta cada clase con su nombre y su número", () => {
    const lado = contarLado(d, d.filas.slice(0, 40)); // 10 de cada clase
    for (const n of NOMBRES) {
      expect(Object.hasOwn(lado.clases!, n), `clase ${n}`).toBe(true);
      expect(lado.clases![n]).toBe(10);
    }
    expect(
      Object.values(lado.clases!).every((v) => typeof v === "number"),
    ).toBe(true);
  });

  it("lo que registra la etapa 6 se lee, también después de guardarse y volver a abrirse", () => {
    const datos = datosEtapa6(
      tabla,
      { ...ENTRADA_6_VACIA, esquema: "estratificada" },
      previas,
      HUELLA,
    );
    expect(ETAPA_6.leer(datos)).toEqual({ ok: true });
    const guardado = JSON.parse(JSON.stringify(datos)) as typeof datos;
    expect(ETAPA_6.leer(guardado)).toEqual({ ok: true });
    for (const lado of ["clases_entrenamiento", "clases_prueba"] as const) {
      const clases = guardado.chequeos[lado] as Record<string, number>;
      for (const n of NOMBRES) expect(Object.hasOwn(clases, n)).toBe(true);
    }
  });
});
