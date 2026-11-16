import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { DB, Db, Tx } from '../db/db.module';
import { paymentMethods, payments, policies, Policy, Reservation } from '../db/schema';
import { platformFee, PaymentRequiredException } from '../common/util';
import { MockPaymentProvider, PaymentProvider } from './provider';

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export function depositRequired(policy: Policy | undefined | null, partySize: number) {
  if (!policy || policy.depositType === 'NONE' || partySize < policy.minPartyForDeposit) return { kind: 'NONE' as const, amountCents: 0 };
  if (policy.depositType === 'CARD_HOLD') return { kind: 'CARD_HOLD' as const, amountCents: 0 };
  const amount = policy.depositType === 'DEPOSIT_PER_PERSON' ? policy.depositAmountCents * partySize : policy.depositAmountCents;
  return { kind: 'DEPOSIT' as const, amountCents: amount };
}

/** Hours before the booking at which cancellation becomes "late" under the policy. */
export function isLateCancel(policy: Policy | null | undefined, startsAt: Date, now = new Date()) {
  if (!policy) return false;
  return startsAt.getTime() - now.getTime() < policy.cancelCutoffHours * 3600000;
}

@Injectable()
export class PaymentsService {
  constructor(@Inject(DB) private readonly db: Db, @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider) {}

  async activePolicy(restaurantId: string, q: Db | Tx = this.db) {
    const [p] = await q.select().from(policies).where(and(eq(policies.restaurantId, restaurantId), eq(policies.active, true)));
    return p ?? null;
  }

  async methodFor(userId: string | null | undefined, paymentMethodId: string | null | undefined, q: Db | Tx = this.db) {
    if (!userId || !paymentMethodId) return null;
    const [m] = await q.select().from(paymentMethods).where(and(eq(paymentMethods.id, paymentMethodId), eq(paymentMethods.userId, userId)));
    return m ?? null;
  }

  /** Called at booking commit: card hold or deposit capture according to the policy version in force. */
  async collectAtBooking(q: Tx, reservation: Reservation, policy: Policy | null, token: string | null, currency: string) {
    const need = depositRequired(policy, reservation.partySize);
    if (need.kind === 'NONE') return null;
    if (!token) throw new PaymentRequiredException('This restaurant requires a card to book');
    if (need.kind === 'CARD_HOLD') {
      const r = await this.provider.authorize(token, 0, currency);
      if (!r.ok) throw new PaymentRequiredException('Card was declined');
      const [p] = await q.insert(payments).values({ reservationId: reservation.id, kind: 'CARD_HOLD', status: 'AUTHORIZED', amountCents: 0, currency, providerRef: r.ref }).returning();
      return p;
    }
    const r = await this.provider.capture(token, need.amountCents, currency);
    if (!r.ok) throw new PaymentRequiredException('Card was declined');
    const [p] = await q.insert(payments).values({
      reservationId: reservation.id, kind: 'DEPOSIT', status: 'CAPTURED', amountCents: need.amountCents,
      platformFeeCents: platformFee(need.amountCents), currency, providerRef: r.ref,
    }).returning();
    return p;
  }

  /**
   * Apply cancellation / no-show money rules (business rule 3: the policy accepted at booking applies).
   * - Deposit: refunded if cancelled in time, otherwise retained as the fee.
   * - Card hold: fee charged on late cancel / no-show.
   */
  async settleOnCancelOrNoShow(q: Tx, reservation: Reservation, outcome: 'CANCEL_IN_TIME' | 'LATE_CANCEL' | 'NO_SHOW', token: string | null, currency: string) {
    const policy = reservation.policyId ? (await q.select().from(policies).where(eq(policies.id, reservation.policyId)))[0] : null;
    const existing = await q.select().from(payments).where(eq(payments.reservationId, reservation.id));
    const deposit = existing.find((p) => p.kind === 'DEPOSIT' && p.status === 'CAPTURED');
    const hold = existing.find((p) => p.kind === 'CARD_HOLD' && p.status === 'AUTHORIZED');
    const results: string[] = [];

    if (outcome === 'CANCEL_IN_TIME') {
      if (deposit) {
        const r = await this.provider.refund(deposit.providerRef!, deposit.amountCents);
        await q.update(payments).set({ status: 'REFUNDED' }).where(eq(payments.id, deposit.id));
        await q.insert(payments).values({ reservationId: reservation.id, kind: 'REFUND', status: 'CAPTURED', amountCents: -deposit.amountCents, currency, providerRef: r.ref, reason: 'Cancelled before cutoff' });
        results.push('deposit_refunded');
      }
      if (hold) { await this.provider.void(hold.providerRef!); await q.update(payments).set({ status: 'VOIDED' }).where(eq(payments.id, hold.id)); }
      return results;
    }

    if (deposit) { results.push('deposit_retained'); return results; }
    const perPerson = outcome === 'NO_SHOW' ? policy?.noShowFeeCents ?? 0 : policy?.lateCancelFeeCents ?? 0;
    const fee = perPerson * reservation.partySize;
    if (fee > 0 && token) {
      const r = await this.provider.capture(token, fee, currency);
      await q.insert(payments).values({
        reservationId: reservation.id, kind: outcome === 'NO_SHOW' ? 'NO_SHOW_FEE' : 'LATE_CANCEL_FEE',
        status: r.ok ? 'CAPTURED' : 'FAILED', amountCents: fee, platformFeeCents: r.ok ? platformFee(fee) : 0, currency, providerRef: r.ref,
      });
      results.push(r.ok ? 'fee_charged' : 'fee_failed');
    }
    if (hold) await q.update(payments).set({ status: 'VOIDED' }).where(eq(payments.id, hold.id));
    return results;
  }

  /** PAY-02: staff waive a fee with a reason code. */
  async waive(paymentId: string, restaurantReservationIds: string[] | null, reason: string) {
    const [p] = await this.db.select().from(payments).where(eq(payments.id, paymentId));
    if (!p || (restaurantReservationIds && !restaurantReservationIds.includes(p.reservationId))) throw new NotFoundException();
    if (!['NO_SHOW_FEE', 'LATE_CANCEL_FEE', 'DEPOSIT'].includes(p.kind) || p.status !== 'CAPTURED') throw new BadRequestException('Only captured fees or deposits can be waived');
    const r = await this.provider.refund(p.providerRef!, p.amountCents);
    await this.db.update(payments).set({ status: 'WAIVED', reason }).where(eq(payments.id, p.id));
    await this.db.insert(payments).values({ reservationId: p.reservationId, kind: 'REFUND', status: 'CAPTURED', amountCents: -p.amountCents, currency: p.currency, providerRef: r.ref, reason });
    return { ok: true };
  }

  forReservations(ids: string[]) {
    if (!ids.length) return Promise.resolve([]);
    return this.db.select().from(payments).where(inArray(payments.reservationId, ids));
  }
}

export const paymentProviderFactory = { provide: PAYMENT_PROVIDER, useFactory: () => new MockPaymentProvider() };
