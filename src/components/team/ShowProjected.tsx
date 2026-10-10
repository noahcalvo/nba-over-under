"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type ShowProjectedState = readonly [showProjected: boolean, setShowProjected: (value: boolean) => void];

const ShowProjectedContext = createContext<ShowProjectedState | null>(null);

/** Held by the teams layout, so the "Show projected" switch keeps its value while moving between team pages. */
export function ShowProjectedProvider({ children }: { children: ReactNode }) {
  const state = useState(true);
  return <ShowProjectedContext.Provider value={state}>{children}</ShowProjectedContext.Provider>;
}

/** The shared switch value; outside the teams layout, a local one that starts on. */
export function useShowProjected(): ShowProjectedState {
  const shared = useContext(ShowProjectedContext);
  const local = useState(true);
  return shared ?? local;
}
