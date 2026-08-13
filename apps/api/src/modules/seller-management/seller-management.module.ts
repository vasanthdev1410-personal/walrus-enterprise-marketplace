import { Global, Module } from '@nestjs/common';
import type { ClockPort, UuidV7GenerationPort } from '../identity-authentication/application/ports/application-runtime.port';
import {
  CLOCK,
  UUID_V7_GENERATOR,
} from '../identity-authentication/identity-authentication.tokens';
import {
  SystemClockAdapter,
  SystemUuidV7Generator,
} from '../identity-authentication/infrastructure/runtime/system-runtime.adapter';
import { IdentityAuthenticationModule } from '../identity-authentication/identity-authentication.module';
import { SELLER_OWNERSHIP_RESOLVER } from '../authorization/authorization.tokens';
import { SellerAssociationPolicy } from './domain/policy/seller-association.policy';
import { SellerCompliancePolicy } from './domain/policy/seller-compliance.policy';
import { SellerLifecycle } from './domain/lifecycle/seller-lifecycle';
import { SellerRetentionPolicy } from './domain/policy/seller-retention.policy';
import { PrismaSellerLegalHoldRepository } from './infrastructure/persistence/prisma/repositories/prisma-seller-legal-hold.repository';
import { PrismaSellerProfileRepository } from './infrastructure/persistence/prisma/repositories/prisma-seller-profile.repository';
import { PrismaSellerOwnershipResolver } from './infrastructure/persistence/prisma/prisma-seller-ownership-resolver';
import { PrismaModule01IdentityContractAdapter } from './infrastructure/persistence/prisma/prisma-module01-identity-contract.adapter';
import { NonProductionSellerEvidenceStorageAdapter } from './infrastructure/evidence-storage/non-production-seller-evidence-storage.adapter';
import { Module02SellerAdminAuthorizationAdapter } from './application/adapters/module02-seller-admin-authorization.adapter';
import { Module02SellerRoleAssignmentAdapter } from './application/adapters/module02-seller-role-assignment.adapter';
import { SellerAuthorizationApplicationService } from './application/services/seller-authorization-application.service';
import { SellerOnboardingApplicationService } from './application/services/seller-onboarding-application.service';
import { SellerVerificationApplicationService } from './application/services/seller-verification-application.service';
import { SellerReadApplicationService } from './application/services/seller-read-application.service';
import { SellerWarehouseApplicationService } from './application/services/seller-warehouse-application.service';
import { SellerMemberApplicationService } from './application/services/seller-member-application.service';
import { SellerController } from './presentation/seller.controller';
import { AdminSellerController } from './presentation/admin-seller.controller';
import { SellerSelfServicePermissionGuard } from './presentation/guards/seller-self-service-permission.guard';
import {
  MODULE01_IDENTITY_CONTRACT,
  MODULE02_AUTHORIZATION_CONTRACT,
  SELLER_ADMIN_AUTHORIZATION,
  SELLER_AUTHORIZATION_APPLICATION_SERVICE,
  SELLER_EVIDENCE_STORAGE,
  SELLER_MEMBER_APPLICATION_SERVICE,
  SELLER_ONBOARDING_APPLICATION_SERVICE,
  SELLER_PROFILE_REPOSITORY,
  SELLER_READ_APPLICATION_SERVICE,
  SELLER_VERIFICATION_APPLICATION_SERVICE,
  SELLER_WAREHOUSE_APPLICATION_SERVICE,
} from './seller-management.tokens';
import { API_IDEMPOTENCY } from '../identity-authentication/identity-authentication.tokens';
import { RATE_LIMITER } from '../identity-authentication/presentation/authentication.tokens';
import type { ApiIdempotencyService } from '../identity-authentication/application/services/api-idempotency.service';
import type { NonProductionRateLimiterPort } from '../identity-authentication/application/ports/non-production-rate-limiter.port';

/**
 * WEMP-M03-PLAN-001 M03-M4 + M03-M5. Module 03 — Seller Management.
 *
 * M03-M4 (unchanged) wires the approved Module 02 ↔ Module 03 authorization
 * integration: SELLER_OWNERSHIP_RESOLVER, MODULE01_IDENTITY_CONTRACT,
 * SELLER_ADMIN_AUTHORIZATION, MODULE02_AUTHORIZATION_CONTRACT and the seller
 * role-assignment lifecycle.
 *
 * M03-M5 adds the presentation layer: the seller self-service and admin
 * controllers (WEMP-M03-SPEC-001 §13), the Module 02 permission guards, the
 * M03-M3 application services wired with the Module 01 idempotency /
 * rate-limit infrastructure (API_IDEMPOTENCY, RATE_LIMITER,
 * NonProductionRateLimiterGuard — exported additively by Module 01; no second
 * system is built), and the M03-M5 read/warehouse/member services.
 *
 * The evidence storage boundary is the documented non-production adapter
 * (D-03 technical condition) until the approved object-storage boundary is
 * integrated.
 */
@Global()
@Module({
  imports: [IdentityAuthenticationModule],
  controllers: [SellerController, AdminSellerController],
  providers: [
    { provide: CLOCK, useClass: SystemClockAdapter },
    { provide: UUID_V7_GENERATOR, useClass: SystemUuidV7Generator },
    PrismaSellerProfileRepository,
    PrismaSellerLegalHoldRepository,
    SellerLifecycle,
    SellerAssociationPolicy,
    SellerCompliancePolicy,
    SellerRetentionPolicy,
    { provide: SELLER_OWNERSHIP_RESOLVER, useClass: PrismaSellerOwnershipResolver },
    { provide: MODULE01_IDENTITY_CONTRACT, useClass: PrismaModule01IdentityContractAdapter },
    { provide: SELLER_ADMIN_AUTHORIZATION, useClass: Module02SellerAdminAuthorizationAdapter },
    {
      provide: MODULE02_AUTHORIZATION_CONTRACT,
      useClass: Module02SellerRoleAssignmentAdapter,
    },
    { provide: SELLER_PROFILE_REPOSITORY, useExisting: PrismaSellerProfileRepository },
    { provide: SELLER_EVIDENCE_STORAGE, useClass: NonProductionSellerEvidenceStorageAdapter },
    SellerSelfServicePermissionGuard,
    {
      provide: SELLER_AUTHORIZATION_APPLICATION_SERVICE,
      inject: [
        PrismaSellerProfileRepository,
        MODULE01_IDENTITY_CONTRACT,
        SellerLifecycle,
        SellerAssociationPolicy,
        SELLER_ADMIN_AUTHORIZATION,
        MODULE02_AUTHORIZATION_CONTRACT,
        CLOCK,
        UUID_V7_GENERATOR,
      ],
      useFactory: (
        repository: PrismaSellerProfileRepository,
        module01: PrismaModule01IdentityContractAdapter,
        lifecycle: SellerLifecycle,
        associations: SellerAssociationPolicy,
        adminAuthorization: Module02SellerAdminAuthorizationAdapter,
        module02: Module02SellerRoleAssignmentAdapter,
        clock: ClockPort,
        identifiers: UuidV7GenerationPort,
      ) =>
        new SellerAuthorizationApplicationService(
          repository,
          module01,
          lifecycle,
          associations,
          adminAuthorization,
          module02,
          clock,
          identifiers,
        ),
    },
    {
      provide: SELLER_ONBOARDING_APPLICATION_SERVICE,
      inject: [
        PrismaSellerProfileRepository,
        MODULE01_IDENTITY_CONTRACT,
        SellerLifecycle,
        SellerAssociationPolicy,
        SellerCompliancePolicy,
        CLOCK,
        UUID_V7_GENERATOR,
        API_IDEMPOTENCY,
        RATE_LIMITER,
      ],
      useFactory: (
        repository: PrismaSellerProfileRepository,
        module01: PrismaModule01IdentityContractAdapter,
        lifecycle: SellerLifecycle,
        associations: SellerAssociationPolicy,
        compliance: SellerCompliancePolicy,
        clock: ClockPort,
        identifiers: UuidV7GenerationPort,
        idempotency: ApiIdempotencyService,
        rateLimiter: NonProductionRateLimiterPort,
      ) =>
        new SellerOnboardingApplicationService(
          repository,
          module01,
          lifecycle,
          associations,
          compliance,
          clock,
          identifiers,
          idempotency,
          rateLimiter,
        ),
    },
    {
      provide: SELLER_VERIFICATION_APPLICATION_SERVICE,
      inject: [
        PrismaSellerProfileRepository,
        MODULE01_IDENTITY_CONTRACT,
        SellerLifecycle,
        SellerAssociationPolicy,
        SellerCompliancePolicy,
        SELLER_ADMIN_AUTHORIZATION,
        SELLER_EVIDENCE_STORAGE,
        CLOCK,
        UUID_V7_GENERATOR,
        API_IDEMPOTENCY,
        RATE_LIMITER,
      ],
      useFactory: (
        repository: PrismaSellerProfileRepository,
        module01: PrismaModule01IdentityContractAdapter,
        lifecycle: SellerLifecycle,
        associations: SellerAssociationPolicy,
        compliance: SellerCompliancePolicy,
        adminAuthorization: Module02SellerAdminAuthorizationAdapter,
        evidenceStorage: NonProductionSellerEvidenceStorageAdapter,
        clock: ClockPort,
        identifiers: UuidV7GenerationPort,
        idempotency: ApiIdempotencyService,
        rateLimiter: NonProductionRateLimiterPort,
      ) =>
        new SellerVerificationApplicationService(
          repository,
          module01,
          lifecycle,
          associations,
          compliance,
          adminAuthorization,
          evidenceStorage,
          clock,
          identifiers,
          idempotency,
          rateLimiter,
        ),
    },
    {
      provide: SELLER_READ_APPLICATION_SERVICE,
      inject: [
        PrismaSellerProfileRepository,
        SellerAssociationPolicy,
        SellerCompliancePolicy,
        SELLER_ADMIN_AUTHORIZATION,
      ],
      useFactory: (
        repository: PrismaSellerProfileRepository,
        associations: SellerAssociationPolicy,
        compliance: SellerCompliancePolicy,
        adminAuthorization: Module02SellerAdminAuthorizationAdapter,
      ) =>
        new SellerReadApplicationService(
          repository,
          associations,
          compliance,
          adminAuthorization,
        ),
    },
    {
      provide: SELLER_WAREHOUSE_APPLICATION_SERVICE,
      inject: [
        PrismaSellerProfileRepository,
        SellerAssociationPolicy,
        CLOCK,
        UUID_V7_GENERATOR,
        API_IDEMPOTENCY,
        RATE_LIMITER,
      ],
      useFactory: (
        repository: PrismaSellerProfileRepository,
        associations: SellerAssociationPolicy,
        clock: ClockPort,
        identifiers: UuidV7GenerationPort,
        idempotency: ApiIdempotencyService,
        rateLimiter: NonProductionRateLimiterPort,
      ) =>
        new SellerWarehouseApplicationService(
          repository,
          associations,
          clock,
          identifiers,
          idempotency,
          rateLimiter,
        ),
    },
    {
      provide: SELLER_MEMBER_APPLICATION_SERVICE,
      inject: [
        PrismaSellerProfileRepository,
        SellerAssociationPolicy,
        CLOCK,
        UUID_V7_GENERATOR,
        API_IDEMPOTENCY,
        RATE_LIMITER,
      ],
      useFactory: (
        repository: PrismaSellerProfileRepository,
        associations: SellerAssociationPolicy,
        clock: ClockPort,
        identifiers: UuidV7GenerationPort,
        idempotency: ApiIdempotencyService,
        rateLimiter: NonProductionRateLimiterPort,
      ) =>
        new SellerMemberApplicationService(
          repository,
          associations,
          clock,
          identifiers,
          idempotency,
          rateLimiter,
        ),
    },
  ],
  exports: [
    SELLER_OWNERSHIP_RESOLVER,
    MODULE01_IDENTITY_CONTRACT,
    SELLER_ADMIN_AUTHORIZATION,
    MODULE02_AUTHORIZATION_CONTRACT,
    SELLER_AUTHORIZATION_APPLICATION_SERVICE,
    SELLER_ONBOARDING_APPLICATION_SERVICE,
    SELLER_VERIFICATION_APPLICATION_SERVICE,
    SELLER_READ_APPLICATION_SERVICE,
    SELLER_WAREHOUSE_APPLICATION_SERVICE,
    SELLER_MEMBER_APPLICATION_SERVICE,
    SELLER_PROFILE_REPOSITORY,
    PrismaSellerProfileRepository,
    PrismaSellerLegalHoldRepository,
  ],
})
// NestJS modules are declarative metadata containers and intentionally have no members.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class SellerManagementModule {}
