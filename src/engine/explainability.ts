// Regla de dominio: ¿el modelo se apoya de verdad en esta variable?
//
// La importancia por permutación mide cuánto empeora el modelo al desordenar la
// columna. Si no llega ni a mostrarse (redondea a 0.000 con los 3 decimales que
// usa la UI) o es negativa, desordenarla no le hizo daño: el modelo NO obtiene
// nada de ella.
//
// Vive aquí —y no duplicada en cada renderizador— porque gobierna TRES sitios que
// deben decir lo mismo: el gráfico, la plantilla determinista y el prompt del LLM.
// El umbral es espejo del de `_explainability` en pipeline.py (`round(imp, 3) > 0`);
// si alguien mueve uno sin el otro, el test de paridad falla.
export const IMPORTANCE_DISPLAY_DECIMALS = 3;

export function isFeatureUsed(importance: number): boolean {
  const factor = 10 ** IMPORTANCE_DISPLAY_DECIMALS;
  return Math.round(importance * factor) / factor > 0;
}
