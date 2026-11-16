/** Scheduled jobs: hold expiry, reminders, Notify dispatch, auto-resolve unmarked bookings (business rule 1). */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, eq, isNull, lt, gte, lte } from 'drizzle-orm';
import { DB, Db } from '../db/db.module';
import { holds, reservations, restaurants } from '../db/schema';
import { EventBus } from '../common/events';
import { MessagingService } from '../messaging/messaging.service';
import { NotifyService } from '../notify/notify.service';
import { BookingsService } from '../bookings/bookings.service';
import { utcToLocal } from '../common/time';

@Injectable()
export class JobsService {
  private readonly log = new Logger('Jobs');
  constructor(@Inject(DB) private readonly db: Db, private readonly events: EventBus, private readonly messaging: MessagingService,
    private readonly notify: NotifyService, private readonly bookings: BookingsService) {}

  private get enabled() { return process.env.JOBS_ENABLED !== 'false'; }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async expireHolds(now = new Date()) {
    if (!this.enabled) return 0;
    const expired = await this.db.update(holds).set({ releasedAt: now })
      .where(and(isNull(holds.releasedAt), isNull(holds.consumedAt), lt(holds.expiresAt, now))).returning();
    for (const h of expired) {
      const [r] = await this.db.select().from(restaurants).where(eq(restaurants.id, h.restaurantId));
      if (r) this.events.publish({ type: 'slot.released', restaurantId: r.id, date: utcToLocal(h.startsAt, r.timezone).date, startsAt: h.startsAt.toISOString() });
    }
    return expired.length;
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async notifyDispatch() { if (this.enabled) await this.notify.dispatchDue(); }

  /** BKG-04: reminder ~24h before with a confirm link. */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async reminders(now = new Date()) {
    if (!this.enabled) return 0;
    const due = await this.db.select({ res: reservations, r: restaurants }).from(reservations).innerJoin(restaurants, eq(restaurants.id, reservations.restaurantId))
      .where(and(eq(reservations.status, 'CONFIRMED'), isNull(reservations.reminderSentAt), gte(reservations.startsAt, now), lte(reservations.startsAt, new Date(now.getTime() + 24 * 3600000))));
    for (const { res, r } of due) {
      const t = utcToLocal(res.startsAt, r.timezone);
      const body = `Reminder: ${r.name} on ${t.date} at ${t.time} for ${res.partySize}. Reply C to confirm or manage: tabledash://reservation/${res.code}`;
      await this.messaging.send('SMS', res.guestPhone, 'reminder', body);
      await this.messaging.send('EMAIL', res.guestEmail, 'reminder', body);
      await this.db.update(reservations).set({ reminderSentAt: now }).where(eq(reservations.id, res.id));
    }
    return due.length;
  }

  /** Rule 1: bookings still CONFIRMED 48h after their time were never marked — treat as seated and complete them. */
  @Cron(CronExpression.EVERY_HOUR)
  async autoResolve(now = new Date()) {
    if (!this.enabled) return 0;
    const stale = await this.db.select().from(reservations).where(and(eq(reservations.status, 'CONFIRMED'), lt(reservations.startsAt, new Date(now.getTime() - 48 * 3600000))));
    for (const r of stale) {
      await this.db.update(reservations).set({ status: 'SEATED', seatedAt: r.startsAt }).where(eq(reservations.id, r.id));
      await this.bookings.complete(r.id, { kind: 'SYSTEM' }).catch((e) => this.log.warn(`auto-complete ${r.id}: ${e.message}`));
    }
    await this.notify.expirePast();
    return stale.length;
  }
}
