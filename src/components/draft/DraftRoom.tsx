"use client";

import type { LeagueAccess } from "@/lib/access/links";
import type { LeagueView } from "@/lib/types";
import { DraftRoomView } from "./DraftRoomView";
import { useLeagueDraft } from "./use-league-draft";

/** A stored league's draft room (or the read-only demo): the server holds the state; useLeagueDraft polls and sends. */
export function DraftRoom({ initial, access }: { initial: LeagueView; access: LeagueAccess }) {
  return <DraftRoomView driver={useLeagueDraft(initial)} access={access} />;
}
