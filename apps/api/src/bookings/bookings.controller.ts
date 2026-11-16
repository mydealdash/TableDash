import { Body, Controller, Delete, ForbiddenException, Get, Headers, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { and, desc, eq, gte, inArray, lt } from 'drizzle-orm';
import { Inject } from '@nestjs/common';
import { AuthOptional, AuthUser, CurrentUser, Public } from '../auth/auth.guard';
import { DB, Db } from '../db/db.module';
import { reservations, restaurants } from '../db/schema';
import { BookingsService, ChannelName } from './bookings.service';

class HoldDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date: string;
  @Matches(/^\d{2}:\d{2}$/) time: string;
  @IsInt() @Min(1) @Max(50) partySize: number;
  @IsOptional() @IsString() tableType?: string;
  @IsString() @MinLength(8) sessionKey: string;
}
class ConfirmDto {
  @IsString() @MinLength(8) sessionKey: string;
  @IsOptional() @IsIn(['APP', 'WEB', 'WIDGET', 'PARTNER', 'AI_AGENT']) channel?: ChannelName;
  @IsOptional() @IsString() source?: string;
  @IsString() @MinLength(2) @MaxLength(80) guestName: string;
  @IsOptional() @Matches(/^\+?[0-9]{7,15}$/) guestPhone?: string;
  @IsOptional() @IsEmail() guestEmail?: string;
  @IsOptional() @IsString() @MaxLength(40) occasion?: string;
  @IsOptional() @IsString() @MaxLength(500) specialRequest?: string;
  @IsOptional() @IsString() paymentMethodId?: string;
  @IsOptional() @IsString() paymentToken?: string;
  @IsOptional() @IsString() idempotencyKey?: string;
  @IsOptional() @IsInt() acceptPolicyVersion?: number;
}
class RequestDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date: string;
  @Matches(/^\d{2}:\d{2}$/) time: string;
  @IsInt() @Min(1) @Max(200) partySize: number;
  @IsString() guestName: string;
  @IsOptional() @Matches(/^\+?[0-9]{7,15}$/) guestPhone?: string;
  @IsOptional() @IsEmail() guestEmail?: string;
  @IsOptional() @IsString() specialRequest?: string;
  @IsOptional() @IsString() occasion?: string;
}
class ModifyDto {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
  @IsOptional() @Matches(/^\d{2}:\d{2}$/) time?: string;
  @IsOptional() @IsInt() @Min(1) @Max(50) partySize?: number;
  @IsOptional() @IsString() tableType?: string;
}
class CancelDto { @IsOptional() @IsString() reason?: string; }

/** Partner and AI-agent channels authenticate with an API key (spec OPS-04/05, flow F). */
function resolveChannel(requested: ChannelName | undefined, partnerKey?: string): { channel: ChannelName; source?: string } {
  if (requested === 'PARTNER' || requested === 'AI_AGENT') {
    const keys = Object.fromEntries((process.env.PARTNER_KEYS ?? '').split(',').filter(Boolean).map((kv) => kv.split(':')));
    const partner = Object.entries(keys).find(([, k]) => k === partnerKey)?.[0];
    if (!partner) throw new ForbiddenException('Valid x-partner-key required for partner channels');
    return { channel: requested, source: partner };
  }
  return { channel: requested ?? 'APP' };
}

@Controller()
export class BookingsController {
  constructor(private readonly bookings: BookingsService, @Inject(DB) private readonly db: Db) {}

  @AuthOptional() @Post('restaurants/:rid/holds') @Throttle({ default: { limit: 20, ttl: 60000 } })
  hold(@Param('rid') rid: string, @Body() dto: HoldDto, @CurrentUser() user?: AuthUser) {
    return this.bookings.createHold(rid, { ...dto, dinerId: user?.id });
  }

  @Public() @Delete('holds/:id')
  release(@Param('id') id: string, @Query('sessionKey') sessionKey: string) { return this.bookings.releaseHold(id, sessionKey); }

  @AuthOptional() @Post('holds/:id/confirm') @Throttle({ default: { limit: 10, ttl: 60000 } })
  confirm(@Param('id') id: string, @Body() dto: ConfirmDto, @Headers('x-partner-key') partnerKey?: string, @CurrentUser() user?: AuthUser) {
    const { channel, source } = resolveChannel(dto.channel, partnerKey);
    if (!dto.guestPhone && !dto.guestEmail) throw new ForbiddenException('A phone or email is required');
    return this.bookings.confirm(id, { ...dto, channel, source: source ?? dto.source, dinerId: user?.id });
  }

  @AuthOptional() @Post('restaurants/:rid/requests')
  request(@Param('rid') rid: string, @Body() dto: RequestDto, @CurrentUser() user?: AuthUser) {
    return this.bookings.requestLargeParty(rid, { ...dto, dinerId: user?.id, channel: 'APP' });
  }

  /** Diner: upcoming and past reservations with restaurant summary. */
  @Get('me/reservations')
  async mine(@CurrentUser() user: AuthUser, @Query('scope') scope: 'upcoming' | 'past' = 'upcoming') {
    const now = new Date(Date.now() - 3 * 3600000);
    const rows = await this.db.select({ r: reservations, restaurant: { id: restaurants.id, name: restaurants.name, slug: restaurants.slug, photos: restaurants.photos, address: restaurants.address, timezone: restaurants.timezone, phone: restaurants.phone } })
      .from(reservations).innerJoin(restaurants, eq(restaurants.id, reservations.restaurantId))
      .where(and(eq(reservations.dinerId, user.id), scope === 'upcoming'
        ? and(gte(reservations.startsAt, now), inArray(reservations.status, ['CONFIRMED', 'REQUESTED', 'SEATED']))
        : lt(reservations.startsAt, new Date())))
      .orderBy(scope === 'upcoming' ? reservations.startsAt : desc(reservations.startsAt)).limit(100);
    return rows.map(({ r, restaurant }) => ({ ...r, restaurant }));
  }

  @Get('me/reservations/:id')
  async one(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const [row] = await this.db.select({ r: reservations, restaurant: restaurants }).from(reservations)
      .innerJoin(restaurants, eq(restaurants.id, reservations.restaurantId))
      .where(and(eq(reservations.id, id), eq(reservations.dinerId, user.id)));
    if (!row) throw new NotFoundException();
    const policy = row.r.policyId ? await this.db.query.policies.findFirst({ where: (p, { eq }) => eq(p.id, row.r.policyId!) }) : null;
    return { ...row.r, restaurant: row.restaurant, policy };
  }

  @Patch('me/reservations/:id')
  modify(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ModifyDto) {
    return this.bookings.modify(id, { userId: user.id, kind: 'DINER' }, dto);
  }

  @Post('me/reservations/:id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CancelDto) {
    return this.bookings.cancel(id, { userId: user.id, kind: 'DINER' }, dto.reason);
  }

  /** Link in the 24h reminder: guest confirms attendance (BKG-04). */
  @Public() @Post('reservations/:code/confirm-attendance')
  guestConfirm(@Param('code') code: string) { return this.bookings.guestConfirm(code).then((r) => ({ code: r.code, confirmed: true })); }
}
