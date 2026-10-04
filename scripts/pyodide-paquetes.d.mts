// Tipos del módulo de paquetes (JS puro, lo leen scripts de Node y los tests).
export declare const REQUIRED: string[];
export declare const LOAD_WITHOUT_DEPS: string[];
export declare const CORE_FILES: string[];
export declare function normalize(name: string): string;
export declare function resolveWheels(
  lock: { packages: Record<string, { file_name: string; depends?: string[] }> },
  required?: string[],
): string[];
