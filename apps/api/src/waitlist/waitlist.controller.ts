import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { AuthOptional, AuthUser, CurrentUser, FLOOR_STAFF, Public, StaffRoles } from '../auth/auth.guard';
import { WaitlistService } from './waitlist.service';

class AddDto {
  @IsString() guestName: string;
  @Matches(/^\+?[0-9]{7,15}$/) guestPhone: string;
  @IsInt() @Min(1) @Max(30) partySize: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsInt() @Min(0) quotedMinutes?: number;
}
class SeatDto { @IsOptional() @IsArray() tableIds?: string[]; }
class RemoveDto { @IsIn(['LEFT', 'REMOVED']) status: 'LEFT' | 'REMOVED'; }

@Controller()
export class WaitlistController {
  constructor(private readonly waitlist: WaitlistService) {}

  // Diner side: see the wait, join remotely, check position.
  @Public() @Get('restaurants/:rid/waitlist/quote')
  quote(@Param('rid') rid: string, @Query('party') party: string) { return this.waitlist.quote(rid, Number(party) || 2); }
  @AuthOptional() @Post('restaurants/:rid/waitlist')
  join(@Param('rid') rid: string, @Body() dto: AddDto, @CurrentUser() u?: AuthUser) {
    const { quotedMinutes, ...rest } = dto;
    return this.waitlist.add(rid, { ...rest, dinerId: u?.id, remote: true });
  }
  @Public() @Get('waitlist/:id') position(@Param('id') id: string) { return this.waitlist.position(id); }

  // Host stand.
  @StaffRoles(...FLOOR_STAFF) @Get('manage/:rid/waitlist') list(@Param('rid') rid: string) { return this.waitlist.list(rid); }
  @StaffRoles(...FLOOR_STAFF) @Post('manage/:rid/waitlist') add(@Param('rid') rid: string, @Body() dto: AddDto) { return this.waitlist.add(rid, dto); }
  @StaffRoles(...FLOOR_STAFF) @Post('manage/:rid/waitlist/:id/notify') ready(@Param('rid') rid: string, @Param('id') id: string) { return this.waitlist.notifyReady(rid, id); }
  @StaffRoles(...FLOOR_STAFF) @Post('manage/:rid/waitlist/:id/seat')
  seat(@Param('rid') rid: string, @Param('id') id: string, @Body() dto: SeatDto, @CurrentUser() u: AuthUser) { return this.waitlist.seat(rid, id, dto.tableIds, u.id); }
  @StaffRoles(...FLOOR_STAFF) @Post('manage/:rid/waitlist/:id/remove')
  remove(@Param('rid') rid: string, @Param('id') id: string, @Body() dto: RemoveDto) { return this.waitlist.remove(rid, id, dto.status); }
}
