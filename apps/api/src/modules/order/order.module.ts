import { Global, Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductCatalogModule } from '../product-catalog/product-catalog.module';
import type { ClockPort } from '../identity-authentication/application/ports/application-runtime.port';
import type { NonProductionRateLimiterPort } from '../identity-authentication/application/ports/non-production-rate-limiter.port';
import type { ApiIdempotencyService } from '../identity-authentication/application/services/api-idempotency.service';
import { IdentityAuthenticationModule } from '../identity-authentication/identity-authentication.module';
import {
  API_IDEMPOTENCY,
  CLOCK,
  UUID_V7_GENERATOR,
} from '../identity-authentication/identity-authentication.tokens';
import { RATE_LIMITER } from '../identity-authentication/presentation/authentication.tokens';
import type { InventoryReservationPort } from '../inventory/domain/ports/inventory-reservation.port';
import { INVENTORY_RESERVATION_PORT } from '../inventory/inventory.tokens';
import type { ProductCatalogReadPort } from '../product-catalog/domain/ports/product-catalog-read.port';
import { PRODUCT_CATALOG_READ } from '../product-catalog/product-catalog.tokens';
import type { CustomerProfileRepository } from '../customer/domain/ports/customer-repository.port';
import { CUSTOMER_PROFILE_REPOSITORY } from '../customer/customer.tokens';
import { OrderRetentionPolicy } from './domain/policy/order-retention.policy';
import { OrderLifecycle } from './domain/lifecycle/order-lifecycle';
import { RecordedOrderRetentionConfigurationAdapter } from './infrastructure/configuration/recorded-order-retention-configuration.adapter';
import { PrismaOrderRepository } from './infrastructure/persistence/prisma/repositories/prisma-order-repository';
import { OrderApplicationService } from './application/services/order-application.service';
import { M07CartSnapshotReadAdapter } from './infrastructure/adapters/m07-cart-snapshot-read.adapter';
import { OrderProductCatalogReadAdapter } from './infrastructure/adapters/order-product-catalog-read.adapter';
import { OrderInventoryConfirmationAdapter } from './infrastructure/adapters/order-inventory-confirmation.adapter';
import { Module06CustomerProfileReadAdapter } from './infrastructure/adapters/module06-customer-profile-read.adapter';
import {
  ORDER_RETENTION_CONFIGURATION,
  ORDER_REPOSITORY,
  ORDER_APPLICATION_SERVICE,
  ORDER_SNAPSHOT_READ_ADAPTER,
  ORDER_INVENTORY_CONFIRMATION_ADAPTER,
  ORDER_PRODUCT_CATALOG_READ_ADAPTER,
  ORDER_CUSTOMER_PROFILE_READ_ADAPTER,
} from './order.tokens';

/**
 * WEMP-M08-PLAN-001 M08-M2/M08-M3. Module 08 wiring.
 *
 * M08-M2 provides:
 * - PrismaOrderRepository (implements OrderRepository port)
 * - OrderRetentionPolicy (domain policy)
 * - OrderRetentionConfigurationPort (env-configurable)
 *
 * M08-M3 adds:
 * - OrderApplicationService (primary use-case orchestrator)
 * - M07CartSnapshotReadAdapter (reads M07 CartSnapshot)
 * - OrderProductCatalogReadAdapter (wraps M04 ProductCatalogReadPort)
 * - OrderInventoryConfirmationAdapter (wraps M05 InventoryReservationPort)
 * - Module06CustomerProfileReadAdapter (wraps M06 CustomerProfileRepository)
 */
@Global()
@Module({
  imports: [IdentityAuthenticationModule, InventoryModule, ProductCatalogModule],
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
    // M08-M3 adapters
    M07CartSnapshotReadAdapter,
    {
      provide: ORDER_SNAPSHOT_READ_ADAPTER,
      useFactory: () => new M07CartSnapshotReadAdapter(),
    },
    {
      provide: ORDER_PRODUCT_CATALOG_READ_ADAPTER,
      inject: [PRODUCT_CATALOG_READ],
      useFactory: (catalog: ProductCatalogReadPort) => new OrderProductCatalogReadAdapter(catalog),
    },
    {
      provide: ORDER_INVENTORY_CONFIRMATION_ADAPTER,
      inject: [INVENTORY_RESERVATION_PORT],
      useFactory: (reservation: InventoryReservationPort) =>
        new OrderInventoryConfirmationAdapter(reservation),
    },
    {
      provide: ORDER_CUSTOMER_PROFILE_READ_ADAPTER,
      inject: [CUSTOMER_PROFILE_REPOSITORY],
      useFactory: (customers: CustomerProfileRepository) =>
        new Module06CustomerProfileReadAdapter(customers),
    },
    {
      provide: ORDER_APPLICATION_SERVICE,
      inject: [
        ORDER_REPOSITORY,
        OrderLifecycle,
        CLOCK,
        UUID_V7_GENERATOR,
        API_IDEMPOTENCY,
        RATE_LIMITER,
        ORDER_PRODUCT_CATALOG_READ_ADAPTER,
        ORDER_INVENTORY_CONFIRMATION_ADAPTER,
        ORDER_CUSTOMER_PROFILE_READ_ADAPTER,
        ORDER_SNAPSHOT_READ_ADAPTER,
      ],
      useFactory: (
        repository: PrismaOrderRepository,
        lifecycle: OrderLifecycle,
        clock: ClockPort,
        identifiers: /* UuidV7GenerationPort */ { next: () => unknown },
        idempotency: ApiIdempotencyService,
        rateLimiter: NonProductionRateLimiterPort,
        productCatalog: OrderProductCatalogReadAdapter,
        inventoryConfirmation: OrderInventoryConfirmationAdapter,
        customerProfileRead: Module06CustomerProfileReadAdapter,
        snapshotRead: M07CartSnapshotReadAdapter,
      ) =>
        new OrderApplicationService(
          repository,
          lifecycle,
          clock,
          identifiers as never,
          idempotency,
          rateLimiter,
          productCatalog,
          inventoryConfirmation,
          customerProfileRead,
          snapshotRead,
        ),
    },
  ],
  exports: [
    OrderRetentionPolicy,
    OrderLifecycle,
    ORDER_RETENTION_CONFIGURATION,
    ORDER_REPOSITORY,
    ORDER_APPLICATION_SERVICE,
    ORDER_SNAPSHOT_READ_ADAPTER,
  ],
})
// NestJS modules are declarative metadata containers and intentionally have no members.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class OrderModule {}
