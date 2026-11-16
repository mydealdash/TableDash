/** Internal admin console API (spec F9, OPS-08): onboarding, accounts, disputes, moderation, audit. */
import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { IsIn, IsNumber, IsOptional, IsString, IsEmail, Matches } from 'class-validator';
import { and, count, desc, eq, gte, ilike, inArray, or, sql, sum } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { AdminOnly, AuthUser, CurrentUser } from '../auth/auth.guard';
import { DB, Db } from '../db/db.module';
import {
  auditLogs, billableCovers, payments, policies, reservations, restaurants, reviews, shifts, staffMemberships, turnTimes, users, rooms, diningTables,
} from '../db/schema';
import { AuditService } from '../common/audit.service';
import { recomputeRating } from '../reviews/reviews.controller';

class OnboardDto {
  @IsString() name: string;
  @Matches(/^[a-z0-9-]+$/) slug: string;
  @IsString() cuisine: string;
  @IsString() city: string;
  @IsString() address: string;
  @IsNumber() lat: number;
  @IsNumber() lng: number;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() neighborhood?: string;
  @IsOptional() @IsIn(['BASIC', 'CORE', 'PRO']) plan?: string;
  @IsEmail() ownerEmail: string;
  @IsString() ownerFirstName: string;
  @IsString() ownerLastName: string;
  @IsString() ownerTempPassword: string;
}
class StatusDto { @IsIn(['ONBOARDING', 'LIVE', 'PAUSED', 'SUSPENDED']) status: 'ONBOARDING' | 'LIVE' | 'PAUSED' | 'SUSPENDED'; @IsOptional() @IsIn(['BASIC', 'CORE', 'PRO']) plan?: string; }
class ModerateDto { @IsIn(['PUBLISHED', 'REMOVED']) status: 'PUBLISHED' | 'REMOVED'; }
class DisputeDto { @IsIn(['DISPUTED', 'REFUNDED']) status: 'DISPUTED' | 'REFUNDED'; @IsOptional() @IsString() reason?: string; }

@AdminOnly()
@Controller('admin')
export class AdminController {
  constructor(@Inject(DB) private readonly db: Db, private readonly audit: AuditService, private readonly jwt: JwtService) {}

  @Get('stats') async stats() {
    const since = new Date(Date.now() - 30 * 86400000);
    const [[r], [u], [res], [cov], [flagged]] = await Promise.all([
      this.db.select({ total: count(), live: sql<number>`count(*) filter (where status = 'LIVE')` }).from(restaurants),
      this.db.select({ n: count() }).from(users).where(eq(users.platformRole, 'DINER')),
      this.db.select({ n: count(), noShows: sql<number>`count(*) filter (where status = 'NO_SHOW')`, covers: sum(reservations.partySize) })
        .from(reservations).where(gte(reservations.startsAt, since)),
      this.db.select({ n: sum(billableCovers.covers) }).from(billableCovers).where(gte(billableCovers.createdAt, since)),
      this.db.select({ n: count() }).from(reviews).where(eq(reviews.status, 'FLAGGED')),
    ]);
    return { restaurants: r, diners: u.n, last30d: { reservations: res.n, covers: Number(res.covers ?? 0), noShows: Number(res.noShows), networkCovers: Number(cov.n ?? 0) }, flaggedReviews: flagged.n };
  }

  @Get('restaurants') restaurants(@Query('q') q?: string, @Query('status') status?: string) {
    const conds = [] as any[];
    if (q) conds.push(or(ilike(restaurants.name, `%${q}%`), ilike(restaurants.city, `%${q}%`)));
    if (status) conds.push(eq(restaurants.status, status as any));
    return this.db.select().from(restaurants).where(conds.length ? and(...conds) : undefined).orderBy(desc(restaurants.createdAt)).limit(500);
  }

  @Get('restaurants/:id') async restaurant(@Param('id') id: string) {
    const [r] = await this.db.select().from(restaurants).where(eq(restaurants.id, id));
    if (!r) throw new NotFoundException();
    const staff = await this.db.select({ id: staffMemberships.id, role: staffMemberships.role, email: users.email, name: users.firstName })
      .from(staffMemberships).innerJoin(users, eq(users.id, staffMemberships.userId)).where(eq(staffMemberships.restaurantId, id));
    const covers = await this.db.select({ month: billableCovers.month, covers: sum(billableCovers.covers) }).from(billableCovers)
      .where(eq(billableCovers.restaurantId, id)).groupBy(billableCovers.month).orderBy(desc(billableCovers.month));
    return { ...r, staff, billing: covers };
  }

  /** Create a restaurant with its owner account and sensible defaults; status starts ONBOARDING. */
  @Post('restaurants') async onboard(@Body() dto: OnboardDto, @CurrentUser() u: AuthUser) {
    const [dupe] = await this.db.select({ id: restaurants.id }).from(restaurants).where(eq(restaurants.slug, dto.slug));
    if (dupe) throw new BadRequestException('Slug in use');
    const result = await this.db.transaction(async (tx) => {
      const [r] = await tx.insert(restaurants).values({
        name: dto.name, slug: dto.slug, cuisine: dto.cuisine, city: dto.city, address: dto.address, lat: dto.lat, lng: dto.lng,
        timezone: dto.timezone ?? 'America/New_York', neighborhood: dto.neighborhood ?? '', plan: dto.plan ?? 'CORE',
      }).returning();
      const email = dto.ownerEmail.toLowerCase();
      let [owner] = await tx.select().from(users).where(eq(users.email, email));
      if (!owner) [owner] = await tx.insert(users).values({ email, firstName: dto.ownerFirstName, lastName: dto.ownerLastName, passwordHash: await bcrypt.hash(dto.ownerTempPassword, 10) }).returning();
      await tx.insert(staffMemberships).values({ userId: owner.id, restaurantId: r.id, role: 'OWNER' });
      await tx.insert(shifts).values({ restaurantId: r.id, name: 'Dinner', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startTime: '17:00', endTime: '21:30', slotInterval: 15 });
      await tx.insert(turnTimes).values([
        { restaurantId: r.id, minParty: 1, maxParty: 2, minutes: 90 }, { restaurantId: r.id, minParty: 3, maxParty: 4, minutes: 105 },
        { restaurantId: r.id, minParty: 5, maxParty: 20, minutes: 135 },
      ]);
      await tx.insert(policies).values({ restaurantId: r.id, version: 1, text: 'Please cancel at least 24 hours in advance.' });
      const [room] = await tx.insert(rooms).values({ restaurantId: r.id, name: 'Main room' }).returning();
      await tx.insert(diningTables).values([1, 2, 3, 4].map((n) => ({ restaurantId: r.id, roomId: room.id, name: `T${n}`, minCovers: 1, maxCovers: n <= 2 ? 2 : 4, x: 40 + n * 110, y: 60 })));
      return r;
    });
    await this.audit.log({ actorId: u.id, restaurantId: result.id, action: 'onboarded', entity: 'restaurant', entityId: result.id });
    return result;
  }

  @Patch('restaurants/:id') async setStatus(@Param('id') id: string, @Body() dto: StatusDto, @CurrentUser() u: AuthUser) {
    const [r] = await this.db.update(restaurants).set(dto).where(eq(restaurants.id, id)).returning();
    if (!r) throw new NotFoundException();
    await this.audit.log({ actorId: u.id, restaurantId: id, action: 'status_changed', entity: 'restaurant', entityId: id, data: dto });
    return r;
  }

  /** Support impersonation: short-lived token, always audited. */
  @Post('restaurants/:id/impersonate') async impersonate(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    await this.audit.log({ actorId: u.id, restaurantId: id, action: 'impersonated', entity: 'restaurant', entityId: id });
    return { token: await this.jwt.signAsync({ sub: u.id, role: 'ADMIN' }, { expiresIn: '1h' }), restaurantId: id };
  }

  @Get('users') users(@Query('q') q?: string) {
    return this.db.select({ id: users.id, email: users.email, phone: users.phone, firstName: users.firstName, lastName: users.lastName,
      platformRole: users.platformRole, tier: users.tier, points: users.points, createdAt: users.createdAt, deletedAt: users.deletedAt })
      .from(users).where(q ? or(ilike(users.email, `%${q}%`), ilike(users.firstName, `%${q}%`), ilike(users.lastName, `%${q}%`), ilike(users.phone, `%${q}%`)) : undefined)
      .orderBy(desc(users.createdAt)).limit(200);
  }

  @Get('reviews') flagged(@Query('status') status = 'FLAGGED') {
    return this.db.select({ r: reviews, restaurant: restaurants.name, author: users.firstName }).from(reviews)
      .innerJoin(restaurants, eq(restaurants.id, reviews.restaurantId)).innerJoin(users, eq(users.id, reviews.dinerId))
      .where(eq(reviews.status, status as any)).orderBy(desc(reviews.createdAt)).limit(200)
      .then((rows) => rows.map((x) => ({ ...x.r, restaurant: x.restaurant, author: x.author })));
  }
  @Patch('reviews/:id') async moderate(@Param('id') id: string, @Body() dto: ModerateDto, @CurrentUser() u: AuthUser) {
    const [rv] = await this.db.update(reviews).set({ status: dto.status }).where(eq(reviews.id, id)).returning();
    if (!rv) throw new NotFoundException();
    await recomputeRating(this.db, rv.restaurantId);
    await this.audit.log({ actorId: u.id, restaurantId: rv.restaurantId, action: `review_${dto.status.toLowerCase()}`, entity: 'review', entityId: id });
    return rv;
  }

  @Get('payments') payments(@Query('status') status?: string) {
    return this.db.select({ p: payments, code: reservations.code, guest: reservations.guestName, restaurant: restaurants.name, startsAt: reservations.startsAt })
      .from(payments).innerJoin(reservations, eq(reservations.id, payments.reservationId)).innerJoin(restaurants, eq(restaurants.id, reservations.restaurantId))
      .where(status ? eq(payments.status, status as any) : inArray(payments.kind, ['DEPOSIT', 'NO_SHOW_FEE', 'LATE_CANCEL_FEE']))
      .orderBy(desc(payments.createdAt)).limit(300)
      .then((rows) => rows.map((x) => ({ ...x.p, code: x.code, guest: x.guest, restaurant: x.restaurant, startsAt: x.startsAt })));
  }

  /** PAY-06: chargeback handling; evidence = reservation events + policy accepted. */
  @Get('payments/:id/evidence') async evidence(@Param('id') id: string) {
    const [p] = await this.db.select().from(payments).where(eq(payments.id, id));
    if (!p) throw new NotFoundException();
    const [res] = await this.db.select().from(reservations).where(eq(reservations.id, p.reservationId));
    const policy = res.policyId ? (await this.db.select().from(policies).where(eq(policies.id, res.policyId)))[0] : null;
    const events = await this.db.query.reservationEvents.findMany({ where: (e, { eq }) => eq(e.reservationId, res.id), orderBy: (e, { asc }) => asc(e.createdAt) });
    return { payment: p, reservation: res, policyAccepted: policy, timeline: events };
  }
  @Patch('payments/:id') async dispute(@Param('id') id: string, @Body() dto: DisputeDto, @CurrentUser() u: AuthUser) {
    const [p] = await this.db.update(payments).set({ status: dto.status, reason: dto.reason }).where(eq(payments.id, id)).returning();
    if (!p) throw new NotFoundException();
    await this.audit.log({ actorId: u.id, action: `payment_${dto.status.toLowerCase()}`, entity: 'payment', entityId: id, data: dto });
    return p;
  }

  @Get('audit') audit_(@Query('restaurantId') rid?: string) {
    return this.db.select().from(auditLogs).where(rid ? eq(auditLogs.restaurantId, rid) : undefined).orderBy(desc(auditLogs.createdAt)).limit(300);
  }
}
