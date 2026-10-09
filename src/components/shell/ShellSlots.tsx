"use client";

import { use } from "react";
import { BottomNav, BottomNavSkeleton } from "./BottomNav";
import type { LeagueChrome } from "./CurrentLeague";
import { LeagueSwitcher, LeagueSwitcherSkeleton } from "./LeagueSwitcher";
import { SidebarNav, SidebarNavSkeleton } from "./SidebarNav";

// The league-dependent parts of the app shell. Each reads the layout's streamed league inside its own Suspense
// boundary (see AppShell); an unknown league keeps the placeholders, and the page shows its not-found state.

type Chrome = { chrome: Promise<LeagueChrome | null> };

export function LeagueSwitcherSlot({ chrome, compact = false }: Chrome & { compact?: boolean }) {
  const value = use(chrome);
  if (!value) return <LeagueSwitcherSkeleton compact={compact} />;
  return <LeagueSwitcher league={value.league} otherLeagues={value.otherLeagues} compact={compact} />;
}

export function SidebarNavSlot({ chrome }: Chrome) {
  const value = use(chrome);
  return value ? <SidebarNav leagueId={value.league.id} /> : <SidebarNavSkeleton />;
}

export function BottomNavSlot({ chrome }: Chrome) {
  const value = use(chrome);
  return value ? <BottomNav leagueId={value.league.id} /> : <BottomNavSkeleton />;
}
