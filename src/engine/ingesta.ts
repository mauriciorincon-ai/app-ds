// S18: lo que se mira de una tabla recién cargada, de una vez: los posibles datos personales y el plan de limpieza
// que el código propone. Llega con `import()` DESPUÉS de cargar el archivo, así que no pesa en la carga inicial.
//
// Los datos personales se buscan en la tabla TAL COMO LLEGÓ: el saneamiento (S4) ya aparta por sí solo las columnas con un valor
// distinto por fila (un correo, un documento), y que quedaran fuera no las vuelve menos personales; el aviso lo dice. El plan,
// en cambio, se arma sobre la tabla saneada: solo propone quitar lo que todavía está.
import type { CsvTable } from "@/lib/ds/csv";
import { proponerPlan } from "./limpieza";
import type { Decisiones, PasoLimpieza } from "./limpieza-plan";
import { detectarPersonales, type AvisoPersonal } from "./personales";

export type AvisoConEstado = AvisoPersonal & {
  /** El saneamiento ya dejó esta columna fuera (un valor distinto por fila). */
  fuera: boolean;
};

export type Ingesta = {
  personales: AvisoConEstado[];
  plan: PasoLimpieza[];
  /** Lo que el usuario fue decidiendo; lo que no está aquí no se aplica. */
  decisiones: Decisiones;
};

export function analizarIngesta(
  cruda: CsvTable,
  saneada: CsvTable = cruda,
): Ingesta {
  const presentes = new Set(saneada.headers);
  const personales = detectarPersonales(cruda).map((aviso) => ({
    ...aviso,
    fuera: !presentes.has(aviso.column),
  }));
  const quedan = personales.filter((aviso) => !aviso.fuera);
  return { personales, plan: proponerPlan(saneada, quedan), decisiones: {} };
}
