import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { SessionRepository } from '../../domain/session/repositories/session-repository';
import { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';
import { SESSION_REPOSITORY } from '../../infrastructure/persistence/prisma/prisma.module';
import type { AuthenticatedRequest } from '../authentication-context';
import { AuthoritativeSessionGuard } from './authoritative-session.guard';

/**
 * AAL2_REQUIRED enforcement for approved Module 01 contracts (M01-MFA-004,
 * M01-MFA-005, M01-ID-002, M01-ID-003): valid ordinary Session with current
 * AAL2 required.
 *
 * Composes the AuthoritativeSessionGuard — JWT signature, Session state,
 * version, expiry, non-RECOVERY class and Identity authenticity — and then
 * requires that the current authentication event reached AAL2. Assurance is
 * never taken from the client: the access token is server-signed, and the
 * authoritative Session row is re-read and must itself carry
 * authenticationAssurance AAL2 with a recorded mfaVerifiedAt for the same
 * identity and session. A token whose acr claim does not match the persisted
 * Session (forged, stale or client-modified) is therefore rejected.
 *
 * The authoritative Session row re-read is a fresh read: it re-validates the
 * Session state and expiries in addition to identity, assurance and MFA
 * verification, so a Session revoked or expired in the window between the
 * composed guard's read and this cross-check read cannot retain AAL2 access.
 *
 * Failures raise the approved 401 AUTHENTICATION_ASSURANCE_INSUFFICIENT.
 * Revoked, expired, version-mismatched or RECOVERY-class sessions fail inside
 * the composed guard with 401 SESSION_INVALID before assurance is evaluated,
 * so revoked and expired sessions can never retain AAL2 access.
 */
@Injectable()
export class Aal2SessionGuard implements CanActivate {
  public constructor(
    @Inject(AuthoritativeSessionGuard)
    private readonly authoritative: AuthoritativeSessionGuard,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.authoritative.canActivate(context);
    const request = context.switchToHttp().getRequest<Request>();
    const claims = (request as AuthenticatedRequest).authentication;

    if (claims.authenticationAssurance !== 'AAL2') {
      throw new UnauthorizedException('AUTHENTICATION_ASSURANCE_INSUFFICIENT');
    }
    const session = await this.sessions.findById(new UuidV7(claims.sessionId));
    const now = new Date();
    if (
      session?.properties.identityId.value !== claims.subject ||
      session.properties.sessionState !== 'ACTIVE' ||
      // Defense-in-depth on the fresh read: a Session rotated to a new version
      // (old row revoked) would already fail the state check, but asserting the
      // version explicitly removes any reliance on that invariant.
      session.properties.sessionVersion.value !== claims.sessionVersion ||
      session.properties.idleExpiresAt <= now ||
      session.properties.absoluteExpiresAt <= now ||
      session.properties.authenticationAssurance !== 'AAL2' ||
      session.properties.mfaVerifiedAt === undefined
    ) {
      throw new UnauthorizedException('AUTHENTICATION_ASSURANCE_INSUFFICIENT');
    }
    return true;
  }
}
