"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { globalNavItems, isActive } from "./nav-items";

function itemClass(active: boolean): string {
  return `flex h-10 w-12 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] leading-none ${
    active ? "bg-accent/10 font-semibold text-accent" : "text-fog-300 hover:bg-ink-800 hover:text-fog-50"
  }`;
}

// usePathname() is only known at request time on routes with dynamic segments, so the links sit in Suspense; until it
// resolves they draw with nothing highlighted.
const UNKNOWN_PATH = "";

/** The mobile top bar's way out of the current section: the NBA schedule and the 30/30 Challenge, the same everywhere. */
export function GlobalNav() {
  return (
    <Suspense fallback={<Links pathname={UNKNOWN_PATH} />}>
      <CurrentLinks />
    </Suspense>
  );
}

function CurrentLinks() {
  return <Links pathname={usePathname()} />;
}

function Links({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Courtline" className="flex shrink-0 items-center gap-1">
      {globalNavItems().map((item) => {
        const active = isActive(item, pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={itemClass(active)}
          >
            <Icon aria-hidden className="size-4" />
            <span>{item.shortLabel}</span>
          </Link>
        );
      })}
    </nav>
  );
}
