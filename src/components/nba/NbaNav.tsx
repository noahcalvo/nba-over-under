"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { isNbaNavActive, nbaNavItems } from "./nav-items";

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

// usePathname() is only known at request time on routes with dynamic segments (games/[gameId]), so the navs sit in
// Suspense; until it resolves they draw with nothing highlighted.
const UNKNOWN_PATH = "";

export function NbaSidebarNav() {
  return (
    <Suspense fallback={<SidebarNav pathname={UNKNOWN_PATH} />}>
      <CurrentSidebarNav />
    </Suspense>
  );
}

function CurrentSidebarNav() {
  return <SidebarNav pathname={usePathname()} />;
}

function SidebarNav({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="NBA" className="flex flex-col gap-1">
      {nbaNavItems().map((item) => {
        const active = isNbaNavActive(item, pathname);
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={sidebarItemClass(active)}>
            <Icon aria-hidden className="size-5 shrink-0" />
            <span className="flex-1">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function NbaBottomNav({ account }: { account: ReactNode }) {
  return (
    <Suspense fallback={<BottomNav pathname={UNKNOWN_PATH} account={account} />}>
      <CurrentBottomNav account={account} />
    </Suspense>
  );
}

function CurrentBottomNav({ account }: { account: ReactNode }) {
  return <BottomNav pathname={usePathname()} account={account} />;
}

function BottomNav({ pathname, account }: { pathname: string; account: ReactNode }) {
  return (
    <nav
      aria-label="NBA"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-700 bg-ink-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="grid grid-cols-3">
        {nbaNavItems()
          .filter((item) => !item.sidebarOnly)
          .map((item) => {
            const active = isNbaNavActive(item, pathname);
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
        <li>{account}</li>
      </ul>
    </nav>
  );
}
