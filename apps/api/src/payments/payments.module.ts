import { Global, Module } from '@nestjs/common';
import { PaymentsService, paymentProviderFactory } from './payments.service';
@Global() @Module({ providers: [PaymentsService, paymentProviderFactory], exports: [PaymentsService] })
export class PaymentsModule {}
