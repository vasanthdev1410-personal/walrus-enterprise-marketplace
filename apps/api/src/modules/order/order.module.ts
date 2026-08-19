import { Global, Module } from '@nestjs/common';
import { IdentityAuthenticationModule } from '../identity-authentication/identity-authentication.module';
import { OrderRetentionPolicy } from './domain/policy/order-retention.policy';
import { OrderLifecycle } from './domain/lifecycle/order-lifecycle';
import { RecordedOrderRetentionConfigurationAdapter } from './infrastructure/configuration/recorded-order-retention-configuration.adapter';
import { PrismaOrderRepository } from './infrastructure/persistence/prisma/repositories/prisma-order-repository';
import { ORDER_RETENTION_CONFIGURATION, ORDER_REPOSITORY } from './order.tokens';

/**
 * WEMP-M08-PLAN-001 M08-M2. Module 08 wiring — persistence layer only.
 *
 * M08-M2 provides:
 * - PrismaOrderRepository (implements OrderRepository port)
 * - OrderRetentionPolicy (domain policy, reused by future M08-M3 retention processor)
 * - OrderRetentionConfigurationPort (env-configurable per D-07)
 *
 * Future milestones will add:
 * - M08-M3: OrderApplicationService, cross-module adapters
 * - M08-M4: Authorization adapters, permission guards
 * - M08-M5: Controllers, API clients
 */
@Global()
@Module({
  imports: [IdentityAuthenticationModule],
  providers: [
    {
      provide: ORDER_RETENTION_CONFIGURATION,
      useClass: RecordedOrderRetentionConfigurationAdapter,
    },
    OrderRetentionPolicy,
    OrderLifecycle,
    {
      provide: ORDER_REPOSITORY,
      useClass: PrismaOrderRepository,
    },
  ],
  exports: [OrderRetentionPolicy, OrderLifecycle, ORDER_RETENTION_CONFIGURATION, ORDER_REPOSITORY],
})
// NestJS modules are declarative metadata containers and intentionally have no members.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class OrderModule {}
