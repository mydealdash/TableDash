import { BadRequestException, Body, Controller, Get, Header, Inject, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { and, asc, desc, eq, gte, inArray, lt } from 'drizzle-orm';
import { ALL_STAFF, AuthUser, CurrentUser, FLOOR_STAFF, MANAGERS, StaffRoles } from '../auth/auth.guard';
import { DB, Db } from '../db/db.module';
import { diningTables, guestProfiles, reservationEvents, reservations, restaurants, rooms } from '../db/schema';
import { BookingsService } from '../bookings/bookings.service';
import { AvailabilityService } from '../availability/availability.service';
import { CrmService } from '../crm/crm.service';
import { PaymentsService } from '../payments/payments.service';
import { EventBus } from '../common/events';
import { addDays, isDate, localToUtc, utcToLocal } from '../common/time';
import { assignTables } from '../availability/engine';

class StaffBookingDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date: string;
  @Matches(/^\d{2}:\d{2}$/) time: string;
  @IsInt() @Min(1) @Max(200) partySize: number;
  @IsString() guestName: string;
  @IsOptional() @Matches(/^\+?[0-9]{7,15}$/) guestPhone?: string;
  @IsOptional() @IsEmail() guestEmail?: string;
  @IsOptional() @IsArray() tableIds?: string[];
  @IsOptional() @IsString() tableType?: string;
  @IsOptional() @IsString() specialRequest?: string;
  @IsOptional() @IsString() occasion?: string;
  @IsOptional() @IsIn(['PHONE', 'WALK_IN']) channel?: 'PHONE' | 'WALK_IN';
  @IsOptional() @IsBoolean() seatNow?: boolean;
  @IsOptional() @IsBoolean() force?: boolean;
}
class SeatDto { @IsOptional() @IsArray() tableIds?: string[]; }
class CompleteDto { @IsOptional() @IsInt() @Min(0) spendCents?: number; }
class ModifyDto {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
  @IsOptional() @Matches(/^\d{2}:\d{2}$/) time?: string;
  @IsOptional() @IsInt() @Min(1) partySize?: number;
}
class ReasonDto { @IsOptional() @IsString() reason?: string; }
class ApproveDto { @IsArray() tableIds: string[]; }
class TableStatusDto {
  @IsIn(['AVAILABLE', 'SEATED', 'APPETIZER', 'ENTREE', 'DESSERT', 'CHECK_DROPPED', 'PAID', 'BUSSING', 'OUT_OF_SERVICE'])
  status: 'AVAILABLE' | 'SEATED' | 'APPETIZER' | 'ENTREE' | 'DESSERT' | 'CHECK_DROPPED' | 'PAID' | 'BUSSING' | 'OUT_OF_SERVICE';
}
class GuestPatchDto {
  @IsOptional() @IsArray() tags?: string[];
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() allergies?: string;
  @IsOptional() @IsBoolean() isVip?: boolean;
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsBoolean() marketingConsent?: boolean;
}
class WaiveDto { @IsString() reason: string; }

/** Restaurant-side operations: host stand (F5), manager app (F6), guestbook. Base path /manage/:rid */
@Controller('manage/:rid')
export class HostController {
  constructor(
    @Inject(DB) private readonly db: Db, private readonly bookings: BookingsService, private readonly availability: AvailabilityService,
    private readonly crm: CrmService, private readonly payments: PaymentsService, private readonly events: EventBus,
  ) {}

  private staff(u: AuthUser) { return { userId: u.id, kind: 'STAFF' as const }; }
  private async owned(rid: string, id: string) {
    const [r] = await this.db.select().from(reservations).where(and(eq(reservations.id, id), eq(reservations.restaurantId, rid)));
    if (!r) throw new NotFoundException('Reservation not found');
    return r;
  }

  /** Reservation book for a local date, with guest cards (CRM-03). */
  @StaffRoles(...ALL_STAFF) @Get('reservations')
  async book(@Param('rid') rid: string, @Query('date') date: string) {
    if (!isDate(date)) throw new BadRequestException('date=YYYY-MM-DD required');
    const [r] = await this.db.select().from(restaurants).where(eq(restaurants.id, rid));
    if (!r) throw new NotFoundException();
    const from = localToUtc(date, '00:00', r.timezone), to = localToUtc(addDays(date, 1), '04:00', r.timezone);
    const rows = await this.db.select({ res: reservations, guest: guestProfiles }).from(reservations)
      .leftJoin(guestProfiles, eq(guestProfiles.id, reservations.guestProfileId))
      .where(and(eq(reservations.restaurantId, rid), gte(reservations.startsAt, from), lt(reservations.startsAt, to)))
      .orderBy(asc(reservations.startsAt));
    const pays = await this.payments.forReservations(rows.map((x) => x.res.id));
    return rows.map(({ res, guest }) => ({
      ...res, localTime: utcToLocal(res.startsAt, r.timezone).time, guest,
      payments: pays.filter((p) => p.reservationId === res.id),
    }));
  }

  /** Live floor: rooms, tables with status and the party currently seated + next booking. */
  @StaffRoles(...ALL_STAFF) @Get('floor')
  async floor(@Param('rid') rid: string) {
    const [r] = await this.db.select().from(restaurants).where(eq(restaurants.id, rid));
    if (!r) throw new NotFoundException();
    const now = new Date();
    const [rs, ts, live] = await Promise.all([
      this.db.select().from(rooms).where(eq(rooms.restaurantId, rid)).orderBy(asc(rooms.sortOrder)),
      this.db.select().from(diningTables).where(eq(diningTables.restaurantId, rid)).orderBy(asc(diningTables.name)),
      this.db.select().from(reservations).where(and(eq(reservations.restaurantId, rid), inArray(reservations.status, ['CONFIRMED', 'SEATED']),
        gte(reservations.endsAt, new Date(now.getTime() - 4 * 3600000)), lt(reservations.startsAt, new Date(now.getTime() + 12 * 3600000))))
        .orderBy(asc(reservations.startsAt)),
    ]);
    return {
      restaurant: { id: r.id, name: r.name, timezone: r.timezone, onlineBookingEnabled: r.onlineBookingEnabled },
      rooms: rs,
      tables: ts.map((t) => ({
        ...t,
        current: live.find((x) => x.id === t.currentReservationId) ?? null,
        next: live.find((x) => x.status === 'CONFIRMED' && x.tableIds.includes(t.id) && x.startsAt > new Date(now.getTime() - 30 * 60000)) ?? null,
      })),
    };
  }

  /** TBL-03: best-fit table suggestions for a party right now or at a booking's time. */
  @StaffRoles(...FLOOR_STAFF) @Get('suggest-tables')
  async suggest(@Param('rid') rid: string, @Query('party') party: string, @Query('reservationId') reservationId?: string) {
    const { restaurant, cfg } = await this.availability.loadConfig(rid);
    const res = reservationId ? await this.owned(rid, reservationId) : null;
    const start = res?.startsAt && res.startsAt > new Date() ? res.startsAt : new Date();
    const partySize = res?.partySize ?? Number(party);
    const occ = await this.availability.loadOccupancy(rid, utcToLocal(start, restaurant.timezone).date, restaurant.timezone, new Date(), undefined, res?.id);
    const end = new Date(start.getTime() + 90 * 60000);
    const busy = new Set(occ.filter((o) => o.startsAt < end && start < o.endsAt).flatMap((o) => o.tableIds));
    return { tableIds: assignTables(cfg.tables, busy, partySize, { online: false }) ?? [], busy: [...busy] };
  }

  @StaffRoles(...FLOOR_STAFF) @Post('reservations')
  create(@Param('rid') rid: string, @Body() dto: StaffBookingDto, @CurrentUser() u: AuthUser) {
    return this.bookings.staffCreate(rid, this.staff(u), { ...dto, channel: dto.channel ?? (dto.seatNow ? 'WALK_IN' : 'PHONE') });
  }

  @StaffRoles(...FLOOR_STAFF) @Patch('reservations/:id')
  async modify(@Param('rid') rid: string, @Param('id') id: string, @Body() dto: ModifyDto, @CurrentUser() u: AuthUser) {
    await this.owned(rid, id); return this.bookings.modify(id, this.staff(u), dto);
  }
  @StaffRoles(...FLOOR_STAFF) @Post('reservations/:id/seat')
  async seat(@Param('rid') rid: string, @Param('id') id: string, @Body() dto: SeatDto, @CurrentUser() u: AuthUser) {
    await this.owned(rid, id); return this.bookings.seat(id, this.staff(u), dto.tableIds);
  }
  @StaffRoles(...FLOOR_STAFF) @Post('reservations/:id/complete')
  async complete(@Param('rid') rid: string, @Param('id') id: string, @Body() dto: CompleteDto, @CurrentUser() u: AuthUser) {
    await this.owned(rid, id); return this.bookings.complete(id, this.staff(u), dto.spendCents);
  }
  @StaffRoles(...FLOOR_STAFF) @Post('reservations/:id/no-show')
  async noShow(@Param('rid') rid: string, @Param('id') id: string, @CurrentUser() u: AuthUser) {
    await this.owned(rid, id); return this.bookings.markNoShow(id, this.staff(u));
  }
  @StaffRoles(...FLOOR_STAFF) @Post('reservations/:id/cancel')
  async cancel(@Param('rid') rid: string, @Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() u: AuthUser) {
    await this.owned(rid, id); return this.bookings.cancel(id, { userId: u.id, kind: 'STAFF' }, dto.reason);
  }
  @StaffRoles(...MANAGERS, 'HOST') @Post('reservations/:id/approve')
  async approve(@Param('rid') rid: string, @Param('id') id: string, @Body() dto: ApproveDto, @CurrentUser() u: AuthUser) {
    await this.owned(rid, id); return this.bookings.approveRequest(id, this.staff(u), dto.tableIds);
  }
  @StaffRoles(...MANAGERS, 'HOST') @Post('reservations/:id/decline')
  async decline(@Param('rid') rid: string, @Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() u: AuthUser) {
    await this.owned(rid, id); return this.bookings.declineRequest(id, this.staff(u), dto.reason);
  }
  @StaffRoles(...ALL_STAFF) @Get('reservations/:id/events')
  async history(@Param('rid') rid: string, @Param('id') id: string) {
    await this.owned(rid, id);
    return this.db.select().from(reservationEvents).where(eq(reservationEvents.reservationId, id)).orderBy(asc(reservationEvents.createdAt));
  }

  /** TBL-02: course progress and manual status changes; clearing a table completes its party. */
  @StaffRoles(...FLOOR_STAFF, 'SERVER') @Patch('tables/:tableId/status')
  async tableStatus(@Param('rid') rid: string, @Param('tableId') tableId: string, @Body() dto: TableStatusDto, @CurrentUser() u: AuthUser) {
    const [t] = await this.db.select().from(diningTables).where(and(eq(diningTables.id, tableId), eq(diningTables.restaurantId, rid)));
    if (!t) throw new NotFoundException();
    if (dto.status === 'AVAILABLE' && t.currentReservationId) {
      const [res] = await this.db.select().from(reservations).where(eq(reservations.id, t.currentReservationId));
      if (res?.status === 'SEATED') { await this.bookings.complete(res.id, this.staff(u)); return { ok: true, completed: res.id }; }
    }
    await this.db.update(diningTables).set({ status: dto.status, statusChangedAt: new Date(), ...(dto.status === 'AVAILABLE' ? { currentReservationId: null } : {}) })
      .where(eq(diningTables.id, tableId));
    this.events.publish({ type: 'table.updated', restaurantId: rid, tableId });
    return { ok: true };
  }

  // ----- Guestbook (spec 9.9) -----
  @StaffRoles(...ALL_STAFF) @Get('guests')
  guests(@Param('rid') rid: string, @Query('q') q?: string, @Query('offset') offset = '0') { return this.crm.list(rid, q, 50, Number(offset)); }
  @StaffRoles(...ALL_STAFF) @Get('guests/:id') guest(@Param('rid') rid: string, @Param('id') id: string) { return this.crm.get(rid, id); }
  @StaffRoles(...FLOOR_STAFF, 'MARKETING') @Patch('guests/:id')
  updateGuest(@Param('rid') rid: string, @Param('id') id: string, @Body() dto: GuestPatchDto) { return this.crm.update(rid, id, dto); }
  @StaffRoles(...MANAGERS, 'MARKETING') @Get('guests-export.csv') @Header('Content-Type', 'text/csv')
  exportGuests(@Param('rid') rid: string) { return this.crm.exportCsv(rid); }

  // ----- Payments -----
  @StaffRoles(...MANAGERS) @Post('payments/:paymentId/waive')
  async waive(@Param('rid') rid: string, @Param('paymentId') pid: string, @Body() dto: WaiveDto) {
    const ids = (await this.db.select({ id: reservations.id }).from(reservations).where(eq(reservations.restaurantId, rid))).map((x) => x.id);
    return this.payments.waive(pid, ids, dto.reason);
  }
}
