"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { challengeNavItems, isChallengeNavActive } from "./nav-items";

function sidebarItemClass(active: boolean): string {
  return `flex items-center gap-3 rounded-lg border-l-2 px-3 py-2.5 text-base transition-colors ${
    active
      ? "border-accent bg-accent/10 font-semibold text-accent"
      : "border-transparent text-fog-300 hover:bg-ink-800 hover:text-fog-50"
  }`;
}

function tabClass(active: boolean): string {
  return `flex h-16 flex-col items-center justify-center gap-0.5 text-xs ${
    active ? "font-semibold text-accent" : "text-fog-300"
  }`;
}

export function ChallengeSidebarNav() {
  const pathname = usePathname();
  const items = challengeNavItems();
  return (
    <nav aria-label="Challenge" className="flex flex-col gap-1">
      {items.map((item, index) => {
        const active = isChallengeNavActive(item, pathname);
        const Icon = item.icon;
        return (
          <div key={item.href} className="contents">
            {index === 1 && <hr className="my-3 border-ink-700" />}
            <Link href={item.href} aria-current={active ? "page" : undefined} className={sidebarItemClass(active)}>
              <Icon aria-hidden className="size-5 shrink-0" />
              <span className="flex-1">{item.label}</span>
            </Link>
          </div>
        );
      })}
    </nav>
  );
}

export function ChallengeBottomNav() {
  const pathname = usePathname();
  const items = challengeNavItems().filter((item) => !item.sidebarOnly);
  return (
    <nav
      aria-label="Challenge"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-700 bg-ink-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="grid grid-cols-4">
        {items.map((item) => {
          const active = isChallengeNavActive(item, pathname);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={active ? "page" : undefined} className={tabClass(active)}>
                <Icon aria-hidden className="size-5" />
                <span>{item.shortLabel}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
