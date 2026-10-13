CREATE TABLE "challenge_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"season" smallint NOT NULL,
	"owner_session_id" uuid,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"saved_at" timestamp with time zone NOT NULL,
	CONSTRAINT "challenge_entries_owner_unique" UNIQUE("season","owner_session_id")
);
--> statement-breakpoint
CREATE TABLE "challenge_line_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" smallint NOT NULL,
	"source" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone NOT NULL,
	"lines" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenge_picks" (
	"entry_id" text NOT NULL,
	"team_id" text NOT NULL,
	"side" text NOT NULL,
	"line_at_pick" real,
	"picked_at" timestamp with time zone NOT NULL,
	CONSTRAINT "challenge_picks_pkey" PRIMARY KEY("entry_id","team_id"),
	CONSTRAINT "challenge_picks_side_check" CHECK ("challenge_picks"."side" in ('OVER', 'UNDER'))
);
--> statement-breakpoint
CREATE TABLE "challenge_seasons" (
	"season" smallint PRIMARY KEY NOT NULL,
	"opening_tipoff" timestamp with time zone,
	"opening_teams" jsonb,
	"deadline" timestamp with time zone,
	"schedule_checked_at" timestamp with time zone,
	"schedule_error" text,
	"locked_at" timestamp with time zone,
	"frozen_lines" jsonb,
	"frozen_line_times" jsonb,
	"frozen_missing" jsonb,
	"frozen_source" text,
	CONSTRAINT "challenge_seasons_freeze_check" CHECK ("challenge_seasons"."locked_at" is null or ("challenge_seasons"."frozen_lines" is not null and "challenge_seasons"."frozen_line_times" is not null and "challenge_seasons"."frozen_missing" is not null and "challenge_seasons"."frozen_source" is not null))
);
--> statement-breakpoint
ALTER TABLE "challenge_entries" ADD CONSTRAINT "challenge_entries_season_challenge_seasons_season_fk" FOREIGN KEY ("season") REFERENCES "public"."challenge_seasons"("season") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_entries" ADD CONSTRAINT "challenge_entries_owner_session_id_sessions_id_fk" FOREIGN KEY ("owner_session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_picks" ADD CONSTRAINT "challenge_picks_entry_id_challenge_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."challenge_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "challenge_entries_by_season" ON "challenge_entries" USING btree ("season");--> statement-breakpoint
CREATE UNIQUE INDEX "challenge_line_snapshots_observed" ON "challenge_line_snapshots" USING btree ("season","observed_at");