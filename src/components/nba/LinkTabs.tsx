import Link from "next/link";

export interface LinkTab {
  label: string;
  href: string;
  active: boolean;
}

/** A segmented control whose options are links (the choice lives in the URL). Same look as `SegmentedControl`. */
export function LinkTabs({ ariaLabel, options }: { ariaLabel: string; options: LinkTab[] }) {
  return (
    <nav aria-label={ariaLabel} className="inline-flex rounded-lg border border-ink-700 bg-ink-900 p-1">
      {options.map((option) => (
        <Link
          key={option.href}
          href={option.href}
          aria-current={option.active ? "true" : undefined}
          className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
            option.active ? "bg-accent text-accent-ink" : "text-fog-300 hover:text-fog-50"
          }`}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}
