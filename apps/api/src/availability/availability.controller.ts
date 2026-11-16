import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../auth/auth.guard';
import { isDate, isTime } from '../common/time';
import { AvailabilityService } from './availability.service';

@Controller('restaurants/:rid/availability')
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  /** Public slot grid for diners, the widget and partners (DSC-03, BKG-01, BKG-06). */
  @Public() @Get()
  async get(@Param('rid') rid: string, @Query('date') date: string, @Query('party') party: string,
    @Query('tableType') tableType?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const partySize = Number(party);
    if (!isDate(date) || !(partySize >= 1 && partySize <= 50)) throw new BadRequestException('date=YYYY-MM-DD and party=1..50 required');
    if ((from && !isTime(from)) || (to && !isTime(to))) throw new BadRequestException('from/to must be HH:mm');
    const { slots, turnMinutes } = await this.availability.slots(rid, { date, partySize, tableType, online: true, fromTime: from, toTime: to });
    return { date, partySize, turnMinutes, slots: slots.filter((s) => s.reason !== 'PAST').map(({ tableIds, ...s }) => s) };
  }
}
