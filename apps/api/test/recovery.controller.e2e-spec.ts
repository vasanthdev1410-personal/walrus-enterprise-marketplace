import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { RecoveryError } from '../src/modules/identity-authentication/application/errors/recovery.error';
import type { ApiIdempotencyService } from '../src/modules/identity-authentication/application/services/api-idempotency.service';
import type { RecoveryRequestApplicationService } from '../src/modules/identity-authentication/application/services/recovery-request-application.service';
import { API_IDEMPOTENCY } from '../src/modules/identity-authentication/identity-authentication.tokens';
import { RecoveryController } from '../src/modules/identity-authentication/presentation/recovery.controller';
import {
  BASIC_AUDIT_LOGGER,
  RATE_LIMITER,
  RECOVERY_REQUEST_APPLICATION_SERVICE,
} from '../src/modules/identity-authentication/presentation/authentication.tokens';
import { NonProductionRateLimiterGuard } from '../src/modules/identity-authentication/presentation/guards/non-production-rate-limiter.guard';
import { BasicAuditInterceptor } from '../src/modules/identity-authentication/presentation/interceptors/basic-audit.interceptor';

const recoveryRequestLocator = '0191310f-789a-7123-8123-000000000001';
const idempotencyKey = 'recovery-key-1234567890abcdef';

describe('Module 01 recovery API (integration)', () => {
  let application: INestApplication;
  let server: Server;

  const startRecovery = jest.fn();
  const getStatus = jest.fn();

  const recoveryRequests = {
    startRecovery,
    getStatus,
  } as unknown as jest.Mocked<RecoveryRequestApplicationService>;

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
      controllers: [RecoveryController],
      providers: [
        { provide: RECOVERY_REQUEST_APPLICATION_SERVICE, useValue: recoveryRequests },
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

  describe('M01-REC-001 POST /api/v1/recovery-requests', () => {
    it('starts an enumeration-safe recovery request (202 Accepted)', async () => {
      startRecovery.mockResolvedValueOnce({
        accepted: true,
        recoveryRequestLocator,
        nextAction: 'SUBMIT_EVIDENCE',
      });

      const response = await request(server)
        .post('/recovery-requests')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          operationClass: 'PASSWORD_RESET',
          recoveryLocatorType: 'EMAIL',
          recoveryLocator: 'user@example.com',
        })
        .expect(202);

      expect(readData(response.body)).toEqual({
        accepted: true,
        recoveryRequestLocator,
        nextAction: 'SUBMIT_EVIDENCE',
      });
      const envelope = response.body as { correlationId?: unknown };
      expect(envelope.correlationId).toBeDefined();
      expect(response.headers['cache-control']).toBe('no-store');
      expect(startRecovery).toHaveBeenCalledWith(
        expect.objectContaining({
          operationClass: 'PASSWORD_RESET',
          recoveryLocatorType: 'EMAIL',
          recoveryLocator: 'user@example.com',
          idempotencyKey,
        }),
      );
    });

    it('rejects a request without an Idempotency-Key (400)', async () => {
      await request(server)
        .post('/recovery-requests')
        .send({
          operationClass: 'PASSWORD_RESET',
          recoveryLocatorType: 'EMAIL',
          recoveryLocator: 'user@example.com',
        })
        .expect(400);

      expect(startRecovery).not.toHaveBeenCalled();
    });

    it('rejects an unapproved operation class (400)', async () => {
      await request(server)
        .post('/recovery-requests')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          operationClass: 'UNKNOWN_OPERATION',
          recoveryLocatorType: 'EMAIL',
          recoveryLocator: 'user@example.com',
        })
        .expect(400);

      expect(startRecovery).not.toHaveBeenCalled();
    });

    it('rejects an invalid recovery locator type (400)', async () => {
      await request(server)
        .post('/recovery-requests')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          operationClass: 'PASSWORD_RESET',
          recoveryLocatorType: 'SMS',
          recoveryLocator: 'user@example.com',
        })
        .expect(400);

      expect(startRecovery).not.toHaveBeenCalled();
    });

    it('rejects a missing recovery locator (400)', async () => {
      await request(server)
        .post('/recovery-requests')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          operationClass: 'PASSWORD_RESET',
          recoveryLocatorType: 'EMAIL',
        })
        .expect(400);

      expect(startRecovery).not.toHaveBeenCalled();
    });

    it('returns the same acceptance shape when no identity is found (enumeration-safe)', async () => {
      startRecovery.mockResolvedValueOnce({
        accepted: true,
        recoveryRequestLocator: '0191310f-789a-7123-8123-000000000099',
        nextAction: 'SUBMIT_EVIDENCE',
      });

      const response = await request(server)
        .post('/recovery-requests')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          operationClass: 'PASSWORD_RESET',
          recoveryLocatorType: 'EMAIL',
          recoveryLocator: 'nobody@example.com',
        })
        .expect(202);

      const data = readData(response.body);
      expect(data.accepted).toBe(true);
      expect(data.recoveryRequestLocator).toBe('0191310f-789a-7123-8123-000000000099');
      expect(data.nextAction).toBe('SUBMIT_EVIDENCE');
    });
  });

  describe('M01-REC-003 GET /api/v1/recovery-requests/:id/status', () => {
    it('returns the safe status of a recovery request (200)', async () => {
      getStatus.mockResolvedValueOnce({
        recoveryRequestId: recoveryRequestLocator,
        safeState: 'REQUESTED',
        nextAction: 'SUBMIT_EVIDENCE',
        expiresAt: '2026-08-10T13:00:00.000Z',
        version: 1,
      });

      const response = await request(server)
        .get(`/recovery-requests/${recoveryRequestLocator}/status`)
        .expect(200);

      expect(readData(response.body)).toEqual({
        recoveryRequestId: recoveryRequestLocator,
        safeState: 'REQUESTED',
        nextAction: 'SUBMIT_EVIDENCE',
        expiresAt: '2026-08-10T13:00:00.000Z',
        version: 1,
      });
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('answers 404 RESOURCE_NOT_AVAILABLE for an unknown locator', async () => {
      getStatus.mockRejectedValueOnce(new RecoveryError('RESOURCE_NOT_AVAILABLE'));

      const response = await request(server)
        .get(`/recovery-requests/${recoveryRequestLocator}/status`)
        .expect(404);

      expect(response.body).toEqual({
        statusCode: 404,
        message: 'RESOURCE_NOT_AVAILABLE',
        error: 'Not Found',
      });
    });

    it('answers 404 RESOURCE_NOT_AVAILABLE for a malformed locator', async () => {
      const response = await request(server)
        .get('/recovery-requests/not-a-uuid/status')
        .expect(404);

      expect(response.body).toEqual({
        statusCode: 404,
        message: 'RESOURCE_NOT_AVAILABLE',
        error: 'Not Found',
      });
      expect(getStatus).not.toHaveBeenCalled();
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
