// Protocolo DS (S12), etapa 7: los pliegues dentro del entrenamiento. Lo que tiene que valer siempre, esquema
// por esquema y sobre muchos repartos al azar: ninguna unidad en los dos lados de un pliegue, cada validación
// posterior a su entrenamiento más el hueco del horizonte, la misma semilla da lo mismo, k baja con su razón
// y nunca de 2, y NINGÚN índice de la prueba aparece en ningún pliegue. La verificación —otra función— cuenta
// lo que un reparto mal hecho dejaría pasar.
import { describe, expect, it } from "vitest";
import {
  ESQUEMAS,
  esPorGrupo,
  esTemporal,
  restar,
  type Diseno,
  type Esquema,
  type UnidadHorizonte,
} from "@/engine/protocolo/particion";
import {
  K_MIN,
  repartirPliegues,
  sinSolape,
  verificarPliegues,
  type ParametrosPliegues,
  type Pliegues,
} from "@/engine/protocolo/pliegues";
import { mulberry32 } from "@/engine/split";

const mes = (m: number) =>
  `${2025 + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}-15`;

function diseno(p: {
  n: number;
  clase?: (i: number) => string;
  valor?: (i: number) => number;
  unidad?: (i: number) => string | null;
  fecha?: (i: number) => string | null;
}): Diseno {
  const filas = Array.from({ length: p.n }, (_, i) => i);
  const clases = p.clase ? filas.map(p.clase) : null;
  const unidades = p.unidad ? filas.map(p.unidad) : null;
  return {
    forma: clases ? "binaria" : "numerica",
    filasTabla: p.n,
    filas,
    clases,
    valores: p.valor ? filas.map(p.valor) : null,
    positivo: clases ? "si" : null,
    unidades,
    unidadRepetida: unidades !== null,
    fechas: p.fecha ? filas.map(p.fecha) : null,
  };
}

/** Un mundo al azar: filas con unidad, mes y clase, y una quinta parte apartada como «la prueba». */
function mundo(semilla: number) {
  const rng = mulberry32(semilla);
  const n = 80 + Math.floor(rng() * 200);
  const nUnidades = 10 + Math.floor(rng() * 30);
  const nMeses = 8 + Math.floor(rng() * 12);
  const unidad = Array.from(
    { length: n },
    () => `U${Math.floor(rng() * nUnidades)}`,
  );
  const m = Array.from({ length: n }, () => Math.floor(rng() * nMeses));
  const clase = Array.from({ length: n }, () => (rng() < 0.3 ? "si" : "no"));
  const d = diseno({
    n,
    clase: (i) => clase[i]!,
    unidad: (i) => unidad[i]!,
    fecha: (i) => mes(m[i]!),
  });
  const entrenamiento = d.filas.filter(() => rng() >= 0.2);
  const prueba = d.filas.filter((f) => !entrenamiento.includes(f));
  const horizonte = Math.floor(rng() * 3);
  return { d, entrenamiento, prueba, horizonte };
}

const P = (
  esquema: Esquema,
  extra: Partial<ParametrosPliegues> = {},
): ParametrosPliegues => ({
  esquema,
  k: 5,
  horizonte: 0,
  unidad: "meses",
  ...extra,
});

function ok(r: ReturnType<typeof repartirPliegues>): Pliegues {
  if (!r.ok) throw new Error(`sin pliegues: ${r.razon}`);
  return r;
}

describe.each(ESQUEMAS)(
  "invariantes del esquema «%s» sobre repartos al azar",
  (esquema) => {
    const SEMILLAS = Array.from({ length: 40 }, (_, i) => 1000 + i);

    it("ningún índice fuera del entrenamiento, ningún solape, y los pliegues sirven", () => {
      let conPliegues = 0;
      const fallos: string[] = [];
      for (const s of SEMILLAS) {
        const { d, entrenamiento, horizonte } = mundo(s);
        const p = P(esquema, { horizonte });
        const r = repartirPliegues(d, entrenamiento, p);
        if (!r.ok) continue;
        conPliegues += 1;
        const v = verificarPliegues(d, entrenamiento, p, r);
        if (!sinSolape(v)) fallos.push(`semilla ${s}: ${JSON.stringify(v)}`);
        if (r.k < K_MIN || r.k > r.kPedido || r.pliegues.length !== r.k)
          fallos.push(`semilla ${s}: k=${r.k} de ${r.kPedido}`);
        if ((r.razon === "pedido") !== (r.k === r.kPedido))
          fallos.push(`semilla ${s}: razón «${r.razon}» con k=${r.k}`);
        if (
          r.pliegues.some(
            (x) => x.validacion.length === 0 || x.entrenamiento.length < K_MIN,
          )
        )
          fallos.push(`semilla ${s}: un pliegue sin casos`);
      }
      expect(fallos).toEqual([]);
      expect(
        conPliegues,
        "al menos 30 de 40 mundos arman pliegues",
      ).toBeGreaterThanOrEqual(30);
    });

    it("la misma semilla da los mismos pliegues", () => {
      for (const s of SEMILLAS.slice(0, 10)) {
        const { d, entrenamiento, horizonte } = mundo(s);
        const p = P(esquema, { horizonte });
        expect(repartirPliegues(d, entrenamiento, p)).toEqual(
          repartirPliegues(d, [...entrenamiento].reverse(), p),
        );
      }
    });

    it("nunca aparece un índice de la prueba, ni en el entrenamiento ni en la validación", () => {
      for (const s of SEMILLAS) {
        const { d, entrenamiento, prueba, horizonte } = mundo(s);
        const r = repartirPliegues(d, entrenamiento, P(esquema, { horizonte }));
        if (!r.ok) continue;
        const vistos = new Set(
          r.pliegues.flatMap((x) => [...x.entrenamiento, ...x.validacion]),
        );
        expect(prueba.filter((f) => vistos.has(f))).toEqual([]);
      }
    });
  },
);

describe("estratificada y por grupo: cada fila valida exactamente una vez", () => {
  for (const esquema of ["estratificada", "grupo"] as const)
    it(`«${esquema}»: las validaciones son una partición del entrenamiento`, () => {
      for (let s = 2000; s < 2030; s++) {
        const { d, entrenamiento } = mundo(s);
        const r = repartirPliegues(d, entrenamiento, P(esquema));
        if (!r.ok) continue;
        const todas = r.pliegues
          .flatMap((x) => [...x.validacion])
          .sort((a, b) => a - b);
        expect(todas).toEqual([...entrenamiento].sort((a, b) => a - b));
        const tamanos = r.pliegues.map((x) => x.validacion.length);
        if (esquema === "estratificada")
          expect(
            Math.max(...tamanos) - Math.min(...tamanos),
          ).toBeLessThanOrEqual(1);
      }
    });

  it("por grupo: cada unidad valida en un solo pliegue y nunca entrena donde valida", () => {
    for (let s = 2100; s < 2130; s++) {
      const { d, entrenamiento } = mundo(s);
      const r = repartirPliegues(d, entrenamiento, P("grupo"));
      if (!r.ok) continue;
      const dondeValida = new Map<string, number>();
      r.pliegues.forEach((x, j) => {
        for (const f of x.validacion) {
          const u = d.unidades![f]!;
          expect(
            dondeValida.get(u) ?? j,
            `unidad ${u} valida en dos pliegues`,
          ).toBe(j);
          dondeValida.set(u, j);
        }
        const deEnt = new Set(x.entrenamiento.map((f) => d.unidades![f]));
        for (const f of x.validacion)
          expect(deEnt.has(d.unidades![f]!)).toBe(false);
      });
    }
  });

  it("un número se reparte por tramos de valor, también balanceado", () => {
    const d = diseno({ n: 100, valor: (i) => (i * 37) % 101 });
    const r = ok(repartirPliegues(d, d.filas, P("estratificada")));
    const tamanos = r.pliegues.map((x) => x.validacion.length);
    expect(Math.max(...tamanos) - Math.min(...tamanos)).toBeLessThanOrEqual(1);
    expect(r.pliegues.flatMap((x) => [...x.validacion]).length).toBe(100);
  });
});

describe("por tiempo: ventana que avanza, con el hueco del horizonte", () => {
  // 10 meses de 12 filas cada uno, una unidad distinta por fila de cada mes
  const d = diseno({
    n: 120,
    clase: (i) => (i % 4 === 0 ? "si" : "no"),
    unidad: (i) => `U${i % 12}`,
    fecha: (i) => mes(Math.floor(i / 12)),
  });
  const todas = d.filas;

  for (const [horizonte, unidad] of [
    [0, "meses"],
    [1, "meses"],
    [31, "dias"],
  ] as const)
    it(`cada validación es posterior a su entrenamiento más ${horizonte} ${unidad}`, () => {
      const p = P("tiempo", { k: 3, horizonte, unidad });
      const r = ok(repartirPliegues(d, todas, p));
      expect(sinSolape(verificarPliegues(d, todas, p, r))).toBe(true);
      let huecos = 0;
      for (const x of r.pliegues) {
        const inicio = x.validacion.map((f) => d.fechas![f]!).sort()[0]!;
        const limite = restar(inicio, horizonte, unidad as UnidadHorizonte);
        expect(x.entrenamiento.every((f) => d.fechas![f]! < limite)).toBe(true);
        // las filas entre el límite y la validación no están en ningún lado: es el hueco
        const lados = new Set([...x.entrenamiento, ...x.validacion]);
        huecos += todas.filter(
          (f) =>
            d.fechas![f]! >= limite && d.fechas![f]! < inicio && !lados.has(f),
        ).length;
      }
      if (horizonte > 0) expect(huecos).toBeGreaterThan(0);
      else expect(huecos).toBe(0);
    });

  it("el primer bloque nunca valida: solo enseña", () => {
    const r = ok(repartirPliegues(d, todas, P("tiempo", { k: 3 })));
    const primera = d.fechas![0]!;
    for (const x of r.pliegues)
      expect(x.validacion.some((f) => d.fechas![f] === primera)).toBe(false);
    expect(
      verificarPliegues(d, todas, P("tiempo", { k: 3 }), r).sinValidar,
    ).toBeGreaterThan(0);
  });

  it("por tiempo y por grupo, el entrenamiento deja fuera la historia de las unidades que valida", () => {
    // unidades locales en el tiempo: cada una vive en 8 filas contiguas (si todas aparecieran en todos
    // los meses, quitar la historia de las que validan dejaría sin entrenamiento, y el motor lo rechaza)
    const dg = diseno({
      n: 120,
      clase: (i) => (i % 3 === 0 ? "si" : "no"),
      unidad: (i) => `U${Math.floor(i / 8)}`,
      fecha: (i) => mes(Math.floor(i / 12)),
    });
    const p = P("tiempo-grupo", { k: 3 });
    const r = ok(repartirPliegues(dg, dg.filas, p));
    for (const x of r.pliegues) {
      const deVal = new Set(x.validacion.map((f) => dg.unidades![f]));
      expect(x.entrenamiento.some((f) => deVal.has(dg.unidades![f]!))).toBe(
        false,
      );
    }
    expect(sinSolape(verificarPliegues(dg, dg.filas, p, r))).toBe(true);
  });

  it("si todas las unidades aparecen en todos los periodos, no hay pliegues y se dice por qué", () => {
    expect(repartirPliegues(d, todas, P("tiempo-grupo", { k: 3 }))).toEqual({
      ok: false,
      razon: "pocos-periodos",
    });
  });
});

describe("k baja con su razón, y con menos de 2 no hay pliegues", () => {
  it("por grupo con tres unidades y cinco pedidos: k = 3 por pocas unidades", () => {
    const d = diseno({
      n: 60,
      clase: (i) => (i % 2 ? "si" : "no"),
      unidad: (i) => `U${i % 3}`,
    });
    const r = ok(repartirPliegues(d, d.filas, P("grupo")));
    expect([r.kPedido, r.k, r.razon]).toEqual([5, 3, "pocas-unidades"]);
    // y si la clase coincide con la unidad, ningún pliegue entrena con las dos: no hay pliegues
    const confundida = diseno({
      n: 60,
      clase: (i) => (i % 3 === 0 ? "si" : "no"),
      unidad: (i) => `U${i % 3}`,
    });
    expect(repartirPliegues(confundida, confundida.filas, P("grupo")).ok).toBe(
      false,
    );
  });

  it("por grupo con una sola unidad: no hay pliegues", () => {
    const d = diseno({
      n: 40,
      clase: (i) => (i % 2 ? "si" : "no"),
      unidad: () => "U0",
    });
    expect(repartirPliegues(d, d.filas, P("grupo"))).toEqual({
      ok: false,
      razon: "pocas-unidades",
    });
  });

  it("por tiempo con tres fechas: k = 2 por pocos periodos; con dos, ninguno", () => {
    const tres = diseno({
      n: 60,
      clase: (i) => (i % 2 ? "si" : "no"),
      fecha: (i) => mes(i % 3),
    });
    const r = ok(repartirPliegues(tres, tres.filas, P("tiempo")));
    expect([r.k, r.razon]).toEqual([2, "pocos-periodos"]);
    const dos = diseno({
      n: 40,
      clase: (i) => (i % 2 ? "si" : "no"),
      fecha: (i) => mes(i % 2),
    });
    expect(repartirPliegues(dos, dos.filas, P("tiempo"))).toEqual({
      ok: false,
      razon: "pocos-periodos",
    });
  });

  it("estratificada con una clase de tres casos y cinco pliegues pedidos: k = 3 por pocos casos", () => {
    const d = diseno({ n: 60, clase: (i) => (i < 3 ? "si" : "no") });
    const r = ok(repartirPliegues(d, d.filas, P("estratificada")));
    expect([r.k, r.razon]).toEqual([3, "pocos-casos"]);
    // con una clase de un solo caso no se puede validar en 2 pliegues con las dos clases
    const rara = diseno({ n: 60, clase: (i) => (i < 1 ? "si" : "no") });
    expect(repartirPliegues(rara, rara.filas, P("estratificada"))).toEqual({
      ok: false,
      razon: "pocos-casos",
    });
  });

  it("un k pedido de 0, 1 o 2.7 se lee como lo que se puede: al menos 2", () => {
    const d = diseno({ n: 60, clase: (i) => (i % 2 ? "si" : "no") });
    expect(
      ok(repartirPliegues(d, d.filas, P("estratificada", { k: 0 }))).k,
    ).toBe(2);
    expect(
      ok(repartirPliegues(d, d.filas, P("estratificada", { k: 2.7 }))).k,
    ).toBe(2);
  });
});

describe("clases con nombre de propiedad heredada (deuda del S11)", () => {
  it("los pliegues no se confunden con «constructor», «__proto__» o «toString»", () => {
    const nombres = ["constructor", "__proto__", "toString", "a"];
    const d = diseno({
      n: 120,
      clase: (i) => nombres[i % 4]!,
      unidad: (i) => `U${i % 20}`,
    });
    for (const esquema of ["estratificada", "grupo"] as const) {
      const r = ok(repartirPliegues(d, d.filas, P(esquema)));
      expect(sinSolape(verificarPliegues(d, d.filas, P(esquema), r))).toBe(
        true,
      );
    }
  });
});

describe("la verificación cuenta lo que un reparto mal hecho dejaría pasar", () => {
  const d = diseno({
    n: 120,
    clase: (i) => (i % 4 === 0 ? "si" : "no"),
    unidad: (i) => `U${i % 12}`,
    fecha: (i) => mes(Math.floor(i / 12)),
  });
  const entrenamiento = d.filas;
  const con = (esquema: Esquema, k = 3, horizonte = 1) => {
    const p = P(esquema, { k, horizonte });
    return { p, r: ok(repartirPliegues(d, entrenamiento, p)) };
  };
  const cambiar = (
    r: Pliegues,
    j: number,
    cambio: Partial<Pliegues["pliegues"][number]>,
  ): Pliegues => ({
    ...r,
    pliegues: r.pliegues.map((x, i) => (i === j ? { ...x, ...cambio } : x)),
  });

  it("una fila en los dos lados de un pliegue", () => {
    const { p, r } = con("estratificada");
    const x = r.pliegues[0]!;
    const malo = cambiar(r, 0, {
      entrenamiento: [...x.entrenamiento, x.validacion[0]!],
    });
    expect(verificarPliegues(d, entrenamiento, p, malo).solapeFilas).toBe(1);
    expect(sinSolape(verificarPliegues(d, entrenamiento, p, malo))).toBe(false);
  });

  it("una unidad en los dos lados de un pliegue, por grupo (sin repetir ninguna fila)", () => {
    const { p, r } = con("grupo");
    const x = r.pliegues[0]!;
    const veces = new Map<string, number[]>();
    for (const f of x.validacion) {
      const u = d.unidades![f]!;
      veces.set(u, [...(veces.get(u) ?? []), f]);
    }
    const [, filas] = [...veces].find(([, fs]) => fs.length >= 2)!;
    const movida = filas[0]!;
    // se mueve UNA fila de la unidad de la validación al entrenamiento: ninguna fila queda repetida
    const malo = cambiar(r, 0, {
      entrenamiento: [...x.entrenamiento, movida],
      validacion: x.validacion.filter((f) => f !== movida),
    });
    const v = verificarPliegues(d, entrenamiento, p, malo);
    expect(v.solapeFilas).toBe(0);
    expect(v.solapeUnidades).toBe(1);
    expect(sinSolape(v)).toBe(false);
  });

  it("entrenamiento a menos de un horizonte de su validación, o posterior", () => {
    const { p, r } = con("tiempo", 3, 1);
    const x = r.pliegues[0]!;
    const inicio = x.validacion.map((f) => d.fechas![f]!).sort()[0]!;
    const limite = restar(inicio, 1, "meses");
    const delHueco = d.filas.filter(
      (f) => d.fechas![f]! >= limite && d.fechas![f]! < inicio,
    );
    expect(delHueco.length).toBeGreaterThan(0);
    const malo = cambiar(r, 0, {
      entrenamiento: [...x.entrenamiento, delHueco[0]!],
    });
    expect(verificarPliegues(d, entrenamiento, p, malo).validacionAntes).toBe(
      1,
    );
    // y una fila posterior a la validación
    const despues = d.filas.find(
      (f) =>
        d.fechas![f]! >
        x.validacion
          .map((g) => d.fechas![g]!)
          .sort()
          .at(-1)!,
    )!;
    const maloDos = cambiar(r, 0, {
      entrenamiento: [...x.entrenamiento, despues],
    });
    expect(
      verificarPliegues(d, entrenamiento, p, maloDos).validacionAntes,
    ).toBe(1);
  });

  it("un índice de la prueba que se cuela", () => {
    const sellado = d.filas.slice(0, 100);
    const p = P("estratificada", { k: 3 });
    const r = ok(repartirPliegues(d, sellado, p));
    const malo = cambiar(r, 1, {
      entrenamiento: [...r.pliegues[1]!.entrenamiento, 110],
    });
    expect(verificarPliegues(d, sellado, p, malo).fueraDelEntrenamiento).toBe(
      1,
    );
    expect(sinSolape(verificarPliegues(d, sellado, p, malo))).toBe(false);
  });

  it("los esquemas sin tiempo ni grupo no cuentan lo que no promete", () => {
    const { p, r } = con("estratificada");
    const v = verificarPliegues(d, entrenamiento, p, r);
    expect([v.solapeUnidades, v.validacionAntes]).toEqual([0, 0]);
    expect(esTemporal("estratificada") || esPorGrupo("estratificada")).toBe(
      false,
    );
  });
});
