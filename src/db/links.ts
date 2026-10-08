import { and, asc, eq, gt, isNull, or, sql } from "drizzle-orm";
import type { LinkKind, LinkRecord } from "@/lib/access/links";
import { createLinkId } from "@/lib/access/tokens";
import type { Db } from "./client";
import { accessLinks } from "./schema";

const LINK_COLUMNS = {
  id: accessLinks.id,
  leagueId: accessLinks.leagueId,
  managerId: accessLinks.managerId,
  kind: accessLinks.kind,
  expiresAt: accessLinks.expiresAt,
  usedAt: accessLinks.usedAt,
  revokedAt: accessLinks.revokedAt,
};

const stillWorks = () =>
  and(
    isNull(accessLinks.revokedAt),
    isNull(accessLinks.usedAt),
    or(isNull(accessLinks.expiresAt), gt(accessLinks.expiresAt, sql`now()`)),
  );

/** Creates a link and returns its id. Revoke the previous link of the same kind first (a unique index enforces it). */
export async function issueLink(
  db: Db,
  input: { leagueId: string; managerId: string | null; kind: LinkKind; expiresInDays?: number },
): Promise<string> {
  const id = createLinkId();
  await db.insert(accessLinks).values({
    id,
    leagueId: input.leagueId,
    managerId: input.managerId,
    kind: input.kind,
    expiresAt: input.expiresInDays ? sql`now() + make_interval(days => ${input.expiresInDays})` : null,
  });
  return id;
}

/** Revokes the unrevoked, unused links of one kind for a seat, or for the league when managerId is omitted. */
export async function revokeLinks(db: Db, input: { leagueId: string; kind: LinkKind; managerId?: string }): Promise<void> {
  await db
    .update(accessLinks)
    .set({ revokedAt: sql`now()` })
    .where(
      and(
        eq(accessLinks.leagueId, input.leagueId),
        eq(accessLinks.kind, input.kind),
        input.managerId === undefined ? undefined : eq(accessLinks.managerId, input.managerId),
        isNull(accessLinks.revokedAt),
        isNull(accessLinks.usedAt),
      ),
    );
}

export async function findLink(db: Db, linkId: string): Promise<LinkRecord | null> {
  const [row] = await db.select(LINK_COLUMNS).from(accessLinks).where(eq(accessLinks.id, linkId));
  return row ?? null;
}

/** The link plus the database clock. Call it inside the transaction that holds the league lock. */
export async function findLinkAt(db: Db, linkId: string): Promise<{ link: LinkRecord; now: Date } | null> {
  const [row] = await db
    .select({ ...LINK_COLUMNS, now: sql<Date>`now()`.mapWith(accessLinks.createdAt) })
    .from(accessLinks)
    .where(eq(accessLinks.id, linkId));
  if (!row) return null;
  const { now, ...link } = row;
  return { link, now };
}

/** Consumes a seat invite. False unless exactly this call used it (not already used, revoked or expired). */
export async function markSeatInviteUsed(db: Db, linkId: string): Promise<boolean> {
  const rows = await db
    .update(accessLinks)
    .set({ usedAt: sql`now()` })
    .where(and(eq(accessLinks.id, linkId), eq(accessLinks.kind, "seat_invite"), stillWorks()))
    .returning({ id: accessLinks.id });
  return rows.length === 1;
}

/** Every link of the league that still works, oldest first. */
export async function listActiveLinks(db: Db, leagueId: string): Promise<LinkRecord[]> {
  return db
    .select(LINK_COLUMNS)
    .from(accessLinks)
    .where(and(eq(accessLinks.leagueId, leagueId), stillWorks()))
    .orderBy(asc(accessLinks.createdAt));
}
