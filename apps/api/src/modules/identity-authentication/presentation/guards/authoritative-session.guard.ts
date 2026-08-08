import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { JwtCryptographicPort } from '../../application/ports/jwt-cryptographic.port';
import type { IdentityRepository } from '../../domain/identity/repositories/identity-repository';
import type { SessionRepository } from '../../domain/session/repositories/session-repository';
import { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';
import { JWT_CRYPTOGRAPHY } from '../../identity-authentication.tokens';
import {
  IDENTITY_REPOSITORY,
  SESSION_REPOSITORY,
} from '../../infrastructure/persistence/prisma/prisma.module';
import type { AuthenticatedRequest } from '../authentication-context';

@Injectable()
export class AuthoritativeSessionGuard implements CanActivate {
  public constructor(
    @Inject(JWT_CRYPTOGRAPHY) private readonly jwt: JwtCryptographicPort,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(IDENTITY_REPOSITORY) private readonly identities: IdentityRepository,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = bearerToken(request.headers.authorization);
    try {
      const claims = await this.jwt.verifyAccessToken(token);
      const [session, identity] = await Promise.all([
        this.sessions.findById(new UuidV7(claims.sessionId)),
        this.identities.findById(new UuidV7(claims.subject)),
      ]);
      const now = new Date();
      if (!this.isSessionValid(session, claims, now)) throw new Error('Invalid Session');
      // Defense-in-depth: an Identity that was deactivated, tombstoned, locked
      // or never activated must not be able to use a still-valid Session.
      if (identity === null || !this.isIdentityAuthenticatable(identity, now)) {
        throw new Error('Invalid Session');
      }
      (request as AuthenticatedRequest).authentication = claims;
      return true;
    } catch {
      throw new UnauthorizedException('SESSION_INVALID');
    }
  }

  private isSessionValid(
    session: Awaited<ReturnType<SessionRepository['findById']>>,
    claims: Awaited<ReturnType<JwtCryptographicPort['verifyAccessToken']>>,
    now: Date,
  ): boolean {
    return (
      session !== null &&
      session.properties.identityId.value === claims.subject &&
      session.properties.sessionState === 'ACTIVE' &&
      session.properties.sessionClass !== 'RECOVERY' &&
      session.properties.sessionVersion.value === claims.sessionVersion &&
      session.properties.idleExpiresAt > now &&
      session.properties.absoluteExpiresAt > now
    );
  }

  private isIdentityAuthenticatable(
    identity: Awaited<ReturnType<IdentityRepository['findById']>>,
    now: Date,
  ): boolean {
    if (identity === null) return false;
    const properties = identity.properties;
    if (properties.identityState !== 'ACTIVE' || properties.verificationState !== 'VERIFIED') {
      return false;
    }
    const lockedUntil = properties.lockedUntil;
    return lockedUntil === undefined || lockedUntil <= now;
  }
}

function bearerToken(header: string | undefined): string {
  if (!header?.startsWith('Bearer ') || header.length <= 7) {
    throw new UnauthorizedException('SESSION_INVALID');
  }
  return header.slice(7);
}
