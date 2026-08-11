import {
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  PreconditionFailedException,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { SessionError } from '../application/errors/session.error';
import type { ApiIdempotencyService } from '../application/services/api-idempotency.service';
import type { SessionManagementApplicationService } from '../application/services/session-management-application.service';
import type { Session } from '../domain/session/entities/session';
import { UuidV7 } from '../domain/shared/value-objects/uuid-v7';
import { API_IDEMPOTENCY } from '../identity-authentication.tokens';
import type { AuthenticatedRequest } from './authentication-context';
import { SESSION_MANAGEMENT_APPLICATION_SERVICE } from './authentication.tokens';
import { AuthoritativeSessionGuard } from './guards/authoritative-session.guard';
import { NonProductionRateLimiterGuard } from './guards/non-production-rate-limiter.guard';
import { assertIdempotencyKey, etagVersion, noStore, success } from './http-contract';
import { BasicAuditInterceptor } from './interceptors/basic-audit.interceptor';
import { RateLimit } from './decorators/rate-limit.decorator';

@ApiTags('Module 01 Session Management')
@Controller('sessions')
@UseGuards(NonProductionRateLimiterGuard)
@UseInterceptors(BasicAuditInterceptor)
export class SessionsController {
  public constructor(
    @Inject(SESSION_MANAGEMENT_APPLICATION_SERVICE)
    private readonly sessions: SessionManagementApplicationService,
    @Inject(API_IDEMPOTENCY) private readonly idempotency: ApiIdempotencyService,
  ) {}

  /**
   * M01-SES-001. Lists the identity's active ordinary sessions. The subject is
   * taken from the server-validated ordinary session, so only own sessions are
   * ever returned. Each item exposes only safe fields; the caller's current
   * session is flagged; no token material is exposed.
   */
  @Get()
  @RateLimit({ limit: 30, windowSeconds: 60 })
  @UseGuards(AuthoritativeSessionGuard)
  @ApiOperation({ operationId: 'M01-SES-001', summary: 'List active sessions' })
  public async listSessions(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Readonly<Record<string, unknown>>> {
    try {
      const claims = request.authentication;
      const sessions = await this.sessions.listSessions({ identityId: new UuidV7(claims.subject) });
      noStore(response);
      return success({
        sessions: sessions.map((session) => toSessionView(session, new UuidV7(claims.sessionId))),
        count: sessions.length,
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * M01-SES-002. Views one owned ordinary session with the same safe fields.
   * Unknown, foreign and recovery-class sessions are answered uniformly with
   * 404 RESOURCE_NOT_AVAILABLE so session state is never enumerable.
   */
  @Get(':sessionId')
  @RateLimit({ limit: 30, windowSeconds: 60 })
  @UseGuards(AuthoritativeSessionGuard)
  @ApiOperation({ operationId: 'M01-SES-002', summary: 'View one owned session' })
  public async getSession(
    @Param('sessionId') sessionId: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Readonly<Record<string, unknown>>> {
    const sessionIdValue = parseSessionId(sessionId);
    try {
      const claims = request.authentication;
      const session = await this.sessions.getSession({
        identityId: new UuidV7(claims.subject),
        sessionId: sessionIdValue,
      });
      noStore(response);
      return success({ session: toSessionView(session, new UuidV7(claims.sessionId)) });
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * M01-SES-003. Revokes one owned ordinary session. The session version
   * travels in If-Match and guards the write; revocation is idempotent (an
   * already revoked/expired session returns success without being altered) and
   * atomically revokes the session's refresh-token family. Stable errors: 404
   * RESOURCE_NOT_AVAILABLE for unknown, foreign or recovery-class sessions,
   * 412 RESOURCE_STATE_CONFLICT for a stale version precondition.
   */
  @Delete(':sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit({ limit: 10, windowSeconds: 60 })
  @UseGuards(AuthoritativeSessionGuard)
  @ApiOperation({ operationId: 'M01-SES-003', summary: 'Revoke a session' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({ name: 'If-Match', required: true })
  public async revokeSession(
    @Param('sessionId') sessionId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    const sessionIdValue = parseSessionId(sessionId);
    const expectedSessionVersion = etagVersion(ifMatch, `session:${sessionIdValue.value}`);
    const claims = request.authentication;
    try {
      await this.idempotency.execute({
        // The session is the revocation subject; the idempotency scope is bound
        // to it so a key cannot be replayed across sessions. The fingerprint
        // carries only the locator and version precondition; no token material.
        scope: `session:${sessionIdValue.value}`,
        operationType: 'M01-SES-003',
        idempotencyKey,
        request: { sessionId, ifMatch },
        execute: () =>
          this.sessions.revokeSession({
            identityId: new UuidV7(claims.subject),
            sessionId: sessionIdValue,
            expectedSessionVersion,
          }),
      });
      noStore(response);
      response.status(HttpStatus.NO_CONTENT).send();
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleError(error: unknown): never {
    if (error instanceof SessionError) {
      switch (error.code) {
        case 'RESOURCE_STATE_CONFLICT':
          throw new PreconditionFailedException(error.code);
        case 'RESOURCE_NOT_AVAILABLE':
        default:
          throw new NotFoundException(error.code);
      }
    }
    throw error;
  }
}

function parseSessionId(value: string): UuidV7 {
  try {
    return new UuidV7(value);
  } catch {
    // A malformed locator is indistinguishable from an unknown session, so the
    // response stays uniform and session state is never enumerable.
    throw new NotFoundException('RESOURCE_NOT_AVAILABLE');
  }
}

function toSessionView(
  session: Session,
  currentSessionId: UuidV7,
): Readonly<Record<string, unknown>> {
  const properties = session.properties;
  return {
    sessionId: properties.sessionId.value,
    sessionClass: properties.sessionClass,
    createdAt: properties.createdAt.toISOString(),
    lastActivityAt: properties.lastActivityAt.toISOString(),
    idleExpiresAt: properties.idleExpiresAt.toISOString(),
    absoluteExpiresAt: properties.absoluteExpiresAt.toISOString(),
    aal: properties.authenticationAssurance,
    deviceSummary:
      properties.deviceSessionId === undefined
        ? null
        : { deviceSessionId: properties.deviceSessionId.value },
    currentSession: properties.sessionId.value === currentSessionId.value,
    state: properties.sessionState,
    version: properties.sessionVersion.value,
  };
}
