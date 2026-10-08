import type { ReactNode } from "react";

export function StatCard({ icon, label, value, sub }: { icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-4 rounded-xl border border-ink-700 bg-ink-850/90 px-4 py-4 sm:px-5">
      <span aria-hidden className="shrink-0 text-accent">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm text-fog-300">{label}</p>
        <p className="font-display text-2xl font-bold text-fog-50 sm:text-3xl">{value}</p>
        {sub && <p className="truncate text-xs text-fog-400">{sub}</p>}
      </div>
    </div>
  );
}
