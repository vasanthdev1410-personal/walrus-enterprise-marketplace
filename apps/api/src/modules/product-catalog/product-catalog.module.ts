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
import { PrismaModule } from '../identity-authentication/infrastructure/persistence/prisma/prisma.module';
import {
  SystemClockAdapter,
  SystemUuidV7Generator,
} from '../identity-authentication/infrastructure/runtime/system-runtime.adapter';
import { Module02SellerAuthorizationContractAdapter } from './application/adapters/module02-seller-authorization-contract.adapter';
import { Module02ProductAdminAuthorizationAdapter } from './application/adapters/module02-product-admin-authorization.adapter';
import { ProductReadApplicationService } from './application/services/product-read-application.service';
import { ProductApplicationService } from './application/services/product-application.service';
import { ProductCategoryReadService } from './application/services/product-media-application.service';
import { ProductMediaApplicationService } from './application/services/product-media-application.service';
import { ProductModerationApplicationService } from './application/services/product-moderation-application.service';
import { ProductVariantSkuApplicationService } from './application/services/product-variant-sku-application.service';
import { ProductLifecycle } from './domain/lifecycle/product-lifecycle';
import { ProductCatalogPolicy } from './domain/policy/product-catalog.policy';
import { FailClosedModule05InventoryContractAdapter } from './infrastructure/adapters/fail-closed-module05-inventory.adapter';
import { NonProductionProductMediaStorageAdapter } from './infrastructure/adapters/non-production-product-media-storage.adapter';
import { PrismaProductCatalogReadAdapter } from './infrastructure/adapters/prisma-product-catalog-read.adapter';
import { PrismaProductCatalogRepository } from './infrastructure/persistence/prisma/repositories/prisma-product-catalog.repository';
import { AdminProductController } from './presentation/admin-product.controller';
import {
  SellerCategoryController,
  SellerProductController,
} from './presentation/seller-product.controller';
import { ProductSellerPermissionGuard } from './presentation/guards/product-seller-permission.guard';
import {
  MODULE02_SELLER_AUTHORIZATION_CONTRACT,
  MODULE05_INVENTORY_CONTRACT,
  PRODUCT_ADMIN_AUTHORIZATION,
  PRODUCT_APPLICATION_SERVICE,
  PRODUCT_CATALOG_READ,
  PRODUCT_CATALOG_REPOSITORY,
  PRODUCT_CATEGORY_READ_SERVICE,
  PRODUCT_MEDIA_APPLICATION_SERVICE,
  PRODUCT_MEDIA_STORAGE,
  PRODUCT_MODERATION_APPLICATION_SERVICE,
  PRODUCT_READ_APPLICATION_SERVICE,
  PRODUCT_VARIANT_SKU_APPLICATION_SERVICE,
} from './product-catalog.tokens';

/**
 * WEMP-M04-PLAN-001 M04-M4 + M04-M5. Module 04 — Product Catalog.
 *
 * M04-M4 (authorization integration boundary, mirroring M03-M4) wires the
 * approved Module 02 ↔ Module 04 authorization integration:
 * - MODULE02_SELLER_AUTHORIZATION_CONTRACT (ownership + seller-eligibility
 *   listing gate, WEMP-M04-CONTRACT-001 Part A, decisions D-01/D-11) backed
 *   by the Module 02 SELLER_OWNERSHIP_RESOLVER.
 * - PRODUCT_ADMIN_AUTHORIZATION (product.review.decide / product.audit.view /
 *   product.media.read, WEMP-M04-AUTHZ-001 §2.2, decision D-11) backed by
 *   the Module 02 authorization engine.
 * - MODULE05_INVENTORY_CONTRACT (fail-closed, decision D-08) — Module 04 is
 *   definition-only; no stock facts are ever fabricated.
 * - PRODUCT_CATALOG_READ (decision D-12/D-10, M05-M4 SKU-fact wiring) — the
 *   real `ProductCatalogReadPort` adapter over Module 04's own repository;
 *   Module 05 consumes SKU facts through this port (never Module 04
 *   storage, A-06), PUBLISHED-gated and fail-closed.
 * - PRODUCT_MEDIA_STORAGE (non-production reference/digest adapter,
 *   decisions D-09/D-17 — fail closed, retention config pending).
 *
 * M04-M5 adds the presentation layer (WEMP-M04-SPEC-001 §18): the seller
 * self-service and admin product controllers, the seller-scoped permission
 * guard (second ownership resolver), the read application service, the
 * Module 02 permission guard on admin routes, and the D-15 rate-limit
 * policy — mirroring how M03-M5 wired Module 03. The listing gate remains
 * enforced inside the application layer, so no route can bypass it.
 */
@Module({
  imports: [IdentityAuthenticationModule, PrismaModule, AuthorizationCoreModule],
  providers: [
    { provide: CLOCK, useClass: SystemClockAdapter },
    { provide: UUID_V7_GENERATOR, useClass: SystemUuidV7Generator },
    PrismaProductCatalogRepository,
    { provide: PRODUCT_CATALOG_REPOSITORY, useExisting: PrismaProductCatalogRepository },
    { provide: PRODUCT_CATALOG_READ, useClass: PrismaProductCatalogReadAdapter },
    ProductLifecycle,
    ProductCatalogPolicy,
    {
      provide: MODULE02_SELLER_AUTHORIZATION_CONTRACT,
      useClass: Module02SellerAuthorizationContractAdapter,
    },
    { provide: PRODUCT_ADMIN_AUTHORIZATION, useClass: Module02ProductAdminAuthorizationAdapter },
    { provide: MODULE05_INVENTORY_CONTRACT, useClass: FailClosedModule05InventoryContractAdapter },
    { provide: PRODUCT_MEDIA_STORAGE, useClass: NonProductionProductMediaStorageAdapter },
    {
      provide: PRODUCT_APPLICATION_SERVICE,
      inject: [
        PRODUCT_CATALOG_REPOSITORY,
        MODULE02_SELLER_AUTHORIZATION_CONTRACT,
        ProductLifecycle,
        ProductCatalogPolicy,
        CLOCK,
        UUID_V7_GENERATOR,
        API_IDEMPOTENCY,
        RATE_LIMITER,
      ],
      useFactory: (
        repository: PrismaProductCatalogRepository,
        module02: Module02SellerAuthorizationContractAdapter,
        lifecycle: ProductLifecycle,
        policy: ProductCatalogPolicy,
        clock: ClockPort,
        identifiers: UuidV7GenerationPort,
        idempotency: ApiIdempotencyService,
        rateLimiter: NonProductionRateLimiterPort,
      ) =>
        new ProductApplicationService(
          repository,
          module02,
          lifecycle,
          policy,
          clock,
          identifiers,
          idempotency,
          rateLimiter,
        ),
    },
    {
      provide: PRODUCT_MODERATION_APPLICATION_SERVICE,
      inject: [
        PRODUCT_CATALOG_REPOSITORY,
        PRODUCT_ADMIN_AUTHORIZATION,
        ProductLifecycle,
        CLOCK,
        UUID_V7_GENERATOR,
      ],
      useFactory: (
        repository: PrismaProductCatalogRepository,
        adminAuthorization: Module02ProductAdminAuthorizationAdapter,
        lifecycle: ProductLifecycle,
        clock: ClockPort,
        identifiers: UuidV7GenerationPort,
      ) =>
        new ProductModerationApplicationService(
          repository,
          adminAuthorization,
          lifecycle,
          clock,
          identifiers,
        ),
    },
    {
      provide: PRODUCT_VARIANT_SKU_APPLICATION_SERVICE,
      inject: [
        PRODUCT_CATALOG_REPOSITORY,
        MODULE02_SELLER_AUTHORIZATION_CONTRACT,
        ProductLifecycle,
        ProductCatalogPolicy,
        CLOCK,
        UUID_V7_GENERATOR,
      ],
      useFactory: (
        repository: PrismaProductCatalogRepository,
        module02: Module02SellerAuthorizationContractAdapter,
        lifecycle: ProductLifecycle,
        policy: ProductCatalogPolicy,
        clock: ClockPort,
        identifiers: UuidV7GenerationPort,
      ) =>
        new ProductVariantSkuApplicationService(
          repository,
          module02,
          lifecycle,
          policy,
          clock,
          identifiers,
        ),
    },
    {
      provide: PRODUCT_MEDIA_APPLICATION_SERVICE,
      inject: [
        PRODUCT_CATALOG_REPOSITORY,
        MODULE02_SELLER_AUTHORIZATION_CONTRACT,
        ProductCatalogPolicy,
        PRODUCT_MEDIA_STORAGE,
        CLOCK,
        UUID_V7_GENERATOR,
      ],
      useFactory: (
        repository: PrismaProductCatalogRepository,
        module02: Module02SellerAuthorizationContractAdapter,
        policy: ProductCatalogPolicy,
        mediaStorage: NonProductionProductMediaStorageAdapter,
        clock: ClockPort,
        identifiers: UuidV7GenerationPort,
      ) =>
        new ProductMediaApplicationService(
          repository,
          module02,
          policy,
          mediaStorage,
          clock,
          identifiers,
        ),
    },
    {
      provide: PRODUCT_CATEGORY_READ_SERVICE,
      inject: [PRODUCT_CATALOG_REPOSITORY],
      useFactory: (repository: PrismaProductCatalogRepository) =>
        new ProductCategoryReadService(repository),
    },
    {
      provide: PRODUCT_READ_APPLICATION_SERVICE,
      inject: [
        PRODUCT_CATALOG_REPOSITORY,
        MODULE02_SELLER_AUTHORIZATION_CONTRACT,
        PRODUCT_ADMIN_AUTHORIZATION,
      ],
      useFactory: (
        repository: PrismaProductCatalogRepository,
        module02: Module02SellerAuthorizationContractAdapter,
        adminAuthorization: Module02ProductAdminAuthorizationAdapter,
      ) => new ProductReadApplicationService(repository, module02, adminAuthorization),
    },
    ProductSellerPermissionGuard,
  ],
  controllers: [SellerProductController, SellerCategoryController, AdminProductController],
  exports: [
    PRODUCT_CATALOG_REPOSITORY,
    PRODUCT_CATALOG_READ,
    MODULE02_SELLER_AUTHORIZATION_CONTRACT,
    PRODUCT_ADMIN_AUTHORIZATION,
    MODULE05_INVENTORY_CONTRACT,
    PRODUCT_MEDIA_STORAGE,
    PRODUCT_APPLICATION_SERVICE,
    PRODUCT_MODERATION_APPLICATION_SERVICE,
    PRODUCT_VARIANT_SKU_APPLICATION_SERVICE,
    PRODUCT_MEDIA_APPLICATION_SERVICE,
    PRODUCT_CATEGORY_READ_SERVICE,
    PRODUCT_READ_APPLICATION_SERVICE,
    ProductSellerPermissionGuard,
  ],
})
// NestJS modules are declarative metadata containers and intentionally have no members.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class ProductCatalogModule {}
