/** Walk-in waitlist (spec 9.6): quoted waits from live floor state, remote join, ready-to-seat SMS. */
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, gte, inArray } from 'drizzle-orm';
import { DB, Db } from '../db/db.module';
import { diningTables, reservations, restaurants, turnTimes, waitlistEntries } from '../db/schema';
import { EventBus } from '../common/events';
import { MessagingService } from '../messaging/messaging.service';
import { BookingsService } from '../bookings/bookings.service';
import { turnMinutes } from '../availability/engine';
import { utcToLocal } from '../common/time';

@Injectable()
export class WaitlistService {
  constructor(@Inject(DB) private readonly db: Db, private readonly events: EventBus, private readonly messaging: MessagingService,
    private readonly bookings: BookingsService) {}

  /**
   * Quote = when the earliest fitting table frees up (seated tables free at
   * seatedAt + turn time; tables with an upcoming reservation are skipped),
   * pushed back by the parties of similar size already waiting. Rounded to 5 min.
   */
  async quote(restaurantId: string, partySize: number, now = new Date()) {
    const [tables, tts, upcoming, waiting, seated] = await Promise.all([
      this.db.select().from(diningTables).where(eq(diningTables.restaurantId, restaurantId)),
      this.db.select().from(turnTimes).where(eq(turnTimes.restaurantId, restaurantId)),
      this.db.select().from(reservations).where(and(eq(reservations.restaurantId, restaurantId), eq(reservations.status, 'CONFIRMED'),
        gte(reservations.startsAt, new Date(now.getTime() - 30 * 60000)))),
      this.db.select().from(waitlistEntries).where(and(eq(waitlistEntries.restaurantId, restaurantId), inArray(waitlistEntries.status, ['WAITING', 'NOTIFIED']))),
      this.db.select().from(reservations).where(and(eq(reservations.restaurantId, restaurantId), eq(reservations.status, 'SEATED'))),
    ]);
    const fit = tables.filter((t) => partySize >= t.minCovers && partySize <= t.maxCovers && t.status !== 'OUT_OF_SERVICE');
    if (!fit.length) return { quotedMinutes: null as number | null, reason: 'No table fits this party size' };
    const turn = turnMinutes(tts, partySize);
    const freeAt = fit.map((t) => {
      let at = now.getTime();
      if (t.status !== 'AVAILABLE') {
        const res = seated.find((s) => s.id === t.currentReservationId);
        const seatedAt = res?.seatedAt?.getTime() ?? t.statusChangedAt.getTime();
        at = Math.max(now.getTime() + 5 * 60000, seatedAt + turnMinutes(tts, res?.partySize ?? t.maxCovers) * 60000);
      }
      // Skip forward past any reservation that would collide with a walk-in turn.
      for (const r of upcoming.filter((u) => u.tableIds.includes(t.id)).sort((a, b) => +a.startsAt - +b.startsAt)) {
        if (r.startsAt.getTime() < at + turn * 60000 && r.endsAt.getTime() > at) at = r.endsAt.getTime();
      }
      return at;
    }).sort((a, b) => a - b);
    const ahead = waiting.filter((w) => w.partySize >= partySize - 1 && w.partySize <= partySize + 1).length;
    const idx = Math.min(ahead, freeAt.length - 1);
    const extraRounds = Math.floor(ahead / freeAt.length) * turn * 60000;
    const minutes = Math.max(0, Math.ceil((freeAt[idx] + extraRounds - now.getTime()) / 60000));
    return { quotedMinutes: Math.ceil(minutes / 5) * 5, reason: null };
  }

  async add(restaurantId: string, input: { guestName: string; guestPhone: string; partySize: number; notes?: string; dinerId?: string | null; remote?: boolean; quotedMinutes?: number }) {
    const [r] = await this.db.select().from(restaurants).where(eq(restaurants.id, restaurantId));
    if (!r) throw new NotFoundException();
    const q = input.quotedMinutes != null ? { quotedMinutes: input.quotedMinutes } : await this.quote(restaurantId, input.partySize);
    if (q.quotedMinutes == null) throw new BadRequestException('No table fits this party size');
    const [entry] = await this.db.insert(waitlistEntries).values({
      restaurantId, guestName: input.guestName, guestPhone: input.guestPhone, partySize: input.partySize, notes: input.notes,
      dinerId: input.dinerId ?? null, joinedRemotely: !!input.remote, quotedMinutes: q.quotedMinutes,
    }).returning();
    this.events.publish({ type: 'waitlist.updated', restaurantId, entryId: entry.id });
    await this.messaging.send('SMS', entry.guestPhone, 'waitlist_joined', `You're on the list at ${r.name}. Estimated wait: ${entry.quotedMinutes} min.`);
    return entry;
  }

  list(restaurantId: string) {
    return this.db.select().from(waitlistEntries)
      .where(and(eq(waitlistEntries.restaurantId, restaurantId), inArray(waitlistEntries.status, ['WAITING', 'NOTIFIED'])))
      .orderBy(asc(waitlistEntries.createdAt));
  }

  async position(entryId: string) {
    const [e] = await this.db.select().from(waitlistEntries).where(eq(waitlistEntries.id, entryId));
    if (!e) throw new NotFoundException();
    const all = await this.list(e.restaurantId);
    const pos = all.findIndex((x) => x.id === e.id);
    return { id: e.id, status: e.status, position: pos >= 0 ? pos + 1 : null, quotedMinutes: e.quotedMinutes, joinedAt: e.createdAt, partySize: e.partySize };
  }

  async notifyReady(restaurantId: string, entryId: string) {
    const [e] = await this.db.update(waitlistEntries).set({ status: 'NOTIFIED', notifiedAt: new Date() })
      .where(and(eq(waitlistEntries.id, entryId), eq(waitlistEntries.restaurantId, restaurantId))).returning();
    if (!e) throw new NotFoundException();
    const [r] = await this.db.select().from(restaurants).where(eq(restaurants.id, restaurantId));
    await this.messaging.send('SMS', e.guestPhone, 'waitlist_ready', `Your table at ${r.name} is ready! Please come to the host stand within 10 minutes.`);
    this.events.publish({ type: 'waitlist.updated', restaurantId, entryId });
    return e;
  }

  async seat(restaurantId: string, entryId: string, tableIds: string[] | undefined, actorId: string) {
    const [e] = await this.db.select().from(waitlistEntries).where(and(eq(waitlistEntries.id, entryId), eq(waitlistEntries.restaurantId, restaurantId)));
    if (!e) throw new NotFoundException();
    const [r] = await this.db.select().from(restaurants).where(eq(restaurants.id, restaurantId));
    const now = utcToLocal(new Date(), r.timezone);
    const res = await this.bookings.staffCreate(restaurantId, { userId: actorId, kind: 'STAFF' }, {
      date: now.date, time: now.time, partySize: e.partySize, tableIds, channel: 'WALK_IN', guestName: e.guestName,
      guestPhone: e.guestPhone, specialRequest: e.notes, seatNow: true,
    });
    await this.db.update(waitlistEntries).set({ status: 'SEATED', seatedAt: new Date(), tableIds: res.tableIds }).where(eq(waitlistEntries.id, e.id));
    this.events.publish({ type: 'waitlist.updated', restaurantId, entryId });
    return res;
  }

  async remove(restaurantId: string, entryId: string, status: 'LEFT' | 'REMOVED') {
    await this.db.update(waitlistEntries).set({ status }).where(and(eq(waitlistEntries.id, entryId), eq(waitlistEntries.restaurantId, restaurantId)));
    this.events.publish({ type: 'waitlist.updated', restaurantId, entryId });
    return { ok: true };
  }
}
