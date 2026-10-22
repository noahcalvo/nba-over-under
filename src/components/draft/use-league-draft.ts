"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { DRAFT_POLL_INTERVAL_MS } from "@/config/league";
import type { DraftCommand } from "@/lib/fades";
import type { LeagueConfig } from "@/lib/league/config";
import type { LeagueView } from "@/lib/types";
import type { DraftRoomDriver } from "./DraftRoomView";

/** Holds the live league view: polls for other managers' picks and fades (until the draft is complete) and sends this viewer's actions. */
export function useLeagueDraft(initial: LeagueView): DraftRoomDriver {
  const router = useRouter();
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

  // The layout banner is server-rendered: when the league turns archived, refresh once so it appears.
  const archived = view.league.archivedAt !== null;
  const wasArchived = useRef(archived);
  useEffect(() => {
    if (archived && !wasArchived.current) router.refresh();
    wasArchived.current = archived;
  }, [archived, router]);

  const shouldPoll = !view.league.isDemo && view.league.draft.status !== "complete" && !archived;
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
        // Other league pages reuse their last render for a minute (unstable_dynamicStaleTime); drop those so they
        // show this change.
        router.refresh();
        return true;
      } catch {
        setError("Couldn't reach the server. Try again.");
        return false;
      } finally {
        setPending(false);
      }
    },
    [accept, refresh, router],
  );

  const dispatch = useCallback((action: DraftCommand) => send(endpoint, "POST", action), [send, endpoint]);

  const saveLineOverrides = useCallback(
    (overrides: Record<string, number>) => send(`/api/leagues/${initial.league.id}/lines`, "PUT", { overrides }),
    [send, initial.league.id],
  );

  const saveConfig = useCallback(
    (config: LeagueConfig) => send(`/api/leagues/${initial.league.id}/config`, "PUT", config),
    [send, initial.league.id],
  );

  const saveDraftOrder = useCallback(
    (order: string[]) => send(`/api/leagues/${initial.league.id}/order`, "PUT", { order }),
    [send, initial.league.id],
  );

  const dismissError = useCallback(() => setError(null), []);

  return { view, error, pending, dispatch, saveLineOverrides, saveConfig, saveDraftOrder, dismissError };
}
