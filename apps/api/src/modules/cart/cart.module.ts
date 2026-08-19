import { Global, Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductCatalogModule } from '../product-catalog/product-catalog.module';
import type {
  ClockPort,
  UuidV7GenerationPort,
} from '../identity-authentication/application/ports/application-runtime.port';
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
import type { CustomerProfileReadPort } from '../customer/domain/ports/customer-profile-read.port';
import {
  CART_RETENTION_CONFIGURATION,
  CART_APPLICATION_SERVICE,
  CART_INVENTORY_RESERVATION_ADAPTER,
  CART_PRODUCT_CATALOG_READ_ADAPTER,
  CART_CUSTOMER_PROFILE_READ_ADAPTER,
} from './cart.tokens';
import { CartApplicationService } from './application/services/cart-application.service';
import { CartLifecycle } from './domain/lifecycle/cart-lifecycle';
import { CartRetentionPolicy } from './domain/policy/cart-retention.policy';
import { CartInventoryReservationAdapter } from './infrastructure/adapters/cart-inventory-reservation.adapter';
import { CartProductCatalogReadAdapter } from './infrastructure/adapters/cart-product-catalog-read.adapter';
import { FailClosedCustomerProfileReadAdapter } from './infrastructure/adapters/fail-closed-customer-profile-read.adapter';
import { RecordedCartRetentionConfigurationAdapter } from './infrastructure/configuration/recorded-cart-retention-configuration.adapter';
import { PrismaCartRepository } from './infrastructure/persistence/prisma/repositories/prisma-cart-repository';

/**
 * WEMP-M07-PLAN-001 M07-M2/M07-M3. Module 07 wiring.
 *
 * M07-M2 provides:
 * - PrismaCartRepository (implements CartRepository port)
 * - CartRetentionPolicy (domain policy, reused by M07-M3 retention processor)
 * - CartRetentionConfigurationPort (env-configurable, default 90 days per D-11)
 *
 * M07-M3 adds:
 * - CartApplicationService (primary use-case orchestrator)
 * - CartInventoryReservationAdapter (wraps M05 InventoryReservationPort)
 * - CartProductCatalogReadAdapter (wraps M04 ProductCatalogReadPort)
 * - FailClosedCustomerProfileReadAdapter (fail-closed until M07-M4)
 * - CartLifecycle (domain lifecycle state machine)
 *
 * The repository is @Global so that future M07-M4/M05 layers can inject it.
 *
 * Fail closed: the customer profile read adapter denies everything until
 * M07-M4 wires the real Module 06 adapter (A-10).
 */
@Global()
@Module({
  imports: [IdentityAuthenticationModule, InventoryModule, ProductCatalogModule],
  providers: [
    {
      provide: CART_RETENTION_CONFIGURATION,
      useClass: RecordedCartRetentionConfigurationAdapter,
    },
    CartRetentionPolicy,
    CartLifecycle,
    PrismaCartRepository,
    {
      provide: CART_INVENTORY_RESERVATION_ADAPTER,
      inject: [INVENTORY_RESERVATION_PORT],
      useFactory: (reservation: InventoryReservationPort) =>
        new CartInventoryReservationAdapter(reservation),
    },
    {
      provide: CART_PRODUCT_CATALOG_READ_ADAPTER,
      inject: [PRODUCT_CATALOG_READ],
      useFactory: (catalog: ProductCatalogReadPort) => new CartProductCatalogReadAdapter(catalog),
    },
    {
      provide: CART_CUSTOMER_PROFILE_READ_ADAPTER,
      useClass: FailClosedCustomerProfileReadAdapter,
    },
    {
      provide: CART_APPLICATION_SERVICE,
      inject: [
        PrismaCartRepository,
        CartLifecycle,
        CLOCK,
        UUID_V7_GENERATOR,
        API_IDEMPOTENCY,
        RATE_LIMITER,
        CART_INVENTORY_RESERVATION_ADAPTER,
        CART_PRODUCT_CATALOG_READ_ADAPTER,
        CART_CUSTOMER_PROFILE_READ_ADAPTER,
      ],
      useFactory: (
        repository: PrismaCartRepository,
        lifecycle: CartLifecycle,
        clock: ClockPort,
        identifiers: UuidV7GenerationPort,
        idempotency: ApiIdempotencyService,
        rateLimiter: NonProductionRateLimiterPort,
        reservation: CartInventoryReservationAdapter,
        productCatalog: CartProductCatalogReadAdapter,
        customerProfileRead: FailClosedCustomerProfileReadAdapter,
      ) =>
        new CartApplicationService(
          repository,
          lifecycle,
          clock,
          identifiers,
          idempotency,
          rateLimiter,
          reservation,
          productCatalog,
          customerProfileRead,
        ),
    },
  ],
  exports: [
    PrismaCartRepository,
    CartRetentionPolicy,
    CART_RETENTION_CONFIGURATION,
    CART_APPLICATION_SERVICE,
    CART_INVENTORY_RESERVATION_ADAPTER,
    CART_PRODUCT_CATALOG_READ_ADAPTER,
    CART_CUSTOMER_PROFILE_READ_ADAPTER,
  ],
})
// NestJS modules are declarative metadata containers and intentionally have no members.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class CartModule {}
