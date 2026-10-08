import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "accent" | "danger" | "soon";

const TONES: Record<BadgeTone, string> = {
  neutral: "border-ink-600 text-fog-300",
  accent: "border-accent/60 bg-accent/10 text-accent",
  danger: "border-negative/60 bg-negative/10 text-negative",
  soon: "border-ink-600 text-fog-400",
};

export function Badge({ tone = "neutral", className = "", children }: { tone?: BadgeTone; className?: string; children: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
