// Protocolo DS (S9), etapa 4 — ¿EXISTE AL DECIDIR? Columna por columna: ¿ese dato se conoce en el
// momento de decidir, o se llena después del resultado? La trampa que arruina hasta papers
// publicados es una columna que «sabe» la respuesta porque se escribe cuando ya pasó (Kaufman et
// al. 2012; Kapoor y Narayanan 2023, tipo L2). El usuario primero APUESTA qué columnas filtran
// el resultado y recién después ve lo que encontró el código; la comparación queda en el cuaderno.
//
// Lo que el código mira (toda la tabla, sin partición: la partición la elige la etapa 6; aquí un
// hallazgo dispara una pregunta, no entra a un modelo):
//  · fuga univariada, con los motores de Probeta (`leakage.ts`, según la tarea);
//  · fuga por VACÍOS: una columna vacía hasta que ocurre el resultado (`fecha_baja`, `motivo`),
//    que ningún motor de fuga ve porque descarta los vacíos, se mide por su indicador lleno/vacío;
//  · columnas tipo identificador (`idLikeAlerts`);
//  · filas exactas repetidas, y la misma unidad el mismo día;
//  · deriva entre periodos (`deriva.ts`), solo si la etapa 2 registró una fecha.
// Lo que el código NO puede saber —quién produce cada columna y cuándo se llena— se pregunta.
//
// Compuerta: toda columna con estado; «usar» exige «existe antes» (y «no sé» jamás entrena);
// «se llena después» exige «excluir» (G-Plan 1a); la acción en bloque solo para columnas sin
// alerta, con su declaración escrita (G-Plan 2a). Los chequeos se RECALCULAN contra la tabla
// cargada: un cuaderno con hallazgos inventados no cumple. Lo que ninguna compuerta puede
// verificar es la VERDAD de lo que el usuario responde ni el orden de su apuesta: eso se declara.
import { byTask, matchTask } from "@/engine/despacho";
import { idLikeAlerts } from "@/engine/eda";
import {
  detectLeakage,
  detectLeakageByClass,
  detectLeakageContinuous,
  type LeakageColumn,
  type LeakageFinding,
} from "@/engine/leakage";
import type { SupervisedTask } from "@/engine/tarea";
import {
  columnValues,
  isNullToken,
  parseNumber,
  type CsvTable,
} from "@/lib/ds/csv";
import {
  PSI_ALERTA,
  PSI_MODERADA,
  derivaDeColumna,
  periodosDeDeriva,
  type EstadoDeriva,
} from "./deriva";
import { filasRepetidas, unidadMomentoRepetidos } from "./duplicados";
import { formaDe } from "./etapa1";
import type {
  DatosEtapa,
  EtapaConstruida,
  Lectura,
  Previas,
  Trampa,
  Valor,
  Veredicto,
} from "./etapas";
import { fechasPorFila } from "./fechas";
import { indiceDe, nombreClase, valoresDe, vistaColumna } from "./tabla";
import {
  booleano,
  claveExtra,
  lista,
  mapa,
  numero,
  texto,
  textoLleno,
  type Registro,
} from "./valores";

export const MOMENTOS = ["antes", "despues", "nose"] as const;
export type Momento = (typeof MOMENTOS)[number];
export const ESTADOS = ["usar", "excluir", "nose"] as const;
export type Estado = (typeof ESTADOS)[number];

/** Largo máximo de lo que el usuario escribe de procedencia en una columna. */
export const PROCEDENCIA_MAX = 200;

const RESPUESTAS = [
  "apuesta",
  "apuesta_ninguna",
  "procedencia",
  "momento",
  "estado",
  "en_bloque",
] as const;

const CHEQUEOS = [
  "columnas",
  "roles",
  "filas",
  "fuga",
  "fuga_vacios",
  "identificador",
  "duplicados_fila",
  "duplicados_unidad_momento",
  "deriva_estado",
  "deriva_corte",
  "deriva_historico",
  "deriva_reciente",
  "deriva_psi",
  "deriva_ks",
  "deriva_sin_medir",
  "alertas",
  "aciertos",
  "sorpresas",
  "falsas_alarmas",
] as const;

/** Todas las claves que esta etapa puede registrar. */
export const CLAVES_4 = { respuestas: RESPUESTAS, chequeos: CHEQUEOS } as const;

/** Las frases («trampas») que esta etapa puede decir, cada una con su texto `{es, en}`. */
export const TRAMPAS_4 = [
  "fuga-excluida",
  "fuga-usada",
  "fuga-vacios-excluida",
  "fuga-vacios-usada",
  "filas-repetidas",
  "unidad-momento-repetida",
  "deriva",
  "sin-fecha",
  "una-fecha",
  "fecha-concentrada",
  "pocas-filas",
  "apuesta",
  "sin-hallazgos",
  "nada-para-entrenar",
] as const;

const ESTADOS_DERIVA: readonly string[] = [
  "medida",
  "sin-fecha",
  "una-fecha",
  "fecha-concentrada",
  "pocas-filas",
];

/** Los estados que se ofrecen para una columna según cuándo se llena. Una sola fuente: la usan
 *  el criterio y la pantalla. «Usar» ⇔ «existe antes»; «después» ⇒ «excluir» (G-Plan 1a). */
export function estadosPermitidos(momento: string): readonly Estado[] {
  if (momento === "antes") return ["usar", "excluir", "nose"];
  if (momento === "despues") return ["excluir"];
  return ["excluir", "nose"];
}

/** Lo que el código encontró en la tabla, sin nada de lo que respondió el usuario. */
export type Hallazgos4 = {
  readonly columnas: readonly string[];
  readonly roles: readonly string[];
  readonly filas: number;
  readonly fuga: Readonly<Record<string, number>>;
  readonly fugaVacios: Readonly<Record<string, number>>;
  readonly identificador: Readonly<Record<string, number>>;
  readonly duplicadosFila: number;
  readonly duplicadosUnidadMomento: number | null;
  readonly derivaEstado: EstadoDeriva;
  readonly derivaCorte: string | null;
  readonly derivaHistorico: number | null;
  readonly derivaReciente: number | null;
  readonly derivaPsi: Readonly<Record<string, number>>;
  readonly derivaKs: Readonly<Record<string, number>>;
  readonly derivaSinMedir: readonly string[];
  /** Con alerta del código, sin contar la apuesta del usuario. */
  readonly alertasBase: readonly string[];
};

const tienePropia = (mapa_: Readonly<Record<string, number>>, k: string) =>
  Object.hasOwn(mapa_, k);

function ordenado(
  columnas: readonly string[],
  incluye: (columna: string) => boolean,
): string[] {
  return columnas.filter(incluye);
}

/** Calcula los hallazgos. Pesado (toda la tabla): `hallazgos4` lo guarda por tabla. */
function calcular(
  tabla: CsvTable,
  forma: SupervisedTask,
  r2: Registro,
): Hallazgos4 | null {
  const objetivo = textoLleno(r2, "objetivo");
  if (objetivo === null) return null;
  const indiceObjetivo = indiceDe(tabla, objetivo);
  if (indiceObjetivo < 0) return null;
  const indices = tabla.headers
    .map((_, i) => i)
    .filter((i) => i !== indiceObjetivo);
  const columnas = indices.map((i) => tabla.headers[i]!);
  const crudos = indices.map((i) => columnValues(tabla, i));
  const vistas = columnas.map((nombre, k) => vistaColumna(nombre, crudos[k]!));

  const unidad =
    r2.unidad === "columna" ? textoLleno(r2, "unidad_columna") : null;
  const momento =
    r2.momento === "columna" ? textoLleno(r2, "momento_columna") : null;
  const roles = [unidad, momento].filter(
    (c): c is string => c !== null && columnas.includes(c),
  );

  // --- el objetivo, como lo normalizó la etapa 2 (no «1» frente a «1.0»)
  const crudosObjetivo = columnValues(tabla, indiceObjetivo);
  // Estimar una cantidad exige que el objetivo se lea como número; las otras tareas, no.
  const pideNumero = byTask(forma, {
    binaria: false,
    multiclase: false,
    numerica: true,
  });
  const llenos = crudosObjetivo.filter((v) => !isNullToken(v));
  const numericoObjetivo =
    llenos.length > 0 && llenos.every((v) => parseNumber(v) !== null);
  const filas = crudosObjetivo
    .map((_, i) => i)
    .filter((i) => !isNullToken(crudosObjetivo[i]!))
    .filter((i) => !pideNumero || parseNumber(crudosObjetivo[i]!) !== null);
  const etiquetas = filas.map((i) =>
    nombreClase(crudosObjetivo[i]!, numericoObjetivo),
  );
  const positivo = texto(r2, "positivo") ?? "";
  const objetivo01 = etiquetas.map((e) => (e === positivo ? 1 : 0)) as (
    0 | 1
  )[];
  const y = filas.map((i) => parseNumber(crudosObjetivo[i]!) ?? 0);

  const buscarFuga = (cols: LeakageColumn[]): LeakageFinding[] =>
    matchTask(forma, {
      binaria: () => detectLeakage(cols, objetivo01),
      multiclase: () => detectLeakageByClass(cols, etiquetas),
      numerica: () => detectLeakageContinuous(cols, y),
    });
  const puntajes = (hallazgos: readonly LeakageFinding[]) =>
    Object.fromEntries(hallazgos.map((h) => [h.column, h.score]));

  // --- identificadores (los de Probeta; una columna numérica con basura no lo es)
  const identificador = Object.fromEntries(
    idLikeAlerts(tabla, objetivo).flatMap((a) => {
      if (a.kind !== "id-like") return [];
      const k = columnas.indexOf(a.column);
      return k >= 0 && vistas[k]!.tipo !== "numero"
        ? [[a.column, a.score] as const]
        : [];
    }),
  );

  // --- fuga univariada: sin el objetivo, la unidad ni el momento, sin identificadores ni fechas
  const candidatas: LeakageColumn[] = [];
  columnas.forEach((nombre, k) => {
    const vista = vistas[k]!;
    if (roles.includes(nombre) || tienePropia(identificador, nombre)) return;
    if (vista.tipo === "texto" && vista.fecha) return;
    if (vista.tipo === "numero")
      candidatas.push({
        name: nombre,
        kind: "numeric",
        values: filas.map((i) => vista.valores[i] ?? null),
      });
    else
      candidatas.push({
        name: nombre,
        kind: "categorical",
        values: filas.map((i) => vista.valores[i] ?? null),
      });
  });
  const fuga = puntajes(buscarFuga(candidatas));

  // --- fuga por vacíos: el indicador lleno/vacío de cada columna con las dos cosas
  const indicadores: LeakageColumn[] = [];
  columnas.forEach((nombre, k) => {
    const vacio = filas.map((i) => isNullToken(crudos[k]![i]!));
    const sinValor = vacio.filter(Boolean).length;
    if (sinValor === 0 || sinValor === vacio.length) return;
    indicadores.push({
      name: nombre,
      kind: "categorical",
      values: vacio.map((v) => (v ? "vacio" : "lleno")),
    });
  });
  const fugaVacios = puntajes(buscarFuga(indicadores));

  // --- filas repetidas
  const fechas = momento
    ? fechasPorFila(
        valoresDe(tabla, momento),
        r2.orden_fecha === "dia-mes" || r2.orden_fecha === "mes-dia"
          ? r2.orden_fecha
          : null,
      )
    : null;
  const duplicadosUnidadMomento =
    unidad !== null && fechas
      ? unidadMomentoRepetidos(valoresDe(tabla, unidad), fechas.fechas)
      : null;

  // --- deriva
  let derivaEstado: EstadoDeriva = "sin-fecha";
  let derivaCorte: string | null = null;
  let derivaHistorico: number | null = null;
  let derivaReciente: number | null = null;
  const psiEntradas: (readonly [string, number])[] = [];
  const ksEntradas: (readonly [string, number])[] = [];
  const derivaSinMedir: string[] = [];
  if (fechas) {
    const periodos = periodosDeDeriva(fechas.fechas);
    if (periodos.tipo !== "medible") derivaEstado = periodos.tipo;
    else {
      derivaEstado = "medida";
      derivaCorte = periodos.corte;
      derivaHistorico = periodos.historico.length;
      derivaReciente = periodos.reciente.length;
      columnas.forEach((nombre, k) => {
        const vista = vistas[k]!;
        if (roles.includes(nombre) || tienePropia(identificador, nombre))
          return;
        if (vista.tipo === "texto" && vista.fecha) return;
        const medida = derivaDeColumna(vista, periodos);
        if (medida.tipo === "pocas-filas") derivaSinMedir.push(nombre);
        else {
          psiEntradas.push([nombre, medida.psi]);
          if (medida.ks !== null) ksEntradas.push([nombre, medida.ks]);
        }
      });
    }
  }
  const derivaPsi = Object.fromEntries(psiEntradas);
  const derivaKs = Object.fromEntries(ksEntradas);

  const conAlerta = (c: string) =>
    tienePropia(fuga, c) ||
    tienePropia(fugaVacios, c) ||
    tienePropia(identificador, c) ||
    (tienePropia(derivaPsi, c) && derivaPsi[c]! >= PSI_ALERTA) ||
    roles.includes(c);
  return {
    columnas,
    roles,
    filas: tabla.rows.length,
    fuga,
    fugaVacios,
    identificador,
    duplicadosFila: filasRepetidas(tabla),
    duplicadosUnidadMomento,
    derivaEstado,
    derivaCorte,
    derivaHistorico,
    derivaReciente,
    derivaPsi,
    derivaKs,
    derivaSinMedir,
    alertasBase: ordenado(columnas, conAlerta),
  };
}

const CACHE = new WeakMap<CsvTable, Map<string, Hallazgos4 | null>>();

/**
 * Los hallazgos de la tabla, con lo que registraron las etapas 1 y 2. Se guardan por tabla y
 * por esas respuestas: `evaluar`, `registrar`, `recalcular` y la pantalla los piden varias veces
 * por clic y el cálculo es de segundos con una tabla grande. Lo guardado sale SOLO de la
 * tabla, nunca de lo que llega en un cuaderno.
 */
export function hallazgos4(
  tabla: CsvTable,
  previas: Previas,
): Hallazgos4 | null {
  const [e1, e2] = [previas[1], previas[2]];
  if (!e1 || !e2) return null;
  const forma = formaDe(e1.respuestas);
  if (!forma) return null;
  const r = e2.respuestas;
  const clave = JSON.stringify([
    forma,
    textoLleno(r, "objetivo"),
    texto(r, "positivo"),
    r.unidad,
    texto(r, "unidad_columna"),
    r.momento,
    texto(r, "momento_columna"),
    r.orden_fecha,
  ]);
  let porClave = CACHE.get(tabla);
  if (!porClave) CACHE.set(tabla, (porClave = new Map()));
  if (!porClave.has(clave)) porClave.set(clave, calcular(tabla, forma, r));
  return porClave.get(clave) ?? null;
}

/** Los chequeos que dependen también de la apuesta: la comparación y las alertas que suma. */
export function chequeos4(
  h: Hallazgos4,
  apuesta: readonly string[],
): Record<string, Valor> {
  const aposto = new Set(apuesta);
  const hayFuga = (c: string) =>
    tienePropia(h.fuga, c) || tienePropia(h.fugaVacios, c);
  const alertas = new Set(h.alertasBase);
  return {
    columnas: [...h.columnas],
    roles: [...h.roles],
    filas: h.filas,
    fuga: { ...h.fuga },
    fuga_vacios: { ...h.fugaVacios },
    identificador: { ...h.identificador },
    duplicados_fila: h.duplicadosFila,
    duplicados_unidad_momento: h.duplicadosUnidadMomento,
    deriva_estado: h.derivaEstado,
    deriva_corte: h.derivaCorte,
    deriva_historico: h.derivaHistorico,
    deriva_reciente: h.derivaReciente,
    deriva_psi: { ...h.derivaPsi },
    deriva_ks: { ...h.derivaKs },
    deriva_sin_medir: [...h.derivaSinMedir],
    alertas: h.columnas.filter((c) => alertas.has(c) || aposto.has(c)),
    aciertos: h.columnas.filter((c) => aposto.has(c) && hayFuga(c)),
    sorpresas: h.columnas.filter((c) => !aposto.has(c) && hayFuga(c)),
    falsas_alarmas: h.columnas.filter((c) => aposto.has(c) && !hayFuga(c)),
  };
}

/** Lo que el usuario responde en la pantalla de la etapa 4. Las listas van alineadas con `columnas`. */
export type EntradaEtapa4 = {
  readonly apuesta: readonly string[];
  readonly ninguna: boolean;
  readonly procedencia: readonly string[];
  readonly momento: readonly string[];
  readonly estado: readonly string[];
  readonly enBloque: readonly string[];
};

/** Arma lo que la etapa 4 registra: las respuestas y los chequeos de la tabla. */
export function datosEtapa4(
  tabla: CsvTable,
  entrada: EntradaEtapa4,
  previas: Previas,
): DatosEtapa {
  const h = hallazgos4(tabla, previas);
  const aposto = new Set(entrada.apuesta);
  const respuestas: Record<string, Valor> = {
    // en el orden de la tabla, haya hecho clic en el orden que haya hecho
    apuesta: h ? h.columnas.filter((c) => aposto.has(c)) : [...entrada.apuesta],
    apuesta_ninguna: entrada.ninguna,
    procedencia: [...entrada.procedencia],
    momento: [...entrada.momento],
    estado: [...entrada.estado],
    en_bloque: [...entrada.enBloque],
  };
  return {
    respuestas,
    chequeos: h ? chequeos4(h, entrada.apuesta) : {},
  };
}

/**
 * Las respuestas de una versión anterior, realineadas por NOMBRE a las columnas de hoy (cambió
 * el archivo o el objetivo): las columnas nuevas quedan sin responder, y una columna que ahora
 * tiene alerta sale de la acción en bloque.
 */
export function entradaDesdeAnterior(
  anterior: DatosEtapa | null,
  columnas: readonly string[],
  alertas: readonly string[],
): EntradaEtapa4 {
  const vacia: EntradaEtapa4 = {
    apuesta: [],
    ninguna: false,
    procedencia: columnas.map(() => ""),
    momento: columnas.map(() => ""),
    estado: columnas.map(() => ""),
    enBloque: [],
  };
  if (!anterior) return vacia;
  const antes = lista(anterior.chequeos, "columnas") ?? [];
  const [pro, mom, est] = [
    lista(anterior.respuestas, "procedencia") ?? [],
    lista(anterior.respuestas, "momento") ?? [],
    lista(anterior.respuestas, "estado") ?? [],
  ];
  const en = (valores: readonly string[], columna: string): string => {
    const k = antes.indexOf(columna);
    return k >= 0 ? (valores[k] ?? "") : "";
  };
  const conAlerta = new Set(alertas);
  const apuesta = (lista(anterior.respuestas, "apuesta") ?? []).filter((c) =>
    columnas.includes(c),
  );
  return {
    apuesta,
    ninguna:
      apuesta.length === 0 &&
      booleano(anterior.respuestas, "apuesta_ninguna") === true,
    procedencia: columnas.map((c) => en(pro, c)),
    momento: columnas.map((c) => en(mom, c)),
    estado: columnas.map((c) => en(est, c)),
    enBloque: (lista(anterior.respuestas, "en_bloque") ?? []).filter(
      (c) => columnas.includes(c) && !conAlerta.has(c),
    ),
  };
}

/** Las columnas que se pueden responder en bloque: las que no tienen ninguna alerta. */
export function elegiblesEnBloque(chequeos: Registro): string[] {
  const alertas = new Set(lista(chequeos, "alertas") ?? []);
  return (lista(chequeos, "columnas") ?? []).filter((c) => !alertas.has(c));
}

/** Las columnas que entrenan: solo las que quedaron en «usar». «No sé» no entrena nunca. */
export function columnasParaEntrenar(datos: DatosEtapa): string[] {
  const columnas = lista(datos.chequeos, "columnas") ?? [];
  const estado = lista(datos.respuestas, "estado") ?? [];
  return columnas.filter((_, i) => estado[i] === "usar");
}

/**
 * Las columnas de la más a la menos preocupante, para la pantalla: primero las que filtran el
 * resultado (la más fuerte arriba), luego las que apostaste sin que el código las vea, los
 * identificadores, la deriva en alerta, la unidad y la fecha, la deriva moderada y el resto en
 * el orden de la tabla.
 */
export function ordenPorRiesgo(chequeos: Registro): string[] {
  const columnas = lista(chequeos, "columnas") ?? [];
  const [fuga, vacios, ident, psi] = [
    mapa(chequeos, "fuga") ?? {},
    mapa(chequeos, "fuga_vacios") ?? {},
    mapa(chequeos, "identificador") ?? {},
    mapa(chequeos, "deriva_psi") ?? {},
  ];
  const falsas = new Set(lista(chequeos, "falsas_alarmas") ?? []);
  const roles = new Set(lista(chequeos, "roles") ?? []);
  const fuerza = (c: string) =>
    Math.max(
      Object.hasOwn(fuga, c) ? fuga[c]! : 0,
      Object.hasOwn(vacios, c) ? vacios[c]! : 0,
    );
  const grupo = (c: string): number => {
    if (Object.hasOwn(fuga, c) || Object.hasOwn(vacios, c)) return 0;
    if (falsas.has(c)) return 1;
    if (Object.hasOwn(ident, c)) return 2;
    if (Object.hasOwn(psi, c) && psi[c]! >= PSI_ALERTA) return 3;
    if (roles.has(c)) return 4;
    if (Object.hasOwn(psi, c) && psi[c]! >= PSI_MODERADA) return 5;
    return 6;
  };
  return columnas
    .map((c, i) => ({ c, i, g: grupo(c) }))
    .sort(
      (a, b) =>
        a.g - b.g || (a.g === 0 ? fuerza(b.c) - fuerza(a.c) : 0) || a.i - b.i,
    )
    .map(({ c }) => c);
}

/** Por qué una columna lleva alerta, de lo más grave a lo menos (la pantalla pone un rótulo a cada una). */
export type MotivoAlerta =
  | "fuga"
  | "fuga-vacios"
  | "identificador"
  | "deriva-alta"
  | "deriva-moderada"
  | "rol"
  | "apuesta";

/**
 * Los motivos de alerta de una columna. «Deriva moderada» se muestra pero NO cuenta como alerta
 * (no está en `alertas`); la apuesta del usuario sí.
 */
export function motivosDeAlerta(
  chequeos: Registro,
  apuesta: readonly string[],
  columna: string,
): MotivoAlerta[] {
  const [fuga, vacios, ident, psi] = [
    mapa(chequeos, "fuga") ?? {},
    mapa(chequeos, "fuga_vacios") ?? {},
    mapa(chequeos, "identificador") ?? {},
    mapa(chequeos, "deriva_psi") ?? {},
  ];
  const motivos: MotivoAlerta[] = [];
  if (Object.hasOwn(fuga, columna)) motivos.push("fuga");
  if (Object.hasOwn(vacios, columna)) motivos.push("fuga-vacios");
  if (Object.hasOwn(ident, columna)) motivos.push("identificador");
  if (Object.hasOwn(psi, columna)) {
    if (psi[columna]! >= PSI_ALERTA) motivos.push("deriva-alta");
    else if (psi[columna]! >= PSI_MODERADA) motivos.push("deriva-moderada");
  }
  if ((lista(chequeos, "roles") ?? []).includes(columna)) motivos.push("rol");
  if (apuesta.includes(columna)) motivos.push("apuesta");
  return motivos;
}

export type ResumenEtapa4 = {
  readonly apuesta: readonly string[];
  readonly ninguna: boolean;
  readonly aciertos: readonly string[];
  readonly sorpresas: readonly string[];
  readonly falsas: readonly string[];
  readonly alertas: number;
  readonly usar: number;
  readonly excluir: number;
  readonly nose: number;
  readonly sinResponder: number;
  readonly enBloque: number;
  readonly derivaEstado: string;
};

/** Lo esencial de una evidencia de la etapa 4, para el cuaderno (no las listas crudas). */
export function resumenEtapa4(datos: DatosEtapa): ResumenEtapa4 {
  const [r, c] = [datos.respuestas, datos.chequeos];
  const estado = lista(r, "estado") ?? [];
  const cuenta = (e: string) => estado.filter((x) => x === e).length;
  return {
    apuesta: lista(r, "apuesta") ?? [],
    ninguna: booleano(r, "apuesta_ninguna") === true,
    aciertos: lista(c, "aciertos") ?? [],
    sorpresas: lista(c, "sorpresas") ?? [],
    falsas: lista(c, "falsas_alarmas") ?? [],
    alertas: (lista(c, "alertas") ?? []).length,
    usar: cuenta("usar"),
    excluir: cuenta("excluir"),
    nose: cuenta("nose"),
    sinResponder: cuenta(""),
    enBloque: (lista(r, "en_bloque") ?? []).length,
    derivaEstado: texto(c, "deriva_estado") ?? "",
  };
}

function leer(datos: DatosEtapa): Lectura {
  const r = datos.respuestas;
  const extra = claveExtra(r, RESPUESTAS);
  if (extra) return { ok: false, campo: `respuestas.${extra}` };
  const falta = RESPUESTAS.find((k) => !(k in r));
  if (falta) return { ok: false, campo: `respuestas.${falta}` };
  if (booleano(r, "apuesta_ninguna") === null)
    return { ok: false, campo: "respuestas.apuesta_ninguna" };
  for (const clave of [
    "apuesta",
    "procedencia",
    "momento",
    "estado",
    "en_bloque",
  ] as const)
    if (lista(r, clave) === null)
      return { ok: false, campo: `respuestas.${clave}` };

  const c = datos.chequeos;
  const intrusa = claveExtra(c, CHEQUEOS);
  if (intrusa) return { ok: false, campo: `chequeos.${intrusa}` };
  const ausente = CHEQUEOS.find((k) => !(k in c));
  if (ausente) return { ok: false, campo: `chequeos.${ausente}` };
  for (const clave of [
    "columnas",
    "roles",
    "deriva_sin_medir",
    "alertas",
    "aciertos",
    "sorpresas",
    "falsas_alarmas",
  ] as const)
    if (lista(c, clave) === null)
      return { ok: false, campo: `chequeos.${clave}` };
  for (const clave of [
    "fuga",
    "fuga_vacios",
    "identificador",
    "deriva_psi",
    "deriva_ks",
  ] as const)
    if (mapa(c, clave) === null)
      return { ok: false, campo: `chequeos.${clave}` };
  for (const clave of ["filas", "duplicados_fila"] as const)
    if (numero(c, clave) === null)
      return { ok: false, campo: `chequeos.${clave}` };
  for (const clave of [
    "duplicados_unidad_momento",
    "deriva_historico",
    "deriva_reciente",
  ] as const)
    if (c[clave] !== null && numero(c, clave) === null)
      return { ok: false, campo: `chequeos.${clave}` };
  if (!ESTADOS_DERIVA.includes(texto(c, "deriva_estado") ?? ""))
    return { ok: false, campo: "chequeos.deriva_estado" };
  if (c.deriva_corte !== null && texto(c, "deriva_corte") === null)
    return { ok: false, campo: "chequeos.deriva_corte" };

  const n = lista(c, "columnas")!.length;
  for (const clave of ["procedencia", "momento", "estado"] as const)
    if (lista(r, clave)!.length !== n)
      return { ok: false, campo: `respuestas.${clave}` };
  if (
    !lista(r, "momento")!.every(
      (m) => m === "" || MOMENTOS.some((x) => x === m),
    )
  )
    return { ok: false, campo: "respuestas.momento" };
  if (
    !lista(r, "estado")!.every((e) => e === "" || ESTADOS.some((x) => x === e))
  )
    return { ok: false, campo: "respuestas.estado" };
  if (!lista(r, "procedencia")!.every((p) => p.length <= PROCEDENCIA_MAX))
    return { ok: false, campo: "respuestas.procedencia" };
  return { ok: true };
}

function criterio(datos: DatosEtapa, previas: Previas): Veredicto {
  const [e1, e2, e3] = [previas[1], previas[2], previas[3]];
  if (!e1 || !e2 || !e3) return { tipo: "falta", faltan: ["etapas-previas"] };
  const r = datos.respuestas;
  const c = datos.chequeos;
  const columnas = lista(c, "columnas") ?? [];
  const alertas = new Set(lista(c, "alertas") ?? []);
  const [procedencia, momento, estado, enBloque] = [
    lista(r, "procedencia") ?? [],
    lista(r, "momento") ?? [],
    lista(r, "estado") ?? [],
    lista(r, "en_bloque") ?? [],
  ];
  const apuesta = lista(r, "apuesta") ?? [];
  const faltan: string[] = [];

  const nombres = [textoLleno(e2.respuestas, "objetivo") ?? "", ...columnas];
  if (new Set(nombres).size !== nombres.length || nombres.includes("__proto__"))
    faltan.push("nombres-columnas");

  const ninguna = booleano(r, "apuesta_ninguna") === true;
  const apuestaBien =
    ninguna === (apuesta.length === 0) &&
    new Set(apuesta).size === apuesta.length &&
    apuesta.every((a) => columnas.includes(a));
  if (!apuestaBien) faltan.push("apuesta");

  if (estado.some((e) => e === "")) faltan.push("estado");
  if (
    columnas.some((_, i) => momento[i] === "despues" && estado[i] !== "excluir")
  )
    faltan.push("despues-excluir");
  if (columnas.some((_, i) => estado[i] === "usar" && momento[i] === "nose"))
    faltan.push("nose-usar");
  if (columnas.some((_, i) => estado[i] === "usar" && momento[i] === ""))
    faltan.push("usar-sin-antes");
  if (
    columnas.some(
      (col, i) =>
        alertas.has(col) &&
        estado[i] === "usar" &&
        (procedencia[i] ?? "").trim() === "",
    )
  )
    faltan.push("procedencia");
  const bloqueMal =
    new Set(enBloque).size !== enBloque.length ||
    enBloque.some((col) => {
      const i = columnas.indexOf(col);
      return (
        i < 0 ||
        alertas.has(col) ||
        momento[i] !== "antes" ||
        estado[i] !== "usar"
      );
    });
  if (bloqueMal) faltan.push("bloque");
  return faltan.length > 0 ? { tipo: "falta", faltan } : { tipo: "cumple" };
}

/** Lo que la etapa 4 evitó, dicho con las columnas del usuario. */
function trampas(datos: DatosEtapa): readonly Trampa[] {
  const [r, c] = [datos.respuestas, datos.chequeos];
  const columnas = lista(c, "columnas") ?? [];
  const estado = lista(r, "estado") ?? [];
  const estadoDe = (col: string) => estado[columnas.indexOf(col)] ?? "";
  const salida: Trampa[] = [];

  const [fuga, vacios] = [mapa(c, "fuga") ?? {}, mapa(c, "fuga_vacios") ?? {}];
  const masFuerte = (m: Readonly<Record<string, number>>) =>
    Object.entries(m).sort(([, a], [, b]) => b - a)[0];
  const decir = (
    m: Readonly<Record<string, number>>,
    excluida: string,
    usada: string,
  ) => {
    const top = masFuerte(m);
    if (!top) return;
    const cols = Object.keys(m);
    // Solo se dice lo que el inventario ya dice: «usada» si alguna está en «usar»; «excluida» si
    // TODAS están en «excluir». Con columnas sin responder o en «no sé», no se afirma nada.
    const decidida = cols.find((col) => estadoDe(col) === "usar");
    if (decidida !== undefined)
      salida.push({
        clave: usada,
        params: { columna: decidida, n: cols.length },
      });
    else if (cols.every((col) => estadoDe(col) === "excluir"))
      salida.push({
        clave: excluida,
        params: { columna: top[0], n: cols.length },
      });
  };
  decir(fuga, "fuga-excluida", "fuga-usada");
  decir(vacios, "fuga-vacios-excluida", "fuga-vacios-usada");

  const filas = numero(c, "duplicados_fila") ?? 0;
  if (filas > 0)
    salida.push({
      clave: "filas-repetidas",
      params: { n: filas, filas: numero(c, "filas") ?? 0 },
    });
  const um = numero(c, "duplicados_unidad_momento") ?? 0;
  if (um > 0)
    salida.push({ clave: "unidad-momento-repetida", params: { n: um } });

  const derivaEstado = texto(c, "deriva_estado") ?? "";
  if (derivaEstado === "medida") {
    const psi = mapa(c, "deriva_psi") ?? {};
    const top = masFuerte(psi);
    if (top && top[1] >= PSI_ALERTA)
      salida.push({
        clave: "deriva",
        params: {
          columna: top[0],
          psi: top[1],
          corte: texto(c, "deriva_corte") ?? "",
        },
      });
  } else salida.push({ clave: derivaEstado, params: {} });

  const aciertos = lista(c, "aciertos") ?? [];
  const sorpresas = lista(c, "sorpresas") ?? [];
  const falsas = lista(c, "falsas_alarmas") ?? [];
  if (aciertos.length + sorpresas.length + falsas.length > 0)
    salida.push({
      clave: "apuesta",
      params: {
        aciertos: aciertos.length,
        sorpresas: sorpresas.length,
        falsas: falsas.length,
      },
    });
  const sinNada =
    Object.keys(fuga).length +
      Object.keys(vacios).length +
      Object.keys(mapa(c, "identificador") ?? {}).length ===
      0 &&
    filas === 0 &&
    um === 0;
  if (sinNada) salida.push({ clave: "sin-hallazgos", params: {} });
  // Solo cuando TODO está respondido y nada quedó en «usar»: sin respuestas no hay nada que decir.
  if (
    estado.length > 0 &&
    estado.every((e) => e !== "") &&
    columnasParaEntrenar(datos).length === 0
  )
    salida.push({ clave: "nada-para-entrenar", params: {} });
  return salida;
}

/** Vuelve a calcular lo que esta etapa registra sobre la tabla cargada, con esa misma apuesta. */
function recalcular(
  datos: DatosEtapa,
  previas: Previas,
  tabla: CsvTable,
): DatosEtapa {
  const h = hallazgos4(tabla, previas);
  return {
    respuestas: datos.respuestas,
    chequeos: h ? chequeos4(h, lista(datos.respuestas, "apuesta") ?? []) : {},
  };
}

export const ETAPA_4: EtapaConstruida = {
  id: 4,
  construida: true,
  dependeDeDatos: true,
  terminos: [
    "existe-al-decidir",
    "fuga-de-datos",
    "procedencia",
    "columna-identificador",
    "duplicado",
    "deriva",
  ],
  preguntas: ["apuesta", "procedencia", "momento", "estado"],
  chequeos: ["fuga", "identificador", "duplicados", "deriva", "apuesta"],
  leer,
  criterio,
  recalcular,
  trampas,
};
