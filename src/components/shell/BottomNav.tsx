"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { isActive, navItems, type NavItem } from "./nav-items";

function itemClass(active: boolean): string {
  return `flex h-16 flex-col items-center justify-center gap-0.5 text-xs ${
    active ? "font-semibold text-accent" : "text-fog-300"
  }`;
}

function ItemContent({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <>
      <Icon aria-hidden className="size-5" />
      <span>{item.shortLabel}</span>
      {!item.ready && <span className="text-[9px] uppercase tracking-wider text-fog-400">Soon</span>}
    </>
  );
}

/** The league's own pages; the NBA schedule and the 30/30 Challenge are in the top bar (GlobalNav). */
function leagueTabs(leagueId: string): NavItem[] {
  return navItems(leagueId).filter((item) => !item.global);
}

/** The league's four tabs, then the account. */
function NavBar({ account, children }: { account: ReactNode; children: ReactNode }) {
  return (
    <nav
      aria-label="League"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-700 bg-ink-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="grid grid-cols-5">
        {children}
        <li>{account}</li>
      </ul>
    </nav>
  );
}

export function BottomNav({ leagueId, account }: { leagueId: string; account: ReactNode }) {
  const pathname = usePathname();
  return (
    <NavBar account={account}>
      {leagueTabs(leagueId).map((item) => {
        const active = isActive(item, pathname);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              data-tour={item.tour}
              aria-current={active ? "page" : undefined}
              className={itemClass(active)}
            >
              <ItemContent item={item} />
            </Link>
          </li>
        );
      })}
    </NavBar>
  );
}

/** The same tabs before the league is known (the prerendered shell): they look the same but don't link yet. */
export function BottomNavSkeleton({ account }: { account: ReactNode }) {
  return (
    <NavBar account={account}>
      {leagueTabs("").map((item) => (
        <li key={item.label}>
          <span aria-disabled="true" className={itemClass(false)}>
            <ItemContent item={item} />
          </span>
        </li>
      ))}
    </NavBar>
  );
}
