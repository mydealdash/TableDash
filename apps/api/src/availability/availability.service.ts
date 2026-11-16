import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, gt, gte, inArray, isNull, lt } from 'drizzle-orm';
import { DB, Db, Tx } from '../db/db.module';
import { closures, diningTables, holds, reservations, restaurants, shifts, turnTimes } from '../db/schema';
import { addDays, localToUtc } from '../common/time';
import { computeSlots, EngineConfig, Occupancy, Slot, SlotQuery, turnMinutes } from './engine';

export const OCCUPYING_STATUSES = ['CONFIRMED', 'SEATED'] as const;
const LIVE_TABLE_STATUSES = new Set(['SEATED', 'APPETIZER', 'ENTREE', 'DESSERT', 'CHECK_DROPPED', 'PAID', 'BUSSING']);

@Injectable()
export class AvailabilityService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async loadConfig(restaurantId: string, q: Db | Tx = this.db) {
    const [r] = await q.select().from(restaurants).where(eq(restaurants.id, restaurantId));
    if (!r) throw new NotFoundException('Restaurant not found');
    const [t, s, tt, c] = await Promise.all([
      q.select().from(diningTables).where(eq(diningTables.restaurantId, restaurantId)),
      q.select().from(shifts).where(eq(shifts.restaurantId, restaurantId)),
      q.select().from(turnTimes).where(eq(turnTimes.restaurantId, restaurantId)),
      q.select().from(closures).where(eq(closures.restaurantId, restaurantId)),
    ]);
    const cfg: EngineConfig = {
      timezone: r.timezone, onlineBookingEnabled: r.onlineBookingEnabled, bookingWindowDays: r.bookingWindowDays,
      maxPartyOnline: r.maxPartyOnline, tables: t, shifts: s, turnTimes: tt, closedDates: c.map((x) => x.date),
    };
    return { restaurant: r, cfg };
  }

  /** Everything that blocks a table on a local date: reservations, live holds, overrunning seated tables. */
  async loadOccupancy(restaurantId: string, date: string, tz: string, now = new Date(), q: Db | Tx = this.db, excludeReservationId?: string) {
    const from = localToUtc(addDays(date, -1), '12:00', tz);
    const to = localToUtc(addDays(date, 1), '12:00', tz);
    const [res, hs, tables] = await Promise.all([
      q.select().from(reservations).where(and(eq(reservations.restaurantId, restaurantId),
        inArray(reservations.status, [...OCCUPYING_STATUSES]), gte(reservations.endsAt, from), lt(reservations.startsAt, to))),
      q.select().from(holds).where(and(eq(holds.restaurantId, restaurantId), isNull(holds.releasedAt), isNull(holds.consumedAt),
        gt(holds.expiresAt, now), gte(holds.endsAt, from), lt(holds.startsAt, to))),
      q.select().from(diningTables).where(eq(diningTables.restaurantId, restaurantId)),
    ]);
    const occ: Occupancy[] = [
      ...res.filter((r) => r.id !== excludeReservationId).map((r) => ({
        startsAt: r.startsAt, endsAt: r.endsAt, tableIds: r.tableIds, partySize: r.partySize,
        countsForPacing: r.channel !== 'WALK_IN',
      })),
      ...hs.map((h) => ({ startsAt: h.startsAt, endsAt: h.endsAt, tableIds: h.tableIds, partySize: h.partySize, countsForPacing: true })),
    ];
    // A table still occupied past its planned end blocks the next 15 minutes.
    for (const t of tables) {
      if (LIVE_TABLE_STATUSES.has(t.status)) {
        occ.push({ startsAt: now, endsAt: new Date(now.getTime() + 15 * 60000), tableIds: [t.id], partySize: 0, countsForPacing: false });
      }
    }
    return occ;
  }

  async slots(restaurantId: string, query: Omit<SlotQuery, 'now'> & { now?: Date }, q: Db | Tx = this.db): Promise<{ slots: Slot[]; turnMinutes: number }> {
    const now = query.now ?? new Date();
    const { cfg } = await this.loadConfig(restaurantId, q);
    const occ = await this.loadOccupancy(restaurantId, query.date, cfg.timezone, now, q);
    return { slots: computeSlots(cfg, occ, { ...query, now }), turnMinutes: turnMinutes(cfg.turnTimes, query.partySize) };
  }
}
