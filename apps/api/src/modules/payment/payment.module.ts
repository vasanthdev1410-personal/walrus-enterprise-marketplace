import { Global, Module } from '@nestjs/common';
import { IdentityAuthenticationModule } from '../identity-authentication/identity-authentication.module';
import { PaymentRetentionPolicy } from './domain/policy/payment-retention.policy';
import { RecordedPaymentRetentionConfigurationAdapter } from './infrastructure/configuration/recorded-payment-retention-configuration.adapter';
import { PrismaPaymentRepository } from './infrastructure/persistence/prisma/repositories/prisma-payment-repository';
import { PAYMENT_RETENTION_CONFIGURATION, PAYMENT_REPOSITORY } from './payment.tokens';

/**
 * WEMP-M09-PLAN-001 M09-M2. Module 09 wiring — persistence layer only.
 *
 * M09-M2 provides:
 * - PrismaPaymentRepository (implements PaymentRepository port)
 * - PaymentRetentionPolicy (domain policy, reused by future retention processor)
 * - PaymentRetentionConfigurationPort (env-configurable per D-11)
 *
 * Future milestones will add:
 * - M09-M3: PaymentApplicationService, Razorpay provider adapter
 * - M09-M4: Authorization adapters, permission guards
 * - M09-M5: Controllers, API clients, web/mobile integration
 */
@Global()
@Module({
  imports: [IdentityAuthenticationModule],
  providers: [
    {
      provide: PAYMENT_RETENTION_CONFIGURATION,
      useClass: RecordedPaymentRetentionConfigurationAdapter,
    },
    PaymentRetentionPolicy,
    {
      provide: PAYMENT_REPOSITORY,
      useClass: PrismaPaymentRepository,
    },
  ],
  exports: [PaymentRetentionPolicy, PAYMENT_RETENTION_CONFIGURATION, PAYMENT_REPOSITORY],
})
// NestJS modules are declarative metadata containers and intentionally have no members.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class PaymentModule {}
