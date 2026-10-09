import { Suspense, type ReactNode } from "react";
import { BottomNavSkeleton } from "./BottomNav";
import { CurrentLeagueProvider, type LeagueChrome } from "./CurrentLeague";
import { LeagueSwitcherSkeleton } from "./LeagueSwitcher";
import { Logo } from "./Logo";
import { BottomNavSlot, LeagueSwitcherSlot, SidebarNavSlot } from "./ShellSlots";
import { SidebarNavSkeleton } from "./SidebarNav";

/**
 * The league frame. It never waits for data: the chrome is in the prerendered HTML, the league switcher and nav links
 * stream in, and the page renders at once (each page has its own loading state).
 */
export function AppShell({ chrome, children }: { chrome: Promise<LeagueChrome | null>; children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-6 border-r border-ink-700 bg-ink-900 px-4 py-6 lg:flex">
        <Logo />
        <Suspense fallback={<LeagueSwitcherSkeleton />}>
          <LeagueSwitcherSlot chrome={chrome} />
        </Suspense>
        <Suspense fallback={<SidebarNavSkeleton />}>
          <SidebarNavSlot chrome={chrome} />
        </Suspense>
      </aside>
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-ink-700 bg-ink-900/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <Logo compact />
        <div className="w-44 min-w-0 sm:w-56">
          <Suspense fallback={<LeagueSwitcherSkeleton compact />}>
            <LeagueSwitcherSlot chrome={chrome} compact />
          </Suspense>
        </div>
      </header>
      <main className="min-w-0 px-4 pb-28 pt-5 sm:px-6 lg:ml-64 lg:px-8 lg:pb-10 lg:pt-8">
        <CurrentLeagueProvider chrome={chrome}>{children}</CurrentLeagueProvider>
      </main>
      <Suspense fallback={<BottomNavSkeleton />}>
        <BottomNavSlot chrome={chrome} />
      </Suspense>
    </div>
  );
}
