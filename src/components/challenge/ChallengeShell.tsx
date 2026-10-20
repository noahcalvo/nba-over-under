import type { ReactNode } from "react";
import { Logo } from "@/components/shell/Logo";
import { CHALLENGE } from "@/config/challenge";
import { ChallengeLeagues } from "./ChallengeLeagues";
import { ChallengeBottomNav, ChallengeSidebarNav } from "./ChallengeNav";

/**
 * The challenge frame: sidebar from lg, bottom tab bar below it. Prerendered; only the mobile header's league menu
 * streams in (it reads the session).
 */
export function ChallengeShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-6 border-r border-ink-700 bg-ink-900 px-4 py-6 lg:flex">
        <div className="flex flex-col gap-2">
          <Logo />
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-fog-400">{CHALLENGE.season} NBA SEASON</p>
        </div>
        <ChallengeSidebarNav />
      </aside>
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-ink-700 bg-ink-900/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <Logo compact />
        <div className="w-44 min-w-0 sm:w-56">
          <ChallengeLeagues />
        </div>
      </header>
      <main className="min-w-0 px-4 pb-28 pt-5 sm:px-6 lg:ml-64 lg:px-8 lg:pb-10 lg:pt-8">{children}</main>
      <ChallengeBottomNav />
    </div>
  );
}
