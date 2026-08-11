import { Module } from '@nestjs/common';
import { PrismaAuthorizationDecisionRepository } from './infrastructure/persistence/prisma/repositories/prisma-authorization-decision.repository';
import { PrismaIdentityRoleAssignmentRepository } from './infrastructure/persistence/prisma/repositories/prisma-identity-role-assignment.repository';

export const IDENTITY_ROLE_ASSIGNMENT_REPOSITORY = Symbol('IDENTITY_ROLE_ASSIGNMENT_REPOSITORY');
export const AUTHORIZATION_DECISION_REPOSITORY = Symbol('AUTHORIZATION_DECISION_REPOSITORY');

/**
 * Module 02 – Roles, Permissions & Authorization. Persistence layer wiring.
 * PrismaService is provided by the global PrismaModule. The module is not yet
 * imported by AppModule: its first consumer (the authorization application
 * service and guards, Milestone 3) registers it.
 */
@Module({
  providers: [
    PrismaIdentityRoleAssignmentRepository,
    PrismaAuthorizationDecisionRepository,
    {
      provide: IDENTITY_ROLE_ASSIGNMENT_REPOSITORY,
      useExisting: PrismaIdentityRoleAssignmentRepository,
    },
    {
      provide: AUTHORIZATION_DECISION_REPOSITORY,
      useExisting: PrismaAuthorizationDecisionRepository,
    },
  ],
  exports: [IDENTITY_ROLE_ASSIGNMENT_REPOSITORY, AUTHORIZATION_DECISION_REPOSITORY],
})
// NestJS modules are declarative metadata containers and intentionally have no members.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class AuthorizationModule {}
