import { Global, Module } from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { AvailabilityController } from './availability.controller';
@Global() @Module({ providers: [AvailabilityService], controllers: [AvailabilityController], exports: [AvailabilityService] })
export class AvailabilityModule {}
