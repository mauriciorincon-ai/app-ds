// S21 (lote 19-19): desde el S19 la app TIENE un «¿Qué pasaría si?». Los textos que dicen «un modelo predictivo no dice qué pasaría si
// cambias algo» no pueden quedar solos: tienen que aclarar que la simulación de Probeta dice qué diría el MODELO con otro valor, no lo
// que ocurriría de verdad. Si no, el usuario cree que una cosa contradice a la otra.
import { describe, expect, it } from "vitest";
import { GLOSARIO } from "@/content/glosario";
import { CONTENIDO_ETAPAS } from "@/content/protocolo";
import en from "../../messages/en.json";
import es from "../../messages/es.json";

type Hoja = string | { [k: string]: Hoja };
const leer = (d: Hoja, ruta: string): string => {
  let v: Hoja = d;
  for (const k of ruta.split(".")) v = (v as { [k: string]: Hoja })[k]!;
  return v as string;
};

const CLAVES = ["protocol.stage.3.help.proposito", "protocol.stage.3.stop.causal", "protocol.stage.3.trap.causal"];
const ACLARA = { es: /¿qué pasaría si\?.* qué diría el modelo/i, en: /what if\?.* what the model would say/i };

describe("la referencia cruzada al «¿Qué pasaría si?»", () => {
  it.each(CLAVES)("%s aclara que la simulación dice qué diría el modelo, en los dos idiomas", (clave) => {
    expect(leer(es as unknown as Hoja, clave)).toMatch(ACLARA.es);
    expect(leer(en as unknown as Hoja, clave)).toMatch(ACLARA.en);
  });

  it("el porqué de la etapa 3 también", () => {
    const d = CONTENIDO_ETAPAS[3]?.porque;
    if (!d) throw new Error("etapa 3 sin porqué");
    expect(d.es).toMatch(ACLARA.es);
    expect(d.en).toMatch(ACLARA.en);
  });

  it("el término «Predecir o explicar» del glosario también", () => {
    const d = GLOSARIO["predecir-o-explicar"]!.definicion;
    expect(d.es).toMatch(ACLARA.es);
    expect(d.en).toMatch(ACLARA.en);
  });
});
