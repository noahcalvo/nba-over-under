/** league_invite: shared, claims any open seat. seat_invite: single use, re-claims a reset seat. personal: signs in. */
export type LinkKind = "league_invite" | "seat_invite" | "personal";

export type LinkStatus = "active" | "revoked" | "used" | "expired";

export interface LinkRecord {
  id: string;
  leagueId: string;
  /** Null only for a league invite. */
  managerId: string | null;
  kind: LinkKind;
  expiresAt: Date | null;
  usedAt: Date | null;
  revokedAt: Date | null;
}

/** Whether a link still works at `now`. Callers inside a transaction pass the database clock. */
export function linkStatus(link: Pick<LinkRecord, "expiresAt" | "usedAt" | "revokedAt">, now: Date): LinkStatus {
  if (link.revokedAt) return "revoked";
  if (link.usedAt) return "used";
  if (link.expiresAt && link.expiresAt.getTime() <= now.getTime()) return "expired";
  return "active";
}

/** The app path a link token opens. */
export function linkPath(token: string): string {
  return `/i/${token}`;
}

/** The links a viewer may see in a league. Spectators see none. */
export interface LeagueAccess {
  /** Commissioner only. */
  invitePath: string | null;
  /** Commissioner only: managerId → path of that seat's pending seat invite. */
  seatInvitePaths: Readonly<Record<string, string>>;
  /** The viewer's own personal link. */
  personalPath: string | null;
}

export const NO_ACCESS: LeagueAccess = { invitePath: null, seatInvitePaths: {}, personalPath: null };
