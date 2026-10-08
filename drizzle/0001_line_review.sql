ALTER TABLE "leagues" ADD COLUMN "lines_season" text;--> statement-breakpoint
ALTER TABLE "leagues" ADD COLUMN "lines_manual" jsonb;--> statement-breakpoint
ALTER TABLE "leagues" ADD COLUMN "line_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL;