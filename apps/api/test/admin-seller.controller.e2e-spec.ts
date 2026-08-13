import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import type { JwtCryptographicPort } from '../src/modules/identity-authentication/application/ports/jwt-cryptographic.port';
import type { IdentityRepository } from '../src/modules/identity-authentication/domain/identity/repositories/identity-repository';
import type { SessionRepository } from '../src/modules/identity-authentication/domain/session/repositories/session-repository';
import { JWT_CRYPTOGRAPHY } from '../src/modules/identity-authentication/identity-authentication.tokens';
import {
  IDENTITY_REPOSITORY,
  SESSION_REPOSITORY,
} from '../src/modules/identity-authentication/infrastructure/persistence/prisma/prisma.module';
import { RATE_LIMITER } from '../src/modules/identity-authentication/presentation/authentication.tokens';
import { Aal2SessionGuard } from '../src/modules/identity-authentication/presentation/guards/aal2-session.guard';
import { AuthoritativeSessionGuard } from '../src/modules/identity-authentication/presentation/guards/authoritative-session.guard';
import { NonProductionRateLimiterGuard } from '../src/modules/identity-authentication/presentation/guards/non-production-rate-limiter.guard';
import { AUTHORIZATION_APPLICATION_SERVICE } from '../src/modules/authorization/authorization.tokens';
import { AuthorizationPermissionGuard } from '../src/modules/authorization/presentation/guards/authorization-permission.guard';
import { SellerApplicationError } from '../src/modules/seller-management/application/errors/seller-application.error';
import {
  SELLER_AUTHORIZATION_APPLICATION_SERVICE,
  SELLER_READ_APPLICATION_SERVICE,
  SELLER_VERIFICATION_APPLICATION_SERVICE,
} from '../src/modules/seller-management/seller-management.tokens';
import { AdminSellerController } from '../src/modules/seller-management/presentation/admin-seller.controller';

interface AdminSellerApiEnvelope {
  data?: {
    sellers?: unknown[];
    seller?: { sellerProfileId?: string; state?: string };
    evidence?: unknown[];
  };
  message?: string;
}

function envelopeOf(response: request.Response): AdminSellerApiEnvelope {
  return response.body as AdminSellerApiEnvelope;
}

/** First argument of the first recorded call (cast at the assertion site). */
function firstCallArg(mock: jest.Mock, argIndex = 0): unknown {
  const calls = mock.mock.calls as unknown as unknown[][];
  return calls[0]?.[argIndex];
}

const adminId = '0191310f-789a-7123-8123-000000000001';
const sessionId = '0191310f-789a-7123-8123-000000000002';
const sellerProfileId = '0191310f-789a-7123-8123-000000000003';

describe('Module 03 admin seller API (integration)', () => {
  let application: INestApplication;
  let server: Server;

  const read = {
    listSellers: jest.fn().mockResolvedValue([
      {
        sellerProfileId,
        state: 'SUBMITTED',
        complianceState: 'IN_PROGRESS',
        version: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]),
    getSellerDetail: jest.fn().mockResolvedValue({
      sellerProfileId,
      state: 'SUBMITTED',
      complianceState: 'IN_PROGRESS',
      version: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      organization: { legalName: 'Walrus Retail', tradeName: 'Walrus', businessAddress: 'Addr' },
      members: [],
      verifications: [],
    }),
    listEvidenceMetadata: jest.fn().mockResolvedValue([
      {
        verificationId: '0191310f-789a-7123-8123-000000000004',
        verificationType: 'GST',
        verificationState: 'APPROVED',
        generation: 1,
        evidenceId: '0191310f-789a-7123-8123-000000000005',
        evidenceType: 'GST_CERTIFICATE',
        evidenceReference: 'ref:object:abc',
        evidenceDigest: 'a'.repeat(64),
        uploadedByIdentityId: adminId,
        uploadedAt: new Date().toISOString(),
      },
    ]),
  };
  const verification = {
    claimReview: jest.fn().mockResolvedValue({
      sellerProfileId,
      state: 'UNDER_REVIEW',
      version: 3,
    }),
    requestCorrections: jest.fn().mockResolvedValue({
      sellerProfileId,
      state: 'CORRECTIONS_REQUESTED',
      version: 3,
    }),
    decideReview: jest.fn().mockResolvedValue({
      sellerProfileId,
      state: 'APPROVED',
      version: 3,
    }),
  };
  const authorization = {
    suspendSeller: jest.fn().mockResolvedValue({
      sellerProfileId,
      state: 'SUSPENDED',
      version: 4,
      sellerRoleGranted: true,
    }),
    reactivateSeller: jest.fn().mockResolvedValue({
      sellerProfileId,
      state: 'ACTIVE',
      version: 5,
      sellerRoleGranted: true,
    }),
  };

  // Untyped mock (cast at the provider): the guard consumes it at runtime only.
  const permissions = {
    authorize: jest.fn().mockResolvedValue({ granted: true }),
  };

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

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      controllers: [AdminSellerController],
      providers: [
        { provide: SELLER_READ_APPLICATION_SERVICE, useValue: read },
        { provide: SELLER_VERIFICATION_APPLICATION_SERVICE, useValue: verification },
        { provide: SELLER_AUTHORIZATION_APPLICATION_SERVICE, useValue: authorization },
        { provide: AUTHORIZATION_APPLICATION_SERVICE, useValue: permissions },
        { provide: JWT_CRYPTOGRAPHY, useValue: jwt },
        { provide: SESSION_REPOSITORY, useValue: sessions },
        { provide: IDENTITY_REPOSITORY, useValue: identities },
        { provide: RATE_LIMITER, useValue: rateLimiter },
        AuthoritativeSessionGuard,
        Aal2SessionGuard,
        NonProductionRateLimiterGuard,
        AuthorizationPermissionGuard,
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
    // resetAllMocks: mock implementations from a previous test must never leak.
    jest.resetAllMocks();
    read.listSellers.mockResolvedValue([
      {
        sellerProfileId,
        state: 'SUBMITTED',
        complianceState: 'IN_PROGRESS',
        version: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    read.getSellerDetail.mockResolvedValue({
      sellerProfileId,
      state: 'SUBMITTED',
      complianceState: 'IN_PROGRESS',
      version: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      organization: { legalName: 'Walrus Retail', tradeName: 'Walrus', businessAddress: 'Addr' },
      members: [],
      verifications: [],
    });
    read.listEvidenceMetadata.mockResolvedValue([
      {
        verificationId: '0191310f-789a-7123-8123-000000000004',
        verificationType: 'GST',
        verificationState: 'APPROVED',
        generation: 1,
        evidenceId: '0191310f-789a-7123-8123-000000000005',
        evidenceType: 'GST_CERTIFICATE',
        evidenceReference: 'ref:object:abc',
        evidenceDigest: 'a'.repeat(64),
        uploadedByIdentityId: adminId,
        uploadedAt: new Date().toISOString(),
      },
    ]);
    verification.claimReview.mockResolvedValue({
      sellerProfileId,
      state: 'UNDER_REVIEW',
      version: 3,
    });
    verification.requestCorrections.mockResolvedValue({
      sellerProfileId,
      state: 'CORRECTIONS_REQUESTED',
      version: 3,
    });
    verification.decideReview.mockResolvedValue({
      sellerProfileId,
      state: 'APPROVED',
      version: 3,
    });
    authorization.suspendSeller.mockResolvedValue({
      sellerProfileId,
      state: 'SUSPENDED',
      version: 4,
      sellerRoleGranted: true,
    });
    authorization.reactivateSeller.mockResolvedValue({
      sellerProfileId,
      state: 'ACTIVE',
      version: 5,
      sellerRoleGranted: true,
    });
    permissions.authorize.mockResolvedValue({ granted: true });
    rateLimiter.consume.mockResolvedValue({
      allowed: true,
      limit: 100,
      remaining: 99,
      resetAt: new Date(Date.now() + 60_000),
    });
  });

  function useAal2Session(): void {
    jwt.verifyAccessToken.mockResolvedValue({
      subject: adminId,
      sessionId,
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
        identityId: { value: adminId },
        sessionState: 'ACTIVE',
        sessionClass: 'INTERACTIVE_WEB',
        sessionVersion: { value: 1 },
        authenticationAssurance: 'AAL2',
        mfaVerifiedAt: new Date(Date.now() - 60_000),
        idleExpiresAt: new Date(Date.now() + 60_000),
        absoluteExpiresAt: new Date(Date.now() + 120_000),
      },
    } as never);
    identities.findById.mockResolvedValue({
      properties: {
        identityId: { value: adminId },
        identityState: 'ACTIVE',
        verificationState: 'VERIFIED',
        lockedUntil: undefined,
      },
    } as never);
  }

  const authHeader = { Authorization: 'Bearer valid-jwt-token' };

  describe('GET /admin/sellers', () => {
    it('lists sellers with the seller.audit.view grant', async () => {
      useAal2Session();

      const response = await request(server).get('/admin/sellers').set(authHeader).expect(200);

      expect(envelopeOf(response).data?.sellers).toHaveLength(1);
      expect(permissions.authorize).toHaveBeenCalledWith(
        expect.objectContaining({ permissionId: 'seller.audit.view' }),
      );
      // Summary rows never include evidence or registration data.
      expect(JSON.stringify(response.body)).not.toContain('registrationNumber');
    });

    it('denies without seller.audit.view (403)', async () => {
      useAal2Session();
      permissions.authorize.mockResolvedValue({ granted: false });

      await request(server).get('/admin/sellers').set(authHeader).expect(403);
      expect(read.listSellers).not.toHaveBeenCalled();
    });

    it('returns 401 for an unauthenticated caller', async () => {
      useAal2Session();
      await request(server).get('/admin/sellers').expect(401);
    });
  });

  describe('GET /admin/sellers/:sellerProfileId', () => {
    it('returns seller detail with the audit grant', async () => {
      useAal2Session();

      const response = await request(server)
        .get(`/admin/sellers/${sellerProfileId}`)
        .set(authHeader)
        .expect(200);

      expect(envelopeOf(response).data?.seller?.sellerProfileId).toBe(sellerProfileId);
    });

    it('returns 404 for a malformed seller id (non-enumerating)', async () => {
      useAal2Session();
      await request(server).get('/admin/sellers/not-a-uuid').set(authHeader).expect(404);
    });
  });

  describe('POST /admin/sellers/:sellerProfileId/review', () => {
    it('approves a seller under review (seller.review.decide)', async () => {
      useAal2Session();

      const response = await request(server)
        .post(`/admin/sellers/${sellerProfileId}/review`)
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-review-001')
        .send({ action: 'APPROVE', expectedVersion: 3 })
        .expect(200);

      expect(envelopeOf(response).data?.seller?.state).toBe('APPROVED');
      const command = firstCallArg(verification.decideReview) as
        { decision?: string; approverIdentityId?: { value?: string } } | undefined;
      expect(command?.decision).toBe('APPROVED');
      expect(command?.approverIdentityId?.value).toBe(adminId);
    });

    it('claims review (SUBMITTED → UNDER_REVIEW)', async () => {
      useAal2Session();

      await request(server)
        .post(`/admin/sellers/${sellerProfileId}/review`)
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-review-002')
        .send({ action: 'CLAIM_REVIEW', expectedVersion: 2 })
        .expect(200);

      expect(verification.claimReview).toHaveBeenCalledTimes(1);
    });

    it('requests corrections with a mandatory reason', async () => {
      useAal2Session();

      await request(server)
        .post(`/admin/sellers/${sellerProfileId}/review`)
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-review-003')
        .send({ action: 'REQUEST_CORRECTIONS', expectedVersion: 3, reasonReference: 'WEMP-REV-0001' })
        .expect(200);

      const command = firstCallArg(verification.requestCorrections) as
        { reasonReference?: string } | undefined;
      expect(command?.reasonReference).toBe('WEMP-REV-0001');
    });

    it('rejects REJECT without a reason (400)', async () => {
      useAal2Session();

      const response = await request(server)
        .post(`/admin/sellers/${sellerProfileId}/review`)
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-review-004')
        .send({ action: 'REJECT', expectedVersion: 3 })
        .expect(400);

      expect(envelopeOf(response).message).toBe('SELLER_PRECONDITION_FAILED');
      expect(verification.decideReview).not.toHaveBeenCalled();
    });

    it('denies self-approval attempts (SoD) with a generic AUTHORIZATION_DENIED', async () => {
      useAal2Session();
      verification.decideReview.mockRejectedValue(new SellerApplicationError('SELLER_SOD_VIOLATION'));

      const response = await request(server)
        .post(`/admin/sellers/${sellerProfileId}/review`)
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-review-005')
        .send({ action: 'APPROVE', expectedVersion: 3 })
        .expect(403);

      expect(envelopeOf(response).message).toBe('AUTHORIZATION_DENIED');
    });

    it('rejects an unknown action at the DTO boundary (400)', async () => {
      useAal2Session();

      await request(server)
        .post(`/admin/sellers/${sellerProfileId}/review`)
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-review-006')
        .send({ action: 'ESCALATE', expectedVersion: 3 })
        .expect(400);
      expect(verification.decideReview).not.toHaveBeenCalled();
    });

    it('rejects a seller under review (REJECT with mandatory reason)', async () => {
      useAal2Session();
      verification.decideReview.mockResolvedValue({
        sellerProfileId,
        state: 'REJECTED',
        version: 3,
      });

      const response = await request(server)
        .post(`/admin/sellers/${sellerProfileId}/review`)
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-review-007')
        .send({ action: 'REJECT', expectedVersion: 3, reasonReference: 'WEMP-REV-0002' })
        .expect(200);

      expect(envelopeOf(response).data?.seller?.state).toBe('REJECTED');
      const command = firstCallArg(verification.decideReview) as
        { decision?: string; reasonReference?: string } | undefined;
      expect(command?.decision).toBe('REJECTED');
      expect(command?.reasonReference).toBe('WEMP-REV-0002');
    });

    it('maps a review state conflict to a generic 409', async () => {
      useAal2Session();
      verification.claimReview.mockRejectedValue(
        new SellerApplicationError('SELLER_STATE_CONFLICT'),
      );

      const response = await request(server)
        .post(`/admin/sellers/${sellerProfileId}/review`)
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-review-008')
        .send({ action: 'CLAIM_REVIEW', expectedVersion: 2 })
        .expect(409);

      expect(envelopeOf(response).message).toBe('SELLER_STATE_CONFLICT');
    });
  });

  describe('POST /admin/sellers/:sellerProfileId/suspend | reactivate', () => {
    it('suspends an ACTIVE seller with a mandatory reason', async () => {
      useAal2Session();

      const response = await request(server)
        .post(`/admin/sellers/${sellerProfileId}/suspend`)
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-susp-001')
        .send({ expectedVersion: 4, reasonReference: 'WEMP-SUSP-0001' })
        .expect(200);

      expect(envelopeOf(response).data?.seller?.state).toBe('SUSPENDED');
      const command = firstCallArg(authorization.suspendSeller) as
        { reasonReference?: string } | undefined;
      expect(command?.reasonReference).toBe('WEMP-SUSP-0001');
    });

    it('rejects suspension without a reason (400)', async () => {
      useAal2Session();

      await request(server)
        .post(`/admin/sellers/${sellerProfileId}/suspend`)
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-susp-002')
        .send({ expectedVersion: 4 })
        .expect(400);
      expect(authorization.suspendSeller).not.toHaveBeenCalled();
    });

    it('reactivates a SUSPENDED seller', async () => {
      useAal2Session();

      const response = await request(server)
        .post(`/admin/sellers/${sellerProfileId}/reactivate`)
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-reac-001')
        .send({ expectedVersion: 4 })
        .expect(200);

      expect(envelopeOf(response).data?.seller?.state).toBe('ACTIVE');
      expect(authorization.reactivateSeller).toHaveBeenCalledTimes(1);
    });

    it('denies suspension without seller.suspend.manage (403)', async () => {
      useAal2Session();
      permissions.authorize.mockResolvedValue({ granted: false });

      await request(server)
        .post(`/admin/sellers/${sellerProfileId}/suspend`)
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-susp-003')
        .send({ expectedVersion: 4, reasonReference: 'WEMP-SUSP-0002' })
        .expect(403);
      expect(authorization.suspendSeller).not.toHaveBeenCalled();
    });

    it('maps a suspension state conflict to a generic 409', async () => {
      useAal2Session();
      authorization.suspendSeller.mockRejectedValue(
        new SellerApplicationError('SELLER_STATE_CONFLICT'),
      );

      const response = await request(server)
        .post(`/admin/sellers/${sellerProfileId}/suspend`)
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-susp-004')
        .send({ expectedVersion: 4, reasonReference: 'WEMP-SUSP-0003' })
        .expect(409);

      expect(envelopeOf(response).message).toBe('SELLER_STATE_CONFLICT');
    });

    it('maps a reactivation denial to a generic 403 AUTHORIZATION_DENIED', async () => {
      useAal2Session();
      authorization.reactivateSeller.mockRejectedValue(
        new SellerApplicationError('SELLER_IDENTITY_INELIGIBLE'),
      );

      const response = await request(server)
        .post(`/admin/sellers/${sellerProfileId}/reactivate`)
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-reac-002')
        .send({ expectedVersion: 4 })
        .expect(403);

      expect(envelopeOf(response).message).toBe('AUTHORIZATION_DENIED');
    });
  });

  describe('GET /admin/sellers/:sellerProfileId/evidence', () => {
    it('returns evidence metadata with seller.evidence.read', async () => {
      useAal2Session();

      const response = await request(server)
        .get(`/admin/sellers/${sellerProfileId}/evidence`)
        .set(authHeader)
        .expect(200);

      expect(envelopeOf(response).data?.evidence).toHaveLength(1);
      expect(permissions.authorize).toHaveBeenCalledWith(
        expect.objectContaining({ permissionId: 'seller.evidence.read' }),
      );
    });

    it('denies evidence access without seller.evidence.read (403)', async () => {
      useAal2Session();
      permissions.authorize.mockResolvedValue({ granted: false });

      await request(server)
        .get(`/admin/sellers/${sellerProfileId}/evidence`)
        .set(authHeader)
        .expect(403);
      expect(read.listEvidenceMetadata).not.toHaveBeenCalled();
    });

    it('maps an evidence metadata failure to a non-enumerating 404', async () => {
      useAal2Session();
      read.listEvidenceMetadata.mockRejectedValue(new SellerApplicationError('SELLER_NOT_FOUND'));

      const response = await request(server)
        .get(`/admin/sellers/${sellerProfileId}/evidence`)
        .set(authHeader)
        .expect(404);

      expect(envelopeOf(response).message).toBe('SELLER_NOT_FOUND');
    });
  });

  describe('list filtering and admin read error mapping', () => {
    it('lists sellers filtered by a valid state', async () => {
      useAal2Session();

      const response = await request(server)
        .get('/admin/sellers?state=ACTIVE')
        .set(authHeader)
        .expect(200);

      expect(envelopeOf(response).data?.sellers).toBeDefined();
      expect(read.listSellers).toHaveBeenCalledWith(
        expect.anything(),
        'ACTIVE',
      );
    });

    it('rejects an unknown state filter as 400 SELLER_PRECONDITION_FAILED', async () => {
      useAal2Session();

      const response = await request(server)
        .get('/admin/sellers?state=NOT_A_STATE')
        .set(authHeader)
        .expect(400);

      expect(envelopeOf(response).message).toBe('SELLER_PRECONDITION_FAILED');
      expect(read.listSellers).not.toHaveBeenCalled();
    });

    it('maps an admin list failure to a generic 403 AUTHORIZATION_DENIED', async () => {
      useAal2Session();
      read.listSellers.mockRejectedValue(
        new SellerApplicationError('SELLER_ADMIN_AUTHORIZATION_DENIED'),
      );

      const response = await request(server).get('/admin/sellers').set(authHeader).expect(403);

      expect(envelopeOf(response).message).toBe('AUTHORIZATION_DENIED');
    });
  });
});
