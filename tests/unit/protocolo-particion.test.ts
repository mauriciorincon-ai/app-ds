// Protocolo DS (S11), etapa 6: el motor de la partición. Lo que tiene que valer siempre, esquema por
// esquema: ningún grupo en los dos lados, ninguna fecha de prueba dentro del hueco ni a menos de un
// horizonte del entrenamiento, la misma semilla da lo mismo, cada fila que no entra se cuenta por su
// motivo, y la verificación —otra función— cuenta lo que una partición mal hecha dejaría pasar.
import { describe, expect, it } from "vitest";
import {
  SEMILLA_6,
  diasDe,
  disenoDe,
  disponibles,
  fechaDe,
  partir,
  preguntaUnidades,
  recetaSello,
  restar,
  sugerido,
  verificar,
  type Diseno,
  type Parametros,
  RESULTADOS_MAX,
} from "@/engine/protocolo/particion";
import { sha256TextoSync } from "@/engine/protocolo/sha256";
import type { CsvTable } from "@/lib/ds/csv";
import { csv } from "./protocolo-etapa4-helpers";

const HUELLA = "a".repeat(64);

const R2_PANEL = {
  objetivo: "baja",
  positivo: "si",
  unidad: "columna",
  unidad_columna: "u",
  momento: "columna",
  momento_columna: "mes",
  orden_fecha: null,
} as const;

/**
 * Un panel: `unidades` clientes que entran escalonados (el i-ésimo empieza en el mes i % 6) y
 * se observan `meses` meses cada uno; «si» en uno de cada `cadaPositivo` (fila).
 */
function panel(
  unidades: number,
  meses: number,
  cadaPositivo = 5,
  escalonado = true,
): CsvTable {
  const lineas = ["u,mes,x,baja"];
  let k = 0;
  for (let i = 0; i < unidades; i++)
    for (let m = 0; m < meses; m++) {
      const mes = (escalonado ? i % 6 : 0) + m;
      const fecha = `2025-${String((mes % 12) + 1).padStart(2, "0")}-15`;
      const anio = mes >= 12 ? "2026" : "2025";
      lineas.push(
        `U${i},${fecha.replace("2025", anio)},${k % 7},${k++ % cadaPositivo === 0 ? "si" : "no"}`,
      );
    }
  return csv(...lineas);
}

function diseno(tabla: CsvTable, r2: Record<string, unknown> = R2_PANEL) {
  const d = disenoDe(tabla, "binaria", r2 as never);
  if (!d) throw new Error("sin diseño");
  return d;
}

const P = (extra: Partial<Parametros>): Parametros => ({
  esquema: "estratificada",
  tamano: 20,
  horizonte: 0,
  unidad: "dias",
  ...extra,
});

function lados(d: Diseno, p: Parametros, tabla: CsvTable) {
  const r = partir(tabla, d, p, HUELLA);
  if (!r) throw new Error("sin partición");
  return r;
}

describe("la caché de particiones tiene tope (S16, S11)", () => {
  it("guarda a lo más RESULTADOS_MAX por tabla: la más vieja se descarta y vuelve a dar lo mismo", () => {
    const t = panel(12, 4);
    const d = diseno(t);
    const primera = lados(d, P({ tamano: 10 }), t);
    expect(lados(d, P({ tamano: 10 }), t)).toBe(primera); // guardada
    for (let tamano = 11; tamano < 11 + RESULTADOS_MAX; tamano++)
      partir(t, d, P({ tamano }), HUELLA);
    const otra = lados(d, P({ tamano: 10 }), t);
    expect(otra).not.toBe(primera); // descartada y recalculada
    expect(otra.sello).toBe(primera.sello); // pero determinista
  });
});

describe("las fechas, sin reloj ni zona horaria", () => {
  it("días y fechas van y vuelven, también en bisiestos", () => {
    expect(diasDe("1970-01-01")).toBe(0);
    for (const f of ["2024-02-29", "2000-03-01", "1999-12-31", "2026-10-18"])
      expect(fechaDe(diasDe(f))).toBe(f);
    expect(restar("2024-03-01", 1, "dias")).toBe("2024-02-29");
    expect(restar("2025-01-01", 1, "dias")).toBe("2024-12-31");
  });

  it("los meses se restan con calendario: fin de mes, cambio de año", () => {
    expect(restar("2025-09-15", 1, "meses")).toBe("2025-08-15");
    expect(restar("2025-03-31", 1, "meses")).toBe("2025-02-28");
    expect(restar("2024-03-31", 1, "meses")).toBe("2024-02-29");
    expect(restar("2025-01-15", 2, "meses")).toBe("2024-11-15");
    expect(restar("2025-01-15", 0, "meses")).toBe("2025-01-15");
  });
});

describe("qué esquemas ofrece y cuál sugiere", () => {
  it("sin fecha ni unidad: solo estratificada, y la sugiere", () => {
    const t = csv("x,baja", "1,si", "2,no", "3,no", "4,si");
    const d = diseno(t, {
      objetivo: "baja",
      positivo: "si",
      unidad: "fila",
      unidad_columna: null,
      momento: "texto",
      momento_columna: null,
      orden_fecha: null,
    });
    expect(disponibles(d)).toEqual(["estratificada"]);
    expect(preguntaUnidades(d)).toBe(false);
    expect(sugerido(d, "")).toBe("estratificada");
  });

  it("con fecha y unidad repetida pregunta; nuevas ⇒ tiempo y grupo, conocidas ⇒ tiempo", () => {
    const d = diseno(panel(20, 4));
    expect(disponibles(d)).toEqual([
      "estratificada",
      "grupo",
      "tiempo",
      "tiempo-grupo",
    ]);
    expect(preguntaUnidades(d)).toBe(true);
    expect(sugerido(d, "")).toBeNull();
    expect(sugerido(d, "nuevas")).toBe("tiempo-grupo");
    expect(sugerido(d, "conocidas")).toBe("tiempo");
  });

  it("solo unidad repetida ⇒ grupo; solo fecha ⇒ tiempo", () => {
    const t = panel(20, 4);
    expect(sugerido(diseno(t, { ...R2_PANEL, momento: "texto" }), "")).toBe(
      "grupo",
    );
    expect(sugerido(diseno(t, { ...R2_PANEL, unidad: "fila" }), "")).toBe(
      "tiempo",
    );
  });
});

describe("por grupo: ninguna unidad en los dos lados", () => {
  const t = panel(40, 4);
  const d = diseno(t);
  const r = lados(d, P({ esquema: "grupo" }), t);

  it("cada unidad queda entera de un lado, y la verificación lo cuenta en cero", () => {
    const u = (filas: readonly number[]) =>
      new Set(filas.map((f) => d.unidades![f]));
    const [ue, up] = [u(r.particion.entrenamiento), u(r.particion.prueba)];
    expect([...ue].filter((x) => up.has(x))).toEqual([]);
    expect(r.verificacion.solapeUnidades).toBe(0);
    expect(r.verificacion.solapeFilas).toBe(0);
    expect(r.particion.entrenamiento.length + r.particion.prueba.length).toBe(
      160,
    );
    // ≈ 20 % de las unidades a la prueba (8 de 40)
    expect(r.prueba.unidades).toBe(8);
  });

  it("al azar, las mismas filas habrían dejado unidades en los dos lados (lo que evitó)", () => {
    expect(r.azar?.unidades).toBeGreaterThan(0);
  });

  it("la prueba no se queda sin la clase rara", () => {
    expect(r.prueba.clases?.si).toBeGreaterThan(0);
    expect(r.entrenamiento.clases?.si).toBeGreaterThan(0);
  });
});

describe("por tiempo: la prueba al final, con el hueco del horizonte", () => {
  const t = panel(30, 4);
  const d = diseno(t);

  it("con un mes de horizonte, el mes anterior al corte es el hueco y nada de prueba cae ahí", () => {
    const r = lados(
      d,
      P({ esquema: "tiempo", horizonte: 1, unidad: "meses" }),
      t,
    );
    const p = r.particion;
    const f = (i: number) => d.fechas![i]!;
    const limite = restar(p.corte!, 1, "meses");
    expect(p.prueba.every((i) => f(i) >= p.corte!)).toBe(true);
    expect(p.hueco.every((i) => f(i) < p.corte! && f(i) >= limite)).toBe(true);
    expect(p.entrenamiento.every((i) => f(i) < limite)).toBe(true);
    expect(p.hueco.length).toBeGreaterThan(0);
    expect(r.verificacion.solapeTiempo).toBe(0);
    // con fechas enteras, la prueba es al menos lo pedido
    expect(p.prueba.length).toBeGreaterThanOrEqual(Math.round(120 * 0.2));
  });

  it("sin horizonte no hay hueco; en días, el hueco cuenta días", () => {
    const sin = lados(d, P({ esquema: "tiempo", horizonte: 0 }), t);
    expect(sin.particion.hueco).toEqual([]);
    const dias = lados(
      d,
      P({ esquema: "tiempo", horizonte: 31, unidad: "dias" }),
      t,
    );
    expect(dias.particion.hueco.length).toBeGreaterThan(0);
    expect(dias.verificacion.solapeTiempo).toBe(0);
  });

  it("al azar, filas de las fechas de la prueba habrían entrado al entrenamiento; por tiempo, ninguna", () => {
    const r = lados(
      d,
      P({ esquema: "tiempo", horizonte: 1, unidad: "meses" }),
      t,
    );
    expect(r.corteReferencia).toBe(r.particion.corte);
    expect(r.recientes).toBe(0);
    expect(r.azar?.recientes).toBeGreaterThan(0);
  });

  it("en un esquema que no es por tiempo, el corte de referencia dice cuántas filas recientes entrenan", () => {
    const porTiempo = lados(d, P({ esquema: "tiempo", horizonte: 0 }), t);
    const azar = lados(d, P({ esquema: "estratificada" }), t);
    expect(azar.corteReferencia).toBe(porTiempo.particion.corte);
    expect(azar.recientes).toBeGreaterThan(0);
    // estratificada no promete nada del tiempo: no hay verificación con horizonte
    expect(azar.verificacion.solapeTiempo).toBeNull();
  });

  it("las mismas unidades quedan en los dos lados (es «conocidas»), y se cuenta", () => {
    const r = lados(d, P({ esquema: "tiempo", horizonte: 0 }), t);
    expect(r.verificacion.solapeUnidades).toBeGreaterThan(0);
  });
});

describe("por tiempo y por grupo: unidades nuevas", () => {
  it("el entrenamiento deja fuera la historia de las unidades de la prueba, y se cuenta", () => {
    const t = panel(60, 4);
    const d = diseno(t);
    const r = lados(
      d,
      P({ esquema: "tiempo-grupo", horizonte: 1, unidad: "meses" }),
      t,
    );
    const p = r.particion;
    expect(r.verificacion.solapeUnidades).toBe(0);
    expect(r.verificacion.solapeTiempo).toBe(0);
    expect(p.fuera.unidadesDePrueba).toBeGreaterThan(0);
    expect(p.entrenamiento.length).toBeGreaterThan(0);
    expect(
      p.entrenamiento.length +
        p.prueba.length +
        p.hueco.length +
        p.fuera.unidadesDePrueba,
    ).toBe(240);
  });

  it("en un panel donde toda unidad llega a la prueba, el entrenamiento queda vacío (no se inventa)", () => {
    const t = panel(10, 6, 5, false);
    const d = diseno(t);
    const r = lados(
      d,
      P({ esquema: "tiempo-grupo", horizonte: 0, unidad: "meses" }),
      t,
    );
    expect(r.particion.entrenamiento).toEqual([]);
    expect(r.particion.fuera.unidadesDePrueba).toBeGreaterThan(0);
  });
});

describe("las filas que no entran se cuentan por su motivo", () => {
  const t = csv(
    "u,mes,baja",
    "A,2025-01-15,si",
    "A,2025-02-15,no",
    "B,2025-01-15,",
    "B,,no",
    ",2025-02-15,no",
    "C,2025-03-15,si",
    "C,2025-04-15,no",
    "D,2025-03-15,no",
    "D,2025-04-15,si",
    "E,2025-04-15,no",
  );
  const d = diseno(t);

  it("sin objetivo, sin fecha (por tiempo) y sin unidad (por grupo)", () => {
    const r = lados(
      d,
      P({ esquema: "tiempo-grupo", horizonte: 0, unidad: "meses" }),
      t,
    );
    expect(r.particion.fuera).toMatchObject({
      sinObjetivo: 1,
      sinFecha: 1,
      sinUnidad: 1,
    });
    const g = lados(d, P({ esquema: "grupo" }), t);
    expect(g.particion.fuera).toMatchObject({
      sinObjetivo: 1,
      sinFecha: 0,
      sinUnidad: 1,
    });
    const e = lados(d, P({ esquema: "estratificada" }), t);
    expect(e.particion.fuera).toMatchObject({
      sinObjetivo: 1,
      sinFecha: 0,
      sinUnidad: 0,
    });
    expect(e.particion.entrenamiento.length + e.particion.prueba.length).toBe(
      9,
    );
  });
});

describe("la verificación cuenta lo que una partición mal hecha dejaría pasar", () => {
  const t = panel(10, 4);
  const d = diseno(t);

  it("una fila en dos lados, una unidad partida y entrenamiento después de la prueba", () => {
    const sinHorizonte = verificar(d, [0, 1, 2, 5], [2, 3], [], null);
    // un esquema que no promete nada del tiempo no se verifica en el tiempo
    expect(sinHorizonte.solapeTiempo).toBeNull();
    const v = verificar(d, [0, 1, 2, 5], [2, 3], [], {
      cantidad: 0,
      unidad: "meses",
    });
    expect(v.solapeFilas).toBe(1);
    expect(v.solapeUnidades).toBe(1); // U0 tiene filas 0–3
    // la prueba empieza en marzo (fila 2: U0, tercer mes); la fila 2 misma y la 5 (U1, que empieza en
    // febrero: su segunda fila es de marzo) son de entrenamiento y no anteriores a marzo
    expect(v.solapeTiempo).toBe(2);
    const futuro = verificar(d, [3], [0], [], { cantidad: 0, unidad: "dias" });
    expect(futuro.solapeTiempo).toBe(1);
    const conHorizonte = verificar(d, [0], [1], [], {
      cantidad: 1,
      unidad: "meses",
    });
    // la fila 0 está justo un mes antes de la 1: a menos de un horizonte (no estrictamente antes)
    expect(conHorizonte.solapeTiempo).toBe(1);
  });
});

describe("determinismo y sello", () => {
  it("la misma semilla da la misma partición; la caché devuelve el mismo objeto", () => {
    const t = panel(30, 4);
    const d = diseno(t);
    const p = P({ esquema: "grupo" });
    const a = lados(d, p, t);
    expect(lados(d, p, t)).toBe(a);
    const otra = panel(30, 4);
    const b = lados(diseno(otra), p, otra);
    expect(b.particion.prueba).toEqual(a.particion.prueba);
    expect(b.sello).toBe(a.sello);
  });

  it("el sello es el SHA-256 de su receta escrita, y cambia con la huella, el esquema o el tamaño", () => {
    const t = panel(30, 4);
    const d = diseno(t);
    const p = P({ esquema: "tiempo", horizonte: 1, unidad: "meses" });
    const r = lados(d, p, t);
    const receta = recetaSello(HUELLA, p, r.particion.prueba);
    expect(receta.split("\n")).toEqual([
      "PROTOCOLO-DS/SELLO/1",
      `huella=${HUELLA}`,
      "esquema=tiempo",
      "tamano=20",
      "horizonte=1 meses",
      `semilla=${SEMILLA_6}`,
      `prueba=${r.particion.prueba.join(",")}`,
    ]);
    expect(r.sello).toBe(sha256TextoSync(receta));
    expect(partir(t, d, p, "b".repeat(64))!.sello).not.toBe(r.sello);
    expect(lados(d, { ...p, tamano: 30 }, t).sello).not.toBe(r.sello);
    expect(lados(d, { ...p, esquema: "tiempo-grupo" }, t).sello).not.toBe(
      r.sello,
    );
  });

  it("un esquema que los datos no permiten, o parámetros fuera de rango, no parten", () => {
    const t = csv("x,baja", "1,si", "2,no", "3,no", "4,si");
    const d = diseno(t, {
      ...R2_PANEL,
      unidad: "fila",
      momento: "texto",
    });
    expect(partir(t, d, P({ esquema: "grupo" }), HUELLA)).toBeNull();
    expect(partir(t, d, P({ tamano: 5 }), HUELLA)).toBeNull();
    expect(partir(t, d, P({ tamano: 20.5 }), HUELLA)).toBeNull();
  });
});

describe("a 50 000 filas", () => {
  it("parte, verifica y sella en un tiempo que no congela la pantalla, y la segunda vez sale de la caché", () => {
    const t = panel(12_500, 4);
    const d = diseno(t);
    const p = P({ esquema: "tiempo-grupo", horizonte: 1, unidad: "meses" });
    const t0 = performance.now();
    const r = lados(d, p, t);
    const ms = performance.now() - t0;
    expect(r.verificacion.solapeUnidades).toBe(0);
    expect(ms).toBeLessThan(2000);
    const t1 = performance.now();
    lados(d, p, t);
    expect(performance.now() - t1).toBeLessThan(5);
  });
});
