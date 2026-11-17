# TableDash

A restaurant reservation platform with the same functional scope as OpenTable and Resy: a diner app and marketplace, a restaurant operating system (host stand, back office) and an internal admin console, all on one booking engine.

Built from the *OpenTable & Resy — Functional Analysis and Functional Specification*. Requirement IDs in code comments (`BKG-02`, `NTF-03`, …) refer to that spec.

| App | Path | Stack | Port |
| --- | --- | --- | --- |
| API | `apps/api` | NestJS 10, Drizzle ORM, PostgreSQL 16, Socket.IO | 4000 |
| Restaurant back office (web, full setup) | `apps/restaurant` | Next.js 14 | 3001 |
| Internal admin console | `apps/admin` | Next.js 14 | 3002 |
| Diner mobile app (iOS / Android) | `apps/diner` | Expo SDK 52, React Native 0.76 | — |
| Restaurant mobile app (iPad / phone) | `apps/restaurant-app` | Expo SDK 52, React Native 0.76, react-native-svg | — |

## Install the apps on your phone or iPad (no app store needed)

Both mobile apps can be installed straight from their Render links. They get a home-screen icon and open full screen like a normal app.

- **iPhone / iPad (Safari):** open the link → Share button → **Add to Home Screen**.
- **Android (Chrome):** open the link → ⋮ menu → **Install app** (or **Add to Home screen**).

| App | Link |
|---|---|
| Restaurant app (host stand, bookings) | https://tabledash-restaurant-app.onrender.com |
| Diner app (search and book) | https://tabledash-diner.onrender.com |

For real App Store / Google Play apps, see "Mobile apps (EAS)" — `eas.json` already points at https://tabledash-api.onrender.com.

## Mobile apps

Both diner and restaurant experiences are native Expo apps for iOS and Android.

- **Diner app** (`apps/diner`): search, restaurant pages, booking with hold timer, deposits, Notify, remote waitlist, manage bookings, reviews, points, account.
- **Restaurant app** (`apps/restaurant-app`): built for an iPad at the host stand (two-pane list + live floor plan; screen stays awake) and works on phones (list / floor toggle). Host stand, seating by tapping a table, course status, walk-ins, waitlist with table-ready texts, bookings by date with modify/cancel/no-show, large-party approvals, fee waivers, guestbook, review replies, pre-shift and performance reports, online-booking switch, booking rules, closed dates, restaurant switcher. Floor-plan drawing, policies and staff invites stay in the web back office.

**Try them on your phone (Expo Go):**
```bash
cd apps/diner            # or apps/restaurant-app
npm install
EXPO_PUBLIC_API_URL=https://<your-api>.onrender.com npx expo start
```
Scan the QR code with the Expo Go app (iOS/Android).

**Install as real apps (EAS Build):** set `EXPO_PUBLIC_API_URL` in each app's `eas.json`, then
```bash
npm install -g eas-cli && eas login
eas build --profile preview --platform android   # installable APK link
eas build --profile preview --platform ios       # needs an Apple Developer account
```
`eas submit` uploads production builds to the App Store and Google Play.

## Google search, reviews and photos (optional)

With a Google key set, the diner app's search covers **every restaurant on Google**, not just TableDash ones:

- Each result shows Google's photo, rating, cuisine, price and address.
- Restaurants on TableDash (matched by their linked Google listing) are marked **Book on TableDash** and show bookable times. The **Bookable on TableDash** filter shows only those.
- Other restaurants open a details page with Google photos, reviews, hours, phone, website and directions, plus **Tell me when they join**. Those requests appear in the admin console under **Requested restaurants**, a sales lead list. When that restaurant joins and links its Google listing, everyone who asked is notified automatically.
- Without a key, or without a location or search text, search shows TableDash restaurants only.

Restaurant pages on TableDash also show the Google rating, up to 5 Google reviews and Google photos alongside TableDash's own reviews.

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project, enable billing, and enable **Places API (New)**.
2. Create an API key. Restrict it to **Places API (New)**. It's used only by the API server and never sent to apps.
3. Set `GOOGLE_MAPS_API_KEY` on the API (on Render: **tabledash-api → Environment**), then redeploy the API.
4. Link each restaurant: **web back office → Settings → Google listing**, or **restaurant app → Settings → Google listing**. Search, then tap **This is us**.

How it complies with Google's Places API policies:
- Only the Google **place ID** is stored. The rating, reviews and photos are fetched live for each view and never saved.
- The API key stays on the server. Photos go through `GET /v1/discovery/google-photo`, which redirects to a short-lived Google URL.
- The diner app shows the **"Google Maps"** text attribution in the same container as the content, credits review and photo authors (avatar, name, profile link), links every review and photo to Google Maps, discloses translations with access to the original text, and states how reviews are ordered.

**Cost:** each diner search makes a billable Text Search request (rating and photo fields put it in Google's Enterprise tier), plus one Place Photo request per result photo shown. Each restaurant page view makes a billable Place Details request (rating and reviews are in Google's higher-priced tier), plus one Place Photo request per Google photo shown. Check Google's current pricing and set a budget alert in Google Cloud.

## Deploy a test environment (Render, free tier)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/mydealdash/TableDash)

`render.yaml` creates Postgres, the API, the web back office, the admin console, and **browser builds of both mobile apps** (`tabledash-diner`, `tabledash-restaurant-app`) for quick testing. On first start the API runs migrations and loads the demo data. Free services sleep after 15 minutes idle, so the first request after a pause takes about a minute. Render's free Postgres expires after 30 days.

To test the diner app on a phone, run `cd apps/diner && npm install && EXPO_PUBLIC_API_URL=https://<your-api>.onrender.com npx expo start` and scan the QR code with Expo Go.

## Quick start

**Docker (API + web apps + Postgres):**

```bash
docker compose up --build
docker compose exec api npx ts-node src/db/seed.ts   # demo data
```

**Local development:**

```bash
npm install                                    # API + web apps (npm workspaces)
cp apps/api/.env.example apps/api/.env         # point DATABASE_URL at your Postgres
npm run db:migrate && npm run db:seed
npm run dev:api          # http://localhost:4000/v1
npm run dev:restaurant   # http://localhost:3001
npm run dev:admin        # http://localhost:3002

cd apps/diner && npm install
EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:4000 npx expo start   # scan with Expo Go
```

**Demo logins** (password `password123`):

| Who | Email |
| --- | --- |
| Diner | `diner@tabledash.dev` (has a saved test card) — or sign in by phone; dev mode shows the OTP |
| Host | `host+osteria-lume@tabledash.dev` (also `harbor-and-vine`, `kiln-tasting-counter`, `saffron-and-salt`) |
| Owner | `owner+<slug>@tabledash.dev` |
| Multi-location manager | `manager@tabledash.dev` |
| Platform admin | `admin@tabledash.dev` |

The four seed restaurants each exercise a different policy: card hold with no-show fee, no deposit, per-person deposit (tasting counter), and walk-in friendly.

## Tests

```bash
npm test     # needs a local Postgres; creates and drops `tabledash_test`
```

22 tests: the availability engine (slots, time zones, best-fit and combined tables, pacing, closures) and end-to-end flows A–F from the spec — search → hold → confirm, deposits and refunds, expired holds, idempotent retries, Notify recovery, seat → complete → loyalty and billing, no-show fees, waitlist, partner/AI channel, admin onboarding and policy versioning.

The concurrency tests fire 25 simultaneous holds at the only table that fits, and 20 simultaneous bookings at one slot. Exactly one hold wins, and no table is ever double-booked.

## How it works

```
Diner app / widget / partners / AI agents ──┐
Restaurant host stand + back office ────────┼──► API (/v1) ──► Postgres
Admin console ──────────────────────────────┘      │
                                     Socket.IO ◄───┤ event bus → Notify, messaging, CRM, billing
                                                   └ scheduled jobs (hold expiry, reminders, auto-resolve)
```

- **Availability engine** (`apps/api/src/availability/engine.ts`): a pure function that turns shifts, slot interval, pacing (covers *and* parties), turn times by party size, tables and table combinations, closures and existing occupancy into bookable slots. Search, holds, commits and modifications all call the same function.
- **No double-bookings:** every write that changes inventory takes a Postgres advisory lock on *(restaurant, local date)* and re-runs the engine inside the lock. Commits accept an idempotency key.
- **Holds:** selecting a time places a 5-minute hold (configurable per restaurant). Expired or abandoned holds release the slot and trigger Notify.
- **Reservation state machine:** `REQUESTED → CONFIRMED → SEATED → COMPLETED`, plus `CANCELLED`, `NO_SHOW` and `DECLINED`. Every transition is written to `reservation_events` for audit and chargeback evidence.
- **Policies are versioned.** A booking keeps the policy the guest accepted, so fees always follow the terms shown at checkout.
- **Notify:** a released slot is matched to subscribers. Gold-tier diners are alerted first, and everyone else after `NOTIFY_PRIORITY_WINDOW_SECONDS`. Alerts are first come, first served.
- **Channels and billing:** every booking carries a channel (`APP`, `WEB`, `WIDGET`, `PARTNER`, `AI_AGENT`, `PHONE`, `WALK_IN`). Completed network covers are written to `billable_covers` for per-cover billing. Partner and AI-agent bookings need an `x-partner-key` (see `PARTNER_KEYS`).
- **Guest CRM:** one profile per restaurant, merged by diner account, phone or email. It tracks visits, spend, no-shows, rule-based tags (Regular, High spender, Allergy), VIP status and notes, and can be exported as CSV.
- **Loyalty:** 100 points per completed network booking. Gold status after 6 completed bookings in 12 months.

## Feature map

| Area | Diner app | Restaurant app | API |
| --- | --- | --- | --- |
| Search & discovery | Search by text, cuisine, sort, location; bookable times on each result | — | `GET /discovery/search`, `/discovery/restaurants/:slug` |
| Booking | Slot picker by seating area and service period, checkout with hold timer, policy acceptance, card or deposit, confirmation and share | Phone bookings, walk-ins, overbook override | `POST /restaurants/:id/holds`, `/holds/:id/confirm` |
| Large parties | Request flow | Approve or decline and assign tables | `/restaurants/:id/requests`, `/manage/:rid/reservations/:id/approve` |
| Manage booking | Modify, cancel (late-fee warning), directions, call | Modify, cancel, no-show, waive fee, history | `/me/reservations/*`, `/manage/:rid/reservations/*` |
| Notify | Set and remove alerts; deep link from the alert | See demand | `/restaurants/:id/notify`, `/me/notify` |
| Waitlist | Remote join, live position | Quoted waits, table-ready SMS, seat, remove | `/restaurants/:id/waitlist`, `/manage/:rid/waitlist` |
| Floor & tables | — | Live floor plan, course status, best-fit suggestions, seat by click, block table, drag-and-drop floor editor | `/manage/:rid/floor`, `/tables/:id/status`, `/suggest-tables` |
| CRM | Dining preferences | Guestbook, tags, VIP, allergies, notes, history, CSV export | `/manage/:rid/guests` |
| Payments | Saved cards (tokens only), deposits | Waive fees | Mock provider behind a `PaymentProvider` interface |
| Reviews | Verified reviews after a completed visit | Reply, flag | `/me/reservations/:id/review`, `/manage/:rid/reviews` |
| Loyalty | Points, Gold progress, saved restaurants | — | `/me/loyalty` |
| Settings | — | Profile, booking rules, shifts and pacing, rooms and tables, turn times, versioned policies, closures, staff roles, online-booking kill switch | `/manage/:rid/settings/*` |
| Reports | — | Pre-shift report, covers, no-show rate, turn times, spend per cover, channel mix, waitlist and Notify conversion, billing, CSV export | `/manage/:rid/reports/*` |
| Admin | — | — | Onboarding, status and plan, users, review moderation, payments and dispute evidence, audited impersonation, audit log |
| Privacy | Export and delete account | — | `GET/DELETE /me` |

## What to plug in before production

These are working stubs behind clean interfaces:

- **Payments:** `MockPaymentProvider` (`apps/api/src/payments/provider.ts`). Add a Stripe or Adyen adapter, and replace `tokenize()` in `apps/diner/src/screens/AddCardScreen.tsx` with the provider's card SDK.
- **SMS, email and push delivery:** messages go to the `message_outbox` table. Set `MESSAGING_PROVIDER` and add a worker for Twilio, SES or Expo Push.
- **Event bus:** in-process today. Swap `EventBus` (`apps/api/src/common/events.ts`) for Redis Streams or Kafka before running more than one API instance, so real-time events and Notify reach every node.
- **Not built in this MVP:** the "should have" and "could have" items in the spec. That covers the AI concierge, email campaigns and segments, prepaid ticketed experiences, gift cards and dining credits, paid search placement, POS integrations, the public partner API with OAuth and webhooks, SSO, and an embeddable web widget for restaurant websites. The data model and channel tags already leave room for them.

## Repository layout

```
apps/api/src
  availability/   engine + service + public availability endpoint
  bookings/       holds, confirm, modify, cancel, seat, complete, no-show
  notify/ waitlist/ crm/ payments/ reviews/ discovery/ diners/
  host/           host stand + guestbook endpoints (/manage/:rid)
  settings/ reports/ admin/ realtime/ jobs/ auth/ messaging/ db/
apps/api/drizzle  SQL migrations
apps/api/test     engine unit tests + e2e tests
apps/restaurant   Next.js host stand & back office
apps/admin        Next.js admin console
apps/diner       Expo diner app
```
