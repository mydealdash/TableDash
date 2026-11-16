/**
 * Demo data: one platform admin, four fictional New York restaurants with floors,
 * shifts, turn times and policies, staff logins, and a diner account.
 * All passwords: "password123". Re-runnable: it wipes the demo tables first.
 */
import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import * as s from './schema';

type TableSpec = { name: string; min: number; max: number; type?: string; x: number; y: number; shape?: string; combine?: string[]; w?: number; h?: number };

const RESTAURANTS = [
  {
    slug: 'harbor-and-vine', name: 'Harbor & Vine', cuisine: 'Seafood', priceBand: 3, neighborhood: 'West Village', city: 'New York',
    address: '41 Perry St, New York, NY', lat: 40.7356, lng: -74.0036, features: ['Outdoor seating', 'Raw bar', 'Bonus points'],
    description: 'Day-boat fish, a long raw bar and a natural-wine list in a candlelit West Village townhouse.',
    policy: { depositType: 'CARD_HOLD' as const, noShowFeeCents: 2500, lateCancelFeeCents: 2500, cancelCutoffHours: 24, text: 'A card is required to hold your table. Cancellations within 24 hours or no-shows are charged $25 per person.' },
  },
  {
    slug: 'osteria-lume', name: 'Osteria Lume', cuisine: 'Italian', priceBand: 2, neighborhood: 'Carroll Gardens', city: 'New York',
    address: '212 Court St, Brooklyn, NY', lat: 40.6831, lng: -73.9944, features: ['Bar seating', 'Kid friendly'],
    description: 'Handmade pasta, wood-fired vegetables and a back garden that is open from May to October.',
    policy: { depositType: 'NONE' as const, noShowFeeCents: 0, lateCancelFeeCents: 0, cancelCutoffHours: 4, text: 'Please let us know at least 4 hours ahead if your plans change.' },
  },
  {
    slug: 'kiln-tasting-counter', name: 'Kiln Tasting Counter', cuisine: 'Contemporary', priceBand: 4, neighborhood: 'Tribeca', city: 'New York',
    address: '9 Harrison St, New York, NY', lat: 40.7190, lng: -74.0096, features: ['Tasting menu', 'Counter seating'],
    description: 'A twelve-seat counter cooking a seasonal tasting menu over live fire.',
    policy: { depositType: 'DEPOSIT_PER_PERSON' as const, depositAmountCents: 5000, noShowFeeCents: 0, lateCancelFeeCents: 0, cancelCutoffHours: 48, text: 'A $50 per person deposit is required and credited to your bill. Deposits are refunded for cancellations more than 48 hours ahead.' },
  },
  {
    slug: 'saffron-and-salt', name: 'Saffron & Salt', cuisine: 'Indian', priceBand: 2, neighborhood: 'Murray Hill', city: 'New York',
    address: '118 Lexington Ave, New York, NY', lat: 40.7432, lng: -73.9826, features: ['Vegetarian friendly', 'Private dining'],
    description: 'Regional Indian cooking from Kerala to Punjab, with a twelve-person private room.',
    policy: { depositType: 'NONE' as const, noShowFeeCents: 0, lateCancelFeeCents: 0, cancelCutoffHours: 2, text: 'Tables are held for 15 minutes past the reservation time.' },
  },
];

const FLOOR: TableSpec[] = [
  { name: '1', min: 1, max: 2, x: 40, y: 40, shape: 'round', combine: ['2'] },
  { name: '2', min: 1, max: 2, x: 140, y: 40, shape: 'round', combine: ['1'] },
  { name: '3', min: 2, max: 4, x: 240, y: 40, combine: ['4'] },
  { name: '4', min: 2, max: 4, x: 360, y: 40, combine: ['3'] },
  { name: '5', min: 2, max: 4, x: 40, y: 170 },
  { name: '6', min: 4, max: 6, x: 160, y: 170, w: 140 },
  { name: '7', min: 6, max: 10, x: 330, y: 170, w: 170 },
  { name: 'B1', min: 1, max: 2, type: 'BAR', x: 40, y: 320, w: 60, h: 50 },
  { name: 'B2', min: 1, max: 2, type: 'BAR', x: 120, y: 320, w: 60, h: 50 },
  { name: 'B3', min: 1, max: 2, type: 'BAR', x: 200, y: 320, w: 60, h: 50 },
  { name: 'P1', min: 2, max: 4, type: 'PATIO', x: 330, y: 320 },
  { name: 'P2', min: 2, max: 4, type: 'PATIO', x: 440, y: 320 },
];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema: s });
  await db.execute(sql`truncate users, restaurants, restaurant_groups, otp_codes, message_outbox, audit_logs, billable_covers cascade`);
  const hash = await bcrypt.hash('password123', 10);

  await db.insert(s.users).values({ email: 'admin@tabledash.dev', firstName: 'Ada', lastName: 'Admin', platformRole: 'ADMIN', passwordHash: hash });
  const [diner] = await db.insert(s.users).values({ email: 'diner@tabledash.dev', phone: '+15555550100', firstName: 'Dana', lastName: 'Diner', passwordHash: hash }).returning();
  await db.insert(s.paymentMethods).values({ userId: diner.id, token: 'tok_visa_demo', brand: 'Visa', last4: '4242', expMonth: 12, expYear: 2029 });
  const [group] = await db.insert(s.restaurantGroups).values({ name: 'Demo Hospitality Group' }).returning();

  for (const [i, spec] of RESTAURANTS.entries()) {
    const { policy, ...fields } = spec;
    const [r] = await db.insert(s.restaurants).values({
      ...fields, groupId: group.id, status: 'LIVE', plan: i === 0 ? 'PRO' : 'CORE', phone: `+1212555010${i}`,
      photos: [1, 2, 3].map((n) => `https://picsum.photos/seed/${spec.slug}-${n}/1200/800`),
      ratingAvg: [4.7, 4.5, 4.9, 4.4][i], ratingCount: [212, 389, 96, 154][i],
    }).returning();
    const [main, bar, patio] = await db.insert(s.rooms).values([
      { restaurantId: r.id, name: 'Dining room', sortOrder: 0 }, { restaurantId: r.id, name: 'Bar', sortOrder: 1 }, { restaurantId: r.id, name: 'Patio', sortOrder: 2 },
    ]).returning();
    const floor = spec.slug === 'kiln-tasting-counter'
      ? Array.from({ length: 6 }, (_, k) => ({ name: `C${k + 1}`, min: 1, max: 2, type: 'COUNTER', x: 40 + k * 80, y: 60, w: 60, h: 50 } as TableSpec))
      : FLOOR;
    const inserted = await db.insert(s.diningTables).values(floor.map((t) => ({
      restaurantId: r.id, roomId: t.type === 'BAR' || t.type === 'COUNTER' ? bar.id : t.type === 'PATIO' ? patio.id : main.id,
      name: t.name, minCovers: t.min, maxCovers: t.max, tableType: t.type ?? 'DINING_ROOM', x: t.x, y: t.y, width: t.w ?? 90, height: t.h ?? 90, shape: t.shape ?? 'rect',
    }))).returning();
    const byName = new Map(inserted.map((t) => [t.name, t.id]));
    for (const t of floor.filter((f) => f.combine)) {
      await db.update(s.diningTables).set({ combinableWith: t.combine!.map((n) => byName.get(n)!) }).where(sql`id = ${byName.get(t.name)}`);
    }
    await db.insert(s.shifts).values(spec.slug === 'kiln-tasting-counter'
      ? [{ restaurantId: r.id, name: 'Seatings', daysOfWeek: [2, 3, 4, 5, 6], startTime: '18:00', endTime: '20:30', slotInterval: 30, maxCoversPerSlot: 12 }]
      : [
          { restaurantId: r.id, name: 'Brunch', daysOfWeek: [0, 6], startTime: '11:00', endTime: '14:30', slotInterval: 15, maxCoversPerSlot: 20 },
          { restaurantId: r.id, name: 'Dinner', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startTime: '17:00', endTime: '22:00', slotInterval: 15, maxCoversPerSlot: 16, maxPartiesPerSlot: 5 },
        ]);
    await db.insert(s.turnTimes).values([
      { restaurantId: r.id, minParty: 1, maxParty: 2, minutes: spec.slug === 'kiln-tasting-counter' ? 150 : 90 },
      { restaurantId: r.id, minParty: 3, maxParty: 4, minutes: 105 },
      { restaurantId: r.id, minParty: 5, maxParty: 6, minutes: 120 },
      { restaurantId: r.id, minParty: 7, maxParty: 20, minutes: 150 },
    ]);
    await db.insert(s.policies).values({ restaurantId: r.id, version: 1, ...policy });

    const staff = [
      { email: `owner+${spec.slug}@tabledash.dev`, firstName: 'Olivia', lastName: 'Owner', role: 'OWNER' as const },
      { email: `host+${spec.slug}@tabledash.dev`, firstName: 'Hugo', lastName: 'Host', role: 'HOST' as const },
    ];
    for (const st of staff) {
      const [u] = await db.insert(s.users).values({ email: st.email, firstName: st.firstName, lastName: st.lastName, passwordHash: hash }).returning();
      await db.insert(s.staffMemberships).values({ userId: u.id, restaurantId: r.id, role: st.role });
    }
  }
  // One login that can run every restaurant in the group (multi-location manager).
  const [gm] = await db.insert(s.users).values({ email: 'manager@tabledash.dev', firstName: 'Mia', lastName: 'Manager', passwordHash: hash }).returning();
  const all = await db.select().from(s.restaurants);
  await db.insert(s.staffMemberships).values(all.map((r) => ({ userId: gm.id, restaurantId: r.id, role: 'MANAGER' as const })));

  console.log('Seeded. Logins (password123): admin@tabledash.dev, manager@tabledash.dev, diner@tabledash.dev, owner+<slug>@tabledash.dev, host+<slug>@tabledash.dev');
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
