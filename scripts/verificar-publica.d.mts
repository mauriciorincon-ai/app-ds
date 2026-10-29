// Tipos de scripts/verificar-publica.mjs para las pruebas (TypeScript strict).
export type Pin = { nombre: string; version: string };

export function pinsDe(texto: string): Pin[];
export function compatible(archivo: string, menor?: number): boolean;
export function sriDelPuntuador(html: string): string | null;

export type Buscar = (
  url: string,
  opciones?: { method?: string },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  arrayBuffer?: () => Promise<ArrayBuffer>;
}>;

export function verificar(args: {
  buscar: Buscar;
  version: string;
  archivosPyodide: string[];
  pins: Pin[];
  python: string;
  /** El SRI que exige el puntuador a `pyodide.js`; si viene, se cruza con lo que sirve el CDN. */
  sri?: string | null;
  menor?: number;
}): Promise<{ bien: string[]; fallas: string[] }>;
