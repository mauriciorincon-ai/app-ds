// Duraciones estimadas para mostrar (S5): redondeo honesto HACIA ARRIBA (una
// estimación que se queda corta frustra más que una holgada) y minutos desde 60 s.
// Las unidades «s» y «min» son iguales en ES y EN.
export function formatEstimate(seconds: number): string {
  if (!(seconds > 0)) return "1 s";
  if (seconds < 60) return `${Math.max(1, Math.ceil(seconds))} s`;
  return `${Math.ceil(seconds / 60)} min`;
}
