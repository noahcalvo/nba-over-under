ALTER TABLE "leagues" ADD COLUMN "blocked_pick" smallint;--> statement-breakpoint
ALTER TABLE "picks" ADD COLUMN "voided" boolean DEFAULT false NOT NULL;