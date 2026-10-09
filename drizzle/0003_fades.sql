CREATE TABLE "fades" (
	"league_id" text NOT NULL,
	"manager_id" text NOT NULL,
	"target_pick_number" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fades_pkey" PRIMARY KEY("league_id","manager_id")
);
--> statement-breakpoint
ALTER TABLE "leagues" DROP CONSTRAINT "leagues_draft_status_check";--> statement-breakpoint
ALTER TABLE "fades" ADD CONSTRAINT "fades_manager_fk" FOREIGN KEY ("league_id","manager_id") REFERENCES "public"."managers"("league_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fades" ADD CONSTRAINT "fades_target_fk" FOREIGN KEY ("league_id","target_pick_number") REFERENCES "public"."picks"("league_id","pick_number") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_draft_status_check" CHECK ("leagues"."draft_status" in ('not_started', 'live', 'paused', 'fades', 'complete'));--> statement-breakpoint
-- Leagues that finished their team picks before the fade stage existed have no fades yet: reopen them for fades.
UPDATE "leagues" SET "draft_status" = 'fades' WHERE "draft_status" = 'complete';