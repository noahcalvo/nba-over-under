import type { ReactNode } from "react";

export function Panel({
  title,
  icon,
  actions,
  className = "",
  bodyClassName = "",
  children,
}: {
  title?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={`min-w-0 rounded-xl border border-ink-700 bg-ink-850/90 ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-700 px-4 py-3 sm:px-5">
          {title && (
            <h2 className="flex min-w-0 items-center gap-2 font-display text-xl font-semibold text-fog-50">
              {icon}
              {title}
            </h2>
          )}
          {actions}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
