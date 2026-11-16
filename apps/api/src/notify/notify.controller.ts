import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { ALL_STAFF, AuthUser, CurrentUser, StaffRoles } from '../auth/auth.guard';
import { NotifyService } from './notify.service';

class SubscribeDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date: string;
  @Matches(/^\d{2}:\d{2}$/) fromTime: string;
  @Matches(/^\d{2}:\d{2}$/) toTime: string;
  @IsInt() @Min(1) @Max(20) partySize: number;
  @IsOptional() @IsString() tableType?: string;
}

@Controller()
export class NotifyController {
  constructor(private readonly notify: NotifyService) {}

  @Post('restaurants/:rid/notify') subscribe(@CurrentUser() u: AuthUser, @Param('rid') rid: string, @Body() dto: SubscribeDto) {
    return this.notify.subscribe(u.id, rid, dto);
  }
  @Get('me/notify') mine(@CurrentUser() u: AuthUser) { return this.notify.mine(u.id); }
  @Delete('me/notify/:id') cancel(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.notify.cancel(u.id, id); }

  /** Restaurant view of Notify demand (NTF-04). */
  @StaffRoles(...ALL_STAFF) @Get('manage/:rid/notify')
  list(@Param('rid') rid: string, @Query('date') date?: string) { return this.notify.list(rid, date); }
}
