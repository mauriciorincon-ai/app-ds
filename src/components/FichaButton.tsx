"use client";

import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";
import type { FichaTarget } from "./FichaModelo";
import { Icon } from "./ui";

// La ficha y su contenido viajan en su propio chunk: se piden la primera vez
// que alguien abre una (R12 — budget de script de 300 KB).
const FichaModelo = dynamic(() => import("./FichaModelo"), { ssr: false });

/** El nombre de un modelo como botón que abre su ficha de lectura (E3). */
export function FichaButton({
  target,
  label,
  children,
  className = "",
}: {
  target: FichaTarget;
  /** Nombre accesible: «Ficha de Random Forest». */
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={label}
        onClick={() => setOpen(true)}
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-sm text-left underline decoration-hairline decoration-1 underline-offset-4 hover:decoration-ink ${className}`}
      >
        <Icon name="info" className="text-ink-muted" />
        {children}
      </button>
      {open && <FichaModelo target={target} onClose={() => setOpen(false)} />}
    </>
  );
}
