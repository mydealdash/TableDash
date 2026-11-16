/** Back-office configuration (spec 9.8 CFG, PRF-03, TBL-01). Base path /manage/:rid/settings */
import { BadRequestException, Body, Controller, Delete, Get, Inject, NotFoundException, Param, Patch, Post, Put } from '@nestjs/common';
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { and, asc, desc, eq } from 'drizzle-orm';
import { ALL_STAFF, AuthUser, CurrentUser, MANAGERS, StaffRoles } from '../auth/auth.guard';
import { DB, Db } from '../db/db.module';
import { closures, diningTables, policies, restaurants, rooms, shifts, staffMemberships, turnTimes, users } from '../db/schema';
import { AuditService } from '../common/audit.service';
import * as bcrypt from 'bcryptjs';

class ProfileDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() cuisine?: string;
  @IsOptional() @IsInt() @Min(1) @Max(4) priceBand?: number;
  @IsOptional() @IsString() neighborhood?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsArray() photos?: string[];
  @IsOptional() @IsString() menuUrl?: string;
  @IsOptional() @IsArray() features?: string[];
  @IsOptional() @IsBoolean() onlineBookingEnabled?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(365) bookingWindowDays?: number;
  @IsOptional() @IsInt() @Min(1) @Max(50) maxPartyOnline?: number;
  @IsOptional() @IsInt() @Min(1) @Max(200) largePartyRequestMax?: number;
  @IsOptional() @IsInt() @Min(1) @Max(30) holdMinutes?: number;
  @IsOptional() @IsInt() @Min(0) @Max(60) graceMinutes?: number;
  @IsOptional() @IsInt() @Min(1) @Max(10) maxActiveBookingsPerDiner?: number;
}
class ShiftDto {
  @IsString() name: string;
  @IsArray() @IsInt({ each: true }) daysOfWeek: number[];
  @Matches(/^\d{2}:\d{2}$/) startTime: string;
  @Matches(/^\d{2}:\d{2}$/) endTime: string;
  @IsIn([15, 30, 60]) slotInterval: number;
  @IsOptional() @IsInt() maxCoversPerSlot?: number | null;
  @IsOptional() @IsInt() maxPartiesPerSlot?: number | null;
  @IsOptional() @IsBoolean() onlineEnabled?: boolean;
}
class TableDto {
  @IsString() name: string;
  @IsInt() @Min(1) minCovers: number;
  @IsInt() @Min(1) maxCovers: number;
  @IsOptional() @IsIn(['DINING_ROOM', 'BAR', 'PATIO', 'COUNTER']) tableType?: string;
  @IsOptional() @IsString() roomId?: string | null;
  @IsOptional() @IsString() section?: string | null;
  @IsOptional() @IsInt() x?: number;
  @IsOptional() @IsInt() y?: number;
  @IsOptional() @IsInt() width?: number;
  @IsOptional() @IsInt() height?: number;
  @IsOptional() @IsIn(['rect', 'round']) shape?: string;
  @IsOptional() @IsArray() combinableWith?: string[];
  @IsOptional() @IsBoolean() onlineBookable?: boolean;
}
class RoomDto { @IsString() name: string; @IsOptional() @IsInt() sortOrder?: number; }
class TurnRowDto { @IsInt() minParty: number; @IsInt() maxParty: number; @IsInt() @Min(15) minutes: number; }
class TurnTimesDto { @IsArray() @ValidateNested({ each: true }) @Type(() => TurnRowDto) rows: TurnRowDto[]; }
class PolicyDto {
  @IsInt() @Min(0) cancelCutoffHours: number;
  @IsIn(['NONE', 'CARD_HOLD', 'DEPOSIT_PER_PERSON', 'DEPOSIT_PER_PARTY']) depositType: 'NONE' | 'CARD_HOLD' | 'DEPOSIT_PER_PERSON' | 'DEPOSIT_PER_PARTY';
  @IsInt() @Min(0) depositAmountCents: number;
  @IsInt() @Min(0) noShowFeeCents: number;
  @IsInt() @Min(0) lateCancelFeeCents: number;
  @IsInt() @Min(1) minPartyForDeposit: number;
  @IsString() text: string;
}
class ClosureDto { @Matches(/^\d{4}-\d{2}-\d{2}$/) date: string; @IsOptional() @IsString() reason?: string; }
class StaffDto {
  @IsString() email: string;
  @IsString() firstName: string;
  @IsString() lastName: string;
  @IsIn(['OWNER', 'MANAGER', 'HOST', 'SERVER', 'MARKETING', 'READ_ONLY']) role: 'OWNER' | 'MANAGER' | 'HOST' | 'SERVER' | 'MARKETING' | 'READ_ONLY';
  @IsOptional() @IsString() tempPassword?: string;
}

@Controller('manage/:rid/settings')
export class SettingsController {
  constructor(@Inject(DB) private readonly db: Db, private readonly audit: AuditService) {}

  @StaffRoles(...ALL_STAFF) @Get()
  async all(@Param('rid') rid: string) {
    const [r] = await this.db.select().from(restaurants).where(eq(restaurants.id, rid));
    if (!r) throw new NotFoundException();
    const [rs, ts, ss, tt, ps, cs] = await Promise.all([
      this.db.select().from(rooms).where(eq(rooms.restaurantId, rid)).orderBy(asc(rooms.sortOrder)),
      this.db.select().from(diningTables).where(eq(diningTables.restaurantId, rid)).orderBy(asc(diningTables.name)),
      this.db.select().from(shifts).where(eq(shifts.restaurantId, rid)).orderBy(asc(shifts.startTime)),
      this.db.select().from(turnTimes).where(eq(turnTimes.restaurantId, rid)).orderBy(asc(turnTimes.minParty)),
      this.db.select().from(policies).where(eq(policies.restaurantId, rid)).orderBy(desc(policies.version)),
      this.db.select().from(closures).where(eq(closures.restaurantId, rid)).orderBy(asc(closures.date)),
    ]);
    return { restaurant: r, rooms: rs, tables: ts, shifts: ss, turnTimes: tt, policies: ps, closures: cs };
  }

  @StaffRoles(...MANAGERS, 'MARKETING') @Patch('profile')
  async profile(@Param('rid') rid: string, @Body() dto: ProfileDto, @CurrentUser() u: AuthUser) {
    const [r] = await this.db.update(restaurants).set(dto).where(eq(restaurants.id, rid)).returning();
    await this.audit.log({ actorId: u.id, restaurantId: rid, action: 'update', entity: 'restaurant', entityId: rid, data: dto });
    return r;
  }

  /** CFG-06: instant online-booking kill switch. */
  @StaffRoles(...MANAGERS, 'HOST') @Put('online-booking')
  async online(@Param('rid') rid: string, @Body() dto: { enabled: boolean }, @CurrentUser() u: AuthUser) {
    await this.db.update(restaurants).set({ onlineBookingEnabled: !!dto.enabled }).where(eq(restaurants.id, rid));
    await this.audit.log({ actorId: u.id, restaurantId: rid, action: dto.enabled ? 'online_on' : 'online_off', entity: 'restaurant', entityId: rid });
    return { onlineBookingEnabled: !!dto.enabled };
  }

  // Shifts
  @StaffRoles(...MANAGERS) @Post('shifts') async addShift(@Param('rid') rid: string, @Body() dto: ShiftDto) {
    if (dto.startTime > dto.endTime) throw new BadRequestException('startTime must be before endTime');
    return (await this.db.insert(shifts).values({ ...dto, restaurantId: rid }).returning())[0];
  }
  @StaffRoles(...MANAGERS) @Patch('shifts/:id') async editShift(@Param('rid') rid: string, @Param('id') id: string, @Body() dto: ShiftDto) {
    return (await this.db.update(shifts).set(dto).where(and(eq(shifts.id, id), eq(shifts.restaurantId, rid))).returning())[0];
  }
  @StaffRoles(...MANAGERS) @Delete('shifts/:id') async delShift(@Param('rid') rid: string, @Param('id') id: string) {
    await this.db.delete(shifts).where(and(eq(shifts.id, id), eq(shifts.restaurantId, rid))); return { ok: true };
  }

  // Rooms & tables (floor-plan editor)
  @StaffRoles(...MANAGERS) @Post('rooms') async addRoom(@Param('rid') rid: string, @Body() dto: RoomDto) {
    return (await this.db.insert(rooms).values({ ...dto, restaurantId: rid }).returning())[0];
  }
  @StaffRoles(...MANAGERS) @Delete('rooms/:id') async delRoom(@Param('rid') rid: string, @Param('id') id: string) {
    await this.db.delete(rooms).where(and(eq(rooms.id, id), eq(rooms.restaurantId, rid))); return { ok: true };
  }
  @StaffRoles(...MANAGERS) @Post('tables') async addTable(@Param('rid') rid: string, @Body() dto: TableDto) {
    if (dto.minCovers > dto.maxCovers) throw new BadRequestException('minCovers must be <= maxCovers');
    return (await this.db.insert(diningTables).values({ ...dto, restaurantId: rid }).returning())[0];
  }
  @StaffRoles(...MANAGERS) @Patch('tables/:id') async editTable(@Param('rid') rid: string, @Param('id') id: string, @Body() dto: Partial<TableDto>) {
    return (await this.db.update(diningTables).set(dto).where(and(eq(diningTables.id, id), eq(diningTables.restaurantId, rid))).returning())[0];
  }
  @StaffRoles(...MANAGERS) @Delete('tables/:id') async delTable(@Param('rid') rid: string, @Param('id') id: string) {
    await this.db.delete(diningTables).where(and(eq(diningTables.id, id), eq(diningTables.restaurantId, rid))); return { ok: true };
  }

  @StaffRoles(...MANAGERS) @Put('turn-times') async setTurns(@Param('rid') rid: string, @Body() dto: TurnTimesDto) {
    await this.db.transaction(async (tx) => {
      await tx.delete(turnTimes).where(eq(turnTimes.restaurantId, rid));
      if (dto.rows.length) await tx.insert(turnTimes).values(dto.rows.map((r) => ({ ...r, restaurantId: rid })));
    });
    return this.db.select().from(turnTimes).where(eq(turnTimes.restaurantId, rid));
  }

  /** CFG-05: policies are versioned; existing bookings keep the version they accepted. */
  @StaffRoles(...MANAGERS) @Post('policies') async newPolicy(@Param('rid') rid: string, @Body() dto: PolicyDto, @CurrentUser() u: AuthUser) {
    const p = await this.db.transaction(async (tx) => {
      const [last] = await tx.select().from(policies).where(eq(policies.restaurantId, rid)).orderBy(desc(policies.version)).limit(1);
      await tx.update(policies).set({ active: false }).where(eq(policies.restaurantId, rid));
      return (await tx.insert(policies).values({ ...dto, restaurantId: rid, version: (last?.version ?? 0) + 1, active: true }).returning())[0];
    });
    await this.audit.log({ actorId: u.id, restaurantId: rid, action: 'policy_published', entity: 'policy', entityId: p.id, data: dto });
    return p;
  }

  @StaffRoles(...MANAGERS) @Post('closures') async addClosure(@Param('rid') rid: string, @Body() dto: ClosureDto) {
    return (await this.db.insert(closures).values({ ...dto, restaurantId: rid }).onConflictDoNothing().returning())[0] ?? { ok: true };
  }
  @StaffRoles(...MANAGERS) @Delete('closures/:id') async delClosure(@Param('rid') rid: string, @Param('id') id: string) {
    await this.db.delete(closures).where(and(eq(closures.id, id), eq(closures.restaurantId, rid))); return { ok: true };
  }

  // Staff & roles (OPS-06)
  @StaffRoles(...MANAGERS) @Get('staff') staff(@Param('rid') rid: string) {
    return this.db.select({ id: staffMemberships.id, role: staffMemberships.role, userId: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName })
      .from(staffMemberships).innerJoin(users, eq(users.id, staffMemberships.userId)).where(eq(staffMemberships.restaurantId, rid));
  }
  @StaffRoles('OWNER') @Post('staff') async addStaff(@Param('rid') rid: string, @Body() dto: StaffDto, @CurrentUser() u: AuthUser) {
    const email = dto.email.toLowerCase();
    let [user] = await this.db.select().from(users).where(eq(users.email, email));
    if (!user) {
      [user] = await this.db.insert(users).values({ email, firstName: dto.firstName, lastName: dto.lastName,
        passwordHash: await bcrypt.hash(dto.tempPassword ?? Math.random().toString(36).slice(2, 12), 10) }).returning();
    }
    const [m] = await this.db.insert(staffMemberships).values({ userId: user.id, restaurantId: rid, role: dto.role })
      .onConflictDoUpdate({ target: [staffMemberships.userId, staffMemberships.restaurantId], set: { role: dto.role } }).returning();
    await this.audit.log({ actorId: u.id, restaurantId: rid, action: 'staff_added', entity: 'staff', entityId: m.id, data: { email, role: dto.role } });
    return m;
  }
  @StaffRoles('OWNER') @Delete('staff/:id') async delStaff(@Param('rid') rid: string, @Param('id') id: string, @CurrentUser() u: AuthUser) {
    await this.db.delete(staffMemberships).where(and(eq(staffMemberships.id, id), eq(staffMemberships.restaurantId, rid)));
    await this.audit.log({ actorId: u.id, restaurantId: rid, action: 'staff_removed', entity: 'staff', entityId: id });
    return { ok: true };
  }
}
