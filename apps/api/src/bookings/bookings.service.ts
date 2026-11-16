/**
 * Booking engine (spec 9.4 BKG, business rules 9.13).
 *
 * Concurrency (NFR-01, zero double-bookings): every write that changes table
 * inventory for a restaurant/day runs inside a transaction holding a Postgres
 * advisory lock on (restaurant, local date). Availability is recomputed inside
 * that lock with the same engine search uses, so two diners can never be
 * assigned the same table for overlapping times.
 */
import {
  BadRequestException, ConflictException, ForbiddenException, GoneException, Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { and, count, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { DB, Db, Tx } from '../db/db.module';
import {
  billableCovers, diningTables, holds, loyaltyEntries, notifySubscriptions, reservationEvents, reservations, restaurants,
  Reservation, users,
} from '../db/schema';
import { AvailabilityService } from '../availability/availability.service';
import { assignTables, computeSlots, turnMinutes } from '../availability/engine';
import { addDays, isDate, isTime, localToUtc, utcToLocal } from '../common/time';
import { confirmationCode } from '../common/util';
import { EventBus } from '../common/events';
import { CrmService } from '../crm/crm.service';
import { PaymentsService, depositRequired, isLateCancel } from '../payments/payments.service';
import { MessagingService } from '../messaging/messaging.service';

export type ChannelName = 'APP' | 'WEB' | 'WIDGET' | 'PARTNER' | 'AI_AGENT' | 'PHONE' | 'WALK_IN';
const NETWORK_CHANNELS: ChannelName[] = ['APP', 'WEB', 'PARTNER', 'AI_AGENT'];

/** Allowed status transitions (the reservation state machine in section 8). */
const TRANSITIONS: Record<string, string[]> = {
  REQUESTED: ['CONFIRMED', 'DECLINED', 'CANCELLED'],
  CONFIRMED: ['SEATED', 'CANCELLED', 'NO_SHOW'],
  SEATED: ['COMPLETED'],
  NO_SHOW: ['CONFIRMED'], // undo a mistaken no-show (fees must be waived separately)
};

export interface Actor { userId?: string | null; kind: 'DINER' | 'STAFF' | 'SYSTEM' | 'PARTNER' }

@Injectable()
export class BookingsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly availability: AvailabilityService,
    private readonly crm: CrmService,
    private readonly payments: PaymentsService,
    private readonly events: EventBus,
    private readonly messaging: MessagingService,
  ) {}

  // ---------- locking & helpers ----------

  private async lock(tx: Tx, restaurantId: string, ...dates: string[]) {
    for (const d of [...new Set(dates)].sort()) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${restaurantId}:${d}`}))`);
    }
  }

  private async event(q: Tx | Db, reservationId: string, type: string, actor: Actor, payload?: unknown) {
    await q.insert(reservationEvents).values({ reservationId, type, actorId: actor.userId ?? null, payload: (payload ?? null) as any });
  }

  async getRestaurant(id: string, q: Db | Tx = this.db) {
    const [r] = await q.select().from(restaurants).where(eq(restaurants.id, id));
    if (!r) throw new NotFoundException('Restaurant not found');
    return r;
  }

  private async getReservation(id: string, q: Db | Tx = this.db) {
    const [r] = await q.select().from(reservations).where(eq(reservations.id, id));
    if (!r) throw new NotFoundException('Reservation not found');
    return r;
  }

  private assertTransition(from: string, to: string) {
    if (!TRANSITIONS[from]?.includes(to)) throw new ConflictException(`Cannot change a ${from} reservation to ${to}`);
  }

  private localDate(r: { startsAt: Date }, tz: string) { return utcToLocal(r.startsAt, tz).date; }

  // ---------- diner flow: hold → confirm ----------

  /** BKG-02: place a short hold on a slot so two diners can't take the same seat during checkout. */
  async createHold(restaurantId: string, input: {
    date: string; time: string; partySize: number; tableType?: string | null; sessionKey: string; dinerId?: string | null;
  }) {
    if (!isDate(input.date) || !isTime(input.time)) throw new BadRequestException('date and time required');
    const r = await this.getRestaurant(restaurantId);
    if (r.status !== 'LIVE') throw new BadRequestException('Restaurant is not taking online bookings');
    if (input.partySize > r.maxPartyOnline) {
      throw new BadRequestException({ message: `Parties over ${r.maxPartyOnline} must send a request`, code: 'LARGE_PARTY' });
    }
    const today = utcToLocal(new Date(), r.timezone).date;
    if (input.date > addDays(today, r.bookingWindowDays)) throw new BadRequestException('Date is outside the booking window');

    if (input.dinerId) await this.assertDinerCap(input.dinerId, r, input.date);

    return this.db.transaction(async (tx) => {
      await this.lock(tx, restaurantId, input.date);
      // A diner re-selecting a slot releases their previous hold first.
      await tx.update(holds).set({ releasedAt: new Date() })
        .where(and(eq(holds.restaurantId, restaurantId), eq(holds.sessionKey, input.sessionKey), isNull(holds.releasedAt), isNull(holds.consumedAt)));
      const { cfg } = await this.availability.loadConfig(restaurantId, tx);
      const occ = await this.availability.loadOccupancy(restaurantId, input.date, r.timezone, new Date(), tx);
      const [slot] = computeSlots(cfg, occ, {
        date: input.date, partySize: input.partySize, tableType: input.tableType, online: true, now: new Date(),
        fromTime: input.time, toTime: input.time,
      });
      if (!slot?.available) throw new ConflictException({ message: 'That time is no longer available', code: 'SLOT_TAKEN', reason: slot?.reason });

      const expiresAt = new Date(Date.now() + r.holdMinutes * 60000);
      const [hold] = await tx.insert(holds).values({
        restaurantId, dinerId: input.dinerId ?? null, sessionKey: input.sessionKey, startsAt: new Date(slot.startsAt),
        endsAt: new Date(slot.endsAt), partySize: input.partySize, tableType: input.tableType ?? null, tableIds: slot.tableIds, expiresAt,
      }).returning();
      const policy = await this.payments.activePolicy(restaurantId, tx);
      return {
        holdId: hold.id, expiresAt, startsAt: hold.startsAt, partySize: hold.partySize, tableType: hold.tableType,
        policy: policy && { id: policy.id, version: policy.version, text: policy.text, cancelCutoffHours: policy.cancelCutoffHours,
          noShowFeeCents: policy.noShowFeeCents, lateCancelFeeCents: policy.lateCancelFeeCents },
        payment: depositRequired(policy, input.partySize),
      };
    });
  }

  /** BKG-09: cap on a diner's active bookings at one restaurant on one day (anti-hoarding / resale). */
  private async assertDinerCap(dinerId: string, r: typeof restaurants.$inferSelect, date: string) {
    const rows = await this.db.select({ startsAt: reservations.startsAt }).from(reservations)
      .where(and(eq(reservations.dinerId, dinerId), eq(reservations.restaurantId, r.id), inArray(reservations.status, ['CONFIRMED', 'REQUESTED'])));
    const sameDay = rows.filter((x) => utcToLocal(x.startsAt, r.timezone).date === date).length;
    if (sameDay >= r.maxActiveBookingsPerDiner) throw new ForbiddenException('You already have the maximum bookings here for that day');
  }

  async releaseHold(holdId: string, sessionKey: string) {
    const [h] = await this.db.update(holds).set({ releasedAt: new Date() })
      .where(and(eq(holds.id, holdId), eq(holds.sessionKey, sessionKey), isNull(holds.consumedAt), isNull(holds.releasedAt))).returning();
    if (h) {
      const r = await this.getRestaurant(h.restaurantId);
      this.events.publish({ type: 'slot.released', restaurantId: h.restaurantId, date: this.localDate(h, r.timezone), startsAt: h.startsAt.toISOString() });
    }
    return { released: !!h };
  }

  /** BKG-03/04: turn a hold into a confirmed reservation, collecting card/deposit per policy. */
  async confirm(holdId: string, input: {
    sessionKey: string; dinerId?: string | null; channel: ChannelName; source?: string | null;
    guestName: string; guestPhone?: string | null; guestEmail?: string | null; occasion?: string | null; specialRequest?: string | null;
    paymentMethodId?: string | null; paymentToken?: string | null; idempotencyKey?: string | null; acceptPolicyVersion?: number | null;
  }) {
    if (input.idempotencyKey) {
      const [dupe] = await this.db.select().from(reservations).where(eq(reservations.idempotencyKey, input.idempotencyKey));
      if (dupe) return dupe;
    }
    const [h0] = await this.db.select().from(holds).where(eq(holds.id, holdId));
    if (!h0 || h0.sessionKey !== input.sessionKey) throw new NotFoundException('Hold not found');
    const r = await this.getRestaurant(h0.restaurantId);
    const date = this.localDate(h0, r.timezone);

    const reservation = await this.db.transaction(async (tx) => {
      await this.lock(tx, r.id, date);
      const [h] = await tx.select().from(holds).where(eq(holds.id, holdId));
      if (h.consumedAt) throw new ConflictException('Hold already used');
      if (h.releasedAt || h.expiresAt < new Date()) throw new GoneException({ message: 'Your hold expired — please pick the time again', code: 'HOLD_EXPIRED' });

      const policy = await this.payments.activePolicy(r.id, tx);
      if (policy && input.acceptPolicyVersion != null && input.acceptPolicyVersion !== policy.version) {
        throw new ConflictException({ message: 'The restaurant policy changed — please review it again', code: 'POLICY_CHANGED' });
      }
      const method = await this.payments.methodFor(input.dinerId, input.paymentMethodId, tx);
      const token = method?.token ?? input.paymentToken ?? null;

      const guestProfileId = await this.crm.upsertForBooking(tx, r.id, {
        dinerId: input.dinerId, name: input.guestName, phone: input.guestPhone, email: input.guestEmail,
      });
      const [res] = await tx.insert(reservations).values({
        code: confirmationCode(), restaurantId: r.id, dinerId: input.dinerId ?? null, guestProfileId,
        startsAt: h.startsAt, endsAt: h.endsAt, partySize: h.partySize, tableType: h.tableType, tableIds: h.tableIds,
        status: 'CONFIRMED', channel: input.channel, source: input.source ?? null, isNetworkCover: NETWORK_CHANNELS.includes(input.channel),
        occasion: input.occasion ?? null, specialRequest: input.specialRequest ?? null, guestName: input.guestName,
        guestPhone: input.guestPhone ?? null, guestEmail: input.guestEmail?.toLowerCase() ?? null, policyId: policy?.id ?? null,
        paymentMethodId: method?.id ?? null, idempotencyKey: input.idempotencyKey ?? null,
      }).returning();
      await this.payments.collectAtBooking(tx, res, policy, token, r.currency);
      await tx.update(holds).set({ consumedAt: new Date() }).where(eq(holds.id, h.id));
      await this.event(tx, res.id, 'created', { userId: input.dinerId, kind: 'DINER' }, { channel: input.channel, source: input.source });
      if (input.dinerId) {
        await tx.update(notifySubscriptions).set({ status: 'BOOKED' }).where(and(
          eq(notifySubscriptions.dinerId, input.dinerId), eq(notifySubscriptions.restaurantId, r.id),
          eq(notifySubscriptions.date, date), inArray(notifySubscriptions.status, ['ACTIVE', 'ALERTED'])));
      }
      return res;
    });

    this.events.publish({ type: 'booking.created', restaurantId: r.id, reservationId: reservation.id });
    const when = utcToLocal(reservation.startsAt, r.timezone);
    const msg = `Confirmed: ${r.name}, ${when.date} at ${when.time}, party of ${reservation.partySize}. Code ${reservation.code}.`;
    await this.messaging.send('SMS', reservation.guestPhone, 'booking_confirmed', msg);
    await this.messaging.send('EMAIL', reservation.guestEmail, 'booking_confirmed', msg);
    return reservation;
  }

  /** BKG-07: large parties become requests the restaurant approves. */
  async requestLargeParty(restaurantId: string, input: {
    date: string; time: string; partySize: number; dinerId?: string | null; channel: ChannelName;
    guestName: string; guestPhone?: string | null; guestEmail?: string | null; specialRequest?: string | null; occasion?: string | null;
  }) {
    const r = await this.getRestaurant(restaurantId);
    if (input.partySize <= r.maxPartyOnline) throw new BadRequestException('Book this party size directly');
    if (input.partySize > r.largePartyRequestMax) throw new BadRequestException('Please contact the restaurant for parties this large');
    const startsAt = localToUtc(input.date, input.time, r.timezone);
    const { cfg } = await this.availability.loadConfig(r.id);
    const endsAt = new Date(startsAt.getTime() + turnMinutes(cfg.turnTimes, input.partySize) * 60000);
    const res = await this.db.transaction(async (tx) => {
      const guestProfileId = await this.crm.upsertForBooking(tx, r.id, { dinerId: input.dinerId, name: input.guestName, phone: input.guestPhone, email: input.guestEmail });
      const policy = await this.payments.activePolicy(r.id, tx);
      const [row] = await tx.insert(reservations).values({
        code: confirmationCode(), restaurantId: r.id, dinerId: input.dinerId ?? null, guestProfileId, startsAt, endsAt,
        partySize: input.partySize, status: 'REQUESTED', channel: input.channel, isNetworkCover: NETWORK_CHANNELS.includes(input.channel),
        guestName: input.guestName, guestPhone: input.guestPhone ?? null, guestEmail: input.guestEmail ?? null,
        specialRequest: input.specialRequest ?? null, occasion: input.occasion ?? null, policyId: policy?.id ?? null,
      }).returning();
      await this.event(tx, row.id, 'requested', { userId: input.dinerId, kind: 'DINER' });
      return row;
    });
    this.events.publish({ type: 'booking.created', restaurantId: r.id, reservationId: res.id });
    return res;
  }

  // ---------- staff flow ----------

  /** Host-entered booking (phone / walk-in). Staff may pick tables explicitly; otherwise best fit. */
  async staffCreate(restaurantId: string, actor: Actor, input: {
    date: string; time: string; partySize: number; tableIds?: string[]; tableType?: string | null; channel: 'PHONE' | 'WALK_IN';
    guestName: string; guestPhone?: string | null; guestEmail?: string | null; specialRequest?: string | null; occasion?: string | null;
    seatNow?: boolean; force?: boolean;
  }) {
    const r = await this.getRestaurant(restaurantId);
    const res = await this.db.transaction(async (tx) => {
      await this.lock(tx, r.id, input.date);
      const { cfg } = await this.availability.loadConfig(r.id, tx);
      const now = new Date();
      const occ = await this.availability.loadOccupancy(r.id, input.date, r.timezone, now, tx);
      let tableIds: string[]; let startsAt: Date; let endsAt: Date;
      const turn = turnMinutes(cfg.turnTimes, input.partySize);

      if (input.seatNow) {
        startsAt = now; endsAt = new Date(now.getTime() + turn * 60000);
        const busy = new Set(occ.filter((o) => o.startsAt < endsAt && startsAt < o.endsAt).flatMap((o) => o.tableIds));
        if (input.tableIds?.length) {
          const clash = input.tableIds.filter((t) => busy.has(t));
          if (clash.length && !input.force) throw new ConflictException({ message: 'Table is booked during this turn', code: 'TABLE_CONFLICT', tableIds: clash });
          tableIds = input.tableIds;
        } else {
          const a = assignTables(cfg.tables, busy, input.partySize, { online: false, tableType: input.tableType });
          if (!a) throw new ConflictException({ message: 'No table free for this party right now', code: 'NO_TABLE' });
          tableIds = a;
        }
      } else {
        const [slot] = computeSlots(cfg, occ, { date: input.date, partySize: input.partySize, tableType: input.tableType, online: false, now, fromTime: input.time, toTime: input.time });
            startsAt = slot ? new Date(slot.startsAt) : localToUtc(input.date, input.time, r.timezone);
        endsAt = new Date(startsAt.getTime() + turn * 60000);
        if (input.tableIds?.length) {
          const busy = new Set(occ.filter((o) => o.startsAt < endsAt && startsAt < o.endsAt).flatMap((o) => o.tableIds));
          const clash = input.tableIds.filter((t) => busy.has(t));
          if (clash.length && !input.force) throw new ConflictException({ message: 'Table is booked during this turn', code: 'TABLE_CONFLICT', tableIds: clash });
          tableIds = input.tableIds;
        } else if (slot?.available) {
          tableIds = slot.tableIds;
        } else if (input.force) {
          tableIds = []; // over-book intentionally; host assigns at seating
        } else {
          throw new ConflictException({ message: 'No table available at that time', code: slot?.reason ?? 'NO_TABLE' });
        }
      }

      const guestProfileId = await this.crm.upsertForBooking(tx, r.id, { name: input.guestName, phone: input.guestPhone, email: input.guestEmail });
      const policy = await this.payments.activePolicy(r.id, tx);
      const [row] = await tx.insert(reservations).values({
        code: confirmationCode(), restaurantId: r.id, guestProfileId, startsAt, endsAt, partySize: input.partySize,
        tableType: input.tableType ?? null, tableIds, status: input.seatNow ? 'SEATED' : 'CONFIRMED', seatedAt: input.seatNow ? now : null,
        channel: input.channel, isNetworkCover: false, guestName: input.guestName, guestPhone: input.guestPhone ?? null,
        guestEmail: input.guestEmail ?? null, specialRequest: input.specialRequest ?? null, occasion: input.occasion ?? null,
        policyId: policy?.id ?? null,
      }).returning();
      if (input.seatNow) {
        await tx.update(diningTables).set({ status: 'SEATED', statusChangedAt: now, currentReservationId: row.id }).where(inArray(diningTables.id, tableIds));
      }
      await this.event(tx, row.id, input.seatNow ? 'walk_in_seated' : 'created', actor, { channel: input.channel, tableIds });
      return row;
    });
    this.events.publish({ type: 'booking.created', restaurantId: r.id, reservationId: res.id });
    if (input.seatNow) res.tableIds.forEach((tableId) => this.events.publish({ type: 'table.updated', restaurantId: r.id, tableId }));
    else await this.messaging.send('SMS', res.guestPhone, 'booking_confirmed', `Confirmed at ${r.name}. Code ${res.code}.`);
    return res;
  }

  /** Staff approve a large-party request and assign tables. */
  async approveRequest(reservationId: string, actor: Actor, tableIds: string[]) {
    const r0 = await this.getReservation(reservationId);
    this.assertTransition(r0.status, 'CONFIRMED');
    const r = await this.getRestaurant(r0.restaurantId);
    const res = await this.db.transaction(async (tx) => {
      await this.lock(tx, r.id, this.localDate(r0, r.timezone));
      const occ = await this.availability.loadOccupancy(r.id, this.localDate(r0, r.timezone), r.timezone, new Date(), tx, r0.id);
      const busy = new Set(occ.filter((o) => o.startsAt < r0.endsAt && r0.startsAt < o.endsAt).flatMap((o) => o.tableIds));
      const clash = tableIds.filter((t) => busy.has(t));
      if (clash.length) throw new ConflictException({ message: 'Tables are booked during this turn', code: 'TABLE_CONFLICT', tableIds: clash });
      const [row] = await tx.update(reservations).set({ status: 'CONFIRMED', tableIds }).where(eq(reservations.id, r0.id)).returning();
      await this.event(tx, r0.id, 'approved', actor, { tableIds });
      return row;
    });
    this.events.publish({ type: 'booking.updated', restaurantId: r.id, reservationId: res.id });
    await this.messaging.send('SMS', res.guestPhone, 'request_approved', `${r.name} confirmed your party of ${res.partySize}. Code ${res.code}.`);
    return res;
  }

  async declineRequest(reservationId: string, actor: Actor, reason?: string) {
    const r0 = await this.getReservation(reservationId);
    this.assertTransition(r0.status, 'DECLINED');
    const [row] = await this.db.update(reservations).set({ status: 'DECLINED' }).where(eq(reservations.id, r0.id)).returning();
    await this.event(this.db, r0.id, 'declined', actor, { reason });
    this.events.publish({ type: 'booking.updated', restaurantId: row.restaurantId, reservationId: row.id });
    await this.messaging.send('SMS', row.guestPhone, 'request_declined', `Sorry — the restaurant could not accommodate your party request.${reason ? ' ' + reason : ''}`);
    return row;
  }

  // ---------- modify / cancel ----------

  /** BKG-05: change time, date or party size, re-checking inventory inside the lock. */
  async modify(reservationId: string, actor: Actor, input: { date?: string; time?: string; partySize?: number; tableType?: string | null }) {
    const r0 = await this.getReservation(reservationId);
    if (actor.kind === 'DINER' && r0.dinerId !== actor.userId) throw new NotFoundException('Reservation not found');
    if (r0.status !== 'CONFIRMED') throw new ConflictException('Only confirmed reservations can be modified');
    const r = await this.getRestaurant(r0.restaurantId);
    const old = utcToLocal(r0.startsAt, r.timezone);
    const date = input.date ?? old.date; const time = input.time ?? old.time; const partySize = input.partySize ?? r0.partySize;
    const online = actor.kind === 'DINER';
    if (online && partySize > r.maxPartyOnline) throw new BadRequestException('Party too large to modify online');
    const policyAtBooking = r0.policyId ? await this.db.query.policies.findFirst({ where: (p, { eq }) => eq(p.id, r0.policyId!) }) : null;
    if (online && isLateCancel(policyAtBooking, r0.startsAt)) {
      throw new ForbiddenException('Changes inside the cancellation window must go through the restaurant');
    }

    const res = await this.db.transaction(async (tx) => {
      await this.lock(tx, r.id, old.date, date);
      const { cfg } = await this.availability.loadConfig(r.id, tx);
      const occ = await this.availability.loadOccupancy(r.id, date, r.timezone, new Date(), tx, r0.id);
      const [slot] = computeSlots(cfg, occ, { date, partySize, tableType: input.tableType ?? r0.tableType, online, now: new Date(), fromTime: time, toTime: time });
      if (!slot?.available) throw new ConflictException({ message: 'That time is not available', code: 'SLOT_TAKEN', reason: slot?.reason });
      const [row] = await tx.update(reservations).set({
        startsAt: new Date(slot.startsAt), endsAt: new Date(slot.endsAt), partySize, tableIds: slot.tableIds,
        tableType: input.tableType ?? r0.tableType, confirmedByGuestAt: null, reminderSentAt: null,
      }).where(eq(reservations.id, r0.id)).returning();
      await this.event(tx, r0.id, 'modified', actor, { from: { ...old, partySize: r0.partySize }, to: { date, time, partySize } });
      return row;
    });
    this.events.publish({ type: 'booking.updated', restaurantId: r.id, reservationId: res.id });
    this.events.publish({ type: 'slot.released', restaurantId: r.id, date: old.date, startsAt: r0.startsAt.toISOString() });
    await this.messaging.send('SMS', res.guestPhone, 'booking_modified', `Updated: ${r.name}, ${date} at ${time}, party of ${partySize}. Code ${res.code}.`);
    return res;
  }

  async cancel(reservationId: string, actor: Actor, reason?: string) {
    const r0 = await this.getReservation(reservationId);
    if (actor.kind === 'DINER' && r0.dinerId !== actor.userId) throw new NotFoundException('Reservation not found');
    this.assertTransition(r0.status, 'CANCELLED');
    const r = await this.getRestaurant(r0.restaurantId);
    const policyAtBooking = r0.policyId ? (await this.db.query.policies.findFirst({ where: (p, { eq }) => eq(p.id, r0.policyId!) })) : null;
    // Restaurant-initiated cancellations never charge the diner.
    const late = actor.kind === 'DINER' && r0.status === 'CONFIRMED' && isLateCancel(policyAtBooking, r0.startsAt);
    const token = await this.tokenFor(r0);

    const { row, money } = await this.db.transaction(async (tx) => {
      const [row] = await tx.update(reservations).set({ status: 'CANCELLED', cancelledAt: new Date(), cancelledBy: actor.kind })
        .where(and(eq(reservations.id, r0.id), eq(reservations.status, r0.status))).returning();
      if (!row) throw new ConflictException('Reservation changed — refresh and try again');
      const money = await this.payments.settleOnCancelOrNoShow(tx, r0, late ? 'LATE_CANCEL' : 'CANCEL_IN_TIME', token, r.currency);
      await this.crm.bump(tx, r0.guestProfileId, 'cancel');
      await this.event(tx, r0.id, 'cancelled', actor, { reason, late, money });
      return { row, money };
    });
    this.events.publish({ type: 'booking.cancelled', restaurantId: r.id, reservationId: row.id });
    this.events.publish({ type: 'slot.released', restaurantId: r.id, date: this.localDate(r0, r.timezone), startsAt: r0.startsAt.toISOString() });
    await this.messaging.send('SMS', row.guestPhone, 'booking_cancelled', `Your reservation at ${r.name} (code ${row.code}) is cancelled.`);
    return { ...row, late, money };
  }

  private async tokenFor(res: Reservation) {
    if (!res.paymentMethodId || !res.dinerId) return null;
    const m = await this.payments.methodFor(res.dinerId, res.paymentMethodId);
    return m?.token ?? null;
  }

  // ---------- service-day transitions ----------

  async seat(reservationId: string, actor: Actor, tableIds?: string[]) {
    const r0 = await this.getReservation(reservationId);
    this.assertTransition(r0.status, 'SEATED');
    const tables = tableIds?.length ? tableIds : r0.tableIds;
    if (!tables.length) throw new BadRequestException('Choose a table to seat this party');
    const now = new Date();
    const row = await this.db.transaction(async (tx) => {
      const [row] = await tx.update(reservations).set({ status: 'SEATED', seatedAt: now, tableIds: tables })
        .where(and(eq(reservations.id, r0.id), eq(reservations.status, 'CONFIRMED'))).returning();
      if (!row) throw new ConflictException('Reservation changed — refresh and try again');
      await tx.update(diningTables).set({ status: 'SEATED', statusChangedAt: now, currentReservationId: r0.id }).where(inArray(diningTables.id, tables));
      await this.event(tx, r0.id, 'seated', actor, { tableIds: tables });
      return row;
    });
    this.events.publish({ type: 'booking.updated', restaurantId: row.restaurantId, reservationId: row.id });
    tables.forEach((tableId) => this.events.publish({ type: 'table.updated', restaurantId: row.restaurantId, tableId }));
    return row;
  }

  /** Check paid / party left: completes the visit, frees tables, credits loyalty, meters billing. */
  async complete(reservationId: string, actor: Actor, spendCents?: number) {
    const r0 = await this.getReservation(reservationId);
    this.assertTransition(r0.status, 'COMPLETED');
    const r = await this.getRestaurant(r0.restaurantId);
    const now = new Date();
    const row = await this.db.transaction(async (tx) => {
      const [row] = await tx.update(reservations).set({ status: 'COMPLETED', completedAt: now, endsAt: now, spendCents: spendCents ?? null })
        .where(and(eq(reservations.id, r0.id), eq(reservations.status, 'SEATED'))).returning();
      if (!row) throw new ConflictException('Reservation changed — refresh and try again');
      if (row.tableIds.length) {
        await tx.update(diningTables).set({ status: 'AVAILABLE', statusChangedAt: now, currentReservationId: null })
          .where(and(inArray(diningTables.id, row.tableIds), eq(diningTables.currentReservationId, row.id)));
      }
      await this.crm.bump(tx, row.guestProfileId, 'visit', spendCents ?? 0);
      await this.creditLoyaltyAndBilling(tx, row, r.timezone);
      await this.event(tx, row.id, 'completed', actor, { spendCents });
      return row;
    });
    this.events.publish({ type: 'booking.updated', restaurantId: r.id, reservationId: row.id });
    row.tableIds.forEach((tableId) => this.events.publish({ type: 'table.updated', restaurantId: r.id, tableId }));
    if (row.dinerId) await this.messaging.send('PUSH', row.dinerId, 'review_request', `How was ${r.name}? Leave a review.`);
    return row;
  }

  /** Business rules 1 & 5: points only for completed network bookings; Gold after 6 in 12 months. */
  private async creditLoyaltyAndBilling(tx: Tx, row: Reservation, tz: string) {
    if (row.isNetworkCover) {
      await tx.insert(billableCovers).values({ restaurantId: row.restaurantId, reservationId: row.id, covers: row.partySize, channel: row.channel, month: utcToLocal(row.startsAt, tz).date.slice(0, 7) }).onConflictDoNothing();
    }
    if (row.dinerId && NETWORK_CHANNELS.includes(row.channel as ChannelName)) {
      await tx.insert(loyaltyEntries).values({ userId: row.dinerId, points: 100, reason: 'Completed reservation', reservationId: row.id });
      const since = new Date(Date.now() - 365 * 86400000);
      const [{ n }] = await tx.select({ n: count() }).from(reservations)
        .where(and(eq(reservations.dinerId, row.dinerId), eq(reservations.status, 'COMPLETED'), gte(reservations.completedAt, since)));
      await tx.update(users).set({
        points: sql`${users.points} + 100`, completedCount: sql`${users.completedCount} + 1`,
        ...(n >= 6 ? { tier: 'GOLD' as const } : {}),
      }).where(eq(users.id, row.dinerId));
    }
  }

  async markNoShow(reservationId: string, actor: Actor) {
    const r0 = await this.getReservation(reservationId);
    this.assertTransition(r0.status, 'NO_SHOW');
    const r = await this.getRestaurant(r0.restaurantId);
    if (actor.kind !== 'SYSTEM' && r0.startsAt.getTime() + r.graceMinutes * 60000 > Date.now()) {
      throw new ConflictException(`Wait until the ${r.graceMinutes}-minute grace period has passed`);
    }
    const token = await this.tokenFor(r0);
    const { row, money } = await this.db.transaction(async (tx) => {
      const [row] = await tx.update(reservations).set({ status: 'NO_SHOW' })
        .where(and(eq(reservations.id, r0.id), eq(reservations.status, 'CONFIRMED'))).returning();
      if (!row) throw new ConflictException('Reservation changed — refresh and try again');
      const money = await this.payments.settleOnCancelOrNoShow(tx, r0, 'NO_SHOW', token, r.currency);
      await this.crm.bump(tx, r0.guestProfileId, 'noShow');
      await this.event(tx, r0.id, 'no_show', actor, { money });
      return { row, money };
    });
    this.events.publish({ type: 'booking.updated', restaurantId: r.id, reservationId: row.id });
    return { ...row, money };
  }

  async guestConfirm(code: string) {
    const [row] = await this.db.update(reservations).set({ confirmedByGuestAt: new Date() })
      .where(and(eq(reservations.code, code), eq(reservations.status, 'CONFIRMED'))).returning();
    if (!row) throw new NotFoundException();
    this.events.publish({ type: 'booking.updated', restaurantId: row.restaurantId, reservationId: row.id });
    return row;
  }
}
