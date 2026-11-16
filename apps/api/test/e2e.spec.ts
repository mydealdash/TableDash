/**
 * End-to-end tests against a real Postgres (DATABASE_URL_TEST, default tabledash_test).
 * Covers the six key flows in the spec and the zero-double-booking guarantee.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { execSync } from 'child_process';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';

const TEST_DB = process.env.DATABASE_URL_TEST ?? 'postgresql://tabledash:tabledash@localhost:5432/tabledash_test';
process.env.DATABASE_URL = TEST_DB;
process.env.JOBS_ENABLED = 'false';
process.env.NODE_ENV = 'test';
process.env.NOTIFY_PRIORITY_WINDOW_SECONDS = '0';
process.env.RATE_LIMIT_PER_MIN = '100000';
process.env.PARTNER_KEYS = 'acme-ai:secret-key';
process.env.GOOGLE_MAPS_API_KEY = 'test-google-key';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { addDays, utcToLocal } from '../src/common/time';
import { JobsService } from '../src/jobs/jobs.service';
import { NotifyService } from '../src/notify/notify.service';

let app: INestApplication;
let pool: Pool;
const http = () => request(app.getHttpServer());
const login = async (email: string) => (await http().post('/v1/auth/login').send({ email, password: 'password123' }).expect(201)).body.token as string;
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const date = addDays(utcToLocal(new Date(), 'America/New_York').date, 3);
const ids: Record<string, string> = {};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  const admin = new Pool({ connectionString: TEST_DB.replace(/\/[^/]+$/, '/postgres') });
  await admin.query('DROP DATABASE IF EXISTS tabledash_test WITH (FORCE)');
  await admin.query('CREATE DATABASE tabledash_test');
  await admin.end();
  const env = { ...process.env, DATABASE_URL: TEST_DB };
  execSync('npx ts-node src/db/migrate.ts', { env, stdio: 'ignore' });
  execSync('npx ts-node src/db/seed.ts', { env, stdio: 'ignore' });
  pool = new Pool({ connectionString: TEST_DB });
  for (const row of (await pool.query('select id, slug from restaurants')).rows) ids[row.slug] = row.id;
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = configureApp(mod.createNestApplication());
  await app.init();
}, 120000);

afterAll(async () => { await app?.close(); await pool?.end(); });

async function book(token: string | null, slug: string, opts: { time?: string; party?: number; extra?: object } = {}) {
  const sessionKey = randomUUID();
  const h = http().post(`/v1/restaurants/${ids[slug]}/holds`).send({ date, time: opts.time ?? '19:00', partySize: opts.party ?? 2, sessionKey });
  const hold = await (token ? h.set(auth(token)) : h);
  if (hold.status !== 201) return { hold };
  const c = http().post(`/v1/holds/${hold.body.holdId}/confirm`).send({ sessionKey, guestName: 'Test Guest', guestPhone: '+15550001111', guestEmail: 'guest@example.com', ...opts.extra });
  const confirm = await (token ? c.set(auth(token)) : c);
  return { hold, confirm };
}

describe('Diner: search → hold → confirm (flow A)', () => {
  it('search returns restaurants with bookable times', async () => {
    const res = await http().get('/v1/discovery/search').query({ city: 'New York', date, time: '19:00', party: 2 }).expect(200);
    expect(res.body.results.length).toBe(4);
    expect(res.body.results.some((r: any) => r.slots.length > 0)).toBe(true);
  });

  it('profile shows policy and reviews', async () => {
    const res = await http().get('/v1/discovery/restaurants/harbor-and-vine').expect(200);
    expect(res.body.policy.depositType).toBe('CARD_HOLD');
    expect(res.body.tableTypes).toEqual(expect.arrayContaining(['DINING_ROOM', 'BAR', 'PATIO']));
  });

  it('guest checkout books a no-deposit restaurant', async () => {
    const { confirm } = await book(null, 'osteria-lume', { time: '18:00' });
    expect(confirm!.status).toBe(201);
    expect(confirm!.body.status).toBe('CONFIRMED');
    expect(confirm!.body.code).toHaveLength(8);
  });

  it('card-hold restaurant requires a card; succeeds with saved card', async () => {
    const t = await login('diner@tabledash.dev');
    const noCard = await book(t, 'harbor-and-vine', { time: '18:00' });
    expect(noCard.confirm!.status).toBe(402);
    const methods = (await http().get('/v1/me/payment-methods').set(auth(t))).body;
    const ok = await book(t, 'harbor-and-vine', { time: '18:30', extra: { paymentMethodId: methods[0].id } });
    expect(ok.confirm!.status).toBe(201);
    const mine = (await http().get('/v1/me/reservations').set(auth(t)).expect(200)).body;
    expect(mine.some((r: any) => r.id === ok.confirm!.body.id)).toBe(true);
  });

  it('deposit restaurant captures per-person deposit; refunds on timely cancel', async () => {
    const t = await login('diner@tabledash.dev');
    const methods = (await http().get('/v1/me/payment-methods').set(auth(t))).body;
    const kilnDate = addDays(date, [2, 3, 4, 5, 6].includes(new Date(date + 'T12:00:00Z').getUTCDay()) ? 0 : 2);
    // Find an open counter slot within 2 weeks (the counter only opens Tue–Sat).
    let res: any; let d = kilnDate;
    for (let i = 0; i < 14 && !res; i++, d = addDays(d, 1)) {
      const sk = randomUUID();
      const hold = await http().post(`/v1/restaurants/${ids['kiln-tasting-counter']}/holds`).set(auth(t)).send({ date: d, time: '18:00', partySize: 2, sessionKey: sk });
      if (hold.status === 201) {
        expect(hold.body.payment).toEqual({ kind: 'DEPOSIT', amountCents: 10000 });
        res = (await http().post(`/v1/holds/${hold.body.holdId}/confirm`).set(auth(t)).send({ sessionKey: sk, guestName: 'Dana Diner', guestEmail: 'diner@tabledash.dev', paymentMethodId: methods[0].id })).body;
      }
    }
    expect(res.status).toBe('CONFIRMED');
    const pay = (await pool.query('select kind, status, amount_cents from payments where reservation_id = $1', [res.id])).rows;
    expect(pay).toEqual([{ kind: 'DEPOSIT', status: 'CAPTURED', amount_cents: 10000 }]);
    const cancel = await http().post(`/v1/me/reservations/${res.id}/cancel`).set(auth(t)).send({}).expect(201);
    expect(cancel.body.late).toBe(false);
    expect(cancel.body.money).toContain('deposit_refunded');
  });

  it('expired hold cannot be confirmed', async () => {
    const sk = randomUUID();
    const hold = await http().post(`/v1/restaurants/${ids['osteria-lume']}/holds`).send({ date, time: '21:00', partySize: 2, sessionKey: sk }).expect(201);
    await pool.query(`update holds set expires_at = now() - interval '1 minute' where id = $1`, [hold.body.holdId]);
    await http().post(`/v1/holds/${hold.body.holdId}/confirm`).send({ sessionKey: sk, guestName: 'Late Guest', guestEmail: 'l@example.com' }).expect(410);
  });

  it('idempotency key returns the same reservation on retry', async () => {
    const sk = randomUUID(); const key = randomUUID();
    const hold = await http().post(`/v1/restaurants/${ids['saffron-and-salt']}/holds`).send({ date, time: '18:15', partySize: 2, sessionKey: sk }).expect(201);
    const a = await http().post(`/v1/holds/${hold.body.holdId}/confirm`).send({ sessionKey: sk, guestName: 'Retry', guestEmail: 'r@example.com', idempotencyKey: key }).expect(201);
    const b = await http().post(`/v1/holds/${hold.body.holdId}/confirm`).send({ sessionKey: sk, guestName: 'Retry', guestEmail: 'r@example.com', idempotencyKey: key }).expect(201);
    expect(b.body.id).toBe(a.body.id);
  });
});

describe('Zero double-bookings under concurrency (NFR-01)', () => {
  it('25 simultaneous holds for the only fitting table → exactly one wins', async () => {
    await pool.query(`update restaurants set max_party_online = 10 where slug = 'osteria-lume'`);
    const attempts = await Promise.all(Array.from({ length: 25 }, () =>
      http().post(`/v1/restaurants/${ids['osteria-lume']}/holds`).send({ date, time: '19:30', partySize: 9, sessionKey: randomUUID() })));
    const codes = attempts.map((a) => a.status).sort();
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(24);
  });

  it('20 concurrent full bookings for party of 2 never share a table/time', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => book(null, 'saffron-and-salt', { time: '20:00', party: 2 })));
    const ok = results.filter((r) => r.confirm?.status === 201).map((r) => r.confirm!.body);
    const tables = ok.flatMap((r: any) => r.tableIds);
    expect(new Set(tables).size).toBe(tables.length); // no table reused at the same time
    expect(ok.length).toBeGreaterThan(0);
  });
});

describe('Notify recovery (flow B)', () => {
  it('cancellation alerts a subscribed diner', async () => {
    const diner = await login('diner@tabledash.dev');
    // Fill the only 9-top (from the concurrency test the 19:30 hold exists; book it for real now)
    await pool.query(`update holds set released_at = now() where restaurant_id = $1`, [ids['osteria-lume']]);
    const taken = await book(null, 'osteria-lume', { time: '19:30', party: 9 });
    expect(taken.confirm!.status).toBe(201);
    const sub = await http().post(`/v1/restaurants/${ids['osteria-lume']}/notify`).set(auth(diner))
      .send({ date, fromTime: '19:00', toTime: '20:00', partySize: 9 }).expect(201);
    const host = await login('host+osteria-lume@tabledash.dev');
    await http().post(`/v1/manage/${ids['osteria-lume']}/reservations/${taken.confirm!.body.id}/cancel`).set(auth(host)).send({ reason: 'Guest called' }).expect(201);
    await sleep(500);
    await app.get(NotifyService).dispatchDue();
    const s = (await pool.query('select status from notify_subscriptions where id = $1', [sub.body.id])).rows[0];
    expect(s.status).toBe('ALERTED');
    const msg = (await pool.query(`select body from message_outbox where template = 'notify_alert' order by created_at desc limit 1`)).rows[0];
    expect(msg.body).toContain('A table just opened at Osteria Lume');
  });
});

describe('Host stand (flow D) and no-show (flow E)', () => {
  it('seat → complete credits loyalty, CRM visit and billable cover', async () => {
    const diner = await login('diner@tabledash.dev');
    await pool.query(`update restaurants set max_active_bookings_per_diner = 10`);
    const { confirm } = await book(diner, 'saffron-and-salt', { time: '17:00' });
    const host = await login('host+saffron-and-salt@tabledash.dev');
    const rid = ids['saffron-and-salt'];
    await http().post(`/v1/manage/${rid}/reservations/${confirm!.body.id}/seat`).set(auth(host)).send({}).expect(201);
    const floor = (await http().get(`/v1/manage/${rid}/floor`).set(auth(host)).expect(200)).body;
    expect(floor.tables.find((t: any) => t.id === confirm!.body.tableIds[0]).status).toBe('SEATED');
    const before = (await pool.query('select points from users where email = $1', ['diner@tabledash.dev'])).rows[0].points;
    await http().post(`/v1/manage/${rid}/reservations/${confirm!.body.id}/complete`).set(auth(host)).send({ spendCents: 18000 }).expect(201);
    const after = (await pool.query('select points from users where email = $1', ['diner@tabledash.dev'])).rows[0].points;
    expect(after - before).toBe(100);
    const cover = (await pool.query('select covers from billable_covers where reservation_id = $1', [confirm!.body.id])).rows[0];
    expect(cover.covers).toBe(2);
    const g = (await pool.query('select visit_count, total_spend_cents from guest_profiles where id = $1', [confirm!.body.guestProfileId])).rows[0];
    expect(g).toEqual({ visit_count: 1, total_spend_cents: 18000 });
    // Verified review allowed only now.
    await http().post(`/v1/me/reservations/${confirm!.body.id}/review`).set(auth(diner)).send({ rating: 5, text: 'Wonderful' }).expect(201);
  });

  it('no-show charges the per-person fee from the booked policy', async () => {
    const diner = await login('diner@tabledash.dev');
    const methods = (await http().get('/v1/me/payment-methods').set(auth(diner))).body;
    const { confirm } = await book(diner, 'harbor-and-vine', { time: '20:00', party: 2, extra: { paymentMethodId: methods[0].id } });
    // Pretend the booking was 30 minutes ago.
    await pool.query(`update reservations set starts_at = now() - interval '30 minutes', ends_at = now() + interval '60 minutes' where id = $1`, [confirm!.body.id]);
    const host = await login('host+harbor-and-vine@tabledash.dev');
    const res = await http().post(`/v1/manage/${ids['harbor-and-vine']}/reservations/${confirm!.body.id}/no-show`).set(auth(host)).expect(201);
    expect(res.body.money).toContain('fee_charged');
    const fee = (await pool.query(`select amount_cents, platform_fee_cents from payments where reservation_id = $1 and kind = 'NO_SHOW_FEE'`, [confirm!.body.id])).rows[0];
    expect(fee).toEqual({ amount_cents: 5000, platform_fee_cents: 100 });
  });

  it('phone booking and walk-in seat now work for staff; diners cannot access manage routes', async () => {
    const host = await login('host+osteria-lume@tabledash.dev');
    const rid = ids['osteria-lume'];
    await http().post(`/v1/manage/${rid}/reservations`).set(auth(host)).send({ date, time: '17:30', partySize: 4, guestName: 'Phone Guest', guestPhone: '+15550002222' }).expect(201);
    const diner = await login('diner@tabledash.dev');
    await http().get(`/v1/manage/${rid}/floor`).set(auth(diner)).expect(403);
    await http().get('/v1/admin/stats').set(auth(diner)).expect(403);
    await http().get(`/v1/manage/${ids['harbor-and-vine']}/floor`).set(auth(host)).expect(403); // other restaurant
  });
});

describe('Waitlist (flow C)', () => {
  it('quotes, adds, notifies and seats a walk-in', async () => {
    const host = await login('host+saffron-and-salt@tabledash.dev');
    const rid = ids['saffron-and-salt'];
    const q = await http().get(`/v1/restaurants/${rid}/waitlist/quote`).query({ party: 2 }).expect(200);
    expect(typeof q.body.quotedMinutes).toBe('number');
    const e = await http().post(`/v1/manage/${rid}/waitlist`).set(auth(host)).send({ guestName: 'Walk In', guestPhone: '+15550003333', partySize: 2 }).expect(201);
    await http().post(`/v1/manage/${rid}/waitlist/${e.body.id}/notify`).set(auth(host)).expect(201);
    const seated = await http().post(`/v1/manage/${rid}/waitlist/${e.body.id}/seat`).set(auth(host)).send({}).expect(201);
    expect(seated.body.status).toBe('SEATED');
    expect(seated.body.channel).toBe('WALK_IN');
  });
});

describe('Partner / AI agent channel (flow F)', () => {
  it('requires a partner key and tags the booking', async () => {
    const sk = randomUUID();
    const hold = await http().post(`/v1/restaurants/${ids['osteria-lume']}/holds`).send({ date, time: '20:30', partySize: 2, sessionKey: sk }).expect(201);
    await http().post(`/v1/holds/${hold.body.holdId}/confirm`).send({ sessionKey: sk, channel: 'AI_AGENT', guestName: 'Agent Guest', guestEmail: 'a@example.com' }).expect(403);
    const ok = await http().post(`/v1/holds/${hold.body.holdId}/confirm`).set('x-partner-key', 'secret-key')
      .send({ sessionKey: sk, channel: 'AI_AGENT', guestName: 'Agent Guest', guestEmail: 'a@example.com' }).expect(201);
    expect(ok.body.channel).toBe('AI_AGENT');
    expect(ok.body.source).toBe('acme-ai');
  });
});

describe('Admin and settings', () => {
  it('admin onboards a restaurant; owner versions the policy; reports work', async () => {
    const admin = await login('admin@tabledash.dev');
    const r = await http().post('/v1/admin/restaurants').set(auth(admin)).send({
      name: 'Test Bistro', slug: 'test-bistro', cuisine: 'French', city: 'New York', address: '1 Test St', lat: 40.7, lng: -74,
      ownerEmail: 'owner@testbistro.dev', ownerFirstName: 'Tess', ownerLastName: 'Owner', ownerTempPassword: 'password123',
    }).expect(201);
    expect(r.body.status).toBe('ONBOARDING');
    await http().patch(`/v1/admin/restaurants/${r.body.id}`).set(auth(admin)).send({ status: 'LIVE' }).expect(200);
    const owner = await login('owner@testbistro.dev');
    const p = await http().post(`/v1/manage/${r.body.id}/settings/policies`).set(auth(owner)).send({
      cancelCutoffHours: 12, depositType: 'CARD_HOLD', depositAmountCents: 0, noShowFeeCents: 2000, lateCancelFeeCents: 1000, minPartyForDeposit: 1, text: 'Card required',
    }).expect(201);
    expect(p.body.version).toBe(2);
    const pre = await http().get(`/v1/manage/${ids['saffron-and-salt']}/reports/pre-shift`).set(auth(await login('manager@tabledash.dev'))).query({ date }).expect(200);
    expect(pre.body.covers).toBeGreaterThan(0);
    const stats = await http().get('/v1/admin/stats').set(auth(admin)).expect(200);
    expect(stats.body.restaurants.total).toBe(5);
  });
});

describe('Google listing: live rating, reviews and photos', () => {
  const PLACE = 'ChIJTestPlaceId1234567890';
  const OTHER = 'ChIJOtherNoodleBar123456';
  const calls: { url: string; headers: any }[] = [];
  beforeAll(() => {
    jest.spyOn(global, 'fetch').mockImplementation(async (input: any, init?: any) => {
      const url = String(input);
      calls.push({ url, headers: init?.headers ?? {} });
      const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url.endsWith('places:searchText')) {
        const body = JSON.parse(init.body);
        if (init.headers['X-Goog-FieldMask'].includes('nextPageToken')) return json({ nextPageToken: 'page2', places: [
          { id: PLACE, displayName: { text: 'Osteria Lume' }, shortFormattedAddress: '212 Court St', location: { latitude: 40.6831, longitude: -73.9944 }, rating: 4.6, userRatingCount: 812,
            priceLevel: 'PRICE_LEVEL_MODERATE', primaryTypeDisplayName: { text: 'Italian Restaurant' }, photos: [{ name: `places/${PLACE}/photos/AbCdEf123`, authorAttributions: [] }], businessStatus: 'OPERATIONAL' },
          { id: OTHER, displayName: { text: 'Real Noodle Bar' }, shortFormattedAddress: '5 Main St', location: { latitude: 40.69, longitude: -73.99 }, rating: 4.3, userRatingCount: 120,
            priceLevel: 'PRICE_LEVEL_INEXPENSIVE', primaryTypeDisplayName: { text: 'Ramen Restaurant' }, businessStatus: 'OPERATIONAL' },
          { id: 'ChIJclosedPlace0000000', displayName: { text: 'Gone Cafe' }, businessStatus: 'CLOSED_PERMANENTLY' },
        ], _q: body.textQuery });
        return json({ places: [{ id: PLACE, displayName: { text: 'Osteria Lume' }, formattedAddress: '212 Court St, Brooklyn', rating: 4.6, userRatingCount: 812, googleMapsUri: 'https://maps.google.com/?cid=1' }] });
      }
      if (url.includes(`/places/${OTHER}`)) return json({ id: OTHER, displayName: { text: 'Real Noodle Bar' }, formattedAddress: '5 Main St, Brooklyn, NY', nationalPhoneNumber: '(718) 555-0199',
        websiteUri: 'https://noodles.example', regularOpeningHours: { openNow: true, weekdayDescriptions: ['Monday: 11:00 AM – 10:00 PM'] }, rating: 4.3, userRatingCount: 120, reviews: [], photos: [] });
      if (url.includes(`/places/${PLACE}?`)) return json({
        id: PLACE, rating: 4.6, userRatingCount: 812, googleMapsUri: 'https://maps.google.com/?cid=1',
        reviews: [{ rating: 5, relativePublishTimeDescription: '2 weeks ago', publishTime: '2026-11-01T19:00:00Z',
          text: { text: 'Great pasta', languageCode: 'en' }, originalText: { text: 'Pasta excelente', languageCode: 'es' },
          authorAttribution: { displayName: 'Ana P.', uri: 'https://maps.google.com/contrib/1', photoUri: 'https://lh3.googleusercontent.com/a' },
          googleMapsUri: 'https://maps.google.com/review/1', flagContentUri: 'https://maps.google.com/flag/1' }],
        photos: [{ name: `places/${PLACE}/photos/AbCdEf123`, widthPx: 4000, heightPx: 3000, authorAttributions: [{ displayName: 'Owner', uri: 'https://maps.google.com/contrib/2' }] }],
      });
      if (url.includes('/photos/AbCdEf123/media')) return json({ name: 'x', photoUri: 'https://lh3.googleusercontent.com/places/photo123' });
      return new Response('not found', { status: 404 });
    });
  });
  afterAll(() => jest.restoreAllMocks());

  it('is disabled until a manager links the listing; then serves live content with attribution', async () => {
    const rid = ids['osteria-lume'];
    expect((await http().get('/v1/discovery/restaurants/osteria-lume/google').expect(200)).body).toEqual({ enabled: false });
    const host = await login('host+osteria-lume@tabledash.dev');
    await http().get(`/v1/manage/${rid}/settings/google/search`).set(auth(host)).expect(403); // managers only
    const owner = await login('owner+osteria-lume@tabledash.dev');
    const found = await http().get(`/v1/manage/${rid}/settings/google/search`).query({ q: 'Osteria Lume Brooklyn' }).set(auth(owner)).expect(200);
    expect(found.body.results[0].placeId).toBe(PLACE);
    await http().put(`/v1/manage/${rid}/settings/google`).set(auth(owner)).send({ placeId: PLACE }).expect(200);

    const g = (await http().get('/v1/discovery/restaurants/osteria-lume/google').expect(200)).body;
    expect(g).toMatchObject({ enabled: true, rating: 4.6, userRatingCount: 812, googleMapsUri: 'https://maps.google.com/?cid=1' });
    expect(g.reviews[0]).toMatchObject({ rating: 5, text: 'Great pasta', originalText: 'Pasta excelente', translated: true, relativeTime: '2 weeks ago',
      author: { name: 'Ana P.', uri: 'https://maps.google.com/contrib/1' }, googleMapsUri: 'https://maps.google.com/review/1' });
    expect(g.photos[0]).toMatchObject({ name: `places/${PLACE}/photos/AbCdEf123`, authors: [{ name: 'Owner' }] });
    // Only the place ID is stored — no Google content in our database.
    const row = (await pool.query('select google_place_id, photos, rating_avg from restaurants where id = $1', [rid])).rows[0];
    expect(row.google_place_id).toBe(PLACE);
    expect(row.photos.join(' ')).not.toContain('googleusercontent');
    // API key goes in a header to Google, never to the client.
    expect(calls.every((c) => c.headers['X-Goog-Api-Key'] === 'test-google-key')).toBe(true);
    expect(JSON.stringify(g)).not.toContain('test-google-key');
  });

  it('photo endpoint redirects to a short-lived Google URL and rejects bad names', async () => {
    const res = await http().get('/v1/discovery/google-photo').query({ name: `places/${PLACE}/photos/AbCdEf123`, w: 800 }).expect(302);
    expect(res.headers.location).toBe('https://lh3.googleusercontent.com/places/photo123');
    await http().get('/v1/discovery/google-photo').query({ name: '../../evil' }).expect(400);
  });

  it('diner search returns Google results, with bookable times only for TableDash restaurants', async () => {
    const res = await http().get('/v1/discovery/places-search').query({ q: 'italian', lat: 40.68, lng: -73.99, date, time: '19:00', party: 2 }).expect(200);
    expect(res.body.source).toBe('google');
    expect(res.body.nextPageToken).toBe('page2');
    const names = res.body.results.map((r: any) => r.name);
    expect(names).not.toContain('Gone Cafe'); // permanently closed places are hidden
    const lume = res.body.results.find((r: any) => r.placeId === PLACE);
    expect(lume).toMatchObject({ rating: 4.6, priceBand: 2, type: 'Italian Restaurant', photo: { name: `places/${PLACE}/photos/AbCdEf123` } });
    expect(lume.tabledash.slug).toBe('osteria-lume');
    expect(lume.tabledash.slots.length).toBeGreaterThan(0);
    const noodle = res.body.results.find((r: any) => r.placeId === OTHER);
    expect(noodle.tabledash).toBeNull();
    expect(noodle.distanceKm).toBeGreaterThan(0);
    // Without text or location it falls back to TableDash's own search.
    expect((await http().get('/v1/discovery/places-search').expect(200)).body.source).toBe('tabledash');
  });

  it('unregistered place page, "tell me when they join", and alert when it joins', async () => {
    const diner = await login('diner@tabledash.dev');
    const page = await http().get(`/v1/discovery/places/${OTHER}`).set(auth(diner)).expect(200);
    expect(page.body).toMatchObject({ name: 'Real Noodle Bar', phone: '(718) 555-0199', website: 'https://noodles.example', tabledash: null, interested: false });
    await http().post(`/v1/discovery/places/${OTHER}/interest`).set(auth(diner)).expect(201);
    expect((await http().get(`/v1/discovery/places/${OTHER}`).set(auth(diner)).expect(200)).body.interested).toBe(true);
    await http().post(`/v1/discovery/places/${OTHER}/interest`).expect(401); // sign-in required
    const admin = await login('admin@tabledash.dev');
    const demand = await http().get('/v1/admin/place-demand').set(auth(admin)).expect(200);
    expect(demand.body[0]).toMatchObject({ placeId: OTHER, requests: 1, onTableDash: false, name: 'Real Noodle Bar' });
    // The restaurant joins and links its listing → the diner is alerted.
    const owner = await login('owner+saffron-and-salt@tabledash.dev');
    const link = await http().put(`/v1/manage/${ids['saffron-and-salt']}/settings/google`).set(auth(owner)).send({ placeId: OTHER }).expect(200);
    expect(link.body.notified).toBe(1);
    const msg = (await pool.query(`select body from message_outbox where template = 'place_joined' order by created_at desc limit 1`)).rows[0];
    expect(msg.body).toContain('Saffron & Salt is now on TableDash');
    expect((await http().get(`/v1/discovery/places/${OTHER}`).expect(200)).body.tabledash.slug).toBe('saffron-and-salt');
    await http().put(`/v1/manage/${ids['saffron-and-salt']}/settings/google`).set(auth(owner)).send({ placeId: null }).expect(200);
  });

  it('unlinking turns Google content off', async () => {
    const owner = await login('owner+osteria-lume@tabledash.dev');
    await http().put(`/v1/manage/${ids['osteria-lume']}/settings/google`).set(auth(owner)).send({ placeId: null }).expect(200);
    expect((await http().get('/v1/discovery/restaurants/osteria-lume/google').expect(200)).body.enabled).toBe(false);
  });
});
