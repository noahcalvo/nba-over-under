import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";
import { LeagueSwitcher, type LeagueSummary } from "./LeagueSwitcher";
import { Logo } from "./Logo";
import { SidebarNav } from "./SidebarNav";

export function AppShell({
  league,
  otherLeagues,
  children,
}: {
  league: LeagueSummary;
  otherLeagues: LeagueSummary[];
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-6 border-r border-ink-700 bg-ink-900 px-4 py-6 lg:flex">
        <Logo />
        <LeagueSwitcher league={league} otherLeagues={otherLeagues} />
        <SidebarNav leagueId={league.id} />
      </aside>
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-ink-700 bg-ink-900/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <Logo compact />
        <div className="w-44 min-w-0 sm:w-56">
          <LeagueSwitcher league={league} otherLeagues={otherLeagues} compact />
        </div>
      </header>
      <main className="min-w-0 px-4 pb-28 pt-5 sm:px-6 lg:ml-64 lg:px-8 lg:pb-10 lg:pt-8">{children}</main>
      <BottomNav leagueId={league.id} />
    </div>
  );
}
