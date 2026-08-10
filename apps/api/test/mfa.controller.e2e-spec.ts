import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { MfaError } from '../src/modules/identity-authentication/application/errors/mfa.error';
import type { ApiIdempotencyService } from '../src/modules/identity-authentication/application/services/api-idempotency.service';
import type { MfaEnrollmentApplicationService } from '../src/modules/identity-authentication/application/services/mfa-enrollment-application.service';
import type { JwtCryptographicPort } from '../src/modules/identity-authentication/application/ports/jwt-cryptographic.port';
import type { IdentityRepository } from '../src/modules/identity-authentication/domain/identity/repositories/identity-repository';
import type { SessionRepository } from '../src/modules/identity-authentication/domain/session/repositories/session-repository';
import { API_IDEMPOTENCY } from '../src/modules/identity-authentication/identity-authentication.tokens';
import { MfaController } from '../src/modules/identity-authentication/presentation/mfa.controller';
import {
  BASIC_AUDIT_LOGGER,
  MFA_ENROLLMENT_APPLICATION_SERVICE,
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
const enrollmentId = '0191310f-789a-7123-8123-000000000003';
const idempotencyKey = 'mfa-key-1234567890abcdef';

describe('Module 01 MFA enrollment API (integration)', () => {
  let application: INestApplication;
  let server: Server;

  const startEnrollment = jest.fn();
  const confirmEnrollment = jest.fn();
  const readStatus = jest.fn();
  const mfaEnrollment = {
    startEnrollment,
    confirmEnrollment,
    readStatus,
  } as unknown as jest.Mocked<MfaEnrollmentApplicationService>;

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
      controllers: [MfaController],
      providers: [
        { provide: MFA_ENROLLMENT_APPLICATION_SERVICE, useValue: mfaEnrollment },
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

  describe('M01-MFA-001 POST /mfa/enrollments', () => {
    it('starts a TOTP enrollment and returns the one-time setup material (201)', async () => {
      startEnrollment.mockResolvedValueOnce({
        enrollmentId,
        enrollmentState: 'PENDING_VERIFICATION',
        protectedSetupMaterial: { secret: 'BASE32SECRET' },
        expiresAt: new Date('2026-08-05T00:05:00.000Z'),
        version: 1,
      });

      const response = await request(server)
        .post('/mfa/enrollments')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"identity:${identityId}:v4"`)
        .send({ factorType: 'TOTP_AUTHENTICATOR' })
        .expect(201);

      const body = response.body as { data: Readonly<Record<string, unknown>> };
      expect(body.data).toMatchObject({
        enrollmentId,
        enrollmentState: 'PENDING_VERIFICATION',
        protectedSetupMaterial: { secret: 'BASE32SECRET' },
        version: 1,
      });
      expect(startEnrollment).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedIdentityVersion: 4,
          factorType: 'TOTP_AUTHENTICATOR',
        }),
      );
    });

    it('returns 401 Unauthorized when the access token is missing', async () => {
      await request(server)
        .post('/mfa/enrollments')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"identity:${identityId}:v4"`)
        .send({ factorType: 'TOTP_AUTHENTICATOR' })
        .expect(401);
    });

    it('returns 400 when the Idempotency-Key is missing', async () => {
      await request(server)
        .post('/mfa/enrollments')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('If-Match', `"identity:${identityId}:v4"`)
        .send({ factorType: 'TOTP_AUTHENTICATOR' })
        .expect(400);
    });

    it('returns 400 when If-Match is missing', async () => {
      await request(server)
        .post('/mfa/enrollments')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .send({ factorType: 'TOTP_AUTHENTICATOR' })
        .expect(400);
    });

    it('returns 400 for an unsupported factor type', async () => {
      await request(server)
        .post('/mfa/enrollments')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"identity:${identityId}:v4"`)
        .send({ factorType: 'WEBAUTHN_PASSKEY' })
        .expect(400);
    });

    it('returns 409 when MFA enrollment is not permitted in the current state', async () => {
      startEnrollment.mockRejectedValueOnce(new MfaError('MFA_ENROLLMENT_NOT_PERMITTED'));
      await request(server)
        .post('/mfa/enrollments')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"identity:${identityId}:v4"`)
        .send({ factorType: 'TOTP_AUTHENTICATOR' })
        .expect(409);
    });

    it('returns 409 for a stale identity version', async () => {
      startEnrollment.mockRejectedValueOnce(new MfaError('RESOURCE_STATE_CONFLICT'));
      await request(server)
        .post('/mfa/enrollments')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"identity:${identityId}:v3"`)
        .send({ factorType: 'TOTP_AUTHENTICATOR' })
        .expect(409);
    });

    it('returns 400 for an unknown body field', async () => {
      await request(server)
        .post('/mfa/enrollments')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"identity:${identityId}:v4"`)
        .send({ factorType: 'TOTP_AUTHENTICATOR', label: 'Work phone' })
        .expect(400);
    });

    it('returns 400 for a malformed If-Match resource', async () => {
      await request(server)
        .post('/mfa/enrollments')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"session:${sessionId}:v1"`)
        .send({ factorType: 'TOTP_AUTHENTICATOR' })
        .expect(400);
    });
  });

  describe('M01-MFA-002 POST /mfa/enrollments/{enrollmentId}/confirmations', () => {
    it('confirms the enrollment with a valid TOTP (200)', async () => {
      confirmEnrollment.mockResolvedValueOnce({
        enrollmentId,
        enrollmentState: 'ACTIVE',
        recoveryCodes: [],
        version: 2,
      });

      const response = await request(server)
        .post(`/mfa/enrollments/${enrollmentId}/confirmations`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"enrollment:${enrollmentId}:v1"`)
        .send({ verificationEvidence: '123456' })
        .expect(200);

      const body = response.body as { data: Readonly<Record<string, unknown>> };
      expect(body.data).toMatchObject({
        enrollmentId,
        enrollmentState: 'ACTIVE',
        recoveryCodes: [],
        version: 2,
      });
      expect(confirmEnrollment).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedEnrollmentVersion: 1,
          verificationEvidence: '123456',
        }),
      );
    });

    it('returns 401 Unauthorized when the access token is missing', async () => {
      await request(server)
        .post(`/mfa/enrollments/${enrollmentId}/confirmations`)
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"enrollment:${enrollmentId}:v1"`)
        .send({ verificationEvidence: '123456' })
        .expect(401);
    });

    it('returns 400 for malformed TOTP evidence', async () => {
      await request(server)
        .post(`/mfa/enrollments/${enrollmentId}/confirmations`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"enrollment:${enrollmentId}:v1"`)
        .send({ verificationEvidence: '12345' })
        .expect(400);
    });

    it('returns 400 for an invalid or expired challenge', async () => {
      confirmEnrollment.mockRejectedValueOnce(new MfaError('CHALLENGE_INVALID_OR_EXPIRED'));
      await request(server)
        .post(`/mfa/enrollments/${enrollmentId}/confirmations`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"enrollment:${enrollmentId}:v1"`)
        .send({ verificationEvidence: '000000' })
        .expect(400);
    });

    it('returns 409 for a stale enrollment version', async () => {
      confirmEnrollment.mockRejectedValueOnce(new MfaError('RESOURCE_STATE_CONFLICT'));
      await request(server)
        .post(`/mfa/enrollments/${enrollmentId}/confirmations`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"enrollment:${enrollmentId}:v1"`)
        .send({ verificationEvidence: '123456' })
        .expect(409);
    });

    it('returns 400 for a malformed enrollment id in the path', async () => {
      await request(server)
        .post('/mfa/enrollments/not-a-uuid/confirmations')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"enrollment:not-a-uuid:v1"`)
        .send({ verificationEvidence: '123456' })
        .expect(400);
    });
  });

  describe('M01-MFA-003 GET /mfa/status', () => {
    it('reads the current MFA status (200)', async () => {
      readStatus.mockResolvedValueOnce({
        enrollmentState: 'ACTIVE',
        activeFactorTypes: ['TOTP_AUTHENTICATOR'],
        replacementRequired: false,
        recoveryCodeCount: 0,
        version: 2,
      });

      const response = await request(server)
        .get('/mfa/status')
        .set('Authorization', 'Bearer valid-jwt-token')
        .expect(200);

      const body = response.body as { data: Readonly<Record<string, unknown>> };
      expect(body.data).toMatchObject({
        enrollmentState: 'ACTIVE',
        activeFactorTypes: ['TOTP_AUTHENTICATOR'],
        replacementRequired: false,
        recoveryCodeCount: 0,
        version: 2,
      });
    });

    it('returns 401 Unauthorized when the access token is missing', async () => {
      await request(server).get('/mfa/status').expect(401);
    });
  });
});
