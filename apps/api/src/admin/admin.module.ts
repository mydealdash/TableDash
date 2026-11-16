import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { GoogleModule } from '../google/google.module';
@Module({ imports: [GoogleModule], controllers: [AdminController] })
export class AdminModule {}
