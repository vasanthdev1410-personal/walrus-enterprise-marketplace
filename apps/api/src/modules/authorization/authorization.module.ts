import { Module } from '@nestjs/common';
import type {
  ClockPort,
  UuidV7GenerationPort,
} from '../identity-authentication/application/ports/application-runtime.port';
import { IdentityAuthenticationModule } from '../identity-authentication/identity-authentication.module';
import {
  CLOCK,
  UUID_V7_GENERATOR,
} from '../identity-authentication/identity-authentication.tokens';
import { SystemClockAdapter } from '../identity-authentication/infrastructure/runtime/system-runtime.adapter';
import { SystemUuidV7Generator } from '../identity-authentication/infrastructure/runtime/system-runtime.adapter';
import { AuthorizationApplicationService } from './application/services/authorization-application.service';
import type { AuthorizationMutationPort } from './application/ports/authorization-mutation.port';
import {
  AUTHORIZATION_APPLICATION_SERVICE,
  AUTHORIZATION_DECISION_REPOSITORY,
  AUTHORIZATION_MUTATION,
  IDENTITY_ROLE_ASSIGNMENT_REPOSITORY,
} from './authorization.tokens';
import { AuthorizationDecisionEngine } from './domain/authorization-decision-engine';
import type { AuthorizationDecisionRepository } from './domain/repositories/authorization-decision-repository';
import type { IdentityRoleAssignmentRepository } from './domain/repositories/identity-role-assignment-repository';
import { PermissionCatalog } from './domain/permission-catalog';
import { RoleCatalog } from './domain/role-catalog';
import { PrismaAuthorizationDecisionRepository } from './infrastructure/persistence/prisma/repositories/prisma-authorization-decision.repository';
import { PrismaAuthorizationMutationRepository } from './infrastructure/persistence/prisma/repositories/prisma-authorization-mutation.repository';
import { PrismaIdentityRoleAssignmentRepository } from './infrastructure/persistence/prisma/repositories/prisma-identity-role-assignment.repository';
import { AuthorizationController } from './presentation/authorization.controller';
import { AuthorizationPermissionGuard } from './presentation/guards/authorization-permission.guard';

/**
 * Module 02 – Roles, Permissions & Authorization. Consumes Module 01's session
 * authentication infrastructure (correct dependency direction: authentication
 * precedes authorization, Part 6.1 §3.1) and owns all role/permission state.
 * Module 01 never reads Module 02 storage.
 */
@Module({
  imports: [IdentityAuthenticationModule],
  controllers: [AuthorizationController],
  providers: [
    { provide: CLOCK, useClass: SystemClockAdapter },
    { provide: UUID_V7_GENERATOR, useClass: SystemUuidV7Generator },
    PrismaIdentityRoleAssignmentRepository,
    PrismaAuthorizationDecisionRepository,
    PrismaAuthorizationMutationRepository,
    {
      provide: IDENTITY_ROLE_ASSIGNMENT_REPOSITORY,
      useExisting: PrismaIdentityRoleAssignmentRepository,
    },
    {
      provide: AUTHORIZATION_DECISION_REPOSITORY,
      useExisting: PrismaAuthorizationDecisionRepository,
    },
    {
      provide: AUTHORIZATION_MUTATION,
      useExisting: PrismaAuthorizationMutationRepository,
    },
    {
      provide: AUTHORIZATION_APPLICATION_SERVICE,
      inject: [
        IDENTITY_ROLE_ASSIGNMENT_REPOSITORY,
        AUTHORIZATION_DECISION_REPOSITORY,
        AUTHORIZATION_MUTATION,
        CLOCK,
        UUID_V7_GENERATOR,
      ],
      useFactory: (
        assignments: IdentityRoleAssignmentRepository,
        decisions: AuthorizationDecisionRepository,
        mutations: AuthorizationMutationPort,
        clock: ClockPort,
        identifiers: UuidV7GenerationPort,
      ) => {
        const permissions = new PermissionCatalog();
        const roles = new RoleCatalog();
        return new AuthorizationApplicationService(
          new AuthorizationDecisionEngine(permissions, roles),
          roles,
          assignments,
          decisions,
          mutations,
          clock,
          identifiers,
        );
      },
    },
    AuthorizationPermissionGuard,
  ],
  exports: [
    AUTHORIZATION_APPLICATION_SERVICE,
    IDENTITY_ROLE_ASSIGNMENT_REPOSITORY,
    AUTHORIZATION_DECISION_REPOSITORY,
  ],
})
// NestJS modules are declarative metadata containers and intentionally have no members.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class AuthorizationModule {}
