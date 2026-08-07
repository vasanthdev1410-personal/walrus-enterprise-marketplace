import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import type { IdentityManagementApplicationService } from '../src/modules/identity-authentication/application/services/identity-management-application.service';
import type { JwtCryptographicPort } from '../src/modules/identity-authentication/application/ports/jwt-cryptographic.port';
import type { IdentityRepository } from '../src/modules/identity-authentication/domain/identity/repositories/identity-repository';
import type { SessionRepository } from '../src/modules/identity-authentication/domain/session/repositories/session-repository';
import { UuidV7 } from '../src/modules/identity-authentication/domain/shared/value-objects/uuid-v7';
import { IdentityController } from '../src/modules/identity-authentication/presentation/identity.controller';
import {
  BASIC_AUDIT_LOGGER,
  IDENTITY_MANAGEMENT_APPLICATION_SERVICE,
  RATE_LIMITER,
} from '../src/modules/identity-authentication/presentation/authentication.tokens';
import { AuthoritativeSessionGuard } from '../src/modules/identity-authentication/presentation/guards/authoritative-session.guard';
import { NonProductionRateLimiterGuard } from '../src/modules/identity-authentication/presentation/guards/non-production-rate-limiter.guard';
import { BasicAuditInterceptor } from '../src/modules/identity-authentication/presentation/interceptors/basic-audit.interceptor';
import { JWT_CRYPTOGRAPHY } from '../src/modules/identity-authentication/identity-authentication.tokens';
import {
  IDENTITY_REPOSITORY,
  SESSION_REPOSITORY,
} from '../src/modules/identity-authentication/infrastructure/persistence/prisma/prisma.module';
import { IdentityError } from '../src/modules/identity-authentication/application/errors/identity.error';

const identityId = '0191310f-789a-7123-8123-000000000001';
const sessionId = '0191310f-789a-7123-8123-000000000002';

describe('Module 01 identity management API (integration)', () => {
  let application: INestApplication;
  let server: Server;

  const register = jest.fn();
  const getProfile = jest.fn();
  const updateProfile = jest.fn();
  const deactivate = jest.fn();
  const softDelete = jest.fn();

  const identityService = {
    register,
    getProfile,
    updateProfile,
    deactivate,
    softDelete,
  } as unknown as jest.Mocked<IdentityManagementApplicationService>;

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
      controllers: [IdentityController],
      providers: [
        { provide: IDENTITY_MANAGEMENT_APPLICATION_SERVICE, useValue: identityService },
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

  describe('M01-ID-001 POST /api/v1/identities', () => {
    it('registers a new identity (201 Created)', async () => {
      register.mockResolvedValueOnce({
        identityId,
        identityState: 'PENDING_VERIFICATION',
        verificationState: 'PENDING_VERIFICATION',
        aggregateVersion: 1,
        classification: 'STANDARD_AUTHENTICATION',
        primaryIdentifier: {
          identifierType: 'EMAIL',
          verificationState: 'UNVERIFIED',
        },
        createdAt: new Date('2026-08-06T12:00:00.000Z'),
        updatedAt: new Date('2026-08-06T12:00:00.000Z'),
      });

      const response = await request(server)
        .post('/identities')
        .send({
          identifierType: 'EMAIL',
          identifier: 'newuser@example.com',
          password: 'SecurePassword123!',
        })
        .expect(201);

      const data = readProfile(response.body);
      expect(data.identityId).toBe(identityId);
      expect(data.identityState).toBe('PENDING_VERIFICATION');
      expect(data.classification).toBe('STANDARD_AUTHENTICATION');
      expect(data.createdAt).toBe('2026-08-06T12:00:00.000Z');
    });

    it('returns 409 Conflict if identifier is already registered', async () => {
      register.mockRejectedValueOnce(new IdentityError('IDENTIFIER_ALREADY_REGISTERED'));

      await request(server)
        .post('/identities')
        .send({
          identifierType: 'EMAIL',
          identifier: 'existing@example.com',
          password: 'SecurePassword123!',
        })
        .expect(409);
    });

    it('rejects a self-asserted privileged classification (400 at validation)', async () => {
      await request(server)
        .post('/identities')
        .send({
          identifierType: 'EMAIL',
          identifier: 'attacker@example.com',
          password: 'SecurePassword123!',
          classification: 'SUPER_ADMIN_AUTHENTICATION',
        })
        .expect(400);
      expect(register).not.toHaveBeenCalled();
    });

    it('returns 400 for a malformed identifier instead of a 500', async () => {
      register.mockRejectedValueOnce(new IdentityError('IDENTIFIER_INVALID'));

      await request(server)
        .post('/identities')
        .send({
          identifierType: 'EMAIL',
          identifier: 'not-an-email',
          password: 'SecurePassword123!',
        })
        .expect(400);
    });

    it('rejects malformed registration payloads (400)', async () => {
      await request(server)
        .post('/identities')
        .send({ identifierType: 'EMAIL', identifier: 'user@example.com' })
        .expect(400);
    });
  });

  describe('M01-ID-002 GET /api/v1/identities/me', () => {
    it('returns 401 Unauthorized when missing access token', async () => {
      await request(server).get('/identities/me').expect(401);
    });

    it('returns authenticated profile (200 OK)', async () => {
      getProfile.mockResolvedValueOnce({
        identityId,
        identityState: 'ACTIVE',
        verificationState: 'VERIFIED',
        aggregateVersion: 2,
        classification: 'STANDARD_AUTHENTICATION',
        createdAt: new Date('2026-08-06T12:00:00.000Z'),
        updatedAt: new Date('2026-08-06T12:00:00.000Z'),
      });

      const response = await request(server)
        .get('/identities/me')
        .set('Authorization', 'Bearer valid-jwt-token')
        .expect(200);

      const data = readProfile(response.body);
      expect(data.identityId).toBe(identityId);
      expect(data.identityState).toBe('ACTIVE');
    });
  });

  describe('M01-ID-002 GET /api/v1/identities/:id', () => {
    it('returns profile for the caller\'s own valid identity id (200 OK)', async () => {
      getProfile.mockResolvedValueOnce({
        identityId,
        identityState: 'ACTIVE',
        verificationState: 'VERIFIED',
        aggregateVersion: 2,
        classification: 'STANDARD_AUTHENTICATION',
        createdAt: new Date('2026-08-06T12:00:00.000Z'),
        updatedAt: new Date('2026-08-06T12:00:00.000Z'),
      });

      const response = await request(server)
        .get(`/identities/${identityId}`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .expect(200);

      expect(readProfile(response.body).identityId).toBe(identityId);
    });

    it('conceals another identity\'s profile as 404 (no cross-user read)', async () => {
      const otherIdentityId = '0191310f-789a-7123-8123-0000000000aa';
      await request(server)
        .get(`/identities/${otherIdentityId}`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .expect(404);
      expect(getProfile).not.toHaveBeenCalled();
    });

    it('returns 404 for a malformed identity id', async () => {
      await request(server)
        .get('/identities/not-a-uuid')
        .set('Authorization', 'Bearer valid-jwt-token')
        .expect(404);
    });
  });

  describe('M01-ID-003 PATCH /api/v1/identities/me', () => {
    it('performs a version-safe profile update (200 OK)', async () => {
      updateProfile.mockResolvedValueOnce({
        identityId,
        identityState: 'ACTIVE',
        verificationState: 'VERIFIED',
        aggregateVersion: 3,
        classification: 'STANDARD_AUTHENTICATION',
        createdAt: new Date('2026-08-06T12:00:00.000Z'),
        updatedAt: new Date('2026-08-06T12:00:00.000Z'),
      });

      const response = await request(server)
        .patch('/identities/me')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send({})
        .expect(200);

      expect(readProfile(response.body).aggregateVersion).toBe(3);
      expect(updateProfile).toHaveBeenCalledWith(expect.any(UuidV7));
    });

    it('rejects unknown profile fields (400)', async () => {
      await request(server)
        .patch('/identities/me')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send({ displayName: 'should not exist' })
        .expect(400);
    });
  });

  describe('M01-ID-004 POST /api/v1/identities/me/deactivate', () => {
    it('deactivates active identity and revokes sessions (200 OK)', async () => {
      deactivate.mockResolvedValueOnce({
        identityId,
        identityState: 'DISABLED',
        verificationState: 'VERIFIED',
        aggregateVersion: 3,
        classification: 'STANDARD_AUTHENTICATION',
        createdAt: new Date('2026-08-06T12:00:00.000Z'),
        updatedAt: new Date('2026-08-06T12:00:00.000Z'),
        disabledAt: new Date('2026-08-06T12:00:00.000Z'),
      });

      const response = await request(server)
        .post('/identities/me/deactivate')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send({ reasonCode: 'USER_REQUESTED' })
        .expect(200);

      const data = readProfile(response.body);
      expect(data.identityState).toBe('DISABLED');
      expect(deactivate).toHaveBeenCalledWith(
        expect.any(UuidV7),
        expect.objectContaining({
          reasonCode: 'USER_REQUESTED',
          expectedAuthorizingSessionVersion: 1,
        }),
      );
    });

    it('returns 409 Conflict for an already deactivated identity', async () => {
      deactivate.mockRejectedValueOnce(new IdentityError('IDENTITY_ALREADY_DEACTIVATED'));

      await request(server)
        .post('/identities/me/deactivate')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send({ reasonCode: 'USER_REQUESTED' })
        .expect(409);
    });
  });

  describe('M01-ID-005 DELETE /api/v1/identities/me', () => {
    it('soft deletes / tombstone stages identity and revokes sessions (200 OK)', async () => {
      softDelete.mockResolvedValueOnce({
        identityId,
        identityState: 'DELETED',
        verificationState: 'VERIFIED',
        aggregateVersion: 4,
        classification: 'STANDARD_AUTHENTICATION',
        createdAt: new Date('2026-08-06T12:00:00.000Z'),
        updatedAt: new Date('2026-08-06T12:00:00.000Z'),
        deletionRequestedAt: new Date('2026-08-06T12:00:00.000Z'),
      });

      const response = await request(server)
        .delete('/identities/me')
        .set('Authorization', 'Bearer valid-jwt-token')
        .expect(200);

      const data = readProfile(response.body);
      expect(data.identityState).toBe('DELETED');
      expect(data.deletionRequestedAt).toBe('2026-08-06T12:00:00.000Z');
      expect(softDelete).toHaveBeenCalledWith(
        expect.any(UuidV7),
        expect.objectContaining({ expectedAuthorizingSessionVersion: 1 }),
      );
    });
  });
});

function readProfile(body: unknown): Record<string, unknown> {
  const envelope = body as { data?: unknown };
  const data = envelope.data;
  if (typeof data !== 'object' || data === null) {
    throw new Error('Missing response data envelope');
  }
  return data as Record<string, unknown>;
}
