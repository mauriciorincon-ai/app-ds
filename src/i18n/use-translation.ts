"use client";

import { useI18n } from "./provider";

// Azúcar sintáctico: `const t = useT()` cuando solo se necesita traducir.
export function useT(): (key: string) => string {
  return useI18n().t;
}
