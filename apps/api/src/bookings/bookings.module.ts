import { Global, Module } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { CrmService } from '../crm/crm.service';
@Global() @Module({ providers: [BookingsService, CrmService], controllers: [BookingsController], exports: [BookingsService, CrmService] })
export class BookingsModule {}
