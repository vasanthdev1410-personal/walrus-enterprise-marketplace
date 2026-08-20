import { Global, Module } from '@nestjs/common';
import { IdentityAuthenticationModule } from '../identity-authentication/identity-authentication.module';
import { AuthorizationCoreModule } from '../authorization/authorization-core.module';
import { AUTHORIZATION_APPLICATION_SERVICE } from '../authorization/authorization.tokens';
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
import type { CustomerProfileRepository } from '../customer/domain/ports/customer-repository.port';
import { CUSTOMER_PROFILE_REPOSITORY } from '../customer/customer.tokens';
import type { AuthorizationApplicationService } from '../authorization/application/services/authorization-application.service';
import { PaymentRetentionPolicy } from './domain/policy/payment-retention.policy';
import type { PaymentLifecycle } from './domain/lifecycle/payment-lifecycle';
import { RecordedPaymentRetentionConfigurationAdapter } from './infrastructure/configuration/recorded-payment-retention-configuration.adapter';
import { PrismaPaymentRepository } from './infrastructure/persistence/prisma/repositories/prisma-payment-repository';
import { RazorpayPaymentProviderAdapter } from './infrastructure/adapters/razorpay-payment-provider.adapter';
import { Module08OrderReadAdapter } from './infrastructure/adapters/module08-order-read.adapter';
import { Module08OrderWriteAdapter } from './infrastructure/adapters/module08-order-write.adapter';
import { Module02PaymentAdminAuthorizationAdapter } from './application/adapters/module02-payment-admin-authorization.adapter';
import type { PaymentAdminAuthorizationPort } from './application/ports/payment-admin-authorization.port';
import { PaymentApplicationService } from './application/services/payment-application.service';
import { PaymentSelfServicePermissionGuard } from './presentation/guards/payment-self-service-permission.guard';
import { PaymentAdminPermissionGuard } from './presentation/guards/payment-admin-permission.guard';
import { PaymentSelfServiceController } from './presentation/payment-self-service.controller';
import { PaymentAdminController } from './presentation/payment-admin.controller';
import { PaymentWebhookController } from './presentation/payment-webhook.controller';
import {
  PAYMENT_RETENTION_CONFIGURATION,
  PAYMENT_REPOSITORY,
  PAYMENT_APPLICATION_SERVICE,
  PAYMENT_PROVIDER,
  PAYMENT_ORDER_READ,
  PAYMENT_ORDER_WRITE,
  PAYMENT_ADMIN_AUTHORIZATION,
  PAYMENT_SELF_SERVICE_PERMISSION_GUARD,
  PAYMENT_ADMIN_PERMISSION_GUARD,
} from './payment.tokens';

/**
 * WEMP-M09-PLAN-001 M09-M2/M09-M3/M09-M4. Module 09 wiring.
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
 *
 * M09-M4 adds:
 * - Module02PaymentAdminAuthorizationAdapter (real Module 02 admin authorization)
 * - PaymentSelfServicePermissionGuard (customer-identity-scoped permission guard)
 * - PaymentAdminPermissionGuard (admin permission guard)
 *
 * Fail closed: the admin authorization adapter denies when the engine cannot
 * decide. The permission guards deny when no claims, no permission metadata,
 * or denied decision.
 */
@Global()
@Module({
  imports: [IdentityAuthenticationModule, OrderModule, AuthorizationCoreModule],
  controllers: [PaymentSelfServiceController, PaymentAdminController, PaymentWebhookController],
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
    // M09-M4 authorization
    {
      provide: PAYMENT_ADMIN_AUTHORIZATION,
      useClass: Module02PaymentAdminAuthorizationAdapter,
    },
    {
      provide: PAYMENT_SELF_SERVICE_PERMISSION_GUARD,
      inject: [AUTHORIZATION_APPLICATION_SERVICE, CUSTOMER_PROFILE_REPOSITORY],
      useFactory: (
        authorization: AuthorizationApplicationService,
        customers: CustomerProfileRepository,
      ) => new PaymentSelfServicePermissionGuard(authorization, customers),
    },
    {
      provide: PAYMENT_ADMIN_PERMISSION_GUARD,
      inject: [PAYMENT_ADMIN_AUTHORIZATION],
      useFactory: (adminAuth: PaymentAdminAuthorizationPort) =>
        new PaymentAdminPermissionGuard(adminAuth),
    },
  ],
  exports: [
    PaymentRetentionPolicy,
    PAYMENT_RETENTION_CONFIGURATION,
    PAYMENT_REPOSITORY,
    PAYMENT_APPLICATION_SERVICE,
    PAYMENT_PROVIDER,
    PAYMENT_ADMIN_AUTHORIZATION,
    PAYMENT_SELF_SERVICE_PERMISSION_GUARD,
    PAYMENT_ADMIN_PERMISSION_GUARD,
  ],
})
// NestJS modules are declarative metadata containers and intentionally have no members.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class PaymentModule {}
