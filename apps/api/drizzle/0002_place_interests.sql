CREATE TABLE IF NOT EXISTS "place_interests" (
	"id" text PRIMARY KEY NOT NULL,
	"google_place_id" text NOT NULL,
	"diner_id" text NOT NULL,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "place_interests" ADD CONSTRAINT "place_interests_diner_id_users_id_fk" FOREIGN KEY ("diner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "place_interest_uq" ON "place_interests" USING btree ("google_place_id","diner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "place_interest_place_idx" ON "place_interests" USING btree ("google_place_id");