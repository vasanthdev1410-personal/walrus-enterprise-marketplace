import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  type CustomDecorator,
} from '@nestjs/common';
import type { Request } from 'express';
import type { VerifiedAccessTokenAuthenticationClaims } from '../../../identity-authentication/application/ports/jwt-cryptographic.port';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { AuthenticatedRequest } from '../../../identity-authentication/presentation/authentication-context';
import { AUTHORIZATION_APPLICATION_SERVICE } from '../../authorization.tokens';
import type { AuthorizationApplicationService } from '../../application/services/authorization-application.service';

export const PERMISSION_METADATA_KEY = 'authorization:permission';

/** Declares the exact permission a protected route requires. */
export const RequiresPermission = (permissionId: string): CustomDecorator =>
  SetMetadata(PERMISSION_METADATA_KEY, permissionId);

/**
 * Part 6.3 §14 (Module 02 source material). Authorization Guard: executes
 * before protected operations, invokes the authorization evaluation, prevents
 * unauthorized execution and never bypasses business logic. Fails closed: a
 * route without an explicit permission declaration, an unauthenticated
 * request, or a denied decision all raise AUTHORIZATION_DENIED. The guard runs
 * after Aal2SessionGuard, which populates the authenticated claims on the
 * request.
 */
@Injectable()
export class AuthorizationPermissionGuard implements CanActivate {
  public constructor(
    @Inject(AUTHORIZATION_APPLICATION_SERVICE)
    private readonly authorization: AuthorizationApplicationService,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const permissionId: unknown = Reflect.getMetadata(
      PERMISSION_METADATA_KEY,
      context.getHandler(),
    );
    if (typeof permissionId !== 'string') {
      throw new ForbiddenException('AUTHORIZATION_DENIED');
    }
    const request = context.switchToHttp().getRequest<Request>();
    // Aal2SessionGuard normally populates the claims; fail closed if it did not.
    const claims: VerifiedAccessTokenAuthenticationClaims | undefined = (
      request as Partial<AuthenticatedRequest>
    ).authentication;
    if (claims === undefined) {
      throw new ForbiddenException('AUTHORIZATION_DENIED');
    }
    const decision = await this.authorization.authorize({
      subjectIdentityId: new UuidV7(claims.subject),
      permissionId,
      sessionIdentifier: claims.sessionId,
    });
    if (!decision.granted) {
      throw new ForbiddenException('AUTHORIZATION_DENIED');
    }
    return true;
  }
}
