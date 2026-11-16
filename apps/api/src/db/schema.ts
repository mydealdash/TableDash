// TableDash data model — mirrors "Core data model" in the functional specification.
import { randomUUID } from 'crypto';
import {
  pgTable, pgEnum, text, integer, boolean, timestamp, doublePrecision, jsonb,
  primaryKey, uniqueIndex, index,
} from 'drizzle-orm/pg-core';

const id = () => text('id').primaryKey().$defaultFn(() => randomUUID());
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date());

// ---------- Enums ----------
export const platformRole = pgEnum('platform_role', ['DINER', 'ADMIN']);
export const staffRole = pgEnum('staff_role', ['OWNER', 'MANAGER', 'HOST', 'SERVER', 'MARKETING', 'READ_ONLY']);
export const dinerTier = pgEnum('diner_tier', ['STANDARD', 'GOLD']);
export const restaurantStatus = pgEnum('restaurant_status', ['ONBOARDING', 'LIVE', 'PAUSED', 'SUSPENDED']);
export const tableStatus = pgEnum('table_status', [
  'AVAILABLE', 'SEATED', 'APPETIZER', 'ENTREE', 'DESSERT', 'CHECK_DROPPED', 'PAID', 'BUSSING', 'OUT_OF_SERVICE',
]);
export const depositType = pgEnum('deposit_type', ['NONE', 'CARD_HOLD', 'DEPOSIT_PER_PERSON', 'DEPOSIT_PER_PARTY']);
export const reservationStatus = pgEnum('reservation_status', [
  'REQUESTED', 'CONFIRMED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'DECLINED',
]);
export const channel = pgEnum('channel', ['APP', 'WEB', 'WIDGET', 'PARTNER', 'AI_AGENT', 'PHONE', 'WALK_IN']);
export const notifyStatus = pgEnum('notify_status', ['ACTIVE', 'ALERTED', 'BOOKED', 'EXPIRED', 'CANCELLED']);
export const waitlistStatus = pgEnum('waitlist_status', ['WAITING', 'NOTIFIED', 'SEATED', 'LEFT', 'REMOVED']);
export const paymentKind = pgEnum('payment_kind', ['CARD_HOLD', 'DEPOSIT', 'NO_SHOW_FEE', 'LATE_CANCEL_FEE', 'REFUND']);
export const paymentStatus = pgEnum('payment_status', [
  'AUTHORIZED', 'CAPTURED', 'VOIDED', 'REFUNDED', 'WAIVED', 'FAILED', 'DISPUTED',
]);
export const reviewStatus = pgEnum('review_status', ['PUBLISHED', 'FLAGGED', 'REMOVED']);

// ---------- Identity ----------
export const users = pgTable('users', {
  id: id(),
  email: text('email').unique(),
  phone: text('phone').unique(),
  passwordHash: text('password_hash'),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  platformRole: platformRole('platform_role').notNull().default('DINER'),
  tier: dinerTier('tier').notNull().default('STANDARD'),
  dietaryNotes: text('dietary_notes'),
  seatingPref: text('seating_pref'),
  marketingOptIn: boolean('marketing_opt_in').notNull().default(false),
  points: integer('points').notNull().default(0),
  completedCount: integer('completed_count').notNull().default(0),
  pushToken: text('push_token'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const otpCodes = pgTable('otp_codes', {
  id: id(),
  phone: text('phone').notNull(),
  code: text('code').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => ({ phoneIdx: index('otp_phone_idx').on(t.phone) }));

export const staffMemberships = pgTable('staff_memberships', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  restaurantId: text('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
  role: staffRole('role').notNull(),
}, (t) => ({ uq: uniqueIndex('staff_user_restaurant_uq').on(t.userId, t.restaurantId) }));

// ---------- Restaurant & inventory configuration ----------
export const restaurantGroups = pgTable('restaurant_groups', { id: id(), name: text('name').notNull() });

export const restaurants = pgTable('restaurants', {
  id: id(),
  slug: text('slug').notNull().unique(),
  groupId: text('group_id').references(() => restaurantGroups.id),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  cuisine: text('cuisine').notNull(),
  priceBand: integer('price_band').notNull().default(2),
  neighborhood: text('neighborhood').notNull().default(''),
  city: text('city').notNull(),
  address: text('address').notNull(),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  timezone: text('timezone').notNull().default('America/New_York'),
  currency: text('currency').notNull().default('USD'),
  phone: text('phone'),
  photos: text('photos').array().notNull().default([]),
  menuUrl: text('menu_url'),
  // Google Places link (only the place ID may be stored under Google's terms).
  googlePlaceId: text('google_place_id'),
  features: text('features').array().notNull().default([]),
  status: restaurantStatus('status').notNull().default('ONBOARDING'),
  plan: text('plan').notNull().default('CORE'),
  onlineBookingEnabled: boolean('online_booking_enabled').notNull().default(true),
  bookingWindowDays: integer('booking_window_days').notNull().default(30),
  maxPartyOnline: integer('max_party_online').notNull().default(8),
  largePartyRequestMax: integer('large_party_request_max').notNull().default(20),
  holdMinutes: integer('hold_minutes').notNull().default(5),
  graceMinutes: integer('grace_minutes').notNull().default(15),
  maxActiveBookingsPerDiner: integer('max_active_bookings_per_diner').notNull().default(2),
  ratingAvg: doublePrecision('rating_avg').notNull().default(0),
  ratingCount: integer('rating_count').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const rooms = pgTable('rooms', {
  id: id(),
  restaurantId: text('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const diningTables = pgTable('dining_tables', {
  id: id(),
  restaurantId: text('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
  roomId: text('room_id').references(() => rooms.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  minCovers: integer('min_covers').notNull(),
  maxCovers: integer('max_covers').notNull(),
  tableType: text('table_type').notNull().default('DINING_ROOM'),
  section: text('section'),
  x: integer('x').notNull().default(0),
  y: integer('y').notNull().default(0),
  width: integer('width').notNull().default(80),
  height: integer('height').notNull().default(80),
  shape: text('shape').notNull().default('rect'),
  combinableWith: text('combinable_with').array().notNull().default([]),
  onlineBookable: boolean('online_bookable').notNull().default(true),
  status: tableStatus('status').notNull().default('AVAILABLE'),
  statusChangedAt: timestamp('status_changed_at', { withTimezone: true }).notNull().defaultNow(),
  currentReservationId: text('current_reservation_id'),
});

export const shifts = pgTable('shifts', {
  id: id(),
  restaurantId: text('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  daysOfWeek: integer('days_of_week').array().notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(), // last seating
  slotInterval: integer('slot_interval').notNull().default(15),
  maxCoversPerSlot: integer('max_covers_per_slot'),
  maxPartiesPerSlot: integer('max_parties_per_slot'),
  onlineEnabled: boolean('online_enabled').notNull().default(true),
});

export const turnTimes = pgTable('turn_times', {
  id: id(),
  restaurantId: text('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
  minParty: integer('min_party').notNull(),
  maxParty: integer('max_party').notNull(),
  minutes: integer('minutes').notNull(),
});

export const closures = pgTable('closures', {
  id: id(),
  restaurantId: text('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  reason: text('reason'),
}, (t) => ({ uq: uniqueIndex('closure_uq').on(t.restaurantId, t.date) }));

export const policies = pgTable('policies', {
  id: id(),
  restaurantId: text('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  active: boolean('active').notNull().default(true),
  cancelCutoffHours: integer('cancel_cutoff_hours').notNull().default(24),
  depositType: depositType('deposit_type').notNull().default('NONE'),
  depositAmountCents: integer('deposit_amount_cents').notNull().default(0),
  noShowFeeCents: integer('no_show_fee_cents').notNull().default(0),
  lateCancelFeeCents: integer('late_cancel_fee_cents').notNull().default(0),
  minPartyForDeposit: integer('min_party_for_deposit').notNull().default(1),
  text: text('text').notNull().default(''),
  createdAt: createdAt(),
}, (t) => ({ uq: uniqueIndex('policy_version_uq').on(t.restaurantId, t.version) }));

// ---------- Booking ----------
export const holds = pgTable('holds', {
  id: id(),
  restaurantId: text('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
  dinerId: text('diner_id').references(() => users.id, { onDelete: 'set null' }),
  sessionKey: text('session_key').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  partySize: integer('party_size').notNull(),
  tableType: text('table_type'),
  tableIds: text('table_ids').array().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  releasedAt: timestamp('released_at', { withTimezone: true }),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => ({ rIdx: index('hold_restaurant_start_idx').on(t.restaurantId, t.startsAt) }));

export const reservations = pgTable('reservations', {
  id: id(),
  code: text('code').notNull().unique(),
  restaurantId: text('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
  dinerId: text('diner_id').references(() => users.id, { onDelete: 'set null' }),
  guestProfileId: text('guest_profile_id').references(() => guestProfiles.id, { onDelete: 'set null' }),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  partySize: integer('party_size').notNull(),
  tableType: text('table_type'),
  tableIds: text('table_ids').array().notNull().default([]),
  status: reservationStatus('status').notNull().default('CONFIRMED'),
  channel: channel('channel').notNull(),
  source: text('source'),
  isNetworkCover: boolean('is_network_cover').notNull().default(true),
  occasion: text('occasion'),
  specialRequest: text('special_request'),
  guestName: text('guest_name').notNull(),
  guestPhone: text('guest_phone'),
  guestEmail: text('guest_email'),
  policyId: text('policy_id').references(() => policies.id),
  paymentMethodId: text('payment_method_id'),
  confirmedByGuestAt: timestamp('confirmed_by_guest_at', { withTimezone: true }),
  reminderSentAt: timestamp('reminder_sent_at', { withTimezone: true }),
  seatedAt: timestamp('seated_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  cancelledBy: text('cancelled_by'),
  idempotencyKey: text('idempotency_key').unique(),
  spendCents: integer('spend_cents'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({
  rIdx: index('res_restaurant_start_idx').on(t.restaurantId, t.startsAt),
  dIdx: index('res_diner_idx').on(t.dinerId),
}));

export const reservationEvents = pgTable('reservation_events', {
  id: id(),
  reservationId: text('reservation_id').notNull().references(() => reservations.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  actorId: text('actor_id'),
  payload: jsonb('payload'),
  createdAt: createdAt(),
}, (t) => ({ rIdx: index('res_event_idx').on(t.reservationId) }));

// ---------- Notify & waitlist ----------
export const notifySubscriptions = pgTable('notify_subscriptions', {
  id: id(),
  restaurantId: text('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
  dinerId: text('diner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  fromTime: text('from_time').notNull(),
  toTime: text('to_time').notNull(),
  partySize: integer('party_size').notNull(),
  tableType: text('table_type'),
  status: notifyStatus('status').notNull().default('ACTIVE'),
  lastAlertAt: timestamp('last_alert_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => ({ idx: index('notify_idx').on(t.restaurantId, t.date, t.status) }));

export const notifyDispatches = pgTable('notify_dispatches', {
  id: id(),
  restaurantId: text('restaurant_id').notNull(),
  subscriptionId: text('subscription_id').notNull().references(() => notifySubscriptions.id, { onDelete: 'cascade' }),
  slotStartsAt: timestamp('slot_starts_at', { withTimezone: true }).notNull(),
  tier: integer('tier').notNull(),
  sendAt: timestamp('send_at', { withTimezone: true }).notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => ({ idx: index('dispatch_send_idx').on(t.sendAt) }));

export const waitlistEntries = pgTable('waitlist_entries', {
  id: id(),
  restaurantId: text('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
  dinerId: text('diner_id').references(() => users.id, { onDelete: 'set null' }),
  guestName: text('guest_name').notNull(),
  guestPhone: text('guest_phone').notNull(),
  partySize: integer('party_size').notNull(),
  notes: text('notes'),
  quotedMinutes: integer('quoted_minutes').notNull(),
  status: waitlistStatus('status').notNull().default('WAITING'),
  joinedRemotely: boolean('joined_remotely').notNull().default(false),
  notifiedAt: timestamp('notified_at', { withTimezone: true }),
  seatedAt: timestamp('seated_at', { withTimezone: true }),
  tableIds: text('table_ids').array().notNull().default([]),
  createdAt: createdAt(),
}, (t) => ({ idx: index('waitlist_idx').on(t.restaurantId, t.status) }));

// ---------- Guest CRM ----------
export const guestProfiles = pgTable('guest_profiles', {
  id: id(),
  restaurantId: text('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
  dinerId: text('diner_id').references(() => users.id, { onDelete: 'set null' }),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull().default(''),
  phone: text('phone'),
  email: text('email'),
  tags: text('tags').array().notNull().default([]),
  notes: text('notes').notNull().default(''),
  allergies: text('allergies').notNull().default(''),
  isVip: boolean('is_vip').notNull().default(false),
  visitCount: integer('visit_count').notNull().default(0),
  noShowCount: integer('no_show_count').notNull().default(0),
  cancelCount: integer('cancel_count').notNull().default(0),
  totalSpendCents: integer('total_spend_cents').notNull().default(0),
  lastVisitAt: timestamp('last_visit_at', { withTimezone: true }),
  marketingConsent: boolean('marketing_consent').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({
  phoneIdx: index('guest_phone_idx').on(t.restaurantId, t.phone),
  emailIdx: index('guest_email_idx').on(t.restaurantId, t.email),
}));

// ---------- Payments ----------
export const paymentMethods = pgTable('payment_methods', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull().default('mock'),
  token: text('token').notNull(), // processor token, never a card number
  brand: text('brand').notNull(),
  last4: text('last4').notNull(),
  expMonth: integer('exp_month').notNull(),
  expYear: integer('exp_year').notNull(),
  createdAt: createdAt(),
});

export const payments = pgTable('payments', {
  id: id(),
  reservationId: text('reservation_id').notNull().references(() => reservations.id, { onDelete: 'cascade' }),
  kind: paymentKind('kind').notNull(),
  status: paymentStatus('status').notNull(),
  amountCents: integer('amount_cents').notNull(),
  platformFeeCents: integer('platform_fee_cents').notNull().default(0),
  currency: text('currency').notNull().default('USD'),
  providerRef: text('provider_ref'),
  reason: text('reason'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------- Reviews, loyalty, saved ----------
export const reviews = pgTable('reviews', {
  id: id(),
  reservationId: text('reservation_id').notNull().unique().references(() => reservations.id, { onDelete: 'cascade' }),
  restaurantId: text('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
  dinerId: text('diner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  rating: integer('rating').notNull(),
  foodRating: integer('food_rating'),
  serviceRating: integer('service_rating'),
  ambienceRating: integer('ambience_rating'),
  text: text('text').notNull().default(''),
  reply: text('reply'),
  status: reviewStatus('status').notNull().default('PUBLISHED'),
  createdAt: createdAt(),
});

export const loyaltyEntries = pgTable('loyalty_entries', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  points: integer('points').notNull(),
  reason: text('reason').notNull(),
  reservationId: text('reservation_id'),
  createdAt: createdAt(),
});

export const savedRestaurants = pgTable('saved_restaurants', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  restaurantId: text('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
}, (t) => ({ pk: primaryKey({ columns: [t.userId, t.restaurantId] }) }));

// Diners asking for a restaurant that isn't on TableDash yet (only Google's place ID is stored).
export const placeInterests = pgTable('place_interests', {
  id: id(),
  googlePlaceId: text('google_place_id').notNull(),
  dinerId: text('diner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  notifiedAt: timestamp('notified_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => ({ uq: uniqueIndex('place_interest_uq').on(t.googlePlaceId, t.dinerId), idx: index('place_interest_place_idx').on(t.googlePlaceId) }));

// ---------- Messaging outbox, audit, billing ----------
export const messageOutbox = pgTable('message_outbox', {
  id: id(),
  channel: text('channel').notNull(), // SMS | EMAIL | PUSH
  to: text('to').notNull(),
  template: text('template').notNull(),
  body: text('body').notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const auditLogs = pgTable('audit_logs', {
  id: id(),
  actorId: text('actor_id'),
  restaurantId: text('restaurant_id'),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id'),
  data: jsonb('data'),
  createdAt: createdAt(),
}, (t) => ({ idx: index('audit_idx').on(t.restaurantId, t.createdAt) }));

export const billableCovers = pgTable('billable_covers', {
  id: id(),
  restaurantId: text('restaurant_id').notNull(),
  reservationId: text('reservation_id').notNull().unique(),
  covers: integer('covers').notNull(),
  channel: channel('channel').notNull(),
  month: text('month').notNull(),
  createdAt: createdAt(),
}, (t) => ({ idx: index('billable_idx').on(t.restaurantId, t.month) }));

export type Restaurant = typeof restaurants.$inferSelect;
export type DiningTable = typeof diningTables.$inferSelect;
export type Shift = typeof shifts.$inferSelect;
export type Reservation = typeof reservations.$inferSelect;
export type Policy = typeof policies.$inferSelect;
export type User = typeof users.$inferSelect;
export type GuestProfile = typeof guestProfiles.$inferSelect;
