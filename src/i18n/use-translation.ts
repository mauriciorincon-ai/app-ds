"use client";

import { useI18n, type TParams } from "./provider";

// Azúcar sintáctico: `const t = useT()` cuando solo se necesita traducir.
export function useT(): (key: string, params?: TParams) => string {
  return useI18n().t;
}
