// Protocolo DS (S9, etapa 4): la deriva entre periodos. La fórmula del PSI y sus umbrales se
// verificaron contra las fuentes (Potgieter et al. 2023, ec. 1; Lewis 1994 para 0,10 y 0,25;
// Yurdakul y Naranjo 2020 para el valor crítico) y los números se calcularon aparte con
// aritmética exacta; el valor χ² y el D de KS se comparan con `scipy` en
// tests/integration/deriva-scipy.test.ts. La guarda de ruido se prueba también por simulación.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CHI2_99_GL5,
  PSI_ALERTA,
  cortesCuantiles,
  derivaDeColumna,
  ksD,
  periodosDeDeriva,
  psiDeConteos,
  ruidoEsperado,
} from "@/engine/protocolo/deriva";
import { fechasPorFila } from "@/engine/protocolo/fechas";
import {
  valoresDe,
  vistaColumna,
  type VistaColumna,
} from "@/engine/protocolo/tabla";
import { parseCsvWithLimits } from "@/lib/ds/csv";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const renovaciones = (() => {
  const r = parseCsvWithLimits(
    readFileSync("docs/kit-de-prueba/renovaciones-mensuales.csv", "utf8"),
  );
  if (!r.ok) throw new Error("renovaciones");
  return r.table;
})();

function medible(fechas: (string | null)[]) {
  const p = periodosDeDeriva(fechas);
  if (p.tipo !== "medible") throw new Error(`no medible: ${p.tipo}`);
  return p;
}

describe("periodos", () => {
  it("el kit: corte el 15 de agosto, 247 filas antes y 114 desde entonces", () => {
    const fechas = fechasPorFila(
      valoresDe(renovaciones, "mes_observado"),
      null,
    )!;
    const p = medible([...fechas.fechas]);
    expect(p.corte).toBe("2025-08-15");
    expect([p.historico.length, p.reciente.length]).toEqual([247, 114]);
    // las filas son índices de la tabla, sin repetir ni perder ninguna
    expect(p.historico.length + p.reciente.length).toBe(361);
    expect(new Set([...p.historico, ...p.reciente]).size).toBe(361);
  });

  it("el reciente es el menor sufijo de días ENTEROS con al menos el 25 %", () => {
    // 4 días de 100 filas: el último junta el 25 % justo
    const dias = ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"];
    const fechas = dias.flatMap((d) => Array<string>(100).fill(d));
    const p = medible(fechas);
    expect(p.corte).toBe("2026-01-04");
    expect(p.reciente).toHaveLength(100);
    // si el último día junta menos, se suma el anterior (nunca se parte un día)
    const dias2 = [
      ...Array<string>(150).fill("2026-01-01"),
      ...Array<string>(150).fill("2026-01-02"),
      ...Array<string>(100).fill("2026-01-03"),
      ...Array<string>(20).fill("2026-01-04"),
    ];
    const p2 = medible(dias2);
    expect(p2.corte).toBe("2026-01-03");
    expect(p2.reciente).toHaveLength(120);
  });

  it("las filas sin fecha no entran a ningún periodo", () => {
    const fechas = [
      ...Array<string | null>(200).fill("2026-01-01"),
      ...Array<string | null>(200).fill("2026-02-01"),
      ...Array<string | null>(50).fill(null),
    ];
    const p = medible(fechas);
    expect(p.historico.length + p.reciente.length).toBe(400);
  });

  it("un solo día, o ninguno, no se mide", () => {
    expect(periodosDeDeriva(Array(400).fill("2026-01-01"))).toEqual({
      tipo: "una-fecha",
    });
    expect(periodosDeDeriva(Array(400).fill(null))).toEqual({
      tipo: "una-fecha",
    });
  });

  it("si el último día junta más de la mitad no hay un «antes» contra el cual medir", () => {
    const fechas = [
      ...Array<string>(100).fill("2026-01-01"),
      ...Array<string>(300).fill("2026-01-02"),
    ];
    expect(periodosDeDeriva(fechas)).toEqual({ tipo: "fecha-concentrada" });
    // el último día junta el 20 %: para llegar al 25 % hay que sumar también el primero, y
    // entonces no queda ningún «antes»
    const casi = [
      ...Array<string>(800).fill("2026-01-01"),
      ...Array<string>(200).fill("2026-01-02"),
    ];
    expect(periodosDeDeriva(casi)).toEqual({ tipo: "fecha-concentrada" });
    // con el 30 % en el último día sí hay dos periodos
    const bien = [
      ...Array<string>(700).fill("2026-01-01"),
      ...Array<string>(300).fill("2026-01-02"),
    ];
    expect(periodosDeDeriva(bien).tipo).toBe("medible");
  });

  it("con pocas filas dice «pocas filas» en vez de regalar un falso rojo", () => {
    const fechas = [
      ...Array<string>(60).fill("2026-01-01"),
      ...Array<string>(20).fill("2026-01-02"),
    ];
    expect(periodosDeDeriva(fechas)).toEqual({ tipo: "pocas-filas" });
    expect(ruidoEsperado(60, 20)).toBeGreaterThan(PSI_ALERTA);
  });
});

describe("PSI", () => {
  it("coincide con el cálculo exacto hecho aparte (Σ (r−h)·ln(r/h), +0,5 por casilla)", () => {
    expect(psiDeConteos([50, 50], [30, 70])).toBeCloseTo(
      0.1659180249910608,
      12,
    );
    expect(psiDeConteos([40, 30, 20, 10], [10, 20, 30, 40])).toBeCloseTo(
      0.8719768526109903,
      12,
    );
    expect(psiDeConteos([100, 0, 0], [0, 0, 100])).toBeCloseTo(
      10.501593877344705,
      12,
    );
  });

  it("dos distribuciones iguales dan 0, y es simétrico", () => {
    expect(psiDeConteos([10, 20, 30], [10, 20, 30])).toBe(0);
    expect(psiDeConteos([10, 20, 30], [30, 20, 10])).toBeCloseTo(
      psiDeConteos([30, 20, 10], [10, 20, 30]),
      12,
    );
  });

  it("las casillas vacías en los dos periodos se quitan; con una sola casilla es 0", () => {
    expect(psiDeConteos([10, 0, 30], [20, 0, 10])).toBeCloseTo(
      0.703171946142288,
      12,
    );
    expect(psiDeConteos([10, 30], [20, 10])).toBeCloseTo(0.703171946142288, 12);
    expect(psiDeConteos([5, 0], [9, 0])).toBe(0);
    expect(psiDeConteos([], [])).toBe(0);
  });

  it("una casilla vacía en un solo periodo no da infinito (el +0,5)", () => {
    const v = psiDeConteos([100, 0], [0, 100]);
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeGreaterThan(PSI_ALERTA);
  });
});

describe("KS", () => {
  it("D es la mayor brecha entre las acumuladas", () => {
    expect(ksD([1, 2, 3], [4, 5, 6])).toBe(1);
    expect(ksD([1, 2, 3, 4], [3, 4, 5, 6])).toBe(0.5);
    expect(ksD([1, 2, 3], [1, 2, 3])).toBe(0);
  });

  it("los empates se cuentan juntos y una muestra vacía da 0", () => {
    expect(ksD([1, 1, 1, 2], [1, 2, 2, 2])).toBeCloseTo(0.5, 12);
    expect(ksD([], [1, 2])).toBe(0);
  });

  it("no depende de cuál va primero", () => {
    const a = [1, 5, 7, 7, 9, 12];
    const b = [2, 3, 7, 11, 13, 14, 15];
    expect(ksD(a, b)).toBeCloseTo(ksD(b, a), 12);
  });
});

describe("cortes y columnas", () => {
  it("los cortes salen de los quintiles del histórico y no se repiten", () => {
    const ordenado = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(cortesCuantiles(ordenado)).toEqual([20, 40, 60, 80]);
    expect(cortesCuantiles([3, 3, 3, 3, 3, 3])).toEqual([3]);
    expect(cortesCuantiles([])).toEqual([]);
  });

  const periodos = (nh: number, nr: number) => ({
    tipo: "medible" as const,
    corte: "x",
    historico: Array.from({ length: nh }, (_, i) => i),
    reciente: Array.from({ length: nr }, (_, i) => nh + i),
  });

  it("una numérica que se corre sube el PSI y el D; una estable no", () => {
    const rng = mulberry32(7);
    const nh = 300;
    const nr = 150;
    const valores = [
      ...Array.from({ length: nh }, () => rng() * 100),
      ...Array.from({ length: nr }, () => 40 + rng() * 100),
    ];
    const vista: VistaColumna = { tipo: "numero", valores, basura: 0 };
    const movida = derivaDeColumna(vista, periodos(nh, nr));
    expect(movida.tipo).toBe("medida");
    if (movida.tipo === "medida") {
      expect(movida.psi).toBeGreaterThan(PSI_ALERTA);
      expect(movida.ks).toBeGreaterThan(0.3);
    }
    const quieta: VistaColumna = {
      tipo: "numero",
      valores: Array.from({ length: nh + nr }, () => rng() * 100),
      basura: 0,
    };
    const q = derivaDeColumna(quieta, periodos(nh, nr));
    expect(q.tipo === "medida" && q.psi < 0.1).toBe(true);
  });

  it("una categoría nueva va a «otras» y los vacíos son su propia casilla", () => {
    const nh = 300;
    const nr = 150;
    const h = Array.from({ length: nh }, (_, i) => ["a", "b", "c"][i % 3]!);
    const r = Array.from({ length: nr }, () => "NUEVA");
    const vista: VistaColumna = {
      tipo: "texto",
      valores: [...h, ...r],
      fecha: false,
    };
    const m = derivaDeColumna(vista, periodos(nh, nr));
    expect(m.tipo === "medida" && m.psi > PSI_ALERTA && m.ks === null).toBe(
      true,
    );
    // los vacíos que aparecen de golpe también son deriva
    const conVacios: VistaColumna = {
      tipo: "texto",
      valores: [...h, ...Array<string | null>(nr).fill(null)],
      fecha: false,
    };
    // sin valores en el reciente no hay con qué medir: «pocas filas», no una cifra inventada
    expect(derivaDeColumna(conVacios, periodos(nh, nr)).tipo).toBe(
      "pocas-filas",
    );
  });

  it("si la columna casi no trae valores en un periodo, «pocas filas»", () => {
    const valores = [
      ...Array.from({ length: 300 }, (_, i) => i),
      ...Array.from({ length: 150 }, (_, i) => (i < 5 ? i : null)),
    ];
    const m = derivaDeColumna(
      { tipo: "numero", valores, basura: 0 },
      periodos(300, 150),
    );
    expect(m.tipo).toBe("pocas-filas");
  });

  it("la basura de una numérica cuenta como vacío (la vista de Probeta)", () => {
    const crudos = [
      ...Array.from({ length: 95 }, (_, i) => String(i)),
      "error",
      "s/d",
      "x",
      "y",
      "z",
    ];
    const v = vistaColumna("edad", crudos);
    expect(v.tipo).toBe("numero");
    if (v.tipo === "numero") expect(v.basura).toBe(5);
  });
});

describe("la guarda de ruido (simulación con semilla)", () => {
  it("bajo ningún cambio, el PSI casi nunca pasa del valor crítico (α = 1 %) y su media ronda (B−1)(1/n+1/m)", () => {
    const rng = mulberry32(2026);
    const [nh, nr, corridas] = [247, 114, 600];
    let sobreCritico = 0;
    let sobreAlerta = 0;
    let suma = 0;
    for (let k = 0; k < corridas; k++) {
      const valores = Array.from({ length: nh + nr }, () => rng());
      const m = derivaDeColumna(
        { tipo: "numero", valores, basura: 0 },
        {
          tipo: "medible",
          corte: "x",
          historico: Array.from({ length: nh }, (_, i) => i),
          reciente: Array.from({ length: nr }, (_, i) => nh + i),
        },
      );
      if (m.tipo !== "medida") throw new Error("debía medirse");
      suma += m.psi;
      if (m.psi >= ruidoEsperado(nh, nr)) sobreCritico += 1;
      if (m.psi >= PSI_ALERTA) sobreAlerta += 1;
    }
    // cinco casillas ⇒ 4 grados de libertad: el valor crítico de 5 es conservador
    expect(sobreCritico / corridas).toBeLessThan(0.01);
    expect(sobreAlerta).toBe(0);
    const media = suma / corridas;
    expect(media).toBeGreaterThan(0.5 * 4 * (1 / nh + 1 / nr));
    expect(media).toBeLessThan(2 * 4 * (1 / nh + 1 / nr));
  });

  it("el χ² al 99 % con 5 grados de libertad es el de las tablas (15,0863)", () => {
    expect(CHI2_99_GL5).toBeCloseTo(15.0863, 3);
  });
});
