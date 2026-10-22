import "server-only";
import { findLink, listActiveLinks } from "@/db/links";
import { linkPath, NO_ACCESS, type LeagueAccess, type LinkRecord } from "@/lib/access/links";
import { signLinkId, verifyLinkToken } from "@/lib/access/tokens";
import type { League } from "@/lib/types";
import { getDb, serverConfig } from "@/server/db";

export async function pathForLink(linkId: string): Promise<string> {
  return linkPath(await signLinkId(linkId, serverConfig().linkSecret));
}

/** The link id in a token when its signature is valid. Needs no database read. */
export function verifyLink(token: string): Promise<string | null> {
  return verifyLinkToken(token, serverConfig().linkSecret);
}

/** The link a token points at, for display only. A claim rechecks the link under the league lock. */
export async function readLinkToken(token: string): Promise<LinkRecord | null> {
  const linkId = await verifyLink(token);
  return linkId ? findLink(await getDb(), linkId) : null;
}

/** The links this viewer may see: the league invite and pending seat invites, for the commissioner only. */
export async function getLeagueAccess(league: League, viewerId: string | null): Promise<LeagueAccess> {
  if (league.isDemo || viewerId !== league.commissionerId) return NO_ACCESS;
  let invitePath: string | null = null;
  const seatInvitePaths: Record<string, string> = {};
  for (const link of await listActiveLinks(await getDb(), league.id)) {
    if (link.kind === "league_invite") {
      invitePath = await pathForLink(link.id);
    } else if (link.kind === "seat_invite" && link.managerId) {
      seatInvitePaths[link.managerId] = await pathForLink(link.id);
    }
  }
  return { invitePath, seatInvitePaths };
}
