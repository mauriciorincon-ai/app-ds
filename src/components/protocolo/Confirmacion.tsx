"use client";

// Protocolo DS (S9, deuda M2/M3 del S8): el diálogo de confirmación de las acciones que
// reemplazan el cuaderno. Es un <dialog> nativo en modal, como la ficha de Probeta: el
// navegador atrapa el foco, deja inerte el resto de la página y cierra con Escape. Lleva
// nombre y descripción (axe: `aria-dialog-name`), el foco entra en el botón menos
// destructivo (`data-autofocus`) y vuelve a quien lo abrió. Escape y el clic en el fondo
// CANCELAN: nunca confirman.
import { useEffect, useId, useRef, type ReactNode } from "react";

export function Confirmacion({
  titulo,
  cuerpo,
  acciones,
  onCancelar,
  devolverA,
  testId,
}: {
  titulo: string;
  cuerpo: ReactNode;
  /** Los botones. El menos destructivo lleva `data-autofocus`. */
  acciones: ReactNode;
  onCancelar: () => void;
  /** Dónde vuelve el foco al cerrar (el botón visible que abrió el diálogo). */
  devolverA?: () => HTMLElement | null;
  testId?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const tituloId = useId();
  const cuerpoId = useId();
  const devolverRef = useRef(devolverA);
  useEffect(() => {
    devolverRef.current = devolverA;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const abridor =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    if (!dialog.open) {
      // Sin <dialog> modal (navegadores viejos, jsdom): se muestra abierto, sin trampa de foco.
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
      (devolverRef.current?.() ?? abridor)?.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      role="alertdialog"
      aria-labelledby={tituloId}
      aria-describedby={cuerpoId}
      data-testid={testId}
      // Escape cancela: se evita el cierre nativo y manda el padre (que desmonta el diálogo).
      onCancel={(event) => {
        event.preventDefault();
        onCancelar();
      }}
      // Un clic en el fondo (fuera de la tarjeta) también cancela.
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancelar();
      }}
      className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-lg border border-hairline bg-surface p-0 text-ink shadow-lg backdrop:bg-black/50"
    >
      <div className="flex flex-col gap-3 p-5">
        <h2 id={tituloId} className="text-lg font-semibold">
          {titulo}
        </h2>
        <div
          id={cuerpoId}
          className="flex flex-col gap-2 text-sm [overflow-wrap:anywhere]"
        >
          {cuerpo}
        </div>
        <div className="flex flex-wrap gap-2">{acciones}</div>
      </div>
    </dialog>
  );
}
