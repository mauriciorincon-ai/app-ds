import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink hover:opacity-90",
  secondary: "border border-hairline bg-surface text-ink hover:bg-sunken",
  ghost: "text-ink hover:bg-sunken",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-medium transition-opacity disabled:pointer-events-none disabled:opacity-50 ${buttonVariants[variant]} ${className}`}
      {...props}
    />
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
