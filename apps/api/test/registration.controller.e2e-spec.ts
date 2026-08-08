import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { RegistrationError } from '../src/modules/identity-authentication/application/errors/registration.error';
import type { ApiIdempotencyService } from '../src/modules/identity-authentication/application/services/api-idempotency.service';
import type { RegistrationApplicationService } from '../src/modules/identity-authentication/application/services/registration-application.service';
import { API_IDEMPOTENCY } from '../src/modules/identity-authentication/identity-authentication.tokens';
import { RegistrationController } from '../src/modules/identity-authentication/presentation/registration.controller';
import {
  BASIC_AUDIT_LOGGER,
  RATE_LIMITER,
  REGISTRATION_APPLICATION_SERVICE,
} from '../src/modules/identity-authentication/presentation/authentication.tokens';
import { NonProductionRateLimiterGuard } from '../src/modules/identity-authentication/presentation/guards/non-production-rate-limiter.guard';
import { BasicAuditInterceptor } from '../src/modules/identity-authentication/presentation/interceptors/basic-audit.interceptor';

const registrationId = '0191310f-789a-7123-8123-000000000001';
const challengeId = '0191310f-789a-7123-8123-000000000002';
const idempotencyKey = 'reg-key-1234567890abcdef';

describe('Module 01 registration API (integration)', () => {
  let application: INestApplication;
  let server: Server;

  const register = jest.fn();
  const requestVerificationChallenge = jest.fn();
  const confirmVerification = jest.fn();
  const activate = jest.fn();
  const getStatus = jest.fn();

  const registrations = {
    register,
    requestVerificationChallenge,
    confirmVerification,
    activate,
    getStatus,
  } as unknown as jest.Mocked<RegistrationApplicationService>;

  const idempotency = {
    execute: jest.fn(async (execution: { execute: () => Promise<unknown> }) => execution.execute()),
  } as unknown as jest.Mocked<ApiIdempotencyService>;

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
      controllers: [RegistrationController],
      providers: [
        { provide: REGISTRATION_APPLICATION_SERVICE, useValue: registrations },
        { provide: API_IDEMPOTENCY, useValue: idempotency },
        { provide: RATE_LIMITER, useValue: rateLimiter },
        { provide: BASIC_AUDIT_LOGGER, useValue: auditLogger },
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
  });

  describe('M01-REG-001 POST /api/v1/registrations', () => {
    it('starts a registration (202 Accepted, enumeration-safe envelope)', async () => {
      register.mockResolvedValueOnce({
        registrationId,
        status: 'PENDING_VERIFICATION',
        version: 1,
      });

      const response = await request(server)
        .post('/registrations')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          identifierType: 'EMAIL',
          identifier: 'newuser@example.com',
          password: 'SecurePassword123!',
        })
        .expect(202);

      const data = readData(response.body);
      expect(data.registrationId).toBe(registrationId);
      expect(data.status).toBe('PENDING_VERIFICATION');
      expect(data.version).toBe(1);
    });

    it('returns 400 when the Idempotency-Key is missing', async () => {
      await request(server)
        .post('/registrations')
        .send({
          identifierType: 'EMAIL',
          identifier: 'newuser@example.com',
          password: 'SecurePassword123!',
        })
        .expect(400);
    });

    it('returns 400 for malformed registration payloads', async () => {
      await request(server)
        .post('/registrations')
        .set('Idempotency-Key', idempotencyKey)
        .send({ identifierType: 'EMAIL', identifier: 'newuser@example.com' })
        .expect(400);
    });
  });

  describe('M01-REG-002 POST /api/v1/registrations/:registrationId/verification-challenges', () => {
    it('issues a purpose-bound verification challenge (202 Accepted)', async () => {
      requestVerificationChallenge.mockResolvedValueOnce({
        challengeId,
        version: 1,
        expiresAt: new Date('2026-08-07T12:05:00.000Z'),
      });

      const response = await request(server)
        .post(`/registrations/${registrationId}/verification-challenges`)
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"registration:${registrationId}:v1"`)
        .send({ channelType: 'EMAIL' })
        .expect(202);

      const data = readData(response.body);
      expect(data.challengeId).toBe(challengeId);
      expect(data.version).toBe(1);
      expect(data.expiresAt).toBe('2026-08-07T12:05:00.000Z');
    });

    it('returns 400 when If-Match is missing', async () => {
      await request(server)
        .post(`/registrations/${registrationId}/verification-challenges`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ channelType: 'EMAIL' })
        .expect(400);
    });

    it('returns 409 when a challenge is already active', async () => {
      requestVerificationChallenge.mockRejectedValueOnce(
        new RegistrationError('CHALLENGE_ALREADY_ACTIVE'),
      );

      await request(server)
        .post(`/registrations/${registrationId}/verification-challenges`)
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"registration:${registrationId}:v1"`)
        .send({ channelType: 'EMAIL' })
        .expect(409);
    });
  });

  describe('M01-REG-003 POST /api/v1/registrations/:registrationId/verification-confirmations', () => {
    it('confirms verification with a valid OTP (200 OK)', async () => {
      confirmVerification.mockResolvedValueOnce({
        status: 'VERIFIED',
        registrationId,
        version: 2,
      });

      const response = await request(server)
        .post(`/registrations/${registrationId}/verification-confirmations`)
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"challenge:${challengeId}:v1"`)
        .send({ challengeId, verificationEvidence: '123456' })
        .expect(200);

      expect(readData(response.body).status).toBe('VERIFIED');
    });

    it('returns 401 for an invalid or expired challenge', async () => {
      confirmVerification.mockRejectedValueOnce(
        new RegistrationError('CHALLENGE_INVALID_OR_EXPIRED'),
      );

      await request(server)
        .post(`/registrations/${registrationId}/verification-confirmations`)
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"challenge:${challengeId}:v1"`)
        .send({ challengeId, verificationEvidence: '000000' })
        .expect(401);
    });

    it('returns 400 for malformed OTP evidence', async () => {
      await request(server)
        .post(`/registrations/${registrationId}/verification-confirmations`)
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"challenge:${challengeId}:v1"`)
        .send({ challengeId, verificationEvidence: 'abc' })
        .expect(400);
    });
  });

  describe('M01-REG-004 POST /api/v1/registrations/:registrationId/activation', () => {
    it('activates a verified registration (200 OK)', async () => {
      activate.mockResolvedValueOnce({
        status: 'ACTIVE',
        identityState: 'ACTIVE',
        verificationState: 'VERIFIED',
        version: 2,
      });

      const response = await request(server)
        .post(`/registrations/${registrationId}/activation`)
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"registration:${registrationId}:v1"`)
        .send({})
        .expect(200);

      const data = readData(response.body);
      expect(data.status).toBe('ACTIVE');
      expect(data.identityState).toBe('ACTIVE');
      expect(data.verificationState).toBe('VERIFIED');
    });

    it('returns 409 when verification is not complete', async () => {
      activate.mockRejectedValueOnce(new RegistrationError('REGISTRATION_NOT_READY'));

      await request(server)
        .post(`/registrations/${registrationId}/activation`)
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"registration:${registrationId}:v1"`)
        .send({})
        .expect(409);
    });
  });

  describe('M01-REG-005 GET /api/v1/registrations/:registrationId/status', () => {
    it('returns the registration status (200 OK)', async () => {
      getStatus.mockResolvedValueOnce({ registrationId, status: 'VERIFIED', version: 1 });

      const response = await request(server)
        .get(`/registrations/${registrationId}/status`)
        .expect(200);

      const data = readData(response.body);
      expect(data.registrationId).toBe(registrationId);
      expect(data.status).toBe('VERIFIED');
    });

    it('returns 404 for an unknown registration', async () => {
      getStatus.mockRejectedValueOnce(new RegistrationError('REGISTRATION_NOT_FOUND'));

      await request(server).get(`/registrations/${registrationId}/status`).expect(404);
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
