/** Reporting (spec 9.12 OPS-01/02): pre-shift report and performance summary. */
import { BadRequestException, Controller, Get, Header, Inject, NotFoundException, Param, Query } from '@nestjs/common';
import { and, asc, eq, gte, lt } from 'drizzle-orm';
import { ALL_STAFF, MANAGERS, StaffRoles } from '../auth/auth.guard';
import { DB, Db } from '../db/db.module';
import { billableCovers, guestProfiles, notifySubscriptions, reservations, restaurants, waitlistEntries } from '../db/schema';
import { addDays, isDate, localToUtc, utcToLocal } from '../common/time';

@Controller('manage/:rid/reports')
export class ReportsController {
  constructor(@Inject(DB) private readonly db: Db) {}

  private async tz(rid: string) {
    const [r] = await this.db.select().from(restaurants).where(eq(restaurants.id, rid));
    if (!r) throw new NotFoundException();
    return r;
  }

  @StaffRoles(...ALL_STAFF) @Get('pre-shift')
  async preShift(@Param('rid') rid: string, @Query('date') date: string) {
    if (!isDate(date)) throw new BadRequestException('date required');
    const r = await this.tz(rid);
    const rows = await this.db.select({ res: reservations, g: guestProfiles }).from(reservations)
      .leftJoin(guestProfiles, eq(guestProfiles.id, reservations.guestProfileId))
      .where(and(eq(reservations.restaurantId, rid), gte(reservations.startsAt, localToUtc(date, '00:00', r.timezone)),
        lt(reservations.startsAt, localToUtc(addDays(date, 1), '04:00', r.timezone))))
      .orderBy(asc(reservations.startsAt));
    const active = rows.filter((x) => ['CONFIRMED', 'SEATED', 'COMPLETED', 'REQUESTED'].includes(x.res.status));
    const line = (x: (typeof rows)[number]) => ({
      id: x.res.id, time: utcToLocal(x.res.startsAt, r.timezone).time, name: x.res.guestName, partySize: x.res.partySize,
      tags: x.g?.tags ?? [], allergies: x.g?.allergies ?? '', notes: x.g?.notes ?? '', occasion: x.res.occasion, request: x.res.specialRequest,
      visits: x.g?.visitCount ?? 0, noShows: x.g?.noShowCount ?? 0, confirmed: !!x.res.confirmedByGuestAt, status: x.res.status,
    });
    return {
      date, covers: active.reduce((s, x) => s + x.res.partySize, 0), parties: active.length,
      byShiftHour: Object.entries(active.reduce<Record<string, number>>((acc, x) => {
        const h = utcToLocal(x.res.startsAt, r.timezone).time.slice(0, 2) + ':00'; acc[h] = (acc[h] ?? 0) + x.res.partySize; return acc;
      }, {})).map(([hour, covers]) => ({ hour, covers })),
      vips: active.filter((x) => x.g?.isVip || x.g?.tags.includes('VIP')).map(line),
      allergies: active.filter((x) => x.g?.allergies).map(line),
      occasions: active.filter((x) => x.res.occasion).map(line),
      largeParties: active.filter((x) => x.res.partySize >= 6).map(line),
      pendingRequests: active.filter((x) => x.res.status === 'REQUESTED').map(line),
      // Expected no-show risk: unconfirmed guests with prior no-shows.
      noShowRisk: active.filter((x) => x.res.status === 'CONFIRMED' && !x.res.confirmedByGuestAt && (x.g?.noShowCount ?? 0) > 0).map(line),
    };
  }

  @StaffRoles(...MANAGERS) @Get('summary')
  async summary(@Param('rid') rid: string, @Query('from') from: string, @Query('to') to: string) {
    if (!isDate(from) || !isDate(to)) throw new BadRequestException('from and to required');
    const r = await this.tz(rid);
    const rows = await this.db.select().from(reservations).where(and(eq(reservations.restaurantId, rid),
      gte(reservations.startsAt, localToUtc(from, '00:00', r.timezone)), lt(reservations.startsAt, localToUtc(addDays(to, 1), '00:00', r.timezone))));
    const done = rows.filter((x) => x.status === 'COMPLETED');
    const ended = rows.filter((x) => ['COMPLETED', 'NO_SHOW'].includes(x.status));
    const byChannel: Record<string, { parties: number; covers: number }> = {};
    for (const x of done) { byChannel[x.channel] ??= { parties: 0, covers: 0 }; byChannel[x.channel].parties++; byChannel[x.channel].covers += x.partySize; }
    const turns = done.filter((x) => x.seatedAt && x.completedAt).map((x) => (x.completedAt!.getTime() - x.seatedAt!.getTime()) / 60000);
    const spend = done.filter((x) => x.spendCents != null);
    const daily: Record<string, number> = {};
    for (const x of done) { const d = utcToLocal(x.startsAt, r.timezone).date; daily[d] = (daily[d] ?? 0) + x.partySize; }
    const wl = await this.db.select().from(waitlistEntries).where(and(eq(waitlistEntries.restaurantId, rid),
      gte(waitlistEntries.createdAt, localToUtc(from, '00:00', r.timezone)), lt(waitlistEntries.createdAt, localToUtc(addDays(to, 1), '00:00', r.timezone))));
    const nt = await this.db.select().from(notifySubscriptions).where(and(eq(notifySubscriptions.restaurantId, rid), gte(notifySubscriptions.date, from), lt(notifySubscriptions.date, addDays(to, 1))));
    return {
      from, to,
      covers: done.reduce((s, x) => s + x.partySize, 0), parties: done.length,
      noShowRate: ended.length ? rows.filter((x) => x.status === 'NO_SHOW').length / ended.length : 0,
      cancellations: rows.filter((x) => x.status === 'CANCELLED').length,
      avgPartySize: done.length ? done.reduce((s, x) => s + x.partySize, 0) / done.length : 0,
      avgTurnMinutes: turns.length ? Math.round(turns.reduce((a, b) => a + b, 0) / turns.length) : null,
      spendPerCoverCents: spend.length ? Math.round(spend.reduce((s, x) => s + x.spendCents!, 0) / spend.reduce((s, x) => s + x.partySize, 0)) : null,
      byChannel, dailyCovers: Object.entries(daily).sort().map(([date, covers]) => ({ date, covers })),
      waitlist: { joined: wl.length, seated: wl.filter((w) => w.status === 'SEATED').length },
      notify: { subscriptions: nt.length, converted: nt.filter((n) => n.status === 'BOOKED').length },
    };
  }

  /** Billable network covers by month (OPS-07 metering). */
  @StaffRoles('OWNER') @Get('billing')
  async billing(@Param('rid') rid: string) {
    const rows = await this.db.select().from(billableCovers).where(eq(billableCovers.restaurantId, rid));
    const byMonth: Record<string, number> = {};
    rows.forEach((x) => (byMonth[x.month] = (byMonth[x.month] ?? 0) + x.covers));
    return Object.entries(byMonth).sort().reverse().map(([month, covers]) => ({ month, networkCovers: covers }));
  }

  @StaffRoles(...MANAGERS) @Get('reservations.csv') @Header('Content-Type', 'text/csv')
  async csv(@Param('rid') rid: string, @Query('from') from: string, @Query('to') to: string) {
    const r = await this.tz(rid);
    const rows = await this.db.select().from(reservations).where(and(eq(reservations.restaurantId, rid),
      gte(reservations.startsAt, localToUtc(from, '00:00', r.timezone)), lt(reservations.startsAt, localToUtc(addDays(to, 1), '00:00', r.timezone))));
    const head = 'code,date,time,party,status,channel,guest,phone,email,spend_cents';
    return [head, ...rows.map((x) => { const l = utcToLocal(x.startsAt, r.timezone);
      return [x.code, l.date, l.time, x.partySize, x.status, x.channel, `"${x.guestName.replace(/"/g, '""')}"`, x.guestPhone ?? '', x.guestEmail ?? '', x.spendCents ?? ''].join(','); })].join('\n');
  }
}
