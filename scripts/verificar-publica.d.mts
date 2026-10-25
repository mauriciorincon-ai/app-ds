// Tipos de scripts/verificar-publica.mjs para las pruebas (TypeScript strict).
export type Pin = { nombre: string; version: string };

export function pinsDe(texto: string): Pin[];
export function compatible(archivo: string, menor?: number): boolean;

export type Buscar = (
  url: string,
  opciones?: { method?: string },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export function verificar(args: {
  buscar: Buscar;
  version: string;
  archivosPyodide: string[];
  pins: Pin[];
  python: string;
  menor?: number;
}): Promise<{ bien: string[]; fallas: string[] }>;
