import type { ButtonHTMLAttributes, ReactNode } from "react";

// Iconos de trazo propios (gate ⭐ S4: todo botón de acción lleva icono a la
// izquierda del texto). SVG inline, currentColor, aria-hidden — el texto
// siempre permanece (el icono refuerza, jamás reemplaza). CERO emojis-icono
// (design-system.md).
export type IconName =
  | "upload"
  | "download"
  | "import"
  | "retry"
  | "play"
  | "back"
  | "plus"
  | "check"
  | "x"
  | "table"
  | "sparkle";

const ICON_PATHS: Record<IconName, ReactNode> = {
  upload: (
    <>
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      <path d="M12 15V4" />
      <path d="m7 9 5-5 5 5" />
    </>
  ),
  download: (
    <>
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      <path d="M12 4v11" />
      <path d="m7 10 5 5 5-5" />
    </>
  ),
  import: (
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  ),
  retry: (
    <>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </>
  ),
  play: <path d="m7 4 13 8-13 8z" />,
  back: (
    <>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  check: <path d="m4 12.5 5.5 5.5L20 7" />,
  x: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
  table: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M9 10v10" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3v6" />
      <path d="M12 15v6" />
      <path d="M3 12h6" />
      <path d="M15 12h6" />
      <path d="m6.3 6.3 3 3" />
      <path d="m14.7 14.7 3 3" />
      <path d="m17.7 6.3-3 3" />
      <path d="m9.3 14.7-3 3" />
    </>
  ),
};

export function Icon({
  name,
  className = "",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-4 w-4 shrink-0 ${className}`}
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink hover:opacity-90",
  secondary: "border border-hairline bg-surface text-ink hover:bg-sunken",
  ghost: "text-ink hover:bg-sunken",
};

export function Button({
  variant = "primary",
  icon,
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  icon?: IconName;
}) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-opacity disabled:pointer-events-none disabled:opacity-50 ${buttonVariants[variant]} ${className}`}
      {...props}
    >
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

export function Card({
  children,
  className = "",
  role,
}: {
  children: ReactNode;
  className?: string;
  role?: string;
}) {
  return (
    <div
      role={role}
      className={`rounded-lg border border-hairline bg-surface shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

type BadgeTone = "neutral" | "caution" | "positive";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: BadgeTone;
}) {
  const tones: Record<BadgeTone, string> = {
    neutral: "border-hairline text-ink-muted",
    caution: "border-caution/40 text-caution",
    positive: "border-positive/40 text-positive",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

// Una métrica: valor en mono/tabular-nums + etiqueta. Fila en el panel de test.
export function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm bg-sunken p-2.5">
      <div className="text-[0.6875rem] uppercase tracking-wide text-ink-muted">
        {label}
      </div>
      <div className="mt-1 font-mono text-lg font-semibold tabular-nums">
        {value}
      </div>
    </div>
  );
}
