import { Global, Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductCatalogModule } from '../product-catalog/product-catalog.module';
import { AuthorizationCoreModule } from '../authorization/authorization-core.module';
import { AUTHORIZATION_APPLICATION_SERVICE } from '../authorization/authorization.tokens';
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
import type { AuthorizationApplicationService } from '../authorization/application/services/authorization-application.service';
import type { CustomerProfileRepository } from '../customer/domain/ports/customer-repository.port';
import { CUSTOMER_PROFILE_REPOSITORY } from '../customer/customer.tokens';
import {
  CART_RETENTION_CONFIGURATION,
  CART_APPLICATION_SERVICE,
  CART_INVENTORY_RESERVATION_ADAPTER,
  CART_PRODUCT_CATALOG_READ_ADAPTER,
  CART_CUSTOMER_PROFILE_READ_ADAPTER,
  CART_ADMIN_AUTHORIZATION,
  CART_SELF_SERVICE_PERMISSION_GUARD,
  CART_ADMIN_PERMISSION_GUARD,
} from './cart.tokens';
import { CartApplicationService } from './application/services/cart-application.service';
import { CartLifecycle } from './domain/lifecycle/cart-lifecycle';
import { CartRetentionPolicy } from './domain/policy/cart-retention.policy';
import { CartInventoryReservationAdapter } from './infrastructure/adapters/cart-inventory-reservation.adapter';
import { CartProductCatalogReadAdapter } from './infrastructure/adapters/cart-product-catalog-read.adapter';
import { Module06CustomerProfileReadAdapter } from './infrastructure/adapters/module06-customer-profile-read.adapter';
import { Module02CartAdminAuthorizationAdapter } from './application/adapters/module02-cart-admin-authorization.adapter';
import type { CartAdminAuthorizationPort } from './application/ports/cart-admin-authorization.port';
import { RecordedCartRetentionConfigurationAdapter } from './infrastructure/configuration/recorded-cart-retention-configuration.adapter';
import { PrismaCartRepository } from './infrastructure/persistence/prisma/repositories/prisma-cart-repository';
import { CartSelfServicePermissionGuard } from './presentation/guards/cart-self-service-permission.guard';
import { CartAdminPermissionGuard } from './presentation/guards/cart-admin-permission.guard';
import { CartSelfServiceController } from './presentation/cart-self-service.controller';
import { CartAdminController } from './presentation/cart-admin.controller';

/**
 * WEMP-M07-PLAN-001 M07-M2/M07-M3/M07-M4. Module 07 wiring.
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
 * - CartLifecycle (domain lifecycle state machine)
 *
 * M07-M4 adds:
 * - Module06CustomerProfileReadAdapter (real Module 06 adapter, replaces fail-closed)
 * - Module02CartAdminAuthorizationAdapter (real Module 02 admin authorization)
 * - CartSelfServicePermissionGuard (customer-identity-scoped permission guard)
 * - CartAdminPermissionGuard (admin permission guard)
 *
 * Fail closed: the customer profile read adapter resolves only ACTIVE
 * profiles (fail closed for unknown/SUSPENDED/CLOSED). The admin
 * authorization adapter denies when the engine cannot decide. The
 * permission guards deny when no claims, no permission metadata, or
 * denied decision.
 */
@Global()
@Module({
  imports: [
    IdentityAuthenticationModule,
    InventoryModule,
    ProductCatalogModule,
    AuthorizationCoreModule,
  ],
  controllers: [CartSelfServiceController, CartAdminController],
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
    // M07-M4: real Module 06 customer profile read adapter (replaces fail-closed).
    {
      provide: CART_CUSTOMER_PROFILE_READ_ADAPTER,
      inject: [CUSTOMER_PROFILE_REPOSITORY],
      useFactory: (customers: CustomerProfileRepository) =>
        new Module06CustomerProfileReadAdapter(customers),
    },
    // M07-M4: real Module 02 cart admin authorization adapter.
    {
      provide: CART_ADMIN_AUTHORIZATION,
      useClass: Module02CartAdminAuthorizationAdapter,
    },
    // M07-M4: permission guards (registered as providers so they can be
    // used as useGuards() in future M07-M5 controllers).
    {
      provide: CART_SELF_SERVICE_PERMISSION_GUARD,
      inject: [AUTHORIZATION_APPLICATION_SERVICE, CUSTOMER_PROFILE_REPOSITORY],
      useFactory: (
        authorization: AuthorizationApplicationService,
        customers: CustomerProfileRepository,
      ) => new CartSelfServicePermissionGuard(authorization, customers),
    },
    {
      provide: CART_ADMIN_PERMISSION_GUARD,
      inject: [CART_ADMIN_AUTHORIZATION],
      useFactory: (adminAuth: CartAdminAuthorizationPort) =>
        new CartAdminPermissionGuard(adminAuth),
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
        customerProfileRead: Module06CustomerProfileReadAdapter,
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
    CART_ADMIN_AUTHORIZATION,
    CART_SELF_SERVICE_PERMISSION_GUARD,
    CART_ADMIN_PERMISSION_GUARD,
  ],
})
// NestJS modules are declarative metadata containers and intentionally have no members.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class CartModule {}
