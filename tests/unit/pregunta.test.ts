// S21 (ADR 030): el lector de «Pregúntale a tus datos». Lo que estos tests hacen FALLAR si se rompe:
//  · las dos preguntas del sprint («ventas del último trimestre por región», «sales by region last quarter») dan la consulta esperada;
//  · el banco de ~90 preguntas (ES y EN, sobre el kit) se lee igual que cuando se revisó: lo ambiguo PREGUNTA, lo que no está en la
//    gramática se dice («No leí: …») y lo que no se entiende lo dice;
//  · una respuesta a una pregunta abierta cierra la duda, y un cambio de lo propuesto quita la marca «propuesto»;
//  · una palabra que es parte del nombre de una columna es de la columna (`ingreso_mensual` no es «por mes»);
//  · «el último trimestre» se resuelve contra la fecha más reciente de la TABLA, jamás contra el reloj;
//  · un orden día/mes ambiguo no deja correr; una columna marcada como dato personal no se ofrece para agrupar ni se reconocen sus valores.
import { describe, expect, it, vi } from "vitest";
import { armarCatalogo, sePuedeCorrer, validar } from "@/engine/consulta";
import { ejemplosDe, leerNumero, leerPregunta } from "@/engine/pregunta";
import { PREGUNTA_MAX } from "@/engine/pregunta-lexico";
import { banco, catalogoDelKit, proyectar } from "../fixtures/preguntas/ayudas";

describe("las dos preguntas del sprint", () => {
  it("«ventas del último trimestre por región»: suma propuesta de ventas_usd por región en el último trimestre de la tabla", () => {
    const cat = catalogoDelKit("ventas-por-region.csv");
    const l = leerPregunta("ventas del último trimestre por región", cat);
    expect(l.tipo).toBe("consulta");
    if (l.tipo !== "consulta") return;
    expect(l.plan.medida).toEqual({ agregacion: "suma", columna: "ventas_usd" });
    expect(l.plan.agrupar).toEqual({ tipo: "categoria", columna: "region" });
    // la tabla llega hasta el lunes 2025-12-22: «el último trimestre» es el que la contiene
    expect(l.plan.ventana).toMatchObject({ columna: "fecha", desde: "2025-10-01", hasta: "2025-12-31" });
    expect(l.propuestos).toEqual(["agregacion"]);
    expect(l.noLeidas).toEqual([]);
  });

  it("«sales by region last quarter» da lo mismo en inglés", () => {
    const cat = catalogoDelKit("sales-by-region.csv");
    const l = leerPregunta("sales by region last quarter", cat);
    expect(l.tipo).toBe("consulta");
    if (l.tipo !== "consulta") return;
    expect(l.plan.medida).toEqual({ agregacion: "suma", columna: "sales_usd" });
    expect(l.plan.agrupar).toEqual({ tipo: "categoria", columna: "region" });
    expect(l.plan.ventana).toMatchObject({ desde: "2025-10-01", hasta: "2025-12-31" });
  });
});

describe("el banco de preguntas", () => {
  const entradas = banco();
  it("trae unas 90 preguntas en español y en inglés, y las tres clases de lectura", () => {
    expect(entradas.length).toBeGreaterThanOrEqual(85);
    const tipos = new Set(entradas.map((e) => (e.esperado as { tipo: string }).tipo));
    expect([...tipos].sort()).toEqual(["consulta", "no-entendi", "pregunta"]);
    expect(entradas.some((e) => e.tabla.startsWith("sales"))).toBe(true);
    expect(entradas.some((e) => e.tabla.startsWith("ventas"))).toBe(true);
  });
  const catalogos = new Map<string, ReturnType<typeof catalogoDelKit>>();
  it.each(entradas.map((e) => [e.id, e] as const))("%s se lee como se revisó", (_id, e) => {
    if (!catalogos.has(e.tabla)) catalogos.set(e.tabla, catalogoDelKit(e.tabla));
    expect(proyectar(leerPregunta(e.pregunta, catalogos.get(e.tabla)!))).toEqual(e.esperado);
  });
});

describe("lo que el lector pregunta, y lo que cambia cuando contestas", () => {
  const cat = catalogoDelKit("ventas-por-region.csv");

  it("un valor que está en dos columnas pregunta de cuál es; con la respuesta, filtra por esa", () => {
    const l = leerPregunta("ventas de norte", cat);
    expect(l.tipo).toBe("pregunta");
    if (l.tipo !== "pregunta") return;
    expect(l.abiertas).toHaveLength(1);
    expect(l.abiertas[0]!.id).toBe("valor:norte");
    expect(l.abiertas[0]!.opciones.map((o) => o.valor).sort()).toEqual(["bodega", "region"]);
    const r = leerPregunta("ventas de norte", cat, { "valor:norte": "bodega" });
    expect(r.tipo).toBe("consulta");
    if (r.tipo === "consulta") expect(r.plan.condiciones).toEqual([{ columna: "bodega", operador: "=", valor: "norte" }]);
  });

  it("un mes sin año, con dos años posibles en la tabla, pregunta el año", () => {
    const l = leerPregunta("ventas en marzo", cat);
    expect(l.tipo).toBe("pregunta");
    if (l.tipo !== "pregunta") return;
    expect(l.abiertas[0]).toMatchObject({ id: "anio:3", tipo: "anio" });
    expect(l.abiertas[0]!.opciones.map((o) => o.valor)).toEqual(["2024", "2025"]);
    const r = leerPregunta("ventas en marzo", cat, { "anio:3": "2024" });
    expect(r.tipo === "consulta" && r.plan.ventana).toMatchObject({ desde: "2024-03-01", hasta: "2024-03-31" });
  });

  it("dos medidas dichas pregunta cuál; la respuesta la fija", () => {
    const l = leerPregunta("ventas y unidades por región", cat);
    expect(l.tipo === "pregunta" && l.abiertas[0]!.id).toBe("medida");
    const r = leerPregunta("ventas y unidades por región", cat, { medida: "unidades" });
    expect(r.tipo === "consulta" && r.plan.medida).toMatchObject({ columna: "unidades" });
  });

  it("«1,500» es ambiguo (¿uno y medio o mil quinientos?): pregunta; «1,5» no", () => {
    const l = leerPregunta("ventas por región con unidades al menos 1,500", cat);
    expect(l.tipo === "pregunta" && l.abiertas[0]).toMatchObject({ id: "numero:1,500", tipo: "numero" });
    const r = leerPregunta("ventas por región con unidades al menos 1,500", cat, { "numero:1,500": "1500" });
    expect(r.tipo === "consulta" && r.plan.condiciones).toEqual([{ columna: "unidades", operador: ">=", valor: "1500" }]);
    const d = leerPregunta("ventas por región con unidades más de 1,5", cat);
    expect(d.tipo === "consulta" && d.plan.condiciones).toEqual([{ columna: "unidades", operador: ">", valor: "1.5" }]);
  });

  it("la agregación y el periodo PROPUESTOS se marcan; si el usuario los CAMBIA el control sigue a la mano (auditoría A-16); si la pregunta los DICE, no se proponen", () => {
    const propuesta = leerPregunta("ventas por fecha", cat);
    expect(propuesta.tipo === "consulta" && propuesta.propuestos).toEqual(["periodo", "agregacion"]);
    const cambiada = leerPregunta("ventas por fecha", cat, { agregacion: "promedio", periodo: "mes" });
    expect(cambiada.tipo === "consulta" && cambiada.propuestos).toEqual(["periodo", "agregacion"]);
    expect(cambiada.tipo === "consulta" && cambiada.plan.medida.agregacion).toBe("promedio");
    expect(cambiada.tipo === "consulta" && cambiada.plan.agrupar).toMatchObject({ tipo: "tiempo", periodo: "mes" });
    const dicha = leerPregunta("promedio de ventas por región", cat);
    expect(dicha.tipo === "consulta" && dicha.propuestos).toEqual([]);
  });

  it("lo que no leyó se dice y no se pierde en silencio; la consulta es la que se muestra", () => {
    const l = leerPregunta("ventas por clima", cat);
    expect(l.tipo === "consulta" && l.noLeidas).toEqual(["clima"]);
    expect(l.tipo === "consulta" && l.plan.agrupar).toBeNull();
    const dos = leerPregunta("ventas por región y producto", cat);
    expect(dos.tipo === "consulta" && dos.noLeidas).toEqual(["producto"]);
  });

  it("una pregunta vacía, larguísima o sin nada que leer lo dice", () => {
    expect(leerPregunta("   ", cat)).toMatchObject({ tipo: "no-entendi", motivo: "vacia" });
    expect(leerPregunta("ventas ".repeat(PREGUNTA_MAX), cat)).toMatchObject({ tipo: "no-entendi", motivo: "muy-larga" });
    expect(leerPregunta("hola, qué tal", cat)).toMatchObject({ tipo: "no-entendi", motivo: "nada" });
  });

  it("pedir el tiempo en una tabla sin fechas lo dice, no inventa una columna", () => {
    const sinFecha = catalogoDelKit("marketing-campania.csv");
    expect(leerPregunta("edad por mes", sinFecha)).toMatchObject({ tipo: "no-entendi", motivo: "sin-fecha" });
    expect(leerPregunta("edad del último trimestre", sinFecha)).toMatchObject({ tipo: "no-entendi", motivo: "sin-fecha" });
  });
});

describe("palabras que son del nombre de una columna", () => {
  it("«ingreso mensual» es la columna ingreso_mensual, no «por mes»", () => {
    const l = leerPregunta("promedio de ingreso mensual por región", catalogoDelKit("marketing-campania.csv"));
    expect(l.tipo === "consulta" && l.plan.medida).toEqual({ agregacion: "promedio", columna: "ingreso_mensual" });
    expect(l.tipo === "consulta" && l.plan.agrupar).toEqual({ tipo: "categoria", columna: "region" });
  });

  it("«por mes» agrupa por el mes de la fecha aunque «mes» esté en otras columnas (mes_observado, antiguedad_meses)", () => {
    const l = leerPregunta("uso mensual gb por mes", catalogoDelKit("bajas-con-fuga.csv"));
    expect(l.tipo === "consulta" && l.plan.agrupar).toEqual({ tipo: "tiempo", columna: "mes_observado", periodo: "mes" });
  });

  it("«ciudad 07» y «ciudad_07» son el mismo valor", () => {
    const cat = catalogoDelKit("tiendas-ciudades.csv");
    for (const q of ["superficie m2 de ciudad 07", "superficie m2 de ciudad_07"]) {
      const l = leerPregunta(q, cat);
      expect(l.tipo === "consulta" && l.plan.condiciones).toEqual([{ columna: "ciudad", operador: "=", valor: "ciudad_07" }]);
    }
  });
});

describe("el tiempo se lee contra la TABLA, no contra el reloj", () => {
  const tabla = (fechas: string[]) => ({
    headers: ["dia", "monto"],
    rows: fechas.map((f, i) => [f, String(10 + i)]),
  });
  it("«último mes» es el mes de la fecha más reciente, sea la que sea (bisiesto incluido)", () => {
    const cat = armarCatalogo(tabla(["2024-01-31", "2024-02-10", "2024-02-29"]));
    const l = leerPregunta("monto del último mes", cat);
    expect(l.tipo === "consulta" && l.plan.ventana).toMatchObject({ desde: "2024-02-01", hasta: "2024-02-29" });
    const p = leerPregunta("monto del mes pasado", cat);
    expect(p.tipo === "consulta" && p.plan.ventana).toMatchObject({ desde: "2024-01-01", hasta: "2024-01-31" });
  });
  it("«últimos 3 meses» cruza el año y «último trimestre» es el calendario (no 90 días)", () => {
    const cat = armarCatalogo(tabla(["2025-11-05", "2026-01-20", "2026-02-02"]));
    const m = leerPregunta("monto de los últimos 3 meses", cat);
    expect(m.tipo === "consulta" && m.plan.ventana).toMatchObject({ desde: "2025-12-01", hasta: "2026-02-28" });
    const q = leerPregunta("monto del último trimestre", cat);
    expect(q.tipo === "consulta" && q.plan.ventana).toMatchObject({ desde: "2026-01-01", hasta: "2026-03-31" });
    const s = leerPregunta("monto de la última semana", cat);
    // el 2026-02-02 fue lunes: su semana va del 02-02 al 02-08
    expect(s.tipo === "consulta" && s.plan.ventana).toMatchObject({ desde: "2026-02-02", hasta: "2026-02-08" });
  });
  it("«desde marzo hasta mayo» con un solo año en la tabla no pregunta el año", () => {
    const cat = armarCatalogo(tabla(["2025-01-10", "2025-03-05", "2025-06-20"]));
    const l = leerPregunta("monto desde marzo hasta mayo", cat);
    expect(l.tipo === "consulta" && l.plan.ventana).toMatchObject({ desde: "2025-03-01", hasta: "2025-05-31" });
  });
  it("un mes que es también un valor de una columna es un valor, no una ventana", () => {
    const cat = armarCatalogo({
      headers: ["mes", "ventas"],
      rows: ["enero", "febrero", "marzo", "enero", "marzo"].map((m, i) => [m, String(i + 1)]),
    });
    const l = leerPregunta("ventas de marzo", cat);
    expect(l.tipo === "consulta" && l.plan.condiciones).toEqual([{ columna: "mes", operador: "=", valor: "marzo" }]);
    expect(l.tipo === "consulta" && l.plan.ventana).toBeNull();
  });
});

describe("las fechas en otro orden, y los datos personales", () => {
  const latina = {
    headers: ["fecha", "monto"],
    rows: ["05/06/2026", "07/06/2026", "01/05/2026", "03/04/2026"].map((f, i) => [f, String(i + 1)]),
  };
  it("un orden día/mes que el código no puede saber no deja correr hasta que el usuario lo diga", () => {
    const cat = armarCatalogo(latina);
    const fecha = cat.columnas.find((c) => c.nombre === "fecha")!;
    expect(fecha.tipo === "fecha" && fecha.ambigua).toBe(true);
    const l = leerPregunta("monto por mes", cat);
    expect(l.tipo).toBe("consulta");
    if (l.tipo !== "consulta") return;
    const v = validar(l.plan, cat);
    expect(sePuedeCorrer(v)).toBe(false);
    expect(v.some((x) => x.clave === "fecha_ambigua" && x.nivel === "error")).toBe(true);
    // con la respuesta del usuario sí
    const resuelto = armarCatalogo(latina, { ordenes: { fecha: "dia-mes" } });
    const lr = leerPregunta("monto por mes", resuelto);
    expect(lr.tipo === "consulta" && sePuedeCorrer(validar(lr.plan, resuelto))).toBe(true);
  });
  it("una columna marcada como dato personal no se ofrece para agrupar, y sus valores no se reconocen en la pregunta", () => {
    const cat = catalogoDelKit("clientes-con-datos-personales.csv", { personales: ["plan", "correo"] });
    const l = leerPregunta("promedio de reclamos por plan", cat);
    expect(l.tipo).toBe("consulta");
    if (l.tipo !== "consulta") return;
    const v = validar(l.plan, cat);
    expect(v.some((x) => x.clave === "grupo_personal" && x.nivel === "error")).toBe(true);
    expect(sePuedeCorrer(v)).toBe(false);
    const sinMarcar = catalogoDelKit("clientes-con-datos-personales.csv");
    const ok = leerPregunta("promedio de reclamos por plan", sinMarcar);
    expect(ok.tipo === "consulta" && sePuedeCorrer(validar(ok.plan, sinMarcar))).toBe(true);
    // los valores de una columna personal no se indexan: «basico» no filtra nada si `plan` es personal
    const f = leerPregunta("reclamos del plan basico", cat);
    expect(f.tipo === "consulta" && f.plan.condiciones).toEqual([]);
  });
});

describe("leerNumero", () => {
  it.each([
    ["30", { valor: "30" }],
    ["1,5", { valor: "1.5" }],
    ["1.5", { valor: "1.5" }],
    ["0,500", { valor: "0.5" }],
    ["12,25", { valor: "12.25" }],
    ["1.500.000", { valor: "1500000" }],
    ["1,500,000", { valor: "1500000" }],
    ["1.234,56", { valor: "1234.56" }],
    ["1,234.56", { valor: "1234.56" }],
    ["1,500", { ambiguo: ["1.5", "1500"] }],
    ["2.000", { ambiguo: ["2", "2000"] }],
    // S21 (auditoría A-11): separadores mezclados NO multiplican por mil; el decimal es el que va al final
    ["1.234,567", { valor: "1234.567" }],
    ["1,234.567", { valor: "1234.567" }],
    ["2023,2024", null],
    ["-5", { valor: "-5" }],
    ["-2,5", { valor: "-2.5" }],
  ])("%s", (texto, esperado) => {
    expect(leerNumero(texto)).toEqual(esperado);
  });
});

// S21 — la auditoría de una pasada (A-01 … A-22): lo que el lector leía mal SIN avisar.
describe("la auditoría: nada se lee mal en silencio", () => {
  const cat = catalogoDelKit("ventas-por-region.csv");
  const gris = armarCatalogo({
    headers: ["grupo", "monto", "estado"],
    rows: [
      ["A", "10", "todos"],
      ["B", "20", "activo"],
      ["A", "30", "activo"],
      ["B", "40", "todos"],
    ],
  });

  it("A-02: «A» y «todos» son valores de una columna pero también palabras de relleno: «grupo A» filtra, «de todos» no", () => {
    const a = leerPregunta("monto del grupo A", gris);
    expect(a.tipo === "consulta" && a.plan.condiciones).toEqual([{ columna: "grupo", operador: "=", valor: "A" }]);
    const t = leerPregunta("monto de todos", gris);
    expect(t.tipo === "consulta" && t.plan.condiciones).toEqual([]);
  });

  it("A-02: «este» como valor no se confunde con «este mes»", () => {
    const l = leerPregunta("ventas de este mes", cat);
    expect(l.tipo === "consulta" && l.plan.condiciones).toEqual([]);
    expect(l.tipo === "consulta" && l.plan.ventana).not.toBeNull();
  });

  it("A-08: «constructor» y «__proto__» no son un mes, una unidad ni un periodo", () => {
    for (const q of ["ventas constructor", "ventas por constructor", "ventas __proto__", "ventas hasta constructor", "ventas ultimo constructor"]) {
      const l = leerPregunta(q, cat);
      expect(JSON.stringify(l), q).not.toMatch(/NaN|undefined/);
      if (l.tipo === "consulta") expect(l.plan.ventana, q).toBeNull();
    }
  });

  it("A-10: un «o» entre condiciones de columnas distintas se une con «y» y LO DICE", () => {
    const l = leerPregunta("ventas con unidades mayor a 30 o ventas mayor a 100", cat);
    expect(l.tipo).toBe("consulta");
    if (l.tipo === "consulta") {
      expect(l.plan.union).toBe("y");
      expect(l.avisos.map((a) => a.clave)).toContain("union-y");
    }
  });

  it("A-14: una fecha imposible o una ventana enorme no se leen: se dicen", () => {
    for (const q of ["ventas en 2025-13", "ventas desde 2024-02-30", "ventas de los últimos 5000 años", "ventas de los últimos 99999999999999 meses"]) {
      const l = leerPregunta(q, cat);
      expect(JSON.stringify(l), q).not.toMatch(/NaN/);
      if (l.tipo === "consulta") {
        const v = l.plan.ventana;
        if (v) {
          expect(v.desde ?? "", q).toMatch(/^\d{4}-\d{2}-\d{2}$|^$/);
          expect(Number((v.desde ?? "2000").slice(0, 4)), q).toBeGreaterThan(1900);
        }
        expect(l.noLeidas.length + l.avisos.length, q).toBeGreaterThan(0);
      }
    }
  });

  it("A-21: dos menciones de la misma columna son UNA cifra: no se pregunta «¿cuál medir?»", () => {
    const l = leerPregunta("ventas usd por region ordenado por ventas", cat);
    expect(l.tipo).toBe("consulta");
  });

  it("A-22: el tiempo no depende del reloj: con el reloj en otro año, la misma ventana", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2031-06-15T12:00:00Z"));
      const l = leerPregunta("ventas del último trimestre por región", cat);
      expect(l.tipo === "consulta" && l.plan.ventana).toMatchObject({ desde: "2025-10-01", hasta: "2025-12-31" });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("los ejemplos con tus columnas", () => {
  it.each(["ventas-por-region.csv", "sales-by-region.csv", "marketing-campania.csv", "tiendas-ciudades.csv", "bajas-con-fuga.csv"])(
    "%s: cada ejemplo que se ofrece lo entiende este mismo lector",
    (archivo) => {
      const cat = catalogoDelKit(archivo);
      for (const idioma of ["es", "en"] as const) {
        const ejemplos = ejemplosDe(cat, idioma);
        expect(ejemplos.length).toBeGreaterThan(0);
        for (const e of ejemplos) {
          const l = leerPregunta(e, cat);
          expect(l.tipo, `${archivo} · ${e}`).toBe("consulta");
          if (l.tipo === "consulta") expect(l.noLeidas, `${archivo} · ${e}`).toEqual([]);
        }
      }
    },
  );
});
