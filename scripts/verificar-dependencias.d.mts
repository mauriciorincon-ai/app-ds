// Tipos de scripts/verificar-dependencias.mjs para las pruebas (TypeScript strict).
export type Permitida = { nombre: string; de: string; a: string; razon: string };

export type Revision =
  | { ilegible: string }
  | {
      ilegible?: undefined;
      degradados: string[];
      aceptados: string[];
      sinUso: string[];
      paquetes: number;
    };

export function versiones(texto: string): Map<string, string[]>;

export function revisar(args: {
  lockBase: string;
  lockPR: string;
  permitidas: Permitida[];
  base?: string;
}): Revision;
