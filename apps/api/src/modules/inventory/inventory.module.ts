import { Module } from '@nestjs/common';
import { AuthorizationCoreModule } from '../authorization/authorization-core.module';
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
import {
  SystemClockAdapter,
  SystemUuidV7Generator,
} from '../identity-authentication/infrastructure/runtime/system-runtime.adapter';
import { ProductCatalogModule } from '../product-catalog/product-catalog.module';
import { Module02InventoryAdminAuthorizationAdapter } from './application/adapters/module02-inventory-admin-authorization.adapter';
import { Module02InventoryAuthorizationAdapter } from './application/adapters/module02-inventory-authorization.adapter';
import { Module04ProductCatalogReadAdapter } from './application/adapters/module04-product-catalog-read.adapter';
import { InventoryConfigApplicationService } from './application/services/inventory-config-application.service';
import { InventoryApplicationService } from './application/services/inventory-application.service';
import { InventoryReadApplicationService } from './application/services/inventory-read-application.service';
import { InventoryReservationService } from './application/services/inventory-reservation.service';
import { InventoryStockPolicy } from './domain/policy/inventory-stock-policy';
import { RecordedRetentionConfigurationAdapter } from './infrastructure/configuration/recorded-retention-configuration.adapter';
import { RecordedThresholdConfigurationAdapter } from './infrastructure/configuration/recorded-threshold-configuration.adapter';
import { PrismaInventoryConfigRepository } from './infrastructure/persistence/prisma/repositories/prisma-inventory-config.repository';
import {
  PrismaInventoryEvidenceReadRepository,
  PrismaInventoryRepository,
} from './infrastructure/persistence/prisma/repositories/prisma-inventory.repository';
import { InventorySellerPermissionGuard } from './presentation/guards/inventory-seller-permission.guard';
import { AdminInventoryController } from './presentation/admin-inventory.controller';
import { InventoryConfigController } from './presentation/inventory-config.controller';
import { SellerInventoryController } from './presentation/seller-inventory.controller';
import {
  INVENTORY_ADMIN_AUTHORIZATION,
  INVENTORY_APPLICATION_SERVICE,
  INVENTORY_CONFIG_APPLICATION_SERVICE,
  INVENTORY_CONFIG_REPOSITORY,
  INVENTORY_EVIDENCE_READ_REPOSITORY,
  INVENTORY_READ_APPLICATION_SERVICE,
  INVENTORY_RESERVATION_PORT,
  INVENTORY_RETENTION_CONFIGURATION,
  INVENTORY_STOCK_POOL_REPOSITORY,
  INVENTORY_THRESHOLD_CONFIGURATION,
  MODULE02_INVENTORY_AUTHORIZATION_CONTRACT,
  MODULE04_PRODUCT_CATALOG_READ,
} from './inventory.tokens';

/**
 * WEMP-M05-PLAN-001 M05-M3. Module 05 — Inventory application layer.
 *
 * M05-M3 wired the application services (seller adjustment, admin
 * correction, domain-level reserve/release, availability + label reads)
 * against the approved ports with fail-closed adapters; M05-M4 replaces
 * that wiring with the real Module 02 inventory ownership resolver (the
 * approved third resource scope — WEMP-M05-AUTHZ-001, decision D-05),
 * the real Module 02 permission adapter for the administrative
 * `inventory.*` identifiers, and the real Module 04 `ProductCatalogReadPort`
 * adapter (decision D-10). Module 05 never reads Module 02/03/04 storage
 * and never evaluates roles itself (A-02/A-06); every adapter fails
 * closed — a missing association, missing SKU fact, engine error, or
 * missing grant resolves to deny, never to a grant.
 *
 * The D-14 threshold and D-12 retention configurations are wired from the
 * recorded owner-approved values (RECORDED 2026-08-15) — env-overridable,
 * fail-closed on invalid values, never hard-coded in business logic.
 *
 * M05-M3 adds no presentation layer (controllers are M05-M5).
 */
@Module({
  imports: [IdentityAuthenticationModule, ProductCatalogModule, AuthorizationCoreModule],
  controllers: [SellerInventoryController, AdminInventoryController, InventoryConfigController],
  providers: [
    InventorySellerPermissionGuard,
    { provide: CLOCK, useClass: SystemClockAdapter },
    { provide: UUID_V7_GENERATOR, useClass: SystemUuidV7Generator },
    PrismaInventoryConfigRepository,
    {
      provide: INVENTORY_CONFIG_REPOSITORY,
      useExisting: PrismaInventoryConfigRepository,
    },
    {
      provide: INVENTORY_CONFIG_APPLICATION_SERVICE,
      inject: [
        INVENTORY_CONFIG_REPOSITORY,
        INVENTORY_ADMIN_AUTHORIZATION,
        RATE_LIMITER,
        API_IDEMPOTENCY,
      ],
      useFactory: (
        config: PrismaInventoryConfigRepository,
        adminAuthorization: Module02InventoryAdminAuthorizationAdapter,
        rateLimiter: NonProductionRateLimiterPort,
        idempotency: ApiIdempotencyService,
      ) =>
        new InventoryConfigApplicationService(config, adminAuthorization, rateLimiter, idempotency),
    },
    PrismaInventoryRepository,
    {
      provide: INVENTORY_STOCK_POOL_REPOSITORY,
      useExisting: PrismaInventoryRepository,
    },
    PrismaInventoryEvidenceReadRepository,
    {
      provide: INVENTORY_EVIDENCE_READ_REPOSITORY,
      useExisting: PrismaInventoryEvidenceReadRepository,
    },
    {
      provide: MODULE02_INVENTORY_AUTHORIZATION_CONTRACT,
      useClass: Module02InventoryAuthorizationAdapter,
    },
    {
      provide: MODULE04_PRODUCT_CATALOG_READ,
      useClass: Module04ProductCatalogReadAdapter,
    },
    {
      provide: INVENTORY_ADMIN_AUTHORIZATION,
      useClass: Module02InventoryAdminAuthorizationAdapter,
    },
    // D-14 (M05-M5): the threshold configuration read path and the admin
    // config surface share one source — `inventory_config_records` via
    // PrismaInventoryConfigRepository, which falls back to the recorded
    // owner-approved defaults (env, RECORDED 2026-08-15) until an admin
    // persists rows. RecordedThresholdConfigurationAdapter is registered
    // for that fallback delegation.
    RecordedThresholdConfigurationAdapter,
    {
      provide: INVENTORY_THRESHOLD_CONFIGURATION,
      useExisting: PrismaInventoryConfigRepository,
    },
    {
      provide: INVENTORY_RETENTION_CONFIGURATION,
      useClass: RecordedRetentionConfigurationAdapter,
    },
    InventoryStockPolicy,
    {
      provide: INVENTORY_APPLICATION_SERVICE,
      inject: [
        INVENTORY_STOCK_POOL_REPOSITORY,
        MODULE02_INVENTORY_AUTHORIZATION_CONTRACT,
        MODULE04_PRODUCT_CATALOG_READ,
        INVENTORY_ADMIN_AUTHORIZATION,
        InventoryStockPolicy,
        CLOCK,
        UUID_V7_GENERATOR,
        API_IDEMPOTENCY,
        RATE_LIMITER,
      ],
      useFactory: (
        repository: PrismaInventoryRepository,
        module02: Module02InventoryAuthorizationAdapter,
        module04: Module04ProductCatalogReadAdapter,
        adminAuthorization: Module02InventoryAdminAuthorizationAdapter,
        policy: InventoryStockPolicy,
        clock: ClockPort,
        identifiers: UuidV7GenerationPort,
        idempotency: ApiIdempotencyService,
        rateLimiter: NonProductionRateLimiterPort,
      ) =>
        new InventoryApplicationService(
          repository,
          module02,
          module04,
          adminAuthorization,
          policy,
          clock,
          identifiers,
          idempotency,
          rateLimiter,
        ),
    },
    {
      provide: INVENTORY_RESERVATION_PORT,
      inject: [
        INVENTORY_STOCK_POOL_REPOSITORY,
        InventoryStockPolicy,
        CLOCK,
        UUID_V7_GENERATOR,
        API_IDEMPOTENCY,
      ],
      useFactory: (
        repository: PrismaInventoryRepository,
        policy: InventoryStockPolicy,
        clock: ClockPort,
        identifiers: UuidV7GenerationPort,
        idempotency: ApiIdempotencyService,
      ) => new InventoryReservationService(repository, policy, clock, identifiers, idempotency),
    },
    {
      provide: INVENTORY_READ_APPLICATION_SERVICE,
      inject: [
        INVENTORY_STOCK_POOL_REPOSITORY,
        INVENTORY_EVIDENCE_READ_REPOSITORY,
        MODULE02_INVENTORY_AUTHORIZATION_CONTRACT,
        MODULE04_PRODUCT_CATALOG_READ,
        INVENTORY_ADMIN_AUTHORIZATION,
        INVENTORY_THRESHOLD_CONFIGURATION,
        InventoryStockPolicy,
        RATE_LIMITER,
      ],
      useFactory: (
        repository: PrismaInventoryRepository,
        evidence: PrismaInventoryEvidenceReadRepository,
        module02: Module02InventoryAuthorizationAdapter,
        module04: Module04ProductCatalogReadAdapter,
        adminAuthorization: Module02InventoryAdminAuthorizationAdapter,
        thresholdConfiguration: PrismaInventoryConfigRepository,
        policy: InventoryStockPolicy,
        rateLimiter: NonProductionRateLimiterPort,
      ) =>
        new InventoryReadApplicationService(
          repository,
          evidence,
          module02,
          module04,
          adminAuthorization,
          thresholdConfiguration,
          policy,
          rateLimiter,
        ),
    },
  ],
  exports: [
    INVENTORY_APPLICATION_SERVICE,
    INVENTORY_READ_APPLICATION_SERVICE,
    INVENTORY_RESERVATION_PORT,
    INVENTORY_THRESHOLD_CONFIGURATION,
    INVENTORY_CONFIG_REPOSITORY,
    INVENTORY_CONFIG_APPLICATION_SERVICE,
    INVENTORY_RETENTION_CONFIGURATION,
  ],
})
// NestJS modules are declarative metadata containers and intentionally have no members.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class InventoryModule {}
