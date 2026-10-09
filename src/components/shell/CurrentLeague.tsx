"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { LeagueSummary } from "./LeagueSwitcher";

/** What the league layout knows. Page loading states read it so their headers draw before the page's data. */
export interface CurrentLeague {
  id: string;
  name: string;
  seasonLabel: string;
  isDemo: boolean;
}

/** The layout's data, streamed: the shell renders without waiting for it. Null for an unknown league. */
export interface LeagueChrome {
  league: CurrentLeague;
  otherLeagues: LeagueSummary[];
}

const CurrentLeagueContext = createContext<CurrentLeague | null>(null);

/**
 * Provides the league once the layout's promise settles, without suspending, so the page below renders at once.
 * Null until then (a direct visit's first paint) and while another league's promise is pending.
 */
export function CurrentLeagueProvider({ chrome, children }: { chrome: Promise<LeagueChrome | null>; children: ReactNode }) {
  const [settled, setSettled] = useState<{ source: Promise<LeagueChrome | null>; league: CurrentLeague | null } | null>(
    null,
  );
  useEffect(() => {
    let live = true;
    chrome.then(
      (value) => live && setSettled({ source: chrome, league: value?.league ?? null }),
      () => live && setSettled({ source: chrome, league: null }),
    );
    return () => {
      live = false;
    };
  }, [chrome]);
  const league = settled?.source === chrome ? settled.league : null;
  return <CurrentLeagueContext.Provider value={league}>{children}</CurrentLeagueContext.Provider>;
}

/** Null outside a league layout and until the league is known. */
export function useCurrentLeague(): CurrentLeague | null {
  return useContext(CurrentLeagueContext);
}
