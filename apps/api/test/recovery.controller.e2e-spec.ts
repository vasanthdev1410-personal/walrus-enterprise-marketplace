import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { RecoveryError } from '../src/modules/identity-authentication/application/errors/recovery.error';
import type { JwtCryptographicPort } from '../src/modules/identity-authentication/application/ports/jwt-cryptographic.port';
import type { ApiIdempotencyService } from '../src/modules/identity-authentication/application/services/api-idempotency.service';
import type { RecoveryRequestApplicationService } from '../src/modules/identity-authentication/application/services/recovery-request-application.service';
import type { IdentityRepository } from '../src/modules/identity-authentication/domain/identity/repositories/identity-repository';
import type { SessionRepository } from '../src/modules/identity-authentication/domain/session/repositories/session-repository';
import { UuidV7 } from '../src/modules/identity-authentication/domain/shared/value-objects/uuid-v7';
import {
  API_IDEMPOTENCY,
  JWT_CRYPTOGRAPHY,
} from '../src/modules/identity-authentication/identity-authentication.tokens';
import { RecoveryController } from '../src/modules/identity-authentication/presentation/recovery.controller';
import {
  BASIC_AUDIT_LOGGER,
  RATE_LIMITER,
  RECOVERY_REQUEST_APPLICATION_SERVICE,
} from '../src/modules/identity-authentication/presentation/authentication.tokens';
import { Aal2SessionGuard } from '../src/modules/identity-authentication/presentation/guards/aal2-session.guard';
import { AuthoritativeSessionGuard } from '../src/modules/identity-authentication/presentation/guards/authoritative-session.guard';
import { NonProductionRateLimiterGuard } from '../src/modules/identity-authentication/presentation/guards/non-production-rate-limiter.guard';
import { BasicAuditInterceptor } from '../src/modules/identity-authentication/presentation/interceptors/basic-audit.interceptor';
import {
  IDENTITY_REPOSITORY,
  SESSION_REPOSITORY,
} from '../src/modules/identity-authentication/infrastructure/persistence/prisma/prisma.module';

const recoveryRequestLocator = '0191310f-789a-7123-8123-000000000001';
const idempotencyKey = 'recovery-key-1234567890abcdef';
const approverIdentityId = '0191310f-789a-7123-8123-00000000000d';
const approverSessionId = '0191310f-789a-7123-8123-00000000000e';

describe('Module 01 recovery API (integration)', () => {
  let application: INestApplication;
  let server: Server;

  const startRecovery = jest.fn();
  const getStatus = jest.fn();
  const submitEvidence = jest.fn();
  const requestApproval = jest.fn();
  const recordApprovalDecision = jest.fn();
  const executeRecovery = jest.fn();
  const cancelRecovery = jest.fn();

  const recoveryRequests = {
    startRecovery,
    getStatus,
    submitEvidence,
    requestApproval,
    recordApprovalDecision,
    executeRecovery,
    cancelRecovery,
  } as unknown as jest.Mocked<RecoveryRequestApplicationService>;

  const jwt = { verifyAccessToken: jest.fn() } as unknown as jest.Mocked<JwtCryptographicPort>;
  const sessions = { findById: jest.fn() } as unknown as jest.Mocked<SessionRepository>;
  const identities = { findById: jest.fn() } as unknown as jest.Mocked<IdentityRepository>;

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
        { provide: JWT_CRYPTOGRAPHY, useValue: jwt },
        { provide: SESSION_REPOSITORY, useValue: sessions },
        { provide: IDENTITY_REPOSITORY, useValue: identities },
        AuthoritativeSessionGuard,
        Aal2SessionGuard,
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
      subject: approverIdentityId,
      sessionId: approverSessionId,
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
        identityId: { value: approverIdentityId },
        sessionState: 'ACTIVE',
        sessionClass: 'INTERACTIVE_WEB',
        sessionVersion: { value: 1 },
        idleExpiresAt: new Date(Date.now() + 60_000),
        absoluteExpiresAt: new Date(Date.now() + 120_000),
      },
    } as never);
    identities.findById.mockResolvedValue({
      properties: {
        identityId: { value: approverIdentityId },
        identityState: 'ACTIVE',
        verificationState: 'VERIFIED',
        lockedUntil: undefined,
      },
    } as never);
  });

  function useAal2Session(): void {
    jwt.verifyAccessToken.mockResolvedValue({
      subject: approverIdentityId,
      sessionId: approverSessionId,
      jwtId: 'jwt',
      issuer: 'issuer',
      audience: 'audience',
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      authenticationMethods: ['PASSWORD', 'TOTP_AUTHENTICATOR'],
      authenticationAssurance: 'AAL2',
      sessionVersion: 1,
    });
    sessions.findById.mockResolvedValue({
      properties: {
        identityId: { value: approverIdentityId },
        sessionState: 'ACTIVE',
        sessionClass: 'INTERACTIVE_WEB',
        sessionVersion: { value: 1 },
        authenticationAssurance: 'AAL2',
        mfaVerifiedAt: new Date(Date.now() - 60_000),
        idleExpiresAt: new Date(Date.now() + 60_000),
        absoluteExpiresAt: new Date(Date.now() + 120_000),
      },
    } as never);
  }

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

  describe('M01-REC-002 POST /api/v1/recovery-requests/:id/evidence', () => {
    const evidenceBody = {
      evidenceType: 'RECOVERY_CODE',
      evidenceValue: 'ABCD-EFGH-IJKL-MNOP-QRST-UVWX',
      recoveryPolicyVersion: 'v1',
    };

    it('submits evidence and returns the safe recovery state (200)', async () => {
      submitEvidence.mockResolvedValueOnce({
        recoveryRequestId: recoveryRequestLocator,
        safeState: 'EVIDENCE_VERIFIED',
        recoveryAssurance: 'RA1',
        nextAction: 'REQUEST_APPROVAL',
        version: 2,
      });

      const response = await request(server)
        .post(`/recovery-requests/${recoveryRequestLocator}/evidence`)
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"recovery-request:${recoveryRequestLocator}:v1"`)
        .send(evidenceBody)
        .expect(200);

      expect(readData(response.body)).toEqual({
        recoveryRequestId: recoveryRequestLocator,
        safeState: 'EVIDENCE_VERIFIED',
        recoveryAssurance: 'RA1',
        nextAction: 'REQUEST_APPROVAL',
        version: 2,
      });
      expect(response.headers['cache-control']).toBe('no-store');
      // Raw evidence must never reach the idempotency fingerprint.
      const fingerprintRequest = idempotency.execute.mock.calls[0]?.[0]?.request;
      expect(JSON.stringify(fingerprintRequest)).not.toContain('ABCD-EFGH-IJKL-MNOP-QRST-UVWX');
      expect(submitEvidence).toHaveBeenCalledWith(
        expect.objectContaining({
          recoveryRequestId: new UuidV7(recoveryRequestLocator),
          expectedRecoveryVersion: 1,
          evidenceType: 'RECOVERY_CODE',
          evidenceValue: 'ABCD-EFGH-IJKL-MNOP-QRST-UVWX',
          recoveryPolicyVersion: 'v1',
        }),
      );
    });

    it('rejects a request without Idempotency-Key (400)', async () => {
      await request(server)
        .post(`/recovery-requests/${recoveryRequestLocator}/evidence`)
        .set('If-Match', `"recovery-request:${recoveryRequestLocator}:v1"`)
        .send(evidenceBody)
        .expect(400);

      expect(submitEvidence).not.toHaveBeenCalled();
    });

    it('rejects a request without If-Match (400)', async () => {
      await request(server)
        .post(`/recovery-requests/${recoveryRequestLocator}/evidence`)
        .set('Idempotency-Key', idempotencyKey)
        .send(evidenceBody)
        .expect(400);

      expect(submitEvidence).not.toHaveBeenCalled();
    });

    it('answers 400 RECOVERY_EVIDENCE_REJECTED when evidence is rejected', async () => {
      submitEvidence.mockRejectedValueOnce(new RecoveryError('RECOVERY_EVIDENCE_REJECTED'));

      const response = await request(server)
        .post(`/recovery-requests/${recoveryRequestLocator}/evidence`)
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"recovery-request:${recoveryRequestLocator}:v1"`)
        .send({ ...evidenceBody, evidenceValue: 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX' })
        .expect(400);

      expect(response.body).toEqual({
        statusCode: 400,
        message: 'RECOVERY_EVIDENCE_REJECTED',
        error: 'Bad Request',
      });
    });

    it('answers 412 RECOVERY_STATE_CONFLICT for a stale version precondition', async () => {
      submitEvidence.mockRejectedValueOnce(new RecoveryError('RECOVERY_STATE_CONFLICT'));

      const response = await request(server)
        .post(`/recovery-requests/${recoveryRequestLocator}/evidence`)
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"recovery-request:${recoveryRequestLocator}:v2"`)
        .send(evidenceBody)
        .expect(412);

      expect(response.body).toEqual({
        statusCode: 412,
        message: 'RECOVERY_STATE_CONFLICT',
        error: 'Precondition Failed',
      });
    });

    it('answers 412 RECOVERY_STATE_CONFLICT for a malformed locator without touching the service', async () => {
      const response = await request(server)
        .post('/recovery-requests/not-a-uuid/evidence')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', '"recovery-request:not-a-uuid:v1"')
        .send(evidenceBody)
        .expect(412);

      expect(response.body).toEqual({
        statusCode: 412,
        message: 'RECOVERY_STATE_CONFLICT',
        error: 'Precondition Failed',
      });
      expect(submitEvidence).not.toHaveBeenCalled();
    });

    it('rejects an unapproved evidence type (400)', async () => {
      await request(server)
        .post(`/recovery-requests/${recoveryRequestLocator}/evidence`)
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"recovery-request:${recoveryRequestLocator}:v1"`)
        .send({ ...evidenceBody, evidenceType: 'UNKNOWN_TYPE' })
        .expect(400);

      expect(submitEvidence).not.toHaveBeenCalled();
    });

    it('rejects unknown fields in a recovery mutation (400)', async () => {
      await request(server)
        .post(`/recovery-requests/${recoveryRequestLocator}/evidence`)
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"recovery-request:${recoveryRequestLocator}:v1"`)
        .send({ ...evidenceBody, extraField: 'not-allowed' })
        .expect(400);

      expect(submitEvidence).not.toHaveBeenCalled();
    });
  });

  describe('M01-REC-004 POST /api/v1/recovery-requests/:id/approval-requests', () => {
    const approvalBody = { recoveryPolicyVersion: 'v1' };

    it('requests approval and returns the safe approval state (202)', async () => {
      requestApproval.mockResolvedValueOnce({
        safeState: 'APPROVAL_PENDING',
        approvalRequired: true,
        version: 3,
      });

      const response = await request(server)
        .post(`/recovery-requests/${recoveryRequestLocator}/approval-requests`)
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"recovery-request:${recoveryRequestLocator}:v2"`)
        .send(approvalBody)
        .expect(202);

      expect(readData(response.body)).toEqual({
        safeState: 'APPROVAL_PENDING',
        approvalRequired: true,
        version: 3,
      });
      expect(response.headers['cache-control']).toBe('no-store');
      expect(requestApproval).toHaveBeenCalledWith(
        expect.objectContaining({
          recoveryRequestId: new UuidV7(recoveryRequestLocator),
          expectedRecoveryVersion: 2,
          recoveryPolicyVersion: 'v1',
        }),
      );
    });

    it('answers 409 RECOVERY_APPROVAL_NOT_REQUIRED when the policy row requires no approval', async () => {
      requestApproval.mockRejectedValueOnce(
        new RecoveryError('RECOVERY_APPROVAL_NOT_REQUIRED'),
      );

      const response = await request(server)
        .post(`/recovery-requests/${recoveryRequestLocator}/approval-requests`)
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"recovery-request:${recoveryRequestLocator}:v2"`)
        .send(approvalBody)
        .expect(409);

      expect(response.body).toEqual({
        statusCode: 409,
        message: 'RECOVERY_APPROVAL_NOT_REQUIRED',
        error: 'Conflict',
      });
    });

    it('answers 412 RECOVERY_STATE_CONFLICT for a stale version precondition', async () => {
      requestApproval.mockRejectedValueOnce(new RecoveryError('RECOVERY_STATE_CONFLICT'));

      const response = await request(server)
        .post(`/recovery-requests/${recoveryRequestLocator}/approval-requests`)
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"recovery-request:${recoveryRequestLocator}:v3"`)
        .send(approvalBody)
        .expect(412);

      expect(response.body).toEqual({
        statusCode: 412,
        message: 'RECOVERY_STATE_CONFLICT',
        error: 'Precondition Failed',
      });
    });

    it('rejects a request without Idempotency-Key (400)', async () => {
      await request(server)
        .post(`/recovery-requests/${recoveryRequestLocator}/approval-requests`)
        .set('If-Match', `"recovery-request:${recoveryRequestLocator}:v2"`)
        .send(approvalBody)
        .expect(400);

      expect(requestApproval).not.toHaveBeenCalled();
    });

    it('rejects a request without If-Match (400)', async () => {
      await request(server)
        .post(`/recovery-requests/${recoveryRequestLocator}/approval-requests`)
        .set('Idempotency-Key', idempotencyKey)
        .send(approvalBody)
        .expect(400);

      expect(requestApproval).not.toHaveBeenCalled();
    });

    it('answers 412 RECOVERY_STATE_CONFLICT for a malformed locator without touching the service', async () => {
      const response = await request(server)
        .post('/recovery-requests/not-a-uuid/approval-requests')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', '"recovery-request:not-a-uuid:v2"')
        .send(approvalBody)
        .expect(412);

      expect(response.body).toEqual({
        statusCode: 412,
        message: 'RECOVERY_STATE_CONFLICT',
        error: 'Precondition Failed',
      });
      expect(requestApproval).not.toHaveBeenCalled();
    });

    it('rejects a missing recovery policy version (400)', async () => {
      await request(server)
        .post(`/recovery-requests/${recoveryRequestLocator}/approval-requests`)
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"recovery-request:${recoveryRequestLocator}:v2"`)
        .send({})
        .expect(400);

      expect(requestApproval).not.toHaveBeenCalled();
    });

    it('rejects unknown fields in a recovery mutation (400)', async () => {
      await request(server)
        .post(`/recovery-requests/${recoveryRequestLocator}/approval-requests`)
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"recovery-request:${recoveryRequestLocator}:v2"`)
        .send({ ...approvalBody, extraField: 'not-allowed' })
        .expect(400);

      expect(requestApproval).not.toHaveBeenCalled();
    });
  });

  describe('M01-REC-005 POST /api/v1/recovery-requests/:id/approval-decisions', () => {
    const decisionBody = {
      decision: 'APPROVED',
      recoveryOperationClass: 'PASSWORD_RESET',
      approvalReasonCode: 'DUAL_CONTROL_APPROVED',
      approvalExpiresAt: '2026-08-10T13:30:00.000Z',
    };

    it('records an approved decision and returns the safe result (200)', async () => {
      useAal2Session();
      recordApprovalDecision.mockResolvedValueOnce({
        recoveryRequestId: recoveryRequestLocator,
        recordedDecision: 'APPROVED',
        version: 4,
      });

      const response = await request(server)
        .post(`/recovery-requests/${recoveryRequestLocator}/approval-decisions`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"recovery-request:${recoveryRequestLocator}:v3"`)
        .send(decisionBody)
        .expect(200);

      expect(readData(response.body)).toEqual({
        recoveryRequestId: recoveryRequestLocator,
        recordedDecision: 'APPROVED',
        version: 4,
      });
      expect(response.headers['cache-control']).toBe('no-store');
      expect(recordApprovalDecision).toHaveBeenCalledWith(
        expect.objectContaining({
          recoveryRequestId: new UuidV7(recoveryRequestLocator),
          // The approver is the authenticated AAL2 session subject, never a
          // client-supplied identity.
          approverIdentityId: new UuidV7(approverIdentityId),
          expectedRecoveryVersion: 3,
          decision: 'APPROVED',
          recoveryOperationClass: 'PASSWORD_RESET',
          approvalReasonCode: 'DUAL_CONTROL_APPROVED',
          approvalExpiresAt: '2026-08-10T13:30:00.000Z',
        }),
      );
    });

    it('returns 401 AUTHENTICATION_ASSURANCE_INSUFFICIENT for an AAL1 session', async () => {
      await request(server)
        .post(`/recovery-requests/${recoveryRequestLocator}/approval-decisions`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"recovery-request:${recoveryRequestLocator}:v3"`)
        .send(decisionBody)
        .expect(401);
    });

    it('returns 401 Unauthorized when the access token is missing', async () => {
      useAal2Session();
      await request(server)
        .post(`/recovery-requests/${recoveryRequestLocator}/approval-decisions`)
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"recovery-request:${recoveryRequestLocator}:v3"`)
        .send(decisionBody)
        .expect(401);
    });

    it('returns 403 AUTHORIZATION_DENIED when Module 02 denies the approver', async () => {
      useAal2Session();
      recordApprovalDecision.mockRejectedValueOnce(new RecoveryError('AUTHORIZATION_DENIED'));

      const response = await request(server)
        .post(`/recovery-requests/${recoveryRequestLocator}/approval-decisions`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"recovery-request:${recoveryRequestLocator}:v3"`)
        .send(decisionBody)
        .expect(403);

      expect(response.body).toEqual({
        statusCode: 403,
        message: 'AUTHORIZATION_DENIED',
        error: 'Forbidden',
      });
    });

    it('returns 403 RECOVERY_APPROVAL_INVALID for an invalid approval attempt', async () => {
      useAal2Session();
      recordApprovalDecision.mockRejectedValueOnce(
        new RecoveryError('RECOVERY_APPROVAL_INVALID'),
      );

      const response = await request(server)
        .post(`/recovery-requests/${recoveryRequestLocator}/approval-decisions`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"recovery-request:${recoveryRequestLocator}:v3"`)
        .send(decisionBody)
        .expect(403);

      expect(response.body).toEqual({
        statusCode: 403,
        message: 'RECOVERY_APPROVAL_INVALID',
        error: 'Forbidden',
      });
    });

    it('returns 403 RECOVERY_APPROVAL_INVALID for a malformed locator without touching the service', async () => {
      useAal2Session();
      const response = await request(server)
        .post('/recovery-requests/not-a-uuid/approval-decisions')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', '"recovery-request:not-a-uuid:v3"')
        .send(decisionBody)
        .expect(403);

      expect(response.body).toEqual({
        statusCode: 403,
        message: 'RECOVERY_APPROVAL_INVALID',
        error: 'Forbidden',
      });
      expect(recordApprovalDecision).not.toHaveBeenCalled();
    });

    it('rejects a request without Idempotency-Key (400)', async () => {
      useAal2Session();
      await request(server)
        .post(`/recovery-requests/${recoveryRequestLocator}/approval-decisions`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('If-Match', `"recovery-request:${recoveryRequestLocator}:v3"`)
        .send(decisionBody)
        .expect(400);

      expect(recordApprovalDecision).not.toHaveBeenCalled();
    });

    it('rejects a request without If-Match (400)', async () => {
      useAal2Session();
      await request(server)
        .post(`/recovery-requests/${recoveryRequestLocator}/approval-decisions`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .send(decisionBody)
        .expect(400);

      expect(recordApprovalDecision).not.toHaveBeenCalled();
    });

    it('rejects a missing decision field (400)', async () => {
      useAal2Session();
      await request(server)
        .post(`/recovery-requests/${recoveryRequestLocator}/approval-decisions`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"recovery-request:${recoveryRequestLocator}:v3"`)
        .send({
          recoveryOperationClass: 'PASSWORD_RESET',
          approvalReasonCode: 'DUAL_CONTROL_APPROVED',
          approvalExpiresAt: '2026-08-10T13:30:00.000Z',
        })
        .expect(400);

      expect(recordApprovalDecision).not.toHaveBeenCalled();
    });

    it('rejects unknown fields in a recovery mutation (400)', async () => {
      useAal2Session();
      await request(server)
        .post(`/recovery-requests/${recoveryRequestLocator}/approval-decisions`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"recovery-request:${recoveryRequestLocator}:v3"`)
        .send({ ...decisionBody, approverRole: 'not-allowed' })
        .expect(400);

      expect(recordApprovalDecision).not.toHaveBeenCalled();
    });
  });

  describe('M01-REC-006 POST /api/v1/recovery-requests/:id/execution', () => {
    const executionBody = {
      permittedOperation: 'PASSWORD_RESET',
      recoveryPolicyVersion: 'v1',
    };

    it('executes an approved recovery and returns the safe completion result (200)', async () => {
      executeRecovery.mockResolvedValueOnce({
        recoveryRequestId: recoveryRequestLocator,
        safeState: 'COMPLETED',
        reauthenticationRequired: true,
        version: 5,
      });

      const response = await request(server)
        .post(`/recovery-requests/${recoveryRequestLocator}/execution`)
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"recovery-request:${recoveryRequestLocator}:v4"`)
        .send(executionBody)
        .expect(200);

      expect(readData(response.body)).toEqual({
        recoveryRequestId: recoveryRequestLocator,
        safeState: 'COMPLETED',
        reauthenticationRequired: true,
        version: 5,
      });
      expect(response.headers['cache-control']).toBe('no-store');
      expect(executeRecovery).toHaveBeenCalledWith({
        recoveryRequestId: new UuidV7(recoveryRequestLocator),
        expectedRecoveryVersion: 4,
        permittedOperation: 'PASSWORD_RESET',
        recoveryPolicyVersion: 'v1',
      });
    });

    it('maps RECOVERY_APPROVAL_REQUIRED to 409', async () => {
      executeRecovery.mockRejectedValueOnce(new RecoveryError('RECOVERY_APPROVAL_REQUIRED'));

      const response = await request(server)
        .post(`/recovery-requests/${recoveryRequestLocator}/execution`)
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"recovery-request:${recoveryRequestLocator}:v2"`)
        .send(executionBody)
        .expect(409);

      expect(response.body).toEqual({
        statusCode: 409,
        message: 'RECOVERY_APPROVAL_REQUIRED',
        error: 'Conflict',
      });
    });

    it('maps RECOVERY_STATE_CONFLICT to 412', async () => {
      executeRecovery.mockRejectedValueOnce(new RecoveryError('RECOVERY_STATE_CONFLICT'));

      const response = await request(server)
        .post(`/recovery-requests/${recoveryRequestLocator}/execution`)
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"recovery-request:${recoveryRequestLocator}:v4"`)
        .send(executionBody)
        .expect(412);

      expect(response.body).toEqual({
        statusCode: 412,
        message: 'RECOVERY_STATE_CONFLICT',
        error: 'Precondition Failed',
      });
    });

    it('answers a malformed locator uniformly with 412', async () => {
      const response = await request(server)
        .post('/recovery-requests/not-a-uuid/execution')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', '"recovery-request:not-a-uuid:v4"')
        .send(executionBody)
        .expect(412);

      expect(response.body).toEqual({
        statusCode: 412,
        message: 'RECOVERY_STATE_CONFLICT',
        error: 'Precondition Failed',
      });
      expect(executeRecovery).not.toHaveBeenCalled();
    });

    it('rejects a request without Idempotency-Key (400)', async () => {
      await request(server)
        .post(`/recovery-requests/${recoveryRequestLocator}/execution`)
        .set('If-Match', `"recovery-request:${recoveryRequestLocator}:v4"`)
        .send(executionBody)
        .expect(400);

      expect(executeRecovery).not.toHaveBeenCalled();
    });

    it('rejects a request without If-Match (400)', async () => {
      await request(server)
        .post(`/recovery-requests/${recoveryRequestLocator}/execution`)
        .set('Idempotency-Key', idempotencyKey)
        .send(executionBody)
        .expect(400);

      expect(executeRecovery).not.toHaveBeenCalled();
    });

    it('rejects a disallowed permitted operation value (400)', async () => {
      await request(server)
        .post(`/recovery-requests/${recoveryRequestLocator}/execution`)
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"recovery-request:${recoveryRequestLocator}:v4"`)
        .send({ ...executionBody, permittedOperation: 'NOT_AN_OPERATION' })
        .expect(400);

      expect(executeRecovery).not.toHaveBeenCalled();
    });

    it('rejects unknown fields in an execution request (400)', async () => {
      await request(server)
        .post(`/recovery-requests/${recoveryRequestLocator}/execution`)
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"recovery-request:${recoveryRequestLocator}:v4"`)
        .send({ ...executionBody, recoveryCodes: ['secret'] })
        .expect(400);

      expect(executeRecovery).not.toHaveBeenCalled();
    });
  });

  describe('M01-REC-007 DELETE /api/v1/recovery-requests/:id', () => {
    it('cancels an in-progress recovery and returns 204 with an empty response', async () => {
      cancelRecovery.mockResolvedValueOnce({
        recoveryRequestId: recoveryRequestLocator,
        safeState: 'CANCELLED',
        version: 4,
      });

      const response = await request(server)
        .delete(`/recovery-requests/${recoveryRequestLocator}`)
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"recovery-request:${recoveryRequestLocator}:v3"`)
        .expect(204);

      expect(response.body).toEqual({});
      expect(response.headers['cache-control']).toBe('no-store');
      expect(cancelRecovery).toHaveBeenCalledWith({
        recoveryRequestId: new UuidV7(recoveryRequestLocator),
        expectedRecoveryVersion: 3,
      });
    });

    it('maps RECOVERY_STATE_CONFLICT to 412', async () => {
      cancelRecovery.mockRejectedValueOnce(new RecoveryError('RECOVERY_STATE_CONFLICT'));

      const response = await request(server)
        .delete(`/recovery-requests/${recoveryRequestLocator}`)
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"recovery-request:${recoveryRequestLocator}:v3"`)
        .expect(412);

      expect(response.body).toEqual({
        statusCode: 412,
        message: 'RECOVERY_STATE_CONFLICT',
        error: 'Precondition Failed',
      });
    });

    it('answers a malformed locator uniformly with 412', async () => {
      const response = await request(server)
        .delete('/recovery-requests/not-a-uuid')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', '"recovery-request:not-a-uuid:v3"')
        .expect(412);

      expect(response.body).toEqual({
        statusCode: 412,
        message: 'RECOVERY_STATE_CONFLICT',
        error: 'Precondition Failed',
      });
      expect(cancelRecovery).not.toHaveBeenCalled();
    });

    it('rejects a request without Idempotency-Key (400)', async () => {
      await request(server)
        .delete(`/recovery-requests/${recoveryRequestLocator}`)
        .set('If-Match', `"recovery-request:${recoveryRequestLocator}:v3"`)
        .expect(400);

      expect(cancelRecovery).not.toHaveBeenCalled();
    });

    it('rejects a request without If-Match (400)', async () => {
      await request(server)
        .delete(`/recovery-requests/${recoveryRequestLocator}`)
        .set('Idempotency-Key', idempotencyKey)
        .expect(400);

      expect(cancelRecovery).not.toHaveBeenCalled();
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
