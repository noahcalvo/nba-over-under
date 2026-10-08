"use client";

import { useCallback, useEffect, useState } from "react";
import { DRAFT_POLL_INTERVAL_MS } from "@/config/league";
import type { DraftAction } from "@/lib/draft";
import type { LeagueView } from "@/lib/types";

/** Holds the live league view: polls for other managers' picks and sends this viewer's actions. */
export function useLeagueDraft(initial: LeagueView) {
  const [view, setView] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const endpoint = `/api/leagues/${initial.league.id}/draft`;

  // Responses can arrive out of order (a poll racing an action); keep the newest version.
  const accept = useCallback((next: LeagueView) => {
    setView((current) => (next.league.version >= current.league.version ? next : current));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (response.ok) accept((await response.json()) as LeagueView);
    } catch {
      // Keep the last known state; the next poll retries.
    }
  }, [endpoint, accept]);

  const shouldPoll = !view.league.isDemo && view.league.draft.status !== "complete";
  useEffect(() => {
    if (!shouldPoll) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, DRAFT_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [shouldPoll, refresh]);

  const send = useCallback(
    async (url: string, method: string, body: unknown): Promise<boolean> => {
      setPending(true);
      setError(null);
      try {
        const response = await fetch(url, {
          method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await response.json();
        if (!response.ok) {
          setError(typeof data?.message === "string" ? data.message : "Something went wrong.");
          void refresh();
          return false;
        }
        accept(data as LeagueView);
        return true;
      } catch {
        setError("Couldn't reach the server. Try again.");
        return false;
      } finally {
        setPending(false);
      }
    },
    [accept, refresh],
  );

  const dispatch = useCallback((action: DraftAction) => send(endpoint, "POST", action), [send, endpoint]);

  const saveLineOverrides = useCallback(
    (overrides: Record<string, number>) => send(`/api/leagues/${initial.league.id}/lines`, "PUT", { overrides }),
    [send, initial.league.id],
  );

  const dismissError = useCallback(() => setError(null), []);

  return { view, error, pending, dispatch, saveLineOverrides, dismissError };
}
