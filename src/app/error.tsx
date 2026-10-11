"use client";

import { PageError } from "@/components/PageError";

// AU-S7-19: el límite de error de la ruta (Next lo monta dentro del layout, con su i18n).
export default function RouteError({
  error,
}: {
  error: Error;
  reset: () => void;
}) {
  return <PageError error={error} />;
}
