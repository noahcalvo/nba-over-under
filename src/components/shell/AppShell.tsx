import { Suspense, type ReactNode } from "react";
import { AccountSlot } from "@/components/account/AccountSlot";
import { LegacyNotice } from "@/components/account/LegacyNotice";
import { BottomNavSkeleton } from "./BottomNav";
import { CurrentLeagueProvider, type LeagueChrome } from "./CurrentLeague";
import { GlobalNav } from "./GlobalNav";
import { LeagueSwitcherSkeleton } from "./LeagueSwitcher";
import { Logo } from "./Logo";
import { MobileHeader } from "./MobileHeader";
import { BottomNavSlot, GlobalNavSlot, LeagueSwitcherSlot, SidebarNavSlot } from "./ShellSlots";
import { SidebarNavSkeleton } from "./SidebarNav";

/**
 * The league frame. It never waits for data: the chrome is in the prerendered HTML, the league switcher and nav links
 * stream in, and the page renders at once (each page has its own loading state).
 */
export function AppShell({ chrome, children }: { chrome: Promise<LeagueChrome | null>; children: ReactNode }) {
  const account = <AccountSlot placement="tab" />;
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
        <div className="mt-auto">
          <AccountSlot placement="sidebar" />
        </div>
      </aside>
      <MobileHeader
        leagues={
          <Suspense fallback={<LeagueSwitcherSkeleton compact />}>
            <LeagueSwitcherSlot chrome={chrome} compact />
          </Suspense>
        }
        nav={
          <Suspense fallback={<GlobalNav />}>
            <GlobalNavSlot chrome={chrome} />
          </Suspense>
        }
      />
      <main className="min-w-0 px-4 pb-28 pt-5 sm:px-6 lg:ml-64 lg:px-8 lg:pb-10 lg:pt-8">
        <LegacyNotice />
        <CurrentLeagueProvider chrome={chrome}>{children}</CurrentLeagueProvider>
      </main>
      <Suspense fallback={<BottomNavSkeleton account={account} />}>
        <BottomNavSlot chrome={chrome} account={account} />
      </Suspense>
    </div>
  );
}
