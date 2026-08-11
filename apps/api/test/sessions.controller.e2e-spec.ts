import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { SessionError } from '../src/modules/identity-authentication/application/errors/session.error';
import type { ApiIdempotencyService } from '../src/modules/identity-authentication/application/services/api-idempotency.service';
import type { SessionManagementApplicationService } from '../src/modules/identity-authentication/application/services/session-management-application.service';
import type { JwtCryptographicPort } from '../src/modules/identity-authentication/application/ports/jwt-cryptographic.port';
import type { IdentityRepository } from '../src/modules/identity-authentication/domain/identity/repositories/identity-repository';
import type { SessionRepository } from '../src/modules/identity-authentication/domain/session/repositories/session-repository';
import { API_IDEMPOTENCY } from '../src/modules/identity-authentication/identity-authentication.tokens';
import { SessionsController } from '../src/modules/identity-authentication/presentation/sessions.controller';
import {
  BASIC_AUDIT_LOGGER,
  RATE_LIMITER,
  SESSION_MANAGEMENT_APPLICATION_SERVICE,
} from '../src/modules/identity-authentication/presentation/authentication.tokens';
import { AuthoritativeSessionGuard } from '../src/modules/identity-authentication/presentation/guards/authoritative-session.guard';
import { NonProductionRateLimiterGuard } from '../src/modules/identity-authentication/presentation/guards/non-production-rate-limiter.guard';
import { BasicAuditInterceptor } from '../src/modules/identity-authentication/presentation/interceptors/basic-audit.interceptor';
import { JWT_CRYPTOGRAPHY } from '../src/modules/identity-authentication/identity-authentication.tokens';
import {
  IDENTITY_REPOSITORY,
  SESSION_REPOSITORY,
} from '../src/modules/identity-authentication/infrastructure/persistence/prisma/prisma.module';

const identityId = '0191310f-789a-7123-8123-000000000001';
const sessionId = '0191310f-789a-7123-8123-000000000002';
const otherSessionId = '0191310f-789a-7123-8123-000000000003';
const idempotencyKey = 'sessions-key-1234567890abcdef';

describe('Module 01 Session Management API (integration)', () => {
  let application: INestApplication;
  let server: Server;

  const listSessions = jest.fn() as jest.MockedFunction<
    SessionManagementApplicationService['listSessions']
  >;
  const getSession = jest.fn() as jest.MockedFunction<
    SessionManagementApplicationService['getSession']
  >;
  const revokeSession = jest.fn() as jest.MockedFunction<
    SessionManagementApplicationService['revokeSession']
  >;
  const sessionsService = {
    listSessions,
    getSession,
    revokeSession,
  } as unknown as jest.Mocked<SessionManagementApplicationService>;

  const idempotency = {
    execute: jest.fn(async (execution: { execute: () => Promise<unknown> }) => execution.execute()),
  } as unknown as jest.Mocked<ApiIdempotencyService>;

  const jwt = { verifyAccessToken: jest.fn() } as unknown as jest.Mocked<JwtCryptographicPort>;
  const sessions = { findById: jest.fn() } as unknown as jest.Mocked<SessionRepository>;
  const identities = { findById: jest.fn() } as unknown as jest.Mocked<IdentityRepository>;

  const rateLimiter = {
    consume: jest.fn().mockResolvedValue({
      allowed: true,
      limit: 100,
      remaining: 99,
      resetAt: new Date(Date.now() + 60_000),
    }),
  };

  const auditLogger = {
    logEvent: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      controllers: [SessionsController],
      providers: [
        { provide: SESSION_MANAGEMENT_APPLICATION_SERVICE, useValue: sessionsService },
        { provide: API_IDEMPOTENCY, useValue: idempotency },
        { provide: RATE_LIMITER, useValue: rateLimiter },
        { provide: BASIC_AUDIT_LOGGER, useValue: auditLogger },
        { provide: JWT_CRYPTOGRAPHY, useValue: jwt },
        { provide: SESSION_REPOSITORY, useValue: sessions },
        { provide: IDENTITY_REPOSITORY, useValue: identities },
        AuthoritativeSessionGuard,
        NonProductionRateLimiterGuard,
        BasicAuditInterceptor,
      ],
    }).compile();

    application = moduleFixture.createNestApplication();
    application.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await application.init();
    server = application.getHttpServer() as Server;
  });

  afterAll(async () => {
    await application.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jwt.verifyAccessToken.mockResolvedValue({
      subject: identityId,
      sessionId,
      jwtId: 'jwt',
      issuer: 'issuer',
      audience: 'audience',
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      authenticationMethods: ['PASSWORD'],
      authenticationAssurance: 'AAL1',
      sessionVersion: 1,
    });
    sessions.findById.mockResolvedValue({
      properties: {
        identityId: { value: identityId },
        sessionState: 'ACTIVE',
        sessionClass: 'INTERACTIVE_WEB',
        sessionVersion: { value: 1 },
        idleExpiresAt: new Date(Date.now() + 60_000),
        absoluteExpiresAt: new Date(Date.now() + 120_000),
      },
    } as never);
    identities.findById.mockResolvedValue({
      properties: {
        identityId: { value: identityId },
        identityState: 'ACTIVE',
        verificationState: 'VERIFIED',
        lockedUntil: undefined,
      },
    } as never);
  });

  describe('M01-SES-001 GET /sessions', () => {
    it("lists the identity's active ordinary sessions with safe fields (200)", async () => {
      listSessions.mockResolvedValueOnce([
        {
          properties: {
            sessionId: { value: sessionId },
            sessionClass: 'INTERACTIVE_WEB',
            sessionState: 'ACTIVE',
            sessionVersion: { value: 1 },
            authenticationAssurance: 'AAL1',
            authenticationSecurityClassificationReference: 'STANDARD_AUTHENTICATION',
            authenticationMethods: ['PASSWORD'],
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            lastActivityAt: new Date('2026-01-01T01:00:00.000Z'),
            idleExpiresAt: new Date('2026-01-01T01:15:00.000Z'),
            absoluteExpiresAt: new Date('2026-01-01T09:00:00.000Z'),
            aggregateVersion: { value: 1 },
            deviceSessionId: { value: '0191310f-789a-7123-8123-00000000000a' },
          },
        },
        {
          properties: {
            sessionId: { value: otherSessionId },
            sessionClass: 'INTERACTIVE_MOBILE',
            sessionState: 'ACTIVE',
            sessionVersion: { value: 1 },
            authenticationAssurance: 'AAL2',
            authenticationSecurityClassificationReference: 'STANDARD_AUTHENTICATION',
            authenticationMethods: ['PASSWORD', 'TOTP_AUTHENTICATOR'],
            createdAt: new Date('2026-01-01T00:10:00.000Z'),
            lastActivityAt: new Date('2026-01-01T00:40:00.000Z'),
            idleExpiresAt: new Date('2026-01-01T00:55:00.000Z'),
            absoluteExpiresAt: new Date('2026-01-01T08:10:00.000Z'),
            aggregateVersion: { value: 1 },
            mfaVerifiedAt: new Date('2026-01-01T00:10:00.000Z'),
          },
        },
      ] as never);

      const response = await request(server)
        .get('/sessions')
        .set('Authorization', 'Bearer valid-jwt-token')
        .expect(200);

      const body = response.body as {
        data: {
          sessions: readonly Readonly<Record<string, unknown>>[];
          count: number;
        };
      };
      expect(body.data.count).toBe(2);
      expect(body.data.sessions[0]).toMatchObject({
        sessionId,
        sessionClass: 'INTERACTIVE_WEB',
        state: 'ACTIVE',
        aal: 'AAL1',
        currentSession: true,
        version: 1,
        deviceSummary: { deviceSessionId: '0191310f-789a-7123-8123-00000000000a' },
      });
      expect(body.data.sessions[1]).toMatchObject({
        sessionId: otherSessionId,
        currentSession: false,
      });
      expect(response.headers['cache-control']).toBe('no-store');
      const listCommand = listSessions.mock.calls[0]?.[0];
      expect(listCommand?.identityId.value).toBe(identityId);
    });

    it('returns 401 SESSION_INVALID when the access token is missing', async () => {
      await request(server).get('/sessions').expect(401);
    });
  });

  describe('M01-SES-002 GET /sessions/:sessionId', () => {
    it('views one owned session with safe fields (200)', async () => {
      getSession.mockResolvedValueOnce({
        properties: {
          sessionId: { value: sessionId },
          sessionClass: 'INTERACTIVE_WEB',
          sessionState: 'ACTIVE',
          sessionVersion: { value: 1 },
          authenticationAssurance: 'AAL1',
          authenticationSecurityClassificationReference: 'STANDARD_AUTHENTICATION',
          authenticationMethods: ['PASSWORD'],
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          lastActivityAt: new Date('2026-01-01T01:00:00.000Z'),
          idleExpiresAt: new Date('2026-01-01T01:15:00.000Z'),
          absoluteExpiresAt: new Date('2026-01-01T09:00:00.000Z'),
          aggregateVersion: { value: 1 },
        },
      } as never);

      const response = await request(server)
        .get(`/sessions/${sessionId}`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .expect(200);

      const body = response.body as { data: { session: Readonly<Record<string, unknown>> } };
      expect(body.data.session).toMatchObject({
        sessionId,
        currentSession: true,
        state: 'ACTIVE',
      });
      const viewCommand = getSession.mock.calls[0]?.[0];
      expect(viewCommand?.sessionId.value).toBe(sessionId);
      expect(viewCommand?.identityId.value).toBe(identityId);
    });

    it('returns 404 RESOURCE_NOT_AVAILABLE for an unknown or foreign session', async () => {
      getSession.mockRejectedValueOnce(new SessionError('RESOURCE_NOT_AVAILABLE'));
      await request(server)
        .get(`/sessions/${otherSessionId}`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .expect(404);
    });

    it('answers a malformed locator uniformly with 404', async () => {
      await request(server)
        .get('/sessions/not-a-uuid')
        .set('Authorization', 'Bearer valid-jwt-token')
        .expect(404);
    });
  });

  describe('M01-SES-003 DELETE /sessions/:sessionId', () => {
    it('revokes one owned session (204)', async () => {
      revokeSession.mockResolvedValueOnce(undefined);

      await request(server)
        .delete(`/sessions/${sessionId}`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"session:${sessionId}:v1"`)
        .expect(204);

      const revokeCommand = revokeSession.mock.calls[0]?.[0];
      expect(revokeCommand?.identityId.value).toBe(identityId);
      expect(revokeCommand?.sessionId.value).toBe(sessionId);
      expect(revokeCommand?.expectedSessionVersion).toBe(1);
    });

    it('returns 400 when the Idempotency-Key is missing', async () => {
      await request(server)
        .delete(`/sessions/${sessionId}`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('If-Match', `"session:${sessionId}:v1"`)
        .expect(400);
    });

    it('returns 400 when the If-Match precondition is missing', async () => {
      await request(server)
        .delete(`/sessions/${sessionId}`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .expect(400);
    });

    it('returns 404 RESOURCE_NOT_AVAILABLE for an unknown or foreign session', async () => {
      revokeSession.mockRejectedValueOnce(new SessionError('RESOURCE_NOT_AVAILABLE'));
      await request(server)
        .delete(`/sessions/${otherSessionId}`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"session:${otherSessionId}:v1"`)
        .expect(404);
    });

    it('returns 412 RESOURCE_STATE_CONFLICT for a stale version precondition', async () => {
      revokeSession.mockRejectedValueOnce(new SessionError('RESOURCE_STATE_CONFLICT'));
      await request(server)
        .delete(`/sessions/${sessionId}`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"session:${sessionId}:v1"`)
        .expect(412);
    });
  });
});
