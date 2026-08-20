import { Global, Module } from '@nestjs/common';
import { IdentityAuthenticationModule } from '../identity-authentication/identity-authentication.module';
import { OrderModule } from '../order/order.module';
import type { ClockPort } from '../identity-authentication/application/ports/application-runtime.port';
import type { NonProductionRateLimiterPort } from '../identity-authentication/application/ports/non-production-rate-limiter.port';
import type { ApiIdempotencyService } from '../identity-authentication/application/services/api-idempotency.service';
import {
  API_IDEMPOTENCY,
  CLOCK,
  UUID_V7_GENERATOR,
} from '../identity-authentication/identity-authentication.tokens';
import { RATE_LIMITER } from '../identity-authentication/presentation/authentication.tokens';
import type { OrderRepository } from '../order/domain/ports/order-repository.port';
import { ORDER_REPOSITORY, ORDER_APPLICATION_SERVICE } from '../order/order.tokens';
import type { OrderApplicationService } from '../order/application/services/order-application.service';
import { PaymentRetentionPolicy } from './domain/policy/payment-retention.policy';
import type { PaymentLifecycle } from './domain/lifecycle/payment-lifecycle';
import { RecordedPaymentRetentionConfigurationAdapter } from './infrastructure/configuration/recorded-payment-retention-configuration.adapter';
import { PrismaPaymentRepository } from './infrastructure/persistence/prisma/repositories/prisma-payment-repository';
import { RazorpayPaymentProviderAdapter } from './infrastructure/adapters/razorpay-payment-provider.adapter';
import { Module08OrderReadAdapter } from './infrastructure/adapters/module08-order-read.adapter';
import { Module08OrderWriteAdapter } from './infrastructure/adapters/module08-order-write.adapter';
import { PaymentApplicationService } from './application/services/payment-application.service';
import {
  PAYMENT_RETENTION_CONFIGURATION,
  PAYMENT_REPOSITORY,
  PAYMENT_APPLICATION_SERVICE,
  PAYMENT_PROVIDER,
  PAYMENT_ORDER_READ,
  PAYMENT_ORDER_WRITE,
} from './payment.tokens';

/**
 * WEMP-M09-PLAN-001 M09-M2/M09-M3. Module 09 wiring.
 *
 * M09-M2 provides:
 * - PrismaPaymentRepository (implements PaymentRepository port)
 * - PaymentRetentionPolicy (domain policy)
 * - PaymentRetentionConfigurationPort (env-configurable per D-11)
 *
 * M09-M3 adds:
 * - PaymentApplicationService (primary use-case orchestrator)
 * - RazorpayPaymentProviderAdapter (implements PaymentProviderPort)
 * - Module08OrderReadAdapter (reads M08 Order facts)
 * - Module08OrderWriteAdapter (transitions M08 Orders via D-05)
 */
@Global()
@Module({
  imports: [IdentityAuthenticationModule, OrderModule],
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
    // M09-M3 providers
    {
      provide: PAYMENT_PROVIDER,
      useClass: RazorpayPaymentProviderAdapter,
    },
    {
      provide: PAYMENT_ORDER_READ,
      inject: [ORDER_REPOSITORY],
      useFactory: (orderRepository: OrderRepository) =>
        new Module08OrderReadAdapter(orderRepository),
    },
    {
      provide: PAYMENT_ORDER_WRITE,
      inject: [ORDER_APPLICATION_SERVICE],
      useFactory: (orderApplicationService: OrderApplicationService) =>
        new Module08OrderWriteAdapter(orderApplicationService),
    },
    {
      provide: PAYMENT_APPLICATION_SERVICE,
      inject: [
        PAYMENT_REPOSITORY,
        'PaymentLifecycle',
        CLOCK,
        UUID_V7_GENERATOR,
        API_IDEMPOTENCY,
        RATE_LIMITER,
        PAYMENT_PROVIDER,
        PAYMENT_ORDER_READ,
        PAYMENT_ORDER_WRITE,
      ],
      useFactory: (
        repository: PrismaPaymentRepository,
        lifecycle: PaymentLifecycle,
        clock: ClockPort,
        identifiers: /* UuidV7GenerationPort */ { next: () => unknown },
        idempotency: ApiIdempotencyService,
        rateLimiter: NonProductionRateLimiterPort,
        provider: RazorpayPaymentProviderAdapter,
        orderRead: Module08OrderReadAdapter,
        orderWrite: Module08OrderWriteAdapter,
      ) =>
        new PaymentApplicationService(
          repository,
          lifecycle,
          clock,
          identifiers as never,
          idempotency,
          rateLimiter,
          provider,
          orderRead,
          orderWrite,
        ),
    },
  ],
  exports: [
    PaymentRetentionPolicy,
    PAYMENT_RETENTION_CONFIGURATION,
    PAYMENT_REPOSITORY,
    PAYMENT_APPLICATION_SERVICE,
    PAYMENT_PROVIDER,
  ],
})
// NestJS modules are declarative metadata containers and intentionally have no members.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class PaymentModule {}
