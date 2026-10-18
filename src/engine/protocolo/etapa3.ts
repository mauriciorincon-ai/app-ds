// Protocolo DS (S8), etapa 3 — ¿PREDECIR O EXPLICAR? Y EL DISEÑO. Un modelo predictivo anticipa lo
// que va a pasar; no dice qué pasaría si cambias algo. Si lo que buscas es una causa, el
// Protocolo se detiene y lo dice (Shmueli, Stat. Sci. 2010; Hernán, Hsu y Healy, 2019): eso exige
// un experimento, no un modelo. Si es predictivo, la ficha de diseño (población, periodo,
// exclusiones) y el tamaño de muestra (criterios de Riley, src/engine/protocolo/muestra.ts).
//
// Compuerta: «predictivo» + ficha escrita + muestra suficiente, o un aviso escrito por el
// usuario. Todo el cálculo de la muestra se RECALCULA desde lo respondido y lo que registró la
// etapa 2; un cuaderno con cifras que no cuadran no cumple.
import { byTask } from "@/engine/despacho";
import type {
  DatosEtapa,
  EtapaConstruida,
  Lectura,
  Previas,
  Trampa,
  Valor,
  Veredicto,
} from "./etapas";
import { formaDe } from "./etapa1";
import {
  MuestraInvalida,
  muestraBinaria,
  muestraCantidad,
  muestraMulticlase,
} from "./muestra";
import {
  claveExtra,
  mapa,
  mismoRegistro,
  numero,
  texto,
  textoLleno,
} from "./valores";

export const PROPOSITOS = ["predecir", "explicar"] as const;
export type Proposito = (typeof PROPOSITOS)[number];

const RESPUESTAS = [
  "proposito",
  "poblacion",
  "exclusiones",
  "periodo_texto",
  "parametros",
  "r2",
  "aviso",
] as const;

/** Todas las claves que esta etapa puede registrar. */
export const CLAVES_3 = {
  respuestas: RESPUESTAS,
  chequeos: [
    "n_disponible",
    "parametros",
    "n_requerido",
    "manda",
    "suficiente",
    "contraccion",
    "optimismo",
    "riesgo_medio",
    "eventos",
    "epp",
    "clase_que_manda",
    "por_clase",
    "varianza",
    "media",
    "parametros_contados",
  ],
} as const;

/** Largo máximo de los textos de la ficha. */
export const FICHA_MAX = 1000;

function proposito(valor: Valor | undefined): Proposito | null {
  return PROPOSITOS.find((p) => p === valor) ?? null;
}

/**
 * La muestra que hace falta, desde lo respondido y la etapa 2. `null` si falta algo de lo que
 * depende (no hay con qué calcular); las cifras en el cuaderno se comparan con esto.
 */
export function chequeos3(
  respuestas: DatosEtapa["respuestas"],
  previas: Previas,
): Record<string, Valor> | null {
  const etapa1 = previas[1];
  const etapa2 = previas[2];
  const forma = etapa1 ? formaDe(etapa1.respuestas) : null;
  if (!etapa1 || !etapa2 || !forma) return null;
  const c = etapa2.chequeos;
  const disponible = numero(c, "filas_utiles");
  const parametros = numero(respuestas, "parametros");
  if (disponible === null || parametros === null || parametros < 1) return null;
  try {
    const requerido = byTask(forma, {
      binaria: (): {
        final: number;
        manda: string;
        extra: Record<string, Valor>;
      } | null => {
        const clases = mapa(c, "clases");
        const tasa = numero(c, "tasa_base");
        if (!clases || tasa === null) return null;
        const m = muestraBinaria({ parametros, prevalencia: tasa });
        return {
          final: m.final,
          manda: m.manda,
          extra: {
            contraccion: m.contraccion,
            optimismo: m.optimismo,
            riesgo_medio: m.riesgoMedio,
            eventos: m.eventos,
            epp: m.epp,
          },
        };
      },
      multiclase: () => {
        const clases = mapa(c, "clases");
        if (!clases || disponible === 0) return null;
        const proporciones = Object.fromEntries(
          Object.entries(clases).map(([k, n]) => [k, n / disponible]),
        );
        const m = muestraMulticlase({ parametros, proporciones });
        return {
          final: m.final,
          manda: m.manda,
          extra: { clase_que_manda: m.clase, por_clase: m.porClase },
        };
      },
      numerica: () => {
        const [media, desv] = [
          numero(c, "objetivo_media"),
          numero(c, "objetivo_desv"),
        ];
        const r2 = numero(respuestas, "r2");
        if (media === null || desv === null || r2 === null) return null;
        const m = muestraCantidad({ parametros, r2, media, desviacion: desv });
        return {
          final: m.final,
          manda: m.manda,
          extra: {
            contraccion: m.contraccion,
            optimismo: m.optimismo,
            varianza: m.varianza,
            media: m.media,
          },
        };
      },
    })();
    if (!requerido) return null;
    return {
      n_disponible: disponible,
      parametros,
      n_requerido: requerido.final,
      manda: requerido.manda,
      suficiente: disponible >= requerido.final,
      ...requerido.extra,
    };
  } catch (error) {
    if (error instanceof MuestraInvalida) return null;
    throw error;
  }
}

function leer(datos: DatosEtapa): Lectura {
  const r = datos.respuestas;
  const extra = claveExtra(r, RESPUESTAS);
  if (extra) return { ok: false, campo: `respuestas.${extra}` };
  if (proposito(r.proposito) === null)
    return { ok: false, campo: "respuestas.proposito" };
  for (const clave of [
    "poblacion",
    "exclusiones",
    "periodo_texto",
    "aviso",
  ] as const) {
    const v = texto(r, clave);
    if (v === null || v.length > FICHA_MAX)
      return { ok: false, campo: `respuestas.${clave}` };
  }
  for (const clave of ["parametros", "r2"] as const)
    if (r[clave] !== null && numero(r, clave) === null)
      return { ok: false, campo: `respuestas.${clave}` };
  if (r.parametros !== null && !Number.isInteger(r.parametros))
    return { ok: false, campo: "respuestas.parametros" };
  if (r.proposito === "explicar") {
    const sobra = Object.keys(datos.chequeos)[0];
    return sobra ? { ok: false, campo: `chequeos.${sobra}` } : { ok: true };
  }
  const c = datos.chequeos;
  const intrusa = claveExtra(c, CLAVES_3.chequeos);
  if (intrusa) return { ok: false, campo: `chequeos.${intrusa}` };
  for (const clave of ["n_disponible", "n_requerido"] as const)
    if (clave in c && numero(c, clave) === null)
      return { ok: false, campo: `chequeos.${clave}` };
  if ("suficiente" in c && typeof c.suficiente !== "boolean")
    return { ok: false, campo: "chequeos.suficiente" };
  // Que las cifras estén y cuadren lo decide el criterio, que las recalcula.
  return { ok: true };
}

function criterio(datos: DatosEtapa, previas: Previas): Veredicto {
  const r = datos.respuestas;
  if (r.proposito === "explicar") return { tipo: "detenida", razon: "causal" };
  const etapa1 = previas[1];
  const etapa2 = previas[2];
  if (!etapa1 || !etapa2) return { tipo: "falta", faltan: ["etapas-previas"] };
  const forma = formaDe(etapa1.respuestas);
  const faltan: string[] = [];
  if (textoLleno(r, "poblacion") === null) faltan.push("poblacion");
  if (textoLleno(r, "exclusiones") === null) faltan.push("exclusiones");
  const conFecha = etapa2.respuestas.momento === "columna";
  if (!conFecha && textoLleno(r, "periodo_texto") === null)
    faltan.push("periodo");
  const parametros = numero(r, "parametros");
  if (parametros === null || parametros < 1) faltan.push("parametros");
  const r2 = numero(r, "r2");
  const pideR2 = forma
    ? byTask(forma, { binaria: false, multiclase: false, numerica: true })
    : false;
  if (pideR2 && (r2 === null || !(r2 > 0 && r2 < 1))) faltan.push("r2");
  if (faltan.length > 0) return { tipo: "falta", faltan };

  const esperados = chequeos3(r, previas);
  if (!esperados) return { tipo: "falta", faltan: ["chequeos"] };
  const guardados = { ...datos.chequeos };
  delete guardados.parametros_contados;
  if (!mismoRegistro(esperados, guardados))
    return { tipo: "falta", faltan: ["chequeos"] };
  if (esperados.suficiente !== true && textoLleno(r, "aviso") === null)
    return { tipo: "falta", faltan: ["muestra"] };
  return { tipo: "cumple" };
}

function trampas(datos: DatosEtapa, previas: Previas): readonly Trampa[] {
  if (datos.respuestas.proposito === "explicar")
    return [{ clave: "causal", params: {} }];
  const c = datos.chequeos;
  const etapa2 = previas[2];
  const requerido = numero(c, "n_requerido");
  const disponible = numero(c, "n_disponible");
  if (requerido === null || disponible === null) return [];
  const salida: Trampa[] = [
    {
      clave: c.suficiente === true ? "muestra-alcanza" : "muestra-corta",
      params: {
        parametros: numero(c, "parametros") ?? 0,
        requerido,
        disponible,
        manda: texto(c, "manda") ?? "",
      },
    },
  ];
  if (etapa2 && etapa2.respuestas.momento === "columna")
    salida.push({
      clave: "periodo",
      params: {
        minimo: texto(etapa2.chequeos, "fecha_min") ?? "",
        maximo: texto(etapa2.chequeos, "fecha_max") ?? "",
      },
    });
  return salida;
}

export const ETAPA_3: EtapaConstruida = {
  id: 3,
  construida: true,
  dependeDeDatos: true,
  terminos: [
    "predecir-o-explicar",
    "poblacion",
    "tamano-de-muestra",
    "contraccion",
    "r2",
    "desbalance",
  ],
  preguntas: [
    "proposito",
    "poblacion",
    "periodo",
    "exclusiones",
    "parametros",
    "r2",
    "aviso",
  ],
  chequeos: ["parametros_contados", "n_requerido", "n_disponible"],
  leer,
  criterio,
  trampas,
};
