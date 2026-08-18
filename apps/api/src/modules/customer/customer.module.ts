import { Global, Module } from '@nestjs/common';
import { AuthorizationCoreModule } from '../authorization/authorization-core.module';
import { CUSTOMER_OWNERSHIP_RESOLVER } from '../authorization/authorization.tokens';
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
import { Module02CustomerAdminAuthorizationAdapter } from './application/adapters/module02-customer-admin-authorization.adapter';
import { CustomerProfileApplicationService } from './application/services/customer-profile-application.service';
import { CustomerLifecycleApplicationService } from './application/services/customer-lifecycle-application.service';
import { CustomerAddressApplicationService } from './application/services/customer-address-application.service';
import { CustomerBusinessProfileApplicationService } from './application/services/customer-business-profile-application.service';
import { CustomerPreferenceApplicationService } from './application/services/customer-preference-application.service';
import { CustomerRetentionApplicationService } from './application/services/customer-retention-application.service';
import { CustomerLifecycle } from './domain/lifecycle/customer-lifecycle';
import { CustomerAddressPolicy } from './domain/policy/customer-address.policy';
import { CustomerBusinessProfilePolicy } from './domain/policy/customer-business.policy';
import { CustomerRetentionPolicy } from './domain/policy/customer-retention.policy';
import { PrismaCustomerOwnershipResolver } from './infrastructure/persistence/prisma/prisma-customer-ownership-resolver';
import { PrismaCustomerAdminReadRepository } from './infrastructure/persistence/prisma/repositories/prisma-customer-admin-read.repository';
import { PrismaCustomerProfileRepository } from './infrastructure/persistence/prisma/repositories/prisma-customer-profile.repository';
import { PrismaCustomerRetentionDeletionRepository } from './infrastructure/persistence/prisma/repositories/prisma-customer-retention-deletion.repository';
import { RecordedCustomerRetentionConfigurationAdapter } from './infrastructure/configuration/recorded-customer-retention-configuration.adapter';
import { CustomerAdminReadApplicationService } from './application/services/customer-admin-read-application.service';
import { CustomerSelfServicePermissionGuard } from './presentation/guards/customer-self-service-permission.guard';
import { AdminCustomerController } from './presentation/admin-customer.controller';
import { CustomerSelfServiceController } from './presentation/customer-self-service.controller';
import {
  CUSTOMER_ADDRESS_APPLICATION_SERVICE,
  CUSTOMER_ADMIN_AUTHORIZATION,
  CUSTOMER_ADMIN_READ_APPLICATION_SERVICE,
  CUSTOMER_BUSINESS_PROFILE_APPLICATION_SERVICE,
  CUSTOMER_LIFECYCLE_APPLICATION_SERVICE,
  CUSTOMER_PREFERENCE_APPLICATION_SERVICE,
  CUSTOMER_PROFILE_APPLICATION_SERVICE,
  CUSTOMER_PROFILE_REPOSITORY,
  CUSTOMER_RETENTION_APPLICATION_SERVICE,
} from './customer.tokens';

/**
 * WEMP-M06-PLAN-001 M06-M4. Module 06 — Customer Management.
 *
 * M06-M4 wires the approved Module 02 ↔ Module 06 authorization integration:
 * CUSTOMER_OWNERSHIP_RESOLVER (the fourth ownership-resolver scope — customer
 * identity, WEMP-M06-AUTHZ-001 §4, Module 02 owner sign-off RECORDED
 * 2026-08-17), CUSTOMER_ADMIN_AUTHORIZATION (the real Module 02 permission
 * adapter replacing the M06-M3 deny-all placeholder), and the customer
 * self-service permission guard (AAL2 → permission guard → ownership). The
 * M06-M3 application services are wired with the real adapters at the port
 * boundary. M06-M5 adds the presentation layer: the customer self-service
 * and admin customer controllers (WEMP-M06-SPEC-001 §14) and the admin read
 * application service (non-enumerating list/detail/audit, D-10 admin
 * 50/hour). No M07/M08/M10 wiring (A-13).
 *
 * Fail closed: without the resolver or a grant, every customer.* decision
 * denies. Module 06 never evaluates roles itself (A-02) and never reads
 * Module 01/02 storage (A-06).
 */
@Global()
@Module({
  imports: [IdentityAuthenticationModule, AuthorizationCoreModule],
  controllers: [CustomerSelfServiceController, AdminCustomerController],
  providers: [
    { provide: CLOCK, useClass: SystemClockAdapter },
    { provide: UUID_V7_GENERATOR, useClass: SystemUuidV7Generator },
    PrismaCustomerProfileRepository,
    { provide: CUSTOMER_PROFILE_REPOSITORY, useExisting: PrismaCustomerProfileRepository },
    PrismaCustomerRetentionDeletionRepository,
    RecordedCustomerRetentionConfigurationAdapter,
    CustomerLifecycle,
    CustomerAddressPolicy,
    CustomerBusinessProfilePolicy,
    CustomerRetentionPolicy,
    { provide: CUSTOMER_OWNERSHIP_RESOLVER, useClass: PrismaCustomerOwnershipResolver },
    { provide: CUSTOMER_ADMIN_AUTHORIZATION, useClass: Module02CustomerAdminAuthorizationAdapter },
    CustomerSelfServicePermissionGuard,
    {
      provide: CUSTOMER_PROFILE_APPLICATION_SERVICE,
      inject: [
        PrismaCustomerProfileRepository,
        CustomerLifecycle,
        CLOCK,
        UUID_V7_GENERATOR,
        API_IDEMPOTENCY,
        RATE_LIMITER,
      ],
      useFactory: (
        repository: PrismaCustomerProfileRepository,
        lifecycle: CustomerLifecycle,
        clock: ClockPort,
        identifiers: UuidV7GenerationPort,
        idempotency: ApiIdempotencyService,
        rateLimiter: NonProductionRateLimiterPort,
      ) =>
        new CustomerProfileApplicationService(
          repository,
          lifecycle,
          clock,
          identifiers,
          idempotency,
          rateLimiter,
        ),
    },
    {
      provide: CUSTOMER_LIFECYCLE_APPLICATION_SERVICE,
      inject: [
        PrismaCustomerProfileRepository,
        CustomerLifecycle,
        CUSTOMER_ADMIN_AUTHORIZATION,
        CLOCK,
        UUID_V7_GENERATOR,
        API_IDEMPOTENCY,
        RATE_LIMITER,
      ],
      useFactory: (
        repository: PrismaCustomerProfileRepository,
        lifecycle: CustomerLifecycle,
        adminAuthorization: Module02CustomerAdminAuthorizationAdapter,
        clock: ClockPort,
        identifiers: UuidV7GenerationPort,
        idempotency: ApiIdempotencyService,
        rateLimiter: NonProductionRateLimiterPort,
      ) =>
        new CustomerLifecycleApplicationService(
          repository,
          lifecycle,
          adminAuthorization,
          clock,
          identifiers,
          idempotency,
          rateLimiter,
        ),
    },
    {
      provide: CUSTOMER_ADDRESS_APPLICATION_SERVICE,
      inject: [
        PrismaCustomerProfileRepository,
        CustomerLifecycle,
        CustomerAddressPolicy,
        CLOCK,
        UUID_V7_GENERATOR,
        API_IDEMPOTENCY,
        RATE_LIMITER,
      ],
      useFactory: (
        repository: PrismaCustomerProfileRepository,
        lifecycle: CustomerLifecycle,
        addressPolicy: CustomerAddressPolicy,
        clock: ClockPort,
        identifiers: UuidV7GenerationPort,
        idempotency: ApiIdempotencyService,
        rateLimiter: NonProductionRateLimiterPort,
      ) =>
        new CustomerAddressApplicationService(
          repository,
          lifecycle,
          addressPolicy,
          clock,
          identifiers,
          idempotency,
          rateLimiter,
        ),
    },
    {
      provide: CUSTOMER_BUSINESS_PROFILE_APPLICATION_SERVICE,
      inject: [
        PrismaCustomerProfileRepository,
        CustomerLifecycle,
        CustomerBusinessProfilePolicy,
        CLOCK,
        UUID_V7_GENERATOR,
        API_IDEMPOTENCY,
        RATE_LIMITER,
      ],
      useFactory: (
        repository: PrismaCustomerProfileRepository,
        lifecycle: CustomerLifecycle,
        businessProfilePolicy: CustomerBusinessProfilePolicy,
        clock: ClockPort,
        identifiers: UuidV7GenerationPort,
        idempotency: ApiIdempotencyService,
        rateLimiter: NonProductionRateLimiterPort,
      ) =>
        new CustomerBusinessProfileApplicationService(
          repository,
          lifecycle,
          businessProfilePolicy,
          clock,
          identifiers,
          idempotency,
          rateLimiter,
        ),
    },
    {
      provide: CUSTOMER_PREFERENCE_APPLICATION_SERVICE,
      inject: [
        PrismaCustomerProfileRepository,
        CustomerLifecycle,
        CLOCK,
        UUID_V7_GENERATOR,
        API_IDEMPOTENCY,
        RATE_LIMITER,
      ],
      useFactory: (
        repository: PrismaCustomerProfileRepository,
        lifecycle: CustomerLifecycle,
        clock: ClockPort,
        identifiers: UuidV7GenerationPort,
        idempotency: ApiIdempotencyService,
        rateLimiter: NonProductionRateLimiterPort,
      ) =>
        new CustomerPreferenceApplicationService(
          repository,
          lifecycle,
          clock,
          identifiers,
          idempotency,
          rateLimiter,
        ),
    },
    PrismaCustomerAdminReadRepository,
    {
      provide: CUSTOMER_ADMIN_READ_APPLICATION_SERVICE,
      inject: [PrismaCustomerAdminReadRepository, CUSTOMER_ADMIN_AUTHORIZATION, RATE_LIMITER],
      useFactory: (
        repository: PrismaCustomerAdminReadRepository,
        adminAuthorization: Module02CustomerAdminAuthorizationAdapter,
        rateLimiter: NonProductionRateLimiterPort,
      ) => new CustomerAdminReadApplicationService(repository, adminAuthorization, rateLimiter),
    },
    {
      provide: CUSTOMER_RETENTION_APPLICATION_SERVICE,
      inject: [
        PrismaCustomerProfileRepository,
        PrismaCustomerRetentionDeletionRepository,
        RecordedCustomerRetentionConfigurationAdapter,
        CustomerRetentionPolicy,
        CUSTOMER_ADMIN_AUTHORIZATION,
        CLOCK,
        UUID_V7_GENERATOR,
      ],
      useFactory: (
        repository: PrismaCustomerProfileRepository,
        deletion: PrismaCustomerRetentionDeletionRepository,
        retentionConfiguration: RecordedCustomerRetentionConfigurationAdapter,
        retentionPolicy: CustomerRetentionPolicy,
        adminAuthorization: Module02CustomerAdminAuthorizationAdapter,
        clock: ClockPort,
        identifiers: UuidV7GenerationPort,
      ) =>
        new CustomerRetentionApplicationService(
          repository,
          deletion,
          retentionConfiguration,
          retentionPolicy,
          adminAuthorization,
          clock,
          identifiers,
        ),
    },
  ],
  exports: [
    CUSTOMER_OWNERSHIP_RESOLVER,
    CUSTOMER_ADMIN_AUTHORIZATION,
    CUSTOMER_PROFILE_REPOSITORY,
    CustomerSelfServicePermissionGuard,
    CUSTOMER_PROFILE_APPLICATION_SERVICE,
    CUSTOMER_LIFECYCLE_APPLICATION_SERVICE,
    CUSTOMER_ADDRESS_APPLICATION_SERVICE,
    CUSTOMER_BUSINESS_PROFILE_APPLICATION_SERVICE,
    CUSTOMER_PREFERENCE_APPLICATION_SERVICE,
    CUSTOMER_RETENTION_APPLICATION_SERVICE,
    CUSTOMER_ADMIN_READ_APPLICATION_SERVICE,
    PrismaCustomerProfileRepository,
    PrismaCustomerAdminReadRepository,
  ],
})
// NestJS modules are declarative metadata containers and intentionally have no members.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class CustomerModule {}
