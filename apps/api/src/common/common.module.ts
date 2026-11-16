import { Global, Module } from '@nestjs/common';
import { EventBus } from './events';
import { AuditService } from './audit.service';

@Global()
@Module({ providers: [EventBus, AuditService], exports: [EventBus, AuditService] })
export class CommonModule {}
