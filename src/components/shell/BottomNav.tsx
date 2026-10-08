"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive, navItems } from "./nav-items";

export function BottomNav({ leagueId }: { leagueId: string }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="League"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-700 bg-ink-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="grid grid-cols-4">
        {navItems(leagueId).map((item) => {
          const active = isActive(item, pathname);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-16 flex-col items-center justify-center gap-0.5 text-xs ${
                  active ? "font-semibold text-accent" : "text-fog-300"
                }`}
              >
                <Icon aria-hidden className="size-5" />
                <span>{item.shortLabel}</span>
                {!item.ready && <span className="text-[9px] uppercase tracking-wider text-fog-400">Soon</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
