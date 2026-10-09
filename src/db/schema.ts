import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const leagues = pgTable(
  "leagues",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    seasonLabel: text("season_label").notNull(),
    commissionerId: text("commissioner_id").notNull(),
    rounds: smallint("rounds").notNull(),
    draftStatus: text("draft_status", { enum: ["not_started", "live", "paused", "fades", "complete"] }).notNull(),
    /** teamId → line, frozen when the draft starts. */
    lines: jsonb("lines").$type<Record<string, number>>(),
    linesSource: text("lines_source"),
    linesAsOf: timestamp("lines_as_of", { withTimezone: true }),
    linesSeason: text("lines_season"),
    /** Teams whose frozen line the commissioner entered. */
    linesManual: jsonb("lines_manual").$type<string[]>(),
    /** Commissioner-entered lines before the draft starts (teamId → line). */
    lineOverrides: jsonb("line_overrides").$type<Record<string, number>>().notNull().default({}),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "leagues_draft_status_check",
      sql`${t.draftStatus} in ('not_started', 'live', 'paused', 'fades', 'complete')`,
    ),
    check("leagues_demo_reserved_check", sql`${t.id} <> 'demo'`),
  ],
);

export const managers = pgTable(
  "managers",
  {
    leagueId: text("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    seat: smallint("seat").notNull(),
    /** Null means an open seat. */
    displayName: text("display_name"),
  },
  (t) => [primaryKey({ name: "managers_pkey", columns: [t.leagueId, t.id] }), unique("managers_seat_unique").on(t.leagueId, t.seat)],
);

export const picks = pgTable(
  "picks",
  {
    leagueId: text("league_id").notNull(),
    pickNumber: smallint("pick_number").notNull(),
    managerId: text("manager_id").notNull(),
    teamId: text("team_id").notNull(),
    side: text("side", { enum: ["OVER", "UNDER"] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: "picks_pkey", columns: [t.leagueId, t.pickNumber] }),
    unique("picks_side_unique").on(t.leagueId, t.teamId, t.side),
    unique("picks_manager_team_unique").on(t.leagueId, t.managerId, t.teamId),
    check("picks_side_check", sql`${t.side} in ('OVER', 'UNDER')`),
    foreignKey({
      name: "picks_manager_fk",
      columns: [t.leagueId, t.managerId],
      foreignColumns: [managers.leagueId, managers.id],
    }).onDelete("cascade"),
  ],
);

/** One fade per manager, locked once stored. Its target is another manager's pick (checked under the league lock). */
export const fades = pgTable(
  "fades",
  {
    leagueId: text("league_id").notNull(),
    managerId: text("manager_id").notNull(),
    targetPickNumber: smallint("target_pick_number").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: "fades_pkey", columns: [t.leagueId, t.managerId] }),
    foreignKey({
      name: "fades_manager_fk",
      columns: [t.leagueId, t.managerId],
      foreignColumns: [managers.leagueId, managers.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "fades_target_fk",
      columns: [t.leagueId, t.targetPickNumber],
      foreignColumns: [picks.leagueId, picks.pickNumber],
    }).onDelete("cascade"),
  ],
);

export const accessLinks = pgTable(
  "access_links",
  {
    id: text("id").primaryKey(),
    leagueId: text("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    /** Null only for a league invite. */
    managerId: text("manager_id"),
    kind: text("kind", { enum: ["league_invite", "seat_invite", "personal"] }).notNull(),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    usedAt: timestamp("used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    check("access_links_kind_check", sql`${t.kind} in ('league_invite', 'seat_invite', 'personal')`),
    check("access_links_seat_check", sql`(${t.kind} = 'league_invite') = (${t.managerId} is null)`),
    foreignKey({
      name: "access_links_manager_fk",
      columns: [t.leagueId, t.managerId],
      foreignColumns: [managers.leagueId, managers.id],
    }).onDelete("cascade"),
    uniqueIndex("access_links_one_league_invite")
      .on(t.leagueId)
      .where(sql`${t.kind} = 'league_invite' and ${t.revokedAt} is null`),
    uniqueIndex("access_links_one_seat_link")
      .on(t.leagueId, t.managerId, t.kind)
      .where(sql`${t.kind} <> 'league_invite' and ${t.usedAt} is null and ${t.revokedAt} is null`),
  ],
);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Hex SHA-256 of the cookie token. The token itself is never stored. */
  tokenHash: text("token_hash").notNull().unique("sessions_token_hash_unique"),
  createdAt: createdAt(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const sessionSeats = pgTable(
  "session_seats",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    leagueId: text("league_id").notNull(),
    managerId: text("manager_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: "session_seats_pkey", columns: [t.sessionId, t.leagueId] }),
    foreignKey({
      name: "session_seats_manager_fk",
      columns: [t.leagueId, t.managerId],
      foreignColumns: [managers.leagueId, managers.id],
    }).onDelete("cascade"),
    index("session_seats_by_seat").on(t.leagueId, t.managerId),
  ],
);

/** Regular-season records by season (end year: 2027 for 2026–27) and team. Shared by every league in the season. */
export const teamRecords = pgTable(
  "team_records",
  {
    season: smallint("season").notNull(),
    teamId: text("team_id").notNull(),
    wins: smallint("wins").notNull(),
    losses: smallint("losses").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "team_records_pkey", columns: [t.season, t.teamId] }),
    check("team_records_wins_check", sql`${t.wins} >= 0`),
    check("team_records_losses_check", sql`${t.losses} >= 0`),
    check("team_records_games_check", sql`${t.wins} + ${t.losses} <= 82`),
  ],
);

/** One row per season: the last successful refresh, and the last attempt with its error. Locked during a refresh. */
export const recordRefreshes = pgTable("record_refreshes", {
  season: smallint("season").primaryKey(),
  source: text("source").notNull(),
  succeededAt: timestamp("succeeded_at", { withTimezone: true }),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull(),
  /** Why the last attempt failed; null when it succeeded. */
  error: text("error"),
});
