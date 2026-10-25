// Protocolo DS (S15), etapa 10 — la ficha dicha con palabras. La ficha del motor (claves + parámetros + fuente) se
// vuelve frases en la pantalla y en el Markdown con el MISMO código (ficha-texto.ts). Lo que tiene que valer:
//  · cada línea que la ficha puede escribir tiene su texto en español y en inglés, sin textos huérfanos;
//  · ninguna ficha, en ningún idioma, deja una clave cruda, un marcador {…} sin llenar, `undefined` o `NaN`;
//  · las cifras se dicen como el resto del Protocolo (costos por cada 100, proporciones, nombres traducidos);
//  · el Markdown no deja que un texto escrito por el usuario rompa la lista ni pinte HTML, y el nombre del
//    archivo sale del cuaderno.
import { describe, expect, it } from "vitest";
import { TEXTOS_ETAPA_10 } from "@/components/protocolo/textos/etapa10";
import { evaluar } from "@/engine/protocolo/compuerta";
import {
  LINEAS_FICHA,
  SECCIONES_FICHA,
  armarFicha,
  evidenciasCumplidas,
  type Ficha,
} from "@/engine/protocolo/ficha";
import { textoPropio } from "@/i18n/textos-etapa";
import { translate } from "@/i18n/translate";
import {
  fichaMarkdown,
  nombreFichaMarkdown,
} from "@/lib/protocolo/ficha-markdown";
import {
  fichaVista,
  nombresDe,
  parametrosTexto,
  type Traduce,
} from "@/lib/protocolo/ficha-texto";
import {
  AHORA,
  ENTRADA_NO_USAR,
  ENTRADA_USAR,
  HUELLA,
  PROTOCOLO10,
  armarCredito9,
  datos10,
  registrar10,
} from "./protocolo-etapa10-helpers";

const IDIOMAS = ["es", "en"] as const;
const tDe =
  (locale: (typeof IDIOMAS)[number]): Traduce =>
  (clave, params) =>
    textoPropio(TEXTOS_ETAPA_10, locale, clave, params) ??
    translate(locale, clave, params);

type Libre = Record<string, unknown>;
type Cambio = { etapa: 2 | 3 | 7 | 8 | 9 | 10; r?: Libre; c?: Libre };

/** Las evidencias de un cuaderno con la 10 registrada (con la compuerta real). */
function evidenciasDe(decision: "usar" | "iterar" | "no-usar") {
  const a = armarCredito9(decision);
  const entrada = decision === "usar" ? ENTRADA_USAR : ENTRADA_NO_USAR;
  const r = registrar10(a, datos10(a, entrada));
  if (!r.ok) throw new Error(JSON.stringify(r.rechazo));
  const cuaderno = {
    ...r.cuaderno,
    cargas: [
      {
        fecha: AHORA.toISOString(),
        sha256: HUELLA,
        nombre: "credito-fuga-plantada.csv",
        filas: a.tabla.rows.length,
        columnas: a.tabla.headers.length,
      },
    ],
  };
  return {
    evidencias: evidenciasCumplidas(
      evaluar(PROTOCOLO10, cuaderno, HUELLA, a.tabla),
    ),
    carga: cuaderno.cargas[0]!,
  };
}

function fichaCon(
  base: ReturnType<typeof evidenciasDe>,
  ...cambios: Cambio[]
): Ficha {
  const evidencias = { ...base.evidencias };
  for (const { etapa, r = {}, c = {} } of cambios) {
    const e = evidencias[etapa]!;
    evidencias[etapa] = {
      ...e,
      datos: {
        respuestas: { ...e.datos.respuestas, ...r },
        chequeos: { ...e.datos.chequeos, ...c },
      } as typeof e.datos,
    };
  }
  return armarFicha({ evidencias, carga: base.carga })!;
}

const USAR = evidenciasDe("usar");
const FICHAS: [string, Ficha][] = [
  ["usar", fichaCon(USAR)],
  ["no usar", fichaCon(evidenciasDe("no-usar"))],
  ["iterar", fichaCon(evidenciasDe("iterar"))],
  [
    "todo lo que se puede escribir",
    fichaCon(
      USAR,
      { etapa: 3, r: { exclusiones: "Clientes con baja temprana" } },
      { etapa: 2, c: { fecha_min: "2024-01-01", fecha_max: "2025-06-30" } },
      {
        etapa: 8,
        c: {
          aperturas: 2,
          regla_costo: 0.5,
          peor_segmento: "c:empleo=informal",
          n_prueba: 12,
        },
      },
      { etapa: 9, c: { brecha: 0.2, hoy_id: "regla", beneficio_regla: 0.05 } },
      {
        etapa: 10,
        r: { cadencia: 8, razon_cadencia: "El mercado cambia lento" },
        c: { cadencia_sugerida: 5 },
      },
    ),
  ],
  [
    "calibración sin probabilidades y modo clase",
    fichaCon(
      USAR,
      {
        etapa: 8,
        c: {
          calibracion: "sin-probabilidades",
          peor_segmento: "ninguno",
          seg_con_soporte: 0,
        },
      },
      { etapa: 9, c: { modo: "clase" } },
    ),
  ],
  [
    "la robustez medida (sigue ganando)",
    fichaCon(USAR, {
      etapa: 8,
      c: { metrica: "auc", prueba_metrica: 0.9, estres_ruido: 0.8, estres_rival: 0.5, estres_rival_id: "majority" },
    }),
  ],
  [
    "la robustez medida (deja de ganar)",
    fichaCon(USAR, {
      etapa: 8,
      c: { metrica: "auc", prueba_metrica: 0.9, estres_ruido: 0.505, estres_rival: 0.5, estres_rival_id: "majority" },
    }),
  ],
  [
    "la robustez medida (ya no ganaba sin ruido)",
    fichaCon(USAR, {
      etapa: 8,
      c: { metrica: "mae", prueba_metrica: 1250.5, estres_ruido: 1300, estres_rival: 1200, estres_rival_id: "median" },
    }),
  ],
  [
    "calibración que no aplica",
    fichaCon(USAR, {
      etapa: 8,
      c: {
        calibracion: "no-aplica",
        peor_segmento: "ninguno",
        seg_con_soporte: 3,
      },
    }),
  ],
  [
    "el umbral movido, cadencia acortada y la 7 sin ventaja",
    fichaCon(
      USAR,
      { etapa: 7, c: { veredicto: "no-supera", senal: "sin-senal" } },
      { etapa: 9, r: { umbral: "0.30" }, c: { umbral_usado: 0.3 } },
      { etapa: 10, r: { cadencia: 3 }, c: { cadencia_sugerida: 5 } },
    ),
  ],
  [
    "sin exclusiones, lo que no se usa, supera y la cadencia que respalda la prueba",
    fichaCon(
      USAR,
      { etapa: 3, r: { exclusiones: " " } },
      { etapa: 7, c: { veredicto: "supera", senal: "senal" } },
      {
        etapa: 10,
        r: { no_usar_para: "Clientes nuevos", cadencia: 5 },
        c: { cadencia_sugerida: 5 },
      },
    ),
  ],
  [
    "sin tiempo en la prueba",
    fichaCon(USAR, {
      etapa: 10,
      c: { cadencia_sugerida: null, base_cadencia: "sin-tiempo" },
    }),
  ],
];

const claves = (f: Ficha) =>
  f.secciones.flatMap((s) => s.lineas.map((l) => [s.id, l.clave] as const));

describe("los textos de la ficha (messages/etapas/etapa10)", () => {
  it.each(IDIOMAS)(
    "%s: cada línea que la ficha puede escribir tiene su texto",
    (idioma) => {
      const faltan: string[] = [];
      for (const [seccion, lineas] of Object.entries(LINEAS_FICHA))
        for (const linea of lineas)
          if (
            !textoPropio(
              TEXTOS_ETAPA_10,
              idioma,
              `protocol.stage.10.sheet.${seccion}.${linea}`,
            )
          )
            faltan.push(`${seccion}.${linea}`);
      expect(faltan).toEqual([]);
    },
  );

  it.each(IDIOMAS)(
    "%s: no sobra ningún texto de línea que la ficha no escriba",
    (idioma) => {
      const sheet = TEXTOS_ETAPA_10[idioma].protocol as unknown as {
        stage: Record<
          string,
          { sheet: Record<string, Record<string, string>> }
        >;
      };
      const hoja = sheet.stage["10"]!.sheet;
      const sobran: string[] = [];
      for (const seccion of SECCIONES_FICHA)
        for (const linea of Object.keys(hoja[seccion] ?? {}))
          if (!(LINEAS_FICHA[seccion] as readonly string[]).includes(linea))
            sobran.push(`${seccion}.${linea}`);
      expect(sobran).toEqual([]);
    },
  );

  it("las fichas de prueba cubren TODAS las líneas del contrato (el cruce no se queda corto)", () => {
    const vistas = new Set(
      FICHAS.flatMap(([, f]) => claves(f).map(([s, k]) => `${s}.${k}`)),
    );
    const sinVer = Object.entries(LINEAS_FICHA)
      .flatMap(([s, ls]) => ls.map((l) => `${s}.${l}`))
      .filter((k) => !vistas.has(k));
    // las dos líneas del `decision-*` que no tocan a «usar» y las del `que-cambiar*` se cubren con las otras fichas
    expect(sinVer).toEqual([]);
  });

  it("toda línea que arma la ficha está en el contrato", () => {
    const fuera: string[] = [];
    for (const [nombre, f] of FICHAS)
      for (const [s, k] of claves(f))
        if (!(LINEAS_FICHA[s] as readonly string[]).includes(k))
          fuera.push(`${nombre}: ${s}.${k}`);
    expect(fuera).toEqual([]);
  });
});

describe("la ficha dicha en pantalla y en Markdown", () => {
  it.each(FICHAS)(
    "%s: ni clave cruda, ni marcador sin llenar, ni undefined, en los dos idiomas",
    (_n, ficha) => {
      for (const idioma of IDIOMAS) {
        const t = tDe(idioma);
        const nombres = nombresDe(USAR.evidencias);
        const vista = fichaVista(ficha, t, idioma, nombres);
        const markdown = fichaMarkdown(ficha, t, idioma, nombres);
        const todo = [
          ...vista.flatMap((s) => [
            s.titulo,
            ...s.lineas.flatMap((l) => [l.texto, l.fuente]),
          ]),
          markdown,
        ].join("\n");
        expect(todo, idioma).not.toMatch(
          /protocol\.|results\.|\{\w+\}|undefined|NaN|\bnull\b|\[object/,
        );
      }
    },
  );

  it("las cifras se dicen como el resto del Protocolo", () => {
    const texto = (idioma: "es" | "en") =>
      fichaVista(FICHAS[3]![1], tDe(idioma), idioma, nombresDe(USAR.evidencias))
        .flatMap((s) => s.lineas.map((l) => l.texto))
        .join("\n");
    const es = texto("es");
    expect(es).toMatch(
      /Cadencia de reentreno \(en meses\): 8, más larga que los 5 que respalda la prueba\. Razón del dueño: «El mercado cambia lento»\./,
    );
    expect(es).toMatch(/Periodo de los datos: de 2024-01-01 a 2025-06-30\./);
    expect(es).toMatch(/Donde más falla: /);
    expect(es).toMatch(
      /Umbrales de deriva \(PSI\): moderada desde 0\.10, alerta desde 0\.25/,
    );
    expect(es).toMatch(/\d por cada 100 decisiones/);
    expect(es).toMatch(/separaron 20\.0 puntos porcentuales/);
    const en = texto("en");
    expect(en).toMatch(
      /Retraining cadence \(in months\): 8, longer than the 5 the test supports\./,
    );
    expect(en).toMatch(/Where it fails most: /);
  });

  it("los nombres cerrados se traducen: la partición, la métrica, el modelo y la línea base", () => {
    const t = tDe("es");
    const p = parametrosTexto(
      t,
      {
        esquema: "estratificada",
        metrica: "auc",
        ganador: "logistic",
        baseId: "nunca-actuar",
        hoyId: "regla",
      },
      nombresDe(USAR.evidencias),
    );
    expect(p).toMatchObject({
      esquema: "Estratificada",
      hoy: "tu regla de hoy",
    });
    expect(p.esquema).not.toMatch(/^protocol/);
    expect(String(p.base)).not.toMatch(/^protocol/);
    expect(String(p.ganador)).not.toMatch(/^results/);
    expect(String(p.metrica)).not.toMatch(/^results/);
  });

  it("el Markdown: título, titular, secciones y una línea por línea con su fuente", () => {
    const md = fichaMarkdown(
      FICHAS[0]![1],
      tDe("es"),
      "es",
      nombresDe(USAR.evidencias),
    );
    expect(
      md.startsWith("# Ficha del modelo\n\n**Un modelo para usar**\n\n> "),
    ).toBe(true);
    expect(md).toContain("## Los datos");
    expect(md).toContain("## Lo que este modelo cumplió");
    expect(md).toContain("## Plan de vigilancia");
    expect(md).toContain("## Quién responde");
    expect(md).not.toContain("## Qué cambiar");
    const items = md.split("\n").filter((l) => l.startsWith("- "));
    expect(items.length).toBe(claves(FICHAS[0]![1]).length);
    for (const item of items) expect(item).toMatch(/ — _.+_$/);
  });

  it("un texto escrito por el usuario no rompe la lista ni pinta HTML", () => {
    const ficha = fichaCon(USAR, {
      etapa: 3,
      r: {
        exclusiones:
          "<img src=x onerror=alert(1)>\nsegunda línea\n\n## titular falso",
      },
    });
    const md = fichaMarkdown(
      ficha,
      tDe("es"),
      "es",
      nombresDe(USAR.evidencias),
    );
    expect(md).not.toMatch(/(^|[^\\])<img/);
    expect(md).toContain("\\<img src=x onerror=alert(1)\\>");
    expect(md).toContain("segunda línea ## titular falso");
    expect(md.split("\n").filter((l) => l.startsWith("## ")).length).toBe(
      ficha.secciones.length,
    );
  });

  it("el Markdown escapa lo que leería como formato o como HTML, también una barra escrita por el usuario (auditoría M1)", () => {
    const barra = fichaCon(USAR, {
      etapa: 3,
      r: { exclusiones: "\\<img src=x>" },
    });
    const md = fichaMarkdown(
      barra,
      tDe("es"),
      "es",
      nombresDe(USAR.evidencias),
    );
    // la barra se escapa a sí misma y el `<` queda escapado: no sale HTML crudo
    expect(md).toContain("\\\\\\<img src=x\\>");
    expect(md).not.toMatch(/(^|[^\\])<img/);
    const enlace = fichaCon(USAR, {
      etapa: 3,
      r: { exclusiones: "[a](http://x) ![](http://x)" },
    });
    const md2 = fichaMarkdown(
      enlace,
      tDe("es"),
      "es",
      nombresDe(USAR.evidencias),
    );
    expect(md2).toContain("\\[a\\](http://x) \\!\\[\\](http://x)");
  });

  it("el nombre del archivo sale del cuaderno, o es genérico", () => {
    expect(nombreFichaMarkdown(USAR.carga)).toBe(
      "ficha-del-modelo-credito-fuga-plantada.md",
    );
    expect(
      nombreFichaMarkdown({ ...USAR.carga, nombre: "Ventas 2025 (v2).CSV" }),
    ).toBe("ficha-del-modelo-ventas-2025-v2.md");
    expect(nombreFichaMarkdown({ ...USAR.carga, nombre: "..." })).toBe(
      "ficha-del-modelo.md",
    );
    expect(nombreFichaMarkdown(null)).toBe("ficha-del-modelo.md");
  });
});
