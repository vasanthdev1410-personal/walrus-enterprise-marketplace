import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { CredentialError } from '../src/modules/identity-authentication/application/errors/credential.error';
import type { ApiIdempotencyService } from '../src/modules/identity-authentication/application/services/api-idempotency.service';
import type {
  ChangePasswordCommand,
  IdentityManagementApplicationService,
} from '../src/modules/identity-authentication/application/services/identity-management-application.service';
import { UuidV7 } from '../src/modules/identity-authentication/domain/shared/value-objects/uuid-v7';
import type { JwtCryptographicPort } from '../src/modules/identity-authentication/application/ports/jwt-cryptographic.port';
import type { IdentityRepository } from '../src/modules/identity-authentication/domain/identity/repositories/identity-repository';
import type { SessionRepository } from '../src/modules/identity-authentication/domain/session/repositories/session-repository';
import { API_IDEMPOTENCY } from '../src/modules/identity-authentication/identity-authentication.tokens';
import { CredentialsController } from '../src/modules/identity-authentication/presentation/credentials.controller';
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

const identityId = '0191310f-789a-7123-8123-000000000001';
const sessionId = '0191310f-789a-7123-8123-000000000002';
const idempotencyKey = 'cred-key-1234567890abcdef';

describe('Module 01 credential mutation API (integration)', () => {
  let application: INestApplication;
  let server: Server;

  const changePassword = jest.fn<Promise<void>, [UuidV7, ChangePasswordCommand]>();
  const identityManagement = {
    changePassword,
  } as unknown as jest.Mocked<IdentityManagementApplicationService>;

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
      controllers: [CredentialsController],
      providers: [
        { provide: IDENTITY_MANAGEMENT_APPLICATION_SERVICE, useValue: identityManagement },
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

  describe('M01-CRED-001 POST /api/v1/credentials/password-change', () => {
    it('changes the password after re-authentication (204 No Content)', async () => {
      changePassword.mockResolvedValueOnce(undefined);

      const response = await request(server)
        .post('/credentials/password-change')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"identity:${identityId}:v2"`)
        .send({
          currentPassword: 'CurrentPass1!',
          newPassword: 'NewPass123!',
        })
        .expect(204);

      expect(response.body).toEqual({});
      expect(changePassword).toHaveBeenCalledWith(
        expect.any(UuidV7),
        expect.objectContaining({
          currentPassword: 'CurrentPass1!',
          newPassword: 'NewPass123!',
          expectedIdentityVersion: 2,
          expectedAuthorizingSessionVersion: 1,
        }),
      );
      const identityArgument = changePassword.mock.calls[0]?.[0];
      const command = changePassword.mock.calls[0]?.[1];
      expect(identityArgument?.value).toBe(identityId);
      expect(command?.authorizingSessionId.value).toBe(sessionId);
    });

    it('returns 401 Unauthorized when missing the access token', async () => {
      await request(server)
        .post('/credentials/password-change')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"identity:${identityId}:v2"`)
        .send({ currentPassword: 'CurrentPass1!', newPassword: 'NewPass123!' })
        .expect(401);
    });

    it('returns 400 when the Idempotency-Key is missing', async () => {
      await request(server)
        .post('/credentials/password-change')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('If-Match', `"identity:${identityId}:v2"`)
        .send({ currentPassword: 'CurrentPass1!', newPassword: 'NewPass123!' })
        .expect(400);
    });

    it('returns 400 when If-Match is missing', async () => {
      await request(server)
        .post('/credentials/password-change')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .send({ currentPassword: 'CurrentPass1!', newPassword: 'NewPass123!' })
        .expect(400);
    });

    it('returns 400 for an incorrect current password', async () => {
      changePassword.mockRejectedValueOnce(new CredentialError('CURRENT_CREDENTIAL_INVALID'));

      await request(server)
        .post('/credentials/password-change')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"identity:${identityId}:v2"`)
        .send({ currentPassword: 'WrongPass1!', newPassword: 'NewPass123!' })
        .expect(400);
    });

    it('returns 400 when the new password fails the policy', async () => {
      changePassword.mockRejectedValueOnce(new CredentialError('PASSWORD_POLICY_FAILED'));

      await request(server)
        .post('/credentials/password-change')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"identity:${identityId}:v2"`)
        .send({ currentPassword: 'CurrentPass1!', newPassword: 'NewPass123!' })
        .expect(400);
    });

    it('returns 400 for a new password below the DTO minimum length', async () => {
      await request(server)
        .post('/credentials/password-change')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"identity:${identityId}:v2"`)
        .send({ currentPassword: 'CurrentPass1!', newPassword: '1234567' })
        .expect(400);
    });

    it('returns 409 for a stale identity version', async () => {
      changePassword.mockRejectedValueOnce(new CredentialError('RESOURCE_STATE_CONFLICT'));

      await request(server)
        .post('/credentials/password-change')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"identity:${identityId}:v1"`)
        .send({ currentPassword: 'CurrentPass1!', newPassword: 'NewPass123!' })
        .expect(409);
    });

    it('returns 400 for an unknown body field', async () => {
      await request(server)
        .post('/credentials/password-change')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"identity:${identityId}:v2"`)
        .send({
          currentPassword: 'CurrentPass1!',
          newPassword: 'NewPass123!',
          confirmationPassword: 'NewPass123!',
        })
        .expect(400);
    });

    it('returns 400 for a malformed If-Match resource', async () => {
      await request(server)
        .post('/credentials/password-change')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"session:${sessionId}:v1"`)
        .send({ currentPassword: 'CurrentPass1!', newPassword: 'NewPass123!' })
        .expect(400);
    });
  });
});
