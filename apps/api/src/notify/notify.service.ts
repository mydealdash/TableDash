/**
 * Notify (spec 9.5): diners subscribe to a full date/time range. When inventory
 * is released, matching subscribers are alerted in priority tiers — Gold diners
 * first, everyone else after NOTIFY_PRIORITY_WINDOW_SECONDS. Alerts are
 * first-come-first-served (NTF-03): nothing is held for the alerted diner.
 */
import { BadRequestException, Inject, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { and, eq, inArray, isNull, lt, lte } from 'drizzle-orm';
import { DB, Db } from '../db/db.module';
import { notifyDispatches, notifySubscriptions, restaurants, users } from '../db/schema';
import { EventBus } from '../common/events';
import { AvailabilityService } from '../availability/availability.service';
import { MessagingService } from '../messaging/messaging.service';
import { isDate, isTime, utcToLocal } from '../common/time';

@Injectable()
export class NotifyService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Db, private readonly events: EventBus,
    private readonly availability: AvailabilityService, private readonly messaging: MessagingService,
  ) {}

  onModuleInit() {
    this.events.on('slot.released', async (e) => { await this.onRelease(e.restaurantId, e.date); });
  }

  async subscribe(dinerId: string, restaurantId: string, input: { date: string; fromTime: string; toTime: string; partySize: number; tableType?: string | null }) {
    if (!isDate(input.date) || !isTime(input.fromTime) || !isTime(input.toTime) || input.fromTime > input.toTime) throw new BadRequestException('Invalid date or time range');
    const [r] = await this.db.select().from(restaurants).where(eq(restaurants.id, restaurantId));
    if (!r) throw new NotFoundException();
    const [sub] = await this.db.insert(notifySubscriptions).values({ ...input, restaurantId, dinerId }).returning();
    return sub;
  }

  /** Staff can add a guest to the Notify list (NTF-04) — they must have a diner account. */
  list(restaurantId: string, date?: string) {
    const conds = [eq(notifySubscriptions.restaurantId, restaurantId), inArray(notifySubscriptions.status, ['ACTIVE', 'ALERTED'])];
    if (date) conds.push(eq(notifySubscriptions.date, date));
    return this.db.select({ s: notifySubscriptions, firstName: users.firstName, lastName: users.lastName, tier: users.tier, phone: users.phone, email: users.email })
      .from(notifySubscriptions).innerJoin(users, eq(users.id, notifySubscriptions.dinerId)).where(and(...conds))
      .then((rows) => rows.map((x) => ({ ...x.s, guest: { firstName: x.firstName, lastName: x.lastName, tier: x.tier, phone: x.phone, email: x.email } })));
  }

  mine(dinerId: string) {
    return this.db.select({ s: notifySubscriptions, name: restaurants.name, slug: restaurants.slug, photos: restaurants.photos })
      .from(notifySubscriptions).innerJoin(restaurants, eq(restaurants.id, notifySubscriptions.restaurantId))
      .where(and(eq(notifySubscriptions.dinerId, dinerId), inArray(notifySubscriptions.status, ['ACTIVE', 'ALERTED'])))
      .then((rows) => rows.map((x) => ({ ...x.s, restaurant: { name: x.name, slug: x.slug, photo: x.photos[0] ?? null } })));
  }

  async cancel(dinerId: string, id: string) {
    await this.db.update(notifySubscriptions).set({ status: 'CANCELLED' }).where(and(eq(notifySubscriptions.id, id), eq(notifySubscriptions.dinerId, dinerId)));
    return { ok: true };
  }

  /** Match released inventory to subscribers and queue tiered dispatches. */
  async onRelease(restaurantId: string, date: string) {
    const subs = await this.db.select({ s: notifySubscriptions, tier: users.tier }).from(notifySubscriptions)
      .innerJoin(users, eq(users.id, notifySubscriptions.dinerId))
      .where(and(eq(notifySubscriptions.restaurantId, restaurantId), eq(notifySubscriptions.date, date), inArray(notifySubscriptions.status, ['ACTIVE', 'ALERTED'])));
    if (!subs.length) return 0;
    const windowMs = Number(process.env.NOTIFY_PRIORITY_WINDOW_SECONDS ?? 120) * 1000;
    let queued = 0;
    for (const { s, tier } of subs) {
      const { slots } = await this.availability.slots(restaurantId, { date, partySize: s.partySize, tableType: s.tableType, online: true, fromTime: s.fromTime, toTime: s.toTime });
      const first = slots.find((x) => x.available);
      if (!first) continue;
      const priority = tier === 'GOLD' ? 0 : 1;
      await this.db.insert(notifyDispatches).values({
        restaurantId, subscriptionId: s.id, slotStartsAt: new Date(first.startsAt), tier: priority,
        sendAt: new Date(Date.now() + (priority === 0 ? 0 : windowMs)),
      });
      queued++;
    }
    await this.dispatchDue();
    return queued;
  }

  /** Runs on a schedule and right after a release: send due alerts if the slot is still open. */
  async dispatchDue(now = new Date()) {
    const due = await this.db.select().from(notifyDispatches).where(and(isNull(notifyDispatches.sentAt), lte(notifyDispatches.sendAt, now))).limit(200);
    let sent = 0;
    for (const d of due) {
      await this.db.update(notifyDispatches).set({ sentAt: now }).where(eq(notifyDispatches.id, d.id));
      const [row] = await this.db.select({ s: notifySubscriptions, user: users, r: restaurants }).from(notifySubscriptions)
        .innerJoin(users, eq(users.id, notifySubscriptions.dinerId)).innerJoin(restaurants, eq(restaurants.id, notifySubscriptions.restaurantId))
        .where(eq(notifySubscriptions.id, d.subscriptionId));
      if (!row || !['ACTIVE', 'ALERTED'].includes(row.s.status)) continue;
      const { slots } = await this.availability.slots(row.r.id, { date: row.s.date, partySize: row.s.partySize, tableType: row.s.tableType, online: true, fromTime: row.s.fromTime, toTime: row.s.toTime });
      const open = slots.filter((x) => x.available);
      if (!open.length) continue; // someone else got it first
      const t = utcToLocal(new Date(open[0].startsAt), row.r.timezone).time;
      const body = `A table just opened at ${row.r.name} on ${row.s.date} at ${t} for ${row.s.partySize}. Book now: tabledash://restaurant/${row.r.slug}?date=${row.s.date}&time=${t}&party=${row.s.partySize}`;
      await this.messaging.send('PUSH', row.user.id, 'notify_alert', body);
      await this.messaging.send('EMAIL', row.user.email, 'notify_alert', body);
      await this.db.update(notifySubscriptions).set({ status: 'ALERTED', lastAlertAt: now }).where(eq(notifySubscriptions.id, row.s.id));
      sent++;
    }
    return sent;
  }

  async expirePast() {
    const today = new Date().toISOString().slice(0, 10);
    await this.db.update(notifySubscriptions).set({ status: 'EXPIRED' }).where(and(lt(notifySubscriptions.date, today), inArray(notifySubscriptions.status, ['ACTIVE', 'ALERTED'])));
  }
}
