import { randomUUID } from 'crypto';

/**
 * Payment processor seam (PAY-01). Only tokens ever reach the platform — the
 * client SDK (Stripe Elements / Adyen Drop-in) tokenizes the card.
 * `MockPaymentProvider` is used in development and tests; add a Stripe adapter
 * implementing this interface for production.
 */
export interface PaymentProvider {
  authorize(token: string, amountCents: number, currency: string): Promise<{ ref: string; ok: boolean }>;
  capture(token: string, amountCents: number, currency: string): Promise<{ ref: string; ok: boolean }>;
  refund(ref: string, amountCents: number): Promise<{ ref: string; ok: boolean }>;
  void(ref: string): Promise<{ ok: boolean }>;
}

export class MockPaymentProvider implements PaymentProvider {
  /** Token "tok_decline" simulates a declined card. */
  async authorize(token: string) { return { ref: `auth_${randomUUID()}`, ok: token !== 'tok_decline' }; }
  async capture(token: string) { return { ref: `ch_${randomUUID()}`, ok: token !== 'tok_decline' }; }
  async refund() { return { ref: `re_${randomUUID()}`, ok: true }; }
  async void() { return { ok: true }; }
}
