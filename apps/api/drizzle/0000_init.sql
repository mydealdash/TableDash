CREATE TYPE "public"."channel" AS ENUM('APP', 'WEB', 'WIDGET', 'PARTNER', 'AI_AGENT', 'PHONE', 'WALK_IN');--> statement-breakpoint
CREATE TYPE "public"."deposit_type" AS ENUM('NONE', 'CARD_HOLD', 'DEPOSIT_PER_PERSON', 'DEPOSIT_PER_PARTY');--> statement-breakpoint
CREATE TYPE "public"."diner_tier" AS ENUM('STANDARD', 'GOLD');--> statement-breakpoint
CREATE TYPE "public"."notify_status" AS ENUM('ACTIVE', 'ALERTED', 'BOOKED', 'EXPIRED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."payment_kind" AS ENUM('CARD_HOLD', 'DEPOSIT', 'NO_SHOW_FEE', 'LATE_CANCEL_FEE', 'REFUND');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('AUTHORIZED', 'CAPTURED', 'VOIDED', 'REFUNDED', 'WAIVED', 'FAILED', 'DISPUTED');--> statement-breakpoint
CREATE TYPE "public"."platform_role" AS ENUM('DINER', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('REQUESTED', 'CONFIRMED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'DECLINED');--> statement-breakpoint
CREATE TYPE "public"."restaurant_status" AS ENUM('ONBOARDING', 'LIVE', 'PAUSED', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('PUBLISHED', 'FLAGGED', 'REMOVED');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('OWNER', 'MANAGER', 'HOST', 'SERVER', 'MARKETING', 'READ_ONLY');--> statement-breakpoint
CREATE TYPE "public"."table_status" AS ENUM('AVAILABLE', 'SEATED', 'APPETIZER', 'ENTREE', 'DESSERT', 'CHECK_DROPPED', 'PAID', 'BUSSING', 'OUT_OF_SERVICE');--> statement-breakpoint
CREATE TYPE "public"."waitlist_status" AS ENUM('WAITING', 'NOTIFIED', 'SEATED', 'LEFT', 'REMOVED');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text,
	"restaurant_id" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "billable_covers" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"reservation_id" text NOT NULL,
	"covers" integer NOT NULL,
	"channel" "channel" NOT NULL,
	"month" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billable_covers_reservation_id_unique" UNIQUE("reservation_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "closures" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"date" text NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dining_tables" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"room_id" text,
	"name" text NOT NULL,
	"min_covers" integer NOT NULL,
	"max_covers" integer NOT NULL,
	"table_type" text DEFAULT 'DINING_ROOM' NOT NULL,
	"section" text,
	"x" integer DEFAULT 0 NOT NULL,
	"y" integer DEFAULT 0 NOT NULL,
	"width" integer DEFAULT 80 NOT NULL,
	"height" integer DEFAULT 80 NOT NULL,
	"shape" text DEFAULT 'rect' NOT NULL,
	"combinable_with" text[] DEFAULT '{}' NOT NULL,
	"online_bookable" boolean DEFAULT true NOT NULL,
	"status" "table_status" DEFAULT 'AVAILABLE' NOT NULL,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"current_reservation_id" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "guest_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"diner_id" text,
	"first_name" text NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"phone" text,
	"email" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"allergies" text DEFAULT '' NOT NULL,
	"is_vip" boolean DEFAULT false NOT NULL,
	"visit_count" integer DEFAULT 0 NOT NULL,
	"no_show_count" integer DEFAULT 0 NOT NULL,
	"cancel_count" integer DEFAULT 0 NOT NULL,
	"total_spend_cents" integer DEFAULT 0 NOT NULL,
	"last_visit_at" timestamp with time zone,
	"marketing_consent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "holds" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"diner_id" text,
	"session_key" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"party_size" integer NOT NULL,
	"table_type" text,
	"table_ids" text[] NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "loyalty_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"points" integer NOT NULL,
	"reason" text NOT NULL,
	"reservation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"to" text NOT NULL,
	"template" text NOT NULL,
	"body" text NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notify_dispatches" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"slot_starts_at" timestamp with time zone NOT NULL,
	"tier" integer NOT NULL,
	"send_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notify_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"diner_id" text NOT NULL,
	"date" text NOT NULL,
	"from_time" text NOT NULL,
	"to_time" text NOT NULL,
	"party_size" integer NOT NULL,
	"table_type" text,
	"status" "notify_status" DEFAULT 'ACTIVE' NOT NULL,
	"last_alert_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "otp_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"code" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_methods" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text DEFAULT 'mock' NOT NULL,
	"token" text NOT NULL,
	"brand" text NOT NULL,
	"last4" text NOT NULL,
	"exp_month" integer NOT NULL,
	"exp_year" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"reservation_id" text NOT NULL,
	"kind" "payment_kind" NOT NULL,
	"status" "payment_status" NOT NULL,
	"amount_cents" integer NOT NULL,
	"platform_fee_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"provider_ref" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "policies" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"version" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"cancel_cutoff_hours" integer DEFAULT 24 NOT NULL,
	"deposit_type" "deposit_type" DEFAULT 'NONE' NOT NULL,
	"deposit_amount_cents" integer DEFAULT 0 NOT NULL,
	"no_show_fee_cents" integer DEFAULT 0 NOT NULL,
	"late_cancel_fee_cents" integer DEFAULT 0 NOT NULL,
	"min_party_for_deposit" integer DEFAULT 1 NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reservation_events" (
	"id" text PRIMARY KEY NOT NULL,
	"reservation_id" text NOT NULL,
	"type" text NOT NULL,
	"actor_id" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"restaurant_id" text NOT NULL,
	"diner_id" text,
	"guest_profile_id" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"party_size" integer NOT NULL,
	"table_type" text,
	"table_ids" text[] DEFAULT '{}' NOT NULL,
	"status" "reservation_status" DEFAULT 'CONFIRMED' NOT NULL,
	"channel" "channel" NOT NULL,
	"source" text,
	"is_network_cover" boolean DEFAULT true NOT NULL,
	"occasion" text,
	"special_request" text,
	"guest_name" text NOT NULL,
	"guest_phone" text,
	"guest_email" text,
	"policy_id" text,
	"payment_method_id" text,
	"confirmed_by_guest_at" timestamp with time zone,
	"reminder_sent_at" timestamp with time zone,
	"seated_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" text,
	"idempotency_key" text,
	"spend_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservations_code_unique" UNIQUE("code"),
	CONSTRAINT "reservations_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "restaurant_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "restaurants" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"group_id" text,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"cuisine" text NOT NULL,
	"price_band" integer DEFAULT 2 NOT NULL,
	"neighborhood" text DEFAULT '' NOT NULL,
	"city" text NOT NULL,
	"address" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"phone" text,
	"photos" text[] DEFAULT '{}' NOT NULL,
	"menu_url" text,
	"features" text[] DEFAULT '{}' NOT NULL,
	"status" "restaurant_status" DEFAULT 'ONBOARDING' NOT NULL,
	"plan" text DEFAULT 'CORE' NOT NULL,
	"online_booking_enabled" boolean DEFAULT true NOT NULL,
	"booking_window_days" integer DEFAULT 30 NOT NULL,
	"max_party_online" integer DEFAULT 8 NOT NULL,
	"large_party_request_max" integer DEFAULT 20 NOT NULL,
	"hold_minutes" integer DEFAULT 5 NOT NULL,
	"grace_minutes" integer DEFAULT 15 NOT NULL,
	"max_active_bookings_per_diner" integer DEFAULT 2 NOT NULL,
	"rating_avg" double precision DEFAULT 0 NOT NULL,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "restaurants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"reservation_id" text NOT NULL,
	"restaurant_id" text NOT NULL,
	"diner_id" text NOT NULL,
	"rating" integer NOT NULL,
	"food_rating" integer,
	"service_rating" integer,
	"ambience_rating" integer,
	"text" text DEFAULT '' NOT NULL,
	"reply" text,
	"status" "review_status" DEFAULT 'PUBLISHED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_reservation_id_unique" UNIQUE("reservation_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rooms" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saved_restaurants" (
	"user_id" text NOT NULL,
	"restaurant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_restaurants_user_id_restaurant_id_pk" PRIMARY KEY("user_id","restaurant_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shifts" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"name" text NOT NULL,
	"days_of_week" integer[] NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"slot_interval" integer DEFAULT 15 NOT NULL,
	"max_covers_per_slot" integer,
	"max_parties_per_slot" integer,
	"online_enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff_memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"restaurant_id" text NOT NULL,
	"role" "staff_role" NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "turn_times" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"min_party" integer NOT NULL,
	"max_party" integer NOT NULL,
	"minutes" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"phone" text,
	"password_hash" text,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"platform_role" "platform_role" DEFAULT 'DINER' NOT NULL,
	"tier" "diner_tier" DEFAULT 'STANDARD' NOT NULL,
	"dietary_notes" text,
	"seating_pref" text,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"completed_count" integer DEFAULT 0 NOT NULL,
	"push_token" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "waitlist_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"diner_id" text,
	"guest_name" text NOT NULL,
	"guest_phone" text NOT NULL,
	"party_size" integer NOT NULL,
	"notes" text,
	"quoted_minutes" integer NOT NULL,
	"status" "waitlist_status" DEFAULT 'WAITING' NOT NULL,
	"joined_remotely" boolean DEFAULT false NOT NULL,
	"notified_at" timestamp with time zone,
	"seated_at" timestamp with time zone,
	"table_ids" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "closures" ADD CONSTRAINT "closures_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "guest_profiles" ADD CONSTRAINT "guest_profiles_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "guest_profiles" ADD CONSTRAINT "guest_profiles_diner_id_users_id_fk" FOREIGN KEY ("diner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "holds" ADD CONSTRAINT "holds_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "holds" ADD CONSTRAINT "holds_diner_id_users_id_fk" FOREIGN KEY ("diner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "loyalty_entries" ADD CONSTRAINT "loyalty_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notify_dispatches" ADD CONSTRAINT "notify_dispatches_subscription_id_notify_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."notify_subscriptions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notify_subscriptions" ADD CONSTRAINT "notify_subscriptions_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notify_subscriptions" ADD CONSTRAINT "notify_subscriptions_diner_id_users_id_fk" FOREIGN KEY ("diner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "policies" ADD CONSTRAINT "policies_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reservation_events" ADD CONSTRAINT "reservation_events_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reservations" ADD CONSTRAINT "reservations_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reservations" ADD CONSTRAINT "reservations_diner_id_users_id_fk" FOREIGN KEY ("diner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reservations" ADD CONSTRAINT "reservations_guest_profile_id_guest_profiles_id_fk" FOREIGN KEY ("guest_profile_id") REFERENCES "public"."guest_profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reservations" ADD CONSTRAINT "reservations_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_group_id_restaurant_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."restaurant_groups"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reviews" ADD CONSTRAINT "reviews_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reviews" ADD CONSTRAINT "reviews_diner_id_users_id_fk" FOREIGN KEY ("diner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rooms" ADD CONSTRAINT "rooms_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saved_restaurants" ADD CONSTRAINT "saved_restaurants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saved_restaurants" ADD CONSTRAINT "saved_restaurants_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shifts" ADD CONSTRAINT "shifts_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "turn_times" ADD CONSTRAINT "turn_times_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_diner_id_users_id_fk" FOREIGN KEY ("diner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_idx" ON "audit_logs" USING btree ("restaurant_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billable_idx" ON "billable_covers" USING btree ("restaurant_id","month");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "closure_uq" ON "closures" USING btree ("restaurant_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "guest_phone_idx" ON "guest_profiles" USING btree ("restaurant_id","phone");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "guest_email_idx" ON "guest_profiles" USING btree ("restaurant_id","email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hold_restaurant_start_idx" ON "holds" USING btree ("restaurant_id","starts_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dispatch_send_idx" ON "notify_dispatches" USING btree ("send_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notify_idx" ON "notify_subscriptions" USING btree ("restaurant_id","date","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "otp_phone_idx" ON "otp_codes" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "policy_version_uq" ON "policies" USING btree ("restaurant_id","version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "res_event_idx" ON "reservation_events" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "res_restaurant_start_idx" ON "reservations" USING btree ("restaurant_id","starts_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "res_diner_idx" ON "reservations" USING btree ("diner_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "staff_user_restaurant_uq" ON "staff_memberships" USING btree ("user_id","restaurant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "waitlist_idx" ON "waitlist_entries" USING btree ("restaurant_id","status");