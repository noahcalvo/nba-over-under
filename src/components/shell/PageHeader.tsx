import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  tag,
  actions,
}: {
  title: string;
  subtitle: ReactNode;
  tag?: string;
  /** Controls shown under the tag, right-aligned from sm. */
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-bold leading-tight text-fog-50 sm:text-5xl">{title}</h1>
        <p className="mt-1 text-lg text-link sm:text-2xl">{subtitle}</p>
      </div>
      {(tag || actions) && (
        <div className="flex min-w-0 flex-col items-start gap-3 sm:items-end">
          {tag && <span className="pt-2 text-xs font-semibold uppercase tracking-[0.2em] text-link">{tag}</span>}
          {actions}
        </div>
      )}
    </header>
  );
}

/** A page header whose text isn't known yet: same height, placeholder bars. */
export function PageHeaderSkeleton({ title }: { title?: string }) {
  return (
    <header aria-hidden className="flex flex-col">
      {title ? (
        <h1 className="font-display text-3xl font-bold leading-tight text-fog-50 sm:text-5xl">{title}</h1>
      ) : (
        <div className="h-9 w-64 max-w-full animate-pulse rounded-lg bg-ink-800 sm:h-[3.75rem] sm:w-96" />
      )}
      <div className="mt-2 h-6 w-56 max-w-full animate-pulse rounded bg-ink-800 sm:h-8" />
    </header>
  );
}
