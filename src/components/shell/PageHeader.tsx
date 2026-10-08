import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, tag }: { title: string; subtitle: ReactNode; tag?: string }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-bold leading-tight text-fog-50 sm:text-5xl">{title}</h1>
        <p className="mt-1 text-lg text-link sm:text-2xl">{subtitle}</p>
      </div>
      {tag && <span className="pt-2 text-xs font-semibold uppercase tracking-[0.2em] text-link">{tag}</span>}
    </header>
  );
}
