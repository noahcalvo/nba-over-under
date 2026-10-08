CREATE TABLE "record_refreshes" (
	"season" smallint PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"succeeded_at" timestamp with time zone,
	"attempted_at" timestamp with time zone NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "team_records" (
	"season" smallint NOT NULL,
	"team_id" text NOT NULL,
	"wins" smallint NOT NULL,
	"losses" smallint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_records_pkey" PRIMARY KEY("season","team_id"),
	CONSTRAINT "team_records_wins_check" CHECK ("team_records"."wins" >= 0),
	CONSTRAINT "team_records_losses_check" CHECK ("team_records"."losses" >= 0),
	CONSTRAINT "team_records_games_check" CHECK ("team_records"."wins" + "team_records"."losses" <= 82)
);
