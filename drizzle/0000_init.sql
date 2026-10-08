CREATE TABLE "access_links" (
	"id" text PRIMARY KEY NOT NULL,
	"league_id" text NOT NULL,
	"manager_id" text,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "access_links_kind_check" CHECK ("access_links"."kind" in ('league_invite', 'seat_invite', 'personal')),
	CONSTRAINT "access_links_seat_check" CHECK (("access_links"."kind" = 'league_invite') = ("access_links"."manager_id" is null))
);
--> statement-breakpoint
CREATE TABLE "leagues" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"season_label" text NOT NULL,
	"commissioner_id" text NOT NULL,
	"rounds" smallint NOT NULL,
	"draft_status" text NOT NULL,
	"lines" jsonb,
	"lines_source" text,
	"lines_as_of" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leagues_draft_status_check" CHECK ("leagues"."draft_status" in ('not_started', 'live', 'paused', 'complete')),
	CONSTRAINT "leagues_demo_reserved_check" CHECK ("leagues"."id" <> 'demo')
);
--> statement-breakpoint
CREATE TABLE "managers" (
	"league_id" text NOT NULL,
	"id" text NOT NULL,
	"seat" smallint NOT NULL,
	"display_name" text,
	CONSTRAINT "managers_pkey" PRIMARY KEY("league_id","id"),
	CONSTRAINT "managers_seat_unique" UNIQUE("league_id","seat")
);
--> statement-breakpoint
CREATE TABLE "picks" (
	"league_id" text NOT NULL,
	"pick_number" smallint NOT NULL,
	"manager_id" text NOT NULL,
	"team_id" text NOT NULL,
	"side" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "picks_pkey" PRIMARY KEY("league_id","pick_number"),
	CONSTRAINT "picks_side_unique" UNIQUE("league_id","team_id","side"),
	CONSTRAINT "picks_manager_team_unique" UNIQUE("league_id","manager_id","team_id"),
	CONSTRAINT "picks_side_check" CHECK ("picks"."side" in ('OVER', 'UNDER'))
);
--> statement-breakpoint
CREATE TABLE "session_seats" (
	"session_id" uuid NOT NULL,
	"league_id" text NOT NULL,
	"manager_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_seats_pkey" PRIMARY KEY("session_id","league_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "access_links" ADD CONSTRAINT "access_links_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_links" ADD CONSTRAINT "access_links_manager_fk" FOREIGN KEY ("league_id","manager_id") REFERENCES "public"."managers"("league_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managers" ADD CONSTRAINT "managers_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "picks" ADD CONSTRAINT "picks_manager_fk" FOREIGN KEY ("league_id","manager_id") REFERENCES "public"."managers"("league_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_seats" ADD CONSTRAINT "session_seats_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_seats" ADD CONSTRAINT "session_seats_manager_fk" FOREIGN KEY ("league_id","manager_id") REFERENCES "public"."managers"("league_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "access_links_one_league_invite" ON "access_links" USING btree ("league_id") WHERE "access_links"."kind" = 'league_invite' and "access_links"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "access_links_one_seat_link" ON "access_links" USING btree ("league_id","manager_id","kind") WHERE "access_links"."kind" <> 'league_invite' and "access_links"."used_at" is null and "access_links"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "session_seats_by_seat" ON "session_seats" USING btree ("league_id","manager_id");