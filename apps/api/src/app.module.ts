import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { DbModule } from './db/db.module';
import { CommonModule } from './common/common.module';
import { MessagingModule } from './messaging/messaging.module';
import { AuthModule } from './auth/auth.module';
import { AvailabilityModule } from './availability/availability.module';
import { PaymentsModule } from './payments/payments.module';
import { BookingsModule } from './bookings/bookings.module';
import { NotifyModule } from './notify/notify.module';
import { DiscoveryModule } from './discovery/discovery.module';
import { DinersModule } from './diners/diners.module';
import { WaitlistModule } from './waitlist/waitlist.module';
import { HostModule } from './host/host.module';
import { SettingsModule } from './settings/settings.module';
import { ReportsModule } from './reports/reports.module';
import { ReviewsModule } from './reviews/reviews.module';
import { AdminModule } from './admin/admin.module';
import { RealtimeModule } from './realtime/realtime.module';
import { JobsModule } from './jobs/jobs.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60000, limit: Number(process.env.RATE_LIMIT_PER_MIN ?? 300) }],
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    DbModule, CommonModule, MessagingModule, AuthModule, AvailabilityModule, PaymentsModule, BookingsModule, NotifyModule,
    DiscoveryModule, DinersModule, WaitlistModule, HostModule, SettingsModule, ReportsModule, ReviewsModule, AdminModule,
    RealtimeModule, JobsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
