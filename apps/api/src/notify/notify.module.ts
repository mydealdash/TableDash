import { Global, Module } from '@nestjs/common';
import { NotifyService } from './notify.service';
import { NotifyController } from './notify.controller';
@Global() @Module({ providers: [NotifyService], controllers: [NotifyController], exports: [NotifyService] })
export class NotifyModule {}
