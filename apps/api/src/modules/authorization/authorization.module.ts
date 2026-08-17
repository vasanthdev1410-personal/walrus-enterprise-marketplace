import { Module } from '@nestjs/common';
import { IdentityAuthenticationModule } from '../identity-authentication/identity-authentication.module';
import { AuthorizationCoreModule } from './authorization-core.module';
import { AdminHealthController } from './presentation/admin-health.controller';
import { AuthorizationController } from './presentation/authorization.controller';
import { AuthorizationPermissionGuard } from './presentation/guards/authorization-permission.guard';
import { ReadinessController } from './presentation/readiness.controller';

/**
 * Module 02 – Roles, Permissions & Authorization. Consumes Module 01's session
 * authentication infrastructure (correct dependency direction: authentication
 * precedes authorization, Part 6.1 §3.1) and owns all role/permission state.
 * Module 01 never reads Module 02 storage.
 */
@Module({
  imports: [AuthorizationCoreModule, IdentityAuthenticationModule],
  controllers: [AdminHealthController, AuthorizationController, ReadinessController],
  providers: [AuthorizationPermissionGuard],
  exports: [AuthorizationCoreModule],
})
// NestJS modules are declarative metadata containers and intentionally have no members.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class AuthorizationModule {}
