import { Module } from '@nestjs/common';
import { DinersController } from './diners.controller';
@Module({ controllers: [DinersController] })
export class DinersModule {}
