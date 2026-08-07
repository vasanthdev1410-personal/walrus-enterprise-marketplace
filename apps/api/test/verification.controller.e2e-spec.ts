import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { VerificationError } from '../src/modules/identity-authentication/application/errors/verification.error';
import type { ApiIdempotencyService } from '../src/modules/identity-authentication/application/services/api-idempotency.service';
import type {
  CommitContactChangeCommand,
  ConfirmVerificationChallengeCommand,
  ContactChangeCommitResult,
  RequestVerificationChallengeCommand,
  VerificationApplicationService,
  VerificationChallengeRequestResult,
  VerificationConfirmationResult,
} from '../src/modules/identity-authentication/application/services/verification-application.service';
import type { JwtCryptographicPort } from '../src/modules/identity-authentication/application/ports/jwt-cryptographic.port';
import type { IdentityRepository } from '../src/modules/identity-authentication/domain/identity/repositories/identity-repository';
import type { SessionRepository } from '../src/modules/identity-authentication/domain/session/repositories/session-repository';
import { API_IDEMPOTENCY } from '../src/modules/identity-authentication/identity-authentication.tokens';
import { VerificationController } from '../src/modules/identity-authentication/presentation/verification.controller';
import {
  BASIC_AUDIT_LOGGER,
  RATE_LIMITER,
  VERIFICATION_APPLICATION_SERVICE,
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
const challengeId = '0191310f-789a-7123-8123-000000000003';
const idempotencyKey = 'ver-key-1234567890abcdef';

describe('Module 01 authenticated verification API (integration)', () => {
  let application: INestApplication;
  let server: Server;

  const requestChallenge = jest.fn<
    Promise<VerificationChallengeRequestResult>,
    [RequestVerificationChallengeCommand]
  >();
  const confirmChallenge = jest.fn<
    Promise<VerificationConfirmationResult>,
    [ConfirmVerificationChallengeCommand]
  >();
  const commitContactChange = jest.fn<
    Promise<ContactChangeCommitResult>,
    [CommitContactChangeCommand]
  >();

  const verification = {
    requestChallenge,
    confirmChallenge,
    commitContactChange,
  } as unknown as jest.Mocked<VerificationApplicationService>;

  const idempotency = {
    execute: jest.fn(async (execution: { execute: () => Promise<unknown> }) =>
      execution.execute(),
    ),
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
      controllers: [VerificationController],
      providers: [
        { provide: VERIFICATION_APPLICATION_SERVICE, useValue: verification },
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

  describe('M01-VER-001 POST /api/v1/verification-challenges', () => {
    it('requests a purpose-bound challenge (202 Accepted)', async () => {
      requestChallenge.mockResolvedValueOnce({
        challengeId,
        state: 'CHALLENGE_ISSUED',
        expiresAt: new Date('2026-08-07T12:05:00.000Z'),
        version: 1,
      });

      const response = await request(server)
        .post('/verification-challenges')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          purpose: 'CONTACT_CHANGE_VERIFICATION',
          channelType: 'EMAIL',
          destination: 'new-contact@example.com',
        })
        .expect(202);

      const data = readData(response.body);
      expect(data.challengeId).toBe(challengeId);
      expect(data.state).toBe('CHALLENGE_ISSUED');
      expect(data.version).toBe(1);
      expect(data.expiresAt).toBe('2026-08-07T12:05:00.000Z');
      expect(requestChallenge).toHaveBeenCalledWith(
        expect.objectContaining({
          purpose: 'CONTACT_CHANGE_VERIFICATION',
          channelType: 'EMAIL',
          destination: 'new-contact@example.com',
        }),
      );
      const requested = firstCallArg(requestChallenge.mock.calls);
      expect(requested?.identityId.value).toBe(identityId);
    });

    it('returns 401 Unauthorized when missing the access token', async () => {
      await request(server)
        .post('/verification-challenges')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          purpose: 'CONTACT_CHANGE_VERIFICATION',
          channelType: 'EMAIL',
          destination: 'new-contact@example.com',
        })
        .expect(401);
    });

    it('returns 400 when the Idempotency-Key is missing', async () => {
      await request(server)
        .post('/verification-challenges')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send({
          purpose: 'CONTACT_CHANGE_VERIFICATION',
          channelType: 'EMAIL',
          destination: 'new-contact@example.com',
        })
        .expect(400);
    });

    it('returns 400 for an unsupported purpose', async () => {
      await request(server)
        .post('/verification-challenges')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          purpose: 'MFA_AUTHENTICATION',
          channelType: 'EMAIL',
          destination: 'new-contact@example.com',
        })
        .expect(400);
    });

    it('returns 400 for a missing destination', async () => {
      await request(server)
        .post('/verification-challenges')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .send({ purpose: 'CONTACT_CHANGE_VERIFICATION', channelType: 'EMAIL' })
        .expect(400);
    });

    it('returns 409 when a challenge is already active', async () => {
      requestChallenge.mockRejectedValueOnce(
        new VerificationError('CHALLENGE_ALREADY_ACTIVE'),
      );

      await request(server)
        .post('/verification-challenges')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          purpose: 'CONTACT_CHANGE_VERIFICATION',
          channelType: 'EMAIL',
          destination: 'new-contact@example.com',
        })
        .expect(409);
    });

    it('returns 400 for a not-permitted verification request', async () => {
      requestChallenge.mockRejectedValueOnce(
        new VerificationError('VERIFICATION_NOT_PERMITTED'),
      );

      await request(server)
        .post('/verification-challenges')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          purpose: 'CONTACT_CHANGE_VERIFICATION',
          channelType: 'EMAIL',
          destination: 'new-contact@example.com',
        })
        .expect(400);
    });
  });

  describe('M01-VER-002 POST /api/v1/verification-challenges/:challengeId/confirmations', () => {
    it('confirms the challenge with a valid OTP (200 OK)', async () => {
      confirmChallenge.mockResolvedValueOnce({
        challengeId,
        verificationState: 'VERIFIED',
        verifiedAt: new Date('2026-08-07T12:00:30.000Z'),
        version: 2,
      });

      const response = await request(server)
        .post(`/verification-challenges/${challengeId}/confirmations`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"challenge:${challengeId}:v1"`)
        .send({ verificationEvidence: '123456' })
        .expect(200);

      const data = readData(response.body);
      expect(data.challengeId).toBe(challengeId);
      expect(data.verificationState).toBe('VERIFIED');
      expect(data.verifiedAt).toBe('2026-08-07T12:00:30.000Z');
      expect(data.version).toBe(2);
      expect(confirmChallenge).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedChallengeVersion: 1,
          verificationEvidence: '123456',
        }),
      );
      const confirmed = firstCallArg(confirmChallenge.mock.calls);
      expect(confirmed?.identityId.value).toBe(identityId);
      expect(confirmed?.challengeId.value).toBe(challengeId);
    });

    it('returns 401 for an invalid or expired challenge', async () => {
      confirmChallenge.mockRejectedValueOnce(
        new VerificationError('CHALLENGE_INVALID_OR_EXPIRED'),
      );

      await request(server)
        .post(`/verification-challenges/${challengeId}/confirmations`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"challenge:${challengeId}:v1"`)
        .send({ verificationEvidence: '000000' })
        .expect(401);
    });

    it('returns 400 when If-Match is missing', async () => {
      await request(server)
        .post(`/verification-challenges/${challengeId}/confirmations`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .send({ verificationEvidence: '123456' })
        .expect(400);
    });

    it('returns 400 for malformed OTP evidence', async () => {
      await request(server)
        .post(`/verification-challenges/${challengeId}/confirmations`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"challenge:${challengeId}:v1"`)
        .send({ verificationEvidence: 'abc' })
        .expect(400);
    });

    it('returns 404 for a malformed challenge id', async () => {
      await request(server)
        .post('/verification-challenges/not-a-uuid/confirmations')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', '"challenge:not-a-uuid:v1"')
        .send({ verificationEvidence: '123456' })
        .expect(404);
    });

    it('returns 409 for a stale version', async () => {
      confirmChallenge.mockRejectedValueOnce(
        new VerificationError('RESOURCE_STATE_CONFLICT'),
      );

      await request(server)
        .post(`/verification-challenges/${challengeId}/confirmations`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"challenge:${challengeId}:v2"`)
        .send({ verificationEvidence: '123456' })
        .expect(409);
    });
  });

  describe('M01-VER-003 POST /api/v1/verification-challenges/:challengeId/commits', () => {
    it('commits the verified contact change (200 OK)', async () => {
      commitContactChange.mockResolvedValueOnce({
        challengeId,
        contactChange: 'COMMITTED',
        committedAt: new Date('2026-08-07T12:00:45.000Z'),
        version: 3,
        primaryIdentifier: { identifierType: 'EMAIL', verificationState: 'VERIFIED' },
      });

      const response = await request(server)
        .post(`/verification-challenges/${challengeId}/commits`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"challenge:${challengeId}:v2"`)
        .send({})
        .expect(200);

      const data = readData(response.body);
      expect(data.challengeId).toBe(challengeId);
      expect(data.contactChange).toBe('COMMITTED');
      expect(data.committedAt).toBe('2026-08-07T12:00:45.000Z');
      expect(data.version).toBe(3);
      expect(data.primaryIdentifier).toEqual({
        identifierType: 'EMAIL',
        verificationState: 'VERIFIED',
      });
      expect(commitContactChange).toHaveBeenCalledWith(
        expect.objectContaining({ expectedChallengeVersion: 2 }),
      );
      const committed = firstCallArg(commitContactChange.mock.calls);
      expect(committed?.identityId.value).toBe(identityId);
      expect(committed?.challengeId.value).toBe(challengeId);
    });

    it('returns 401 for an invalid or expired challenge', async () => {
      commitContactChange.mockRejectedValueOnce(
        new VerificationError('CHALLENGE_INVALID_OR_EXPIRED'),
      );

      await request(server)
        .post(`/verification-challenges/${challengeId}/commits`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"challenge:${challengeId}:v2"`)
        .send({})
        .expect(401);
    });

    it('returns 400 when If-Match is missing', async () => {
      await request(server)
        .post(`/verification-challenges/${challengeId}/commits`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .send({})
        .expect(400);
    });

    it('returns 400 for an unknown body field', async () => {
      await request(server)
        .post(`/verification-challenges/${challengeId}/commits`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"challenge:${challengeId}:v2"`)
        .send({ destination: 'tampered@example.com' })
        .expect(400);
    });

    it('returns 404 for a malformed challenge id', async () => {
      await request(server)
        .post('/verification-challenges/not-a-uuid/commits')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', '"challenge:not-a-uuid:v2"')
        .send({})
        .expect(404);
    });

    it('returns 409 for a stale version', async () => {
      commitContactChange.mockRejectedValueOnce(
        new VerificationError('RESOURCE_STATE_CONFLICT'),
      );

      await request(server)
        .post(`/verification-challenges/${challengeId}/commits`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"challenge:${challengeId}:v1"`)
        .send({})
        .expect(409);
    });

    it('returns 400 for a not-permitted commit', async () => {
      commitContactChange.mockRejectedValueOnce(
        new VerificationError('VERIFICATION_NOT_PERMITTED'),
      );

      await request(server)
        .post(`/verification-challenges/${challengeId}/commits`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"challenge:${challengeId}:v2"`)
        .send({})
        .expect(400);
    });

    it('returns 401 Unauthorized when missing the access token', async () => {
      await request(server)
        .post(`/verification-challenges/${challengeId}/commits`)
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"challenge:${challengeId}:v2"`)
        .send({})
        .expect(401);
    });
  });
});

function readData(body: unknown): Record<string, unknown> {
  const envelope = body as { data?: unknown };
  const data = envelope.data;
  if (typeof data !== 'object' || data === null) {
    throw new Error('Missing response data envelope');
  }
  return data as Record<string, unknown>;
}

function firstCallArg<T>(calls: [T][]): T | undefined {
  const first = calls[0];
  return first === undefined ? undefined : first[0];
}
