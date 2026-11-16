import { randomInt } from 'crypto';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function confirmationCode(len = 8) {
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}
export function platformFee(amountCents: number) {
  const bps = Number(process.env.PLATFORM_FEE_BPS ?? 200);
  return Math.round((amountCents * bps) / 10000);
}
export const pick = <T extends object, K extends keyof T>(o: T, keys: K[]) =>
  Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]])) as Pick<T, K>;

import { HttpException, HttpStatus } from '@nestjs/common';
export class PaymentRequiredException extends HttpException {
  constructor(message: string) { super({ statusCode: 402, message, error: 'Payment Required' }, HttpStatus.PAYMENT_REQUIRED); }
}
