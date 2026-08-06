import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtCryptographicPort } from '../../application/ports/jwt-cryptographic.port';
import type { SessionRepository } from '../../domain/session/repositories/session-repository';
import { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';
import { JWT_CRYPTOGRAPHY } from '../../identity-authentication.tokens';
import { SESSION_REPOSITORY } from '../../infrastructure/persistence/prisma/prisma.module';
import type { AuthenticatedRequest } from '../authentication-context';

@Injectable()
export class AuthoritativeSessionGuard implements CanActivate {
  public constructor(
    @Inject(JWT_CRYPTOGRAPHY) private readonly jwt: JwtCryptographicPort,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = bearerToken(request.headers.authorization);
    try {
      const claims = await this.jwt.verifyAccessToken(token);
      const session = await this.sessions.findById(new UuidV7(claims.sessionId));
      const now = new Date();
      if (
        session?.properties.identityId.value !== claims.subject ||
        session.properties.sessionState !== 'ACTIVE' ||
        session.properties.sessionClass === 'RECOVERY' ||
        session.properties.sessionVersion.value !== claims.sessionVersion ||
        session.properties.idleExpiresAt <= now ||
        session.properties.absoluteExpiresAt <= now
      ) throw new Error('Invalid Session');
      (request as AuthenticatedRequest).authentication = claims;
      return true;
    } catch {
      throw new UnauthorizedException('SESSION_INVALID');
    }
  }
}

function bearerToken(header: string | undefined): string {
  if (!header?.startsWith('Bearer ') || header.length <= 7) {
    throw new UnauthorizedException('SESSION_INVALID');
  }
  return header.slice(7);
}
