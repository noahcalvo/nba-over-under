"use client";

import { createContext, useContext, type ReactNode } from "react";

/** What the league layout already knows. Page loading states read it so their headers draw before the page's data. */
export interface CurrentLeague {
  id: string;
  name: string;
  seasonLabel: string;
  isDemo: boolean;
}

const CurrentLeagueContext = createContext<CurrentLeague | null>(null);

export function CurrentLeagueProvider({ league, children }: { league: CurrentLeague; children: ReactNode }) {
  return <CurrentLeagueContext.Provider value={league}>{children}</CurrentLeagueContext.Provider>;
}

/** Null outside a league layout. */
export function useCurrentLeague(): CurrentLeague | null {
  return useContext(CurrentLeagueContext);
}
