// S18 (ADR 026): el plan de limpieza, la parte que va con la página: los tipos y lo que se hace con las decisiones.
// Proponer los pasos (umbrales, cuantiles, detector) vive en `limpieza.ts`, que llega solo después de cargar un archivo.
//
// Regla de fondo (sanitize.ts, ADR-002 extendido): lo estadístico se ajusta DENTRO del pipeline y solo con train. Por eso un
// paso aprobado no toca la tabla: viaja como una instrucción al preprocesador (`SpecLimpieza`) o quita/reclasifica una
// columna. Lo que no se decide NO se aplica.
import type { TipoPersonal } from "./personales";

export type TipoPaso =
  | "tipo-categoria"
  | "vacio-indicador"
  | "vacio-categoria"
  | "atipicos-cuantiles"
  | "quitar-columna";

export type PasoLimpieza = {
  /** `tipo:columna`: estable entre corridas. */
  id: string;
  tipo: TipoPaso;
  columna: string;
  /** Cuántas celdas toca, de cuántas (para la frase; en `tipo-categoria`, los valores distintos). */
  celdas: number;
  de: number;
  /** Solo `quitar-columna`: qué parece guardar. */
  personal?: TipoPersonal;
};

export type Decision = "aprobado" | "rechazado";
export type Decisiones = Readonly<Record<string, Decision>>;

/** Lo que el preprocesador recibe (nombres de columnas, ningún valor). */
export type SpecLimpieza = {
  indicador_vacio: string[];
  sin_dato: string[];
  cuantiles: string[];
};

export type MotivoNoAplicado =
  "objetivo" | "columna-quitada" | "ahora-categoria" | "ya-excluida";

export type RegistroPaso = {
  id: string;
  tipo: TipoPaso;
  columna: string;
  celdas: number;
  de: number;
  decision: Decision | "sin-decidir";
  aplicado: boolean;
  motivo: MotivoNoAplicado | null;
};

export type PlanAplicado = {
  quitar: string[];
  /** Numéricas que se tratan como categoría. */
  categoricas: string[];
  /** `null` si ningún paso estadístico quedó aprobado (el payload sale igual que antes del S18). */
  limpieza: SpecLimpieza | null;
  registro: RegistroPaso[];
};

/**
 * Pura y determinista: el mismo plan con las mismas decisiones da siempre lo mismo. Un paso sobre la columna que se quiere
 * predecir no se aplica (se dice en el registro), y los pasos de una columna que se quita o que pasa a ser categoría
 * tampoco. S21: `excluidas` son las columnas que la tarea ya deja fuera por su cuenta (al agrupar, un identificador o una fecha):
 * un paso estadístico sobre ellas no se aplica ni se dice «aplicado» (quitar la columna sí, el plan la quitó primero).
 */
export function aplicarDecisiones(
  plan: readonly PasoLimpieza[],
  decisiones: Decisiones,
  objetivo: string | null,
  excluidas: ReadonlySet<string> = new Set(),
): PlanAplicado {
  const aprobado = (p: PasoLimpieza) => decisiones[p.id] === "aprobado";
  const quitar = new Set(
    plan
      .filter(
        (p) =>
          p.tipo === "quitar-columna" && aprobado(p) && p.columna !== objetivo,
      )
      .map((p) => p.columna),
  );
  const categoricas = new Set(
    plan
      .filter(
        (p) =>
          p.tipo === "tipo-categoria" &&
          aprobado(p) &&
          p.columna !== objetivo &&
          !quitar.has(p.columna),
      )
      .map((p) => p.columna),
  );
  const spec: SpecLimpieza = {
    indicador_vacio: [],
    sin_dato: [],
    cuantiles: [],
  };
  const registro: RegistroPaso[] = plan.map((p) => {
    const decision = decisiones[p.id] ?? "sin-decidir";
    let motivo: MotivoNoAplicado | null = null;
    if (decision === "aprobado") {
      if (p.columna === objetivo) motivo = "objetivo";
      else if (p.tipo !== "quitar-columna" && quitar.has(p.columna))
        motivo = "columna-quitada";
      else if (
        (p.tipo === "vacio-indicador" || p.tipo === "atipicos-cuantiles") &&
        categoricas.has(p.columna)
      )
        motivo = "ahora-categoria";
      else if (p.tipo !== "quitar-columna" && excluidas.has(p.columna))
        motivo = "ya-excluida";
    }
    const aplicado = decision === "aprobado" && motivo === null;
    if (aplicado) {
      if (p.tipo === "vacio-indicador") spec.indicador_vacio.push(p.columna);
      else if (p.tipo === "vacio-categoria") spec.sin_dato.push(p.columna);
      else if (p.tipo === "atipicos-cuantiles") spec.cuantiles.push(p.columna);
    }
    return {
      id: p.id,
      tipo: p.tipo,
      columna: p.columna,
      celdas: p.celdas,
      de: p.de,
      decision,
      aplicado,
      motivo,
    };
  });
  const hayEspecificacion =
    spec.indicador_vacio.length + spec.sin_dato.length + spec.cuantiles.length >
    0;
  return {
    quitar: [...quitar],
    categoricas: [...categoricas],
    limpieza: hayEspecificacion ? spec : null,
    registro,
  };
}

/** La especificación del preprocesador que dejó un registro (lo aplicado), para la receta y el servicio. */
export function especificacionDe(
  registro: readonly RegistroPaso[] | undefined,
): SpecLimpieza | null {
  const spec: SpecLimpieza = { indicador_vacio: [], sin_dato: [], cuantiles: [] };
  for (const paso of registro ?? []) {
    if (!paso.aplicado) continue;
    if (paso.tipo === "vacio-indicador") spec.indicador_vacio.push(paso.columna);
    else if (paso.tipo === "vacio-categoria") spec.sin_dato.push(paso.columna);
    else if (paso.tipo === "atipicos-cuantiles") spec.cuantiles.push(paso.columna);
  }
  return spec.indicador_vacio.length + spec.sin_dato.length + spec.cuantiles.length > 0
    ? spec
    : null;
}
