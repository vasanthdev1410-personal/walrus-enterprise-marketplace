import { ConflictException, ValidationPipe, type INestApplication } from '@nestjs/common';
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
import {
  SELLER_MEMBER_APPLICATION_SERVICE,
  SELLER_ONBOARDING_APPLICATION_SERVICE,
  SELLER_PROFILE_REPOSITORY,
  SELLER_READ_APPLICATION_SERVICE,
  SELLER_VERIFICATION_APPLICATION_SERVICE,
  SELLER_WAREHOUSE_APPLICATION_SERVICE,
} from '../src/modules/seller-management/seller-management.tokens';
import { SellerApplicationError } from '../src/modules/seller-management/application/errors/seller-application.error';
import { SellerController } from '../src/modules/seller-management/presentation/seller.controller';
import { SellerSelfServicePermissionGuard } from '../src/modules/seller-management/presentation/guards/seller-self-service-permission.guard';

interface SellerApiEnvelope {
  data?: {
    seller?: { state?: string; version?: number; sellerProfileId?: string };
    warehouse?: { state?: string };
    member?: { associationState?: string };
    warehouses?: unknown[];
    agreements?: unknown[];
    members?: unknown[];
    verification?: Record<string, unknown>;
    profile?: Record<string, unknown>;
    business?: Record<string, unknown>;
  };
  message?: string;
}

function envelopeOf(response: request.Response): SellerApiEnvelope {
  return response.body as SellerApiEnvelope;
}

/** First argument of the first recorded call (cast at the assertion site). */
function firstCallArg(mock: jest.Mock, argIndex = 0): unknown {
  const calls = mock.mock.calls as unknown as unknown[][];
  return calls[0]?.[argIndex];
}

const identityId = '0191310f-789a-7123-8123-000000000001';
const sessionId = '0191310f-789a-7123-8123-000000000002';
const sellerProfileId = '0191310f-789a-7123-8123-000000000003';
const otherSellerProfileId = '0191310f-789a-7123-8123-000000000099';

describe('Module 03 seller self-service API (integration)', () => {
  let application: INestApplication;
  let server: Server;

  const onboarding = {
    requestSellerProfileCreation: jest.fn().mockResolvedValue({
      sellerProfileId,
      state: 'DRAFT',
      version: 1,
    }),
    submitOnboarding: jest.fn().mockResolvedValue({
      sellerProfileId,
      state: 'SUBMITTED',
      version: 2,
    }),
    resubmitOnboarding: jest.fn().mockResolvedValue({
      sellerProfileId,
      state: 'SUBMITTED',
      version: 3,
    }),
    updateProfile: jest.fn().mockResolvedValue({
      sellerProfileId,
      state: 'DRAFT',
      version: 2,
    }),
  };
  const verification = {
    submitVerification: jest.fn().mockResolvedValue({
      verificationId: '0191310f-789a-7123-8123-000000000004',
      state: 'SUBMITTED',
      generation: 1,
      sellerVersion: 2,
    }),
    getVerificationStatus: jest.fn().mockResolvedValue({
      sellerProfileId,
      complianceState: 'IN_PROGRESS',
      verifications: [{ verificationType: 'GST', state: 'SUBMITTED', generation: 1 }],
    }),
  };
  const read = {
    getOwnOnboardingStatus: jest.fn().mockResolvedValue({
      sellerProfileId,
      state: 'DRAFT',
      complianceState: 'NOT_STARTED',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      organization: { legalName: 'Walrus Retail', tradeName: 'Walrus', businessAddress: 'Addr' },
      verifications: [],
    }),
    getOwnProfile: jest.fn().mockResolvedValue({
      sellerProfileId,
      state: 'ACTIVE',
      complianceState: 'COMPLIANT',
      version: 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      organization: { legalName: 'Walrus Retail', tradeName: 'Walrus', businessAddress: 'Addr' },
      members: [],
    }),
    listWarehouses: jest.fn().mockResolvedValue([]),
    listAgreements: jest.fn().mockResolvedValue([]),
    listMembers: jest.fn().mockResolvedValue([]),
  };
  const warehouses = {
    createWarehouse: jest.fn().mockResolvedValue({
      warehouseId: '0191310f-789a-7123-8123-000000000005',
      state: 'ACTIVE',
      sellerVersion: 6,
    }),
    closeWarehouse: jest.fn().mockResolvedValue({
      warehouseId: '0191310f-789a-7123-8123-000000000005',
      state: 'CLOSED',
      sellerVersion: 6,
    }),
  };
  const members = {
    addMember: jest.fn().mockResolvedValue({
      sellerProfileId,
      memberIdentityId: '0191310f-789a-7123-8123-000000000006',
      associationRole: 'MEMBER',
      associationState: 'ACTIVE',
      sellerVersion: 6,
    }),
    removeMember: jest.fn().mockResolvedValue({
      sellerProfileId,
      memberIdentityId: '0191310f-789a-7123-8123-000000000006',
      associationRole: 'MEMBER',
      associationState: 'REMOVED',
      sellerVersion: 6,
    }),
  };

  // Untyped mocks (cast at the provider): the guard consumes these at runtime
  // only; test code configures them loosely.
  const authorization = {
    authorize: jest.fn().mockResolvedValue({ granted: true }),
  };

  const sellers = {
    findProfileByAssociatedIdentityId: jest.fn().mockResolvedValue({
      properties: { sellerProfileId: { value: sellerProfileId } },
    }),
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
      controllers: [SellerController],
      providers: [
        { provide: SELLER_ONBOARDING_APPLICATION_SERVICE, useValue: onboarding },
        { provide: SELLER_VERIFICATION_APPLICATION_SERVICE, useValue: verification },
        { provide: SELLER_READ_APPLICATION_SERVICE, useValue: read },
        { provide: SELLER_WAREHOUSE_APPLICATION_SERVICE, useValue: warehouses },
        { provide: SELLER_MEMBER_APPLICATION_SERVICE, useValue: members },
        { provide: AUTHORIZATION_APPLICATION_SERVICE, useValue: authorization },
        { provide: SELLER_PROFILE_REPOSITORY, useValue: sellers },
        { provide: JWT_CRYPTOGRAPHY, useValue: jwt },
        { provide: SESSION_REPOSITORY, useValue: sessions },
        { provide: IDENTITY_REPOSITORY, useValue: identities },
        { provide: RATE_LIMITER, useValue: rateLimiter },
        AuthoritativeSessionGuard,
        Aal2SessionGuard,
        NonProductionRateLimiterGuard,
        SellerSelfServicePermissionGuard,
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

  const draftStatus = {
    sellerProfileId,
    state: 'DRAFT' as const,
    complianceState: 'NOT_STARTED' as const,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    organization: { legalName: 'Walrus Retail', tradeName: 'Walrus', businessAddress: 'Addr' },
    verifications: [],
  };

  beforeEach(() => {
    // resetAllMocks: mock implementations from a previous test must never leak.
    jest.resetAllMocks();
    onboarding.requestSellerProfileCreation.mockResolvedValue({
      sellerProfileId,
      state: 'DRAFT',
      version: 1,
    });
    onboarding.submitOnboarding.mockResolvedValue({
      sellerProfileId,
      state: 'SUBMITTED',
      version: 2,
    });
    onboarding.resubmitOnboarding.mockResolvedValue({
      sellerProfileId,
      state: 'SUBMITTED',
      version: 3,
    });
    onboarding.updateProfile.mockResolvedValue({
      sellerProfileId,
      state: 'DRAFT',
      version: 2,
    });
    verification.submitVerification.mockResolvedValue({
      verificationId: '0191310f-789a-7123-8123-000000000004',
      state: 'SUBMITTED',
      generation: 1,
      sellerVersion: 2,
    });
    verification.getVerificationStatus.mockResolvedValue({
      sellerProfileId,
      complianceState: 'IN_PROGRESS',
      verifications: [{ verificationType: 'GST', state: 'SUBMITTED', generation: 1 }],
    });
    read.getOwnOnboardingStatus.mockResolvedValue(draftStatus);
    read.getOwnProfile.mockResolvedValue({
      sellerProfileId,
      state: 'ACTIVE',
      complianceState: 'COMPLIANT',
      version: 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      organization: { legalName: 'Walrus Retail', tradeName: 'Walrus', businessAddress: 'Addr' },
      members: [],
    });
    read.listWarehouses.mockResolvedValue([]);
    read.listAgreements.mockResolvedValue([]);
    read.listMembers.mockResolvedValue([]);
    warehouses.createWarehouse.mockResolvedValue({
      warehouseId: '0191310f-789a-7123-8123-000000000005',
      state: 'ACTIVE',
      sellerVersion: 6,
    });
    warehouses.closeWarehouse.mockResolvedValue({
      warehouseId: '0191310f-789a-7123-8123-000000000005',
      state: 'CLOSED',
      sellerVersion: 6,
    });
    members.addMember.mockResolvedValue({
      sellerProfileId,
      memberIdentityId: '0191310f-789a-7123-8123-000000000006',
      associationRole: 'MEMBER',
      associationState: 'ACTIVE',
      sellerVersion: 6,
    });
    members.removeMember.mockResolvedValue({
      sellerProfileId,
      memberIdentityId: '0191310f-789a-7123-8123-000000000006',
      associationRole: 'MEMBER',
      associationState: 'REMOVED',
      sellerVersion: 6,
    });
    authorization.authorize.mockResolvedValue({ granted: true });
    sellers.findProfileByAssociatedIdentityId.mockResolvedValue({
      properties: { sellerProfileId: { value: sellerProfileId } },
    });
    rateLimiter.consume.mockResolvedValue({
      allowed: true,
      limit: 100,
      remaining: 99,
      resetAt: new Date(Date.now() + 60_000),
    });
  });

  function useVerifiedIdentity(): void {
    identities.findById.mockResolvedValue({
      properties: {
        identityId: { value: identityId },
        identityState: 'ACTIVE',
        verificationState: 'VERIFIED',
        lockedUntil: undefined,
      },
    } as never);
  }

  function useAal2Session(): void {
    jwt.verifyAccessToken.mockResolvedValue({
      subject: identityId,
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
        identityId: { value: identityId },
        sessionState: 'ACTIVE',
        sessionClass: 'INTERACTIVE_WEB',
        sessionVersion: { value: 1 },
        authenticationAssurance: 'AAL2',
        mfaVerifiedAt: new Date(Date.now() - 60_000),
        idleExpiresAt: new Date(Date.now() + 60_000),
        absoluteExpiresAt: new Date(Date.now() + 120_000),
      },
    } as never);
    useVerifiedIdentity();
  }

  function useAal1Session(): void {
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
        authenticationAssurance: 'AAL1',
        idleExpiresAt: new Date(Date.now() + 60_000),
        absoluteExpiresAt: new Date(Date.now() + 120_000),
      },
    } as never);
    useVerifiedIdentity();
  }

  const authHeader = { Authorization: 'Bearer valid-jwt-token' };
  const validOnboarding = {
    legalName: 'Walrus Retail Pvt Ltd',
    tradeName: 'Walrus Retail',
    registrationNumber: 'GSTIN1234567890123',
    businessAddress: '1 Market Street, Bengaluru',
  };

  describe('POST /seller/onboarding', () => {
    it('creates a DRAFT seller for an AAL2 verified identity (201)', async () => {
      useAal2Session();

      const response = await request(server)
        .post('/seller/onboarding')
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-onboarding-001')
        .send(validOnboarding)
        .expect(201);

      expect(envelopeOf(response).data?.seller).toMatchObject({ state: 'DRAFT', version: 1 });
      const command = firstCallArg(onboarding.requestSellerProfileCreation) as
        | {
            identityId?: { value?: string };
            registrationLookupDigest?: string;
            registrationNumber?: string;
          }
        | undefined;
      expect(command?.identityId?.value).toBe(identityId);
      // The digest is derived server-side from the raw registration number —
      // the client never supplies it.
      expect(command?.registrationLookupDigest).toMatch(/^[0-9a-f]{64}$/);
      expect(command?.registrationNumber).toBe('GSTIN1234567890123');
    });

    it('rejects a missing Idempotency-Key on the mutation', async () => {
      useAal2Session();

      const response = await request(server)
        .post('/seller/onboarding')
        .set(authHeader)
        .send(validOnboarding)
        .expect(400);

      expect(envelopeOf(response).message).toBe('IDEMPOTENCY_KEY_REQUIRED');
      expect(onboarding.requestSellerProfileCreation).not.toHaveBeenCalled();
    });

    it('rejects an invalid DTO (missing required field)', async () => {
      useAal2Session();

      await request(server)
        .post('/seller/onboarding')
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-onboarding-002')
        .send({ legalName: 'Only Name' })
        .expect(400);
      expect(onboarding.requestSellerProfileCreation).not.toHaveBeenCalled();
    });

    it('rejects unknown fields (whitelist + forbidNonWhitelisted)', async () => {
      useAal2Session();

      await request(server)
        .post('/seller/onboarding')
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-onboarding-003')
        .send({ ...validOnboarding, adminBypass: true })
        .expect(400);
      expect(onboarding.requestSellerProfileCreation).not.toHaveBeenCalled();
    });

    it('returns 401 for an unauthenticated caller', async () => {
      useAal2Session();
      await request(server)
        .post('/seller/onboarding')
        .set('Idempotency-Key', 'idempotency-key-onboarding-004')
        .send(validOnboarding)
        .expect(401);
    });

    it('returns 401 AUTHENTICATION_ASSURANCE_INSUFFICIENT for an AAL1 session', async () => {
      useAal1Session();

      const response = await request(server)
        .post('/seller/onboarding')
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-onboarding-005')
        .send(validOnboarding)
        .expect(401);

      expect(envelopeOf(response).message).toBe('AUTHENTICATION_ASSURANCE_INSUFFICIENT');
    });

    it('surfaces a duplicate-business denial as a non-enumerating 409', async () => {
      useAal2Session();
      onboarding.requestSellerProfileCreation.mockRejectedValue(
        new SellerApplicationError('SELLER_DUPLICATE_DETECTED'),
      );

      const response = await request(server)
        .post('/seller/onboarding')
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-onboarding-006')
        .send(validOnboarding)
        .expect(409);

      expect(envelopeOf(response).message).toBe('SELLER_STATE_CONFLICT');
    });
  });

  describe('POST /seller/onboarding/submit (server-side state dispatch)', () => {
    it('submits a DRAFT onboarding for review', async () => {
      useAal2Session();
      read.getOwnOnboardingStatus.mockResolvedValue({
        sellerProfileId,
        state: 'DRAFT',
        complianceState: 'NOT_STARTED',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        organization: { legalName: 'X', tradeName: 'Y', businessAddress: 'Z' },
        verifications: [],
      });

      const response = await request(server)
        .post('/seller/onboarding/submit')
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-submit-001')
        .send({ sellerProfileId, expectedVersion: 1 })
        .expect(200);

      expect(envelopeOf(response).data?.seller?.state).toBe('SUBMITTED');
      expect(onboarding.submitOnboarding).toHaveBeenCalledTimes(1);
      expect(onboarding.resubmitOnboarding).not.toHaveBeenCalled();
    });

    it('dispatches CORRECTIONS_REQUESTED to resubmit (new review cycle)', async () => {
      useAal2Session();
      read.getOwnOnboardingStatus.mockResolvedValue({
        sellerProfileId,
        state: 'CORRECTIONS_REQUESTED',
        complianceState: 'IN_PROGRESS',
        version: 4,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        organization: { legalName: 'X', tradeName: 'Y', businessAddress: 'Z' },
        verifications: [],
      });

      await request(server)
        .post('/seller/onboarding/submit')
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-submit-002')
        .send({ sellerProfileId, expectedVersion: 4 })
        .expect(200);

      expect(onboarding.resubmitOnboarding).toHaveBeenCalledTimes(1);
      expect(onboarding.submitOnboarding).not.toHaveBeenCalled();
    });

    it('rejects a lifecycle violation with a non-enumerating 409', async () => {
      useAal2Session();
      onboarding.submitOnboarding.mockRejectedValue(
        new SellerApplicationError('SELLER_STATE_CONFLICT'),
      );

      const response = await request(server)
        .post('/seller/onboarding/submit')
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-submit-003')
        .send({ sellerProfileId, expectedVersion: 2 })
        .expect(409);

      expect(envelopeOf(response).message).toBe('SELLER_STATE_CONFLICT');
    });
  });

  describe('seller role-gated self-service (Module 02 permission guard)', () => {
    it('denies GET /seller/warehouses when Module 02 denies the permission', async () => {
      useAal2Session();
      authorization.authorize.mockResolvedValue({ granted: false });

      const response = await request(server).get('/seller/warehouses').set(authHeader).expect(403);

      expect(envelopeOf(response).message).toBe('AUTHORIZATION_DENIED');
      expect(read.listWarehouses).not.toHaveBeenCalled();
    });

    it('grants GET /seller/warehouses when the SELLER role holds the org-scoped permission', async () => {
      useAal2Session();
      read.listWarehouses.mockResolvedValue([
        {
          warehouseId: '0191310f-789a-7123-8123-000000000005',
          name: 'W1',
          state: 'ACTIVE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);

      const response = await request(server).get('/seller/warehouses').set(authHeader).expect(200);

      expect(envelopeOf(response).data?.warehouses).toHaveLength(1);
      // The service receives the session-resolved seller scope, never a client id.
      const scope = firstCallArg(read.listWarehouses) as { value?: string } | undefined;
      const caller = firstCallArg(read.listWarehouses, 1) as { value?: string } | undefined;
      expect(scope?.value).toBe(sellerProfileId);
      expect(caller?.value).toBe(identityId);
    });

    it('fails closed when the caller has no resolvable seller (403)', async () => {
      useAal2Session();
      sellers.findProfileByAssociatedIdentityId.mockResolvedValue(null);

      await request(server).get('/seller/agreements').set(authHeader).expect(403);
      expect(authorization.authorize).not.toHaveBeenCalled();
    });

    it('fails closed when the authorization engine errors (dependency failure)', async () => {
      useAal2Session();
      authorization.authorize.mockRejectedValue(new Error('engine down'));

      await request(server).get('/seller/members').set(authHeader).expect(403);
    });

    it('creates a warehouse using the session-resolved seller scope (201)', async () => {
      useAal2Session();

      const response = await request(server)
        .post('/seller/warehouses')
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-wh-001')
        .send({ expectedVersion: 5, name: 'Main', address: 'Sector 62' })
        .expect(201);

      expect(envelopeOf(response).data?.warehouse?.state).toBe('ACTIVE');
      const command = firstCallArg(warehouses.createWarehouse) as
        { sellerProfileId?: { value?: string }; expectedVersion?: number } | undefined;
      expect(command?.sellerProfileId?.value).toBe(sellerProfileId);
      expect(command?.expectedVersion).toBe(5);
    });
  });

  describe('ownership enforcement (never trust client-supplied identifiers)', () => {
    it('denies a forged seller identifier on profile update (non-enumerating 404)', async () => {
      useAal2Session();
      onboarding.updateProfile.mockRejectedValue(
        new SellerApplicationError('SELLER_OWNERSHIP_DENIED'),
      );

      const response = await request(server)
        .patch('/seller/profile')
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-upd-001')
        .send({ sellerProfileId: otherSellerProfileId, expectedVersion: 1, tradeName: 'Hack' })
        .expect(404);

      // The response does not reveal whether the other seller exists.
      expect(envelopeOf(response).message).toBe('SELLER_NOT_FOUND');
    });

    it('denies a suspended/revoked identity with a generic AUTHORIZATION_DENIED', async () => {
      useAal2Session();
      verification.submitVerification.mockRejectedValue(
        new SellerApplicationError('SELLER_IDENTITY_INELIGIBLE'),
      );

      const response = await request(server)
        .post('/seller/verification')
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-ver-001')
        .send({
          sellerProfileId,
          expectedVersion: 2,
          verificationType: 'GST',
          evidence: [
            {
              evidenceType: 'GST_CERTIFICATE',
              evidenceReference: 'ref:object:abc',
              evidenceDigest: 'a'.repeat(64),
            },
          ],
        })
        .expect(403);

      expect(envelopeOf(response).message).toBe('AUTHORIZATION_DENIED');
    });

    it('rejects malformed evidence digest at the DTO boundary (400)', async () => {
      useAal2Session();

      await request(server)
        .post('/seller/verification')
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-ver-002')
        .send({
          sellerProfileId,
          expectedVersion: 2,
          verificationType: 'GST',
          evidence: [
            {
              evidenceType: 'GST_CERTIFICATE',
              evidenceReference: 'r',
              evidenceDigest: 'not-a-digest',
            },
          ],
        })
        .expect(400);
      expect(verification.submitVerification).not.toHaveBeenCalled();
    });
  });

  describe('verification status (evidence privacy)', () => {
    it('returns status with NO evidence references or digests', async () => {
      useAal2Session();

      const response = await request(server)
        .get('/seller/verification')
        .set(authHeader)
        .expect(200);

      const body = JSON.stringify(response.body);
      expect(body).toContain('verificationType');
      expect(body).not.toContain('evidenceReference');
      expect(body).not.toContain('evidenceDigest');
      expect(body).not.toContain('registrationNumber');
    });
  });

  describe('rate limiting (Module 01 infrastructure)', () => {
    it('returns 429 RATE_LIMIT_EXCEEDED when the rate limiter denies', async () => {
      useAal2Session();
      rateLimiter.consume.mockResolvedValue({
        allowed: false,
        limit: 100,
        remaining: 0,
        resetAt: new Date(Date.now() + 60_000),
      });

      const response = await request(server)
        .post('/seller/onboarding')
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-rl-001')
        .send(validOnboarding)
        .expect(429);

      expect(envelopeOf(response).message).toBe('RATE_LIMIT_EXCEEDED');
      expect(onboarding.requestSellerProfileCreation).not.toHaveBeenCalled();
    });
  });

  describe('idempotency', () => {
    it('surfaces an idempotency conflict as a stable 409', async () => {
      useAal2Session();
      onboarding.requestSellerProfileCreation.mockRejectedValue(
        new ConflictException('IDEMPOTENCY_KEY_REUSED'),
      );

      const response = await request(server)
        .post('/seller/onboarding')
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-idem-001')
        .send(validOnboarding)
        .expect(409);

      expect(envelopeOf(response).message).toBe('IDEMPOTENCY_KEY_REUSED');
    });
  });

  describe('member management (owner action)', () => {
    it('adds a member for a granted SELLER with the session-resolved seller', async () => {
      useAal2Session();

      const response = await request(server)
        .post('/seller/members')
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-member-001')
        .send({ expectedVersion: 5, memberIdentityId: '0191310f-789a-7123-8123-000000000006' })
        .expect(201);

      expect(envelopeOf(response).data?.member?.associationState).toBe('ACTIVE');
      const command = firstCallArg(members.addMember) as
        { sellerProfileId?: { value?: string } } | undefined;
      expect(command?.sellerProfileId?.value).toBe(sellerProfileId);
    });

    it('denies removal of a member when the app layer rejects (404 non-enumerating)', async () => {
      useAal2Session();
      members.removeMember.mockRejectedValue(new SellerApplicationError('SELLER_NOT_FOUND'));

      await request(server)
        .delete('/seller/members/0191310f-789a-7123-8123-000000000006')
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-member-002')
        .send({ expectedVersion: 5 })
        .expect(404);
    });

    it('removes a member for a granted SELLER with the session-resolved seller', async () => {
      useAal2Session();

      const response = await request(server)
        .delete('/seller/members/0191310f-789a-7123-8123-000000000006')
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-member-003')
        .send({ expectedVersion: 5 })
        .expect(200);

      expect(envelopeOf(response).data?.member?.associationState).toBe('REMOVED');
      const command = firstCallArg(members.removeMember) as
        | {
            sellerProfileId?: { value?: string };
            memberIdentityId?: { value?: string };
          }
        | undefined;
      expect(command?.sellerProfileId?.value).toBe(sellerProfileId);
      expect(command?.memberIdentityId?.value).toBe('0191310f-789a-7123-8123-000000000006');
    });

    it('rejects a malformed member identity URL parameter as a non-enumerating 404', async () => {
      useAal2Session();

      await request(server)
        .delete('/seller/members/not-a-uuid')
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-member-004')
        .send({ expectedVersion: 5 })
        .expect(404);
      expect(members.removeMember).not.toHaveBeenCalled();
    });

    it('surfaces an add-member app-layer denial as a non-enumerating 409', async () => {
      useAal2Session();
      members.addMember.mockRejectedValue(new SellerApplicationError('SELLER_DUPLICATE_DETECTED'));

      const response = await request(server)
        .post('/seller/members')
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-member-005')
        .send({ expectedVersion: 5, memberIdentityId: '0191310f-789a-7123-8123-000000000006' })
        .expect(409);

      expect(envelopeOf(response).message).toBe('SELLER_STATE_CONFLICT');
    });
  });

  describe('additional self-service reads (server-scoped)', () => {
    it('returns the own onboarding status for a pre-approval caller (GET /seller/onboarding)', async () => {
      useAal2Session();

      const response = await request(server).get('/seller/onboarding').set(authHeader).expect(200);

      expect(envelopeOf(response).data?.seller?.sellerProfileId).toBe(sellerProfileId);
      expect(read.getOwnOnboardingStatus).toHaveBeenCalledWith(expect.anything());
      expect(JSON.stringify(response.body)).not.toContain('registrationNumber');
    });

    it('surfaces a missing own seller as a non-enumerating 404', async () => {
      useAal2Session();
      read.getOwnOnboardingStatus.mockRejectedValue(new SellerApplicationError('SELLER_NOT_FOUND'));

      const response = await request(server).get('/seller/onboarding').set(authHeader).expect(404);

      expect(envelopeOf(response).message).toBe('SELLER_NOT_FOUND');
    });
  });

  describe('profile read / business read (SELLER role)', () => {
    it('returns the own profile with the seller.profile.read grant', async () => {
      useAal2Session();

      const response = await request(server).get('/seller/profile').set(authHeader).expect(200);

      expect(envelopeOf(response).data?.profile?.sellerProfileId).toBe(sellerProfileId);
      expect(read.getOwnProfile).toHaveBeenCalledTimes(1);
    });

    it('returns business information with the seller.organization.read grant', async () => {
      useAal2Session();

      const response = await request(server).get('/seller/business').set(authHeader).expect(200);

      expect(envelopeOf(response).data?.business).toMatchObject({
        legalName: 'Walrus Retail',
        tradeName: 'Walrus',
      });
    });

    it('denies profile read when the permission is denied (403)', async () => {
      useAal2Session();
      authorization.authorize.mockResolvedValue({ granted: false });

      const response = await request(server).get('/seller/profile').set(authHeader).expect(403);

      expect(envelopeOf(response).message).toBe('AUTHORIZATION_DENIED');
    });
  });

  describe('profile / business update (pre-approval surface)', () => {
    it('updates the own profile (200) with a server-validated id and idempotency', async () => {
      useAal2Session();

      const response = await request(server)
        .patch('/seller/profile')
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-upd-002')
        .send({ sellerProfileId, expectedVersion: 1, tradeName: 'Walrus Retail New' })
        .expect(200);

      expect(envelopeOf(response).data?.seller?.state).toBe('DRAFT');
      const command = firstCallArg(onboarding.updateProfile) as
        { sellerProfileId?: { value?: string }; tradeName?: string } | undefined;
      expect(command?.sellerProfileId?.value).toBe(sellerProfileId);
      expect(command?.tradeName).toBe('Walrus Retail New');
      expect(command).not.toHaveProperty('legalName');
      expect(command).not.toHaveProperty('businessAddress');
    });

    it('rejects an empty profile update (no fields) as 400', async () => {
      useAal2Session();

      const response = await request(server)
        .patch('/seller/profile')
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-upd-003')
        .send({ sellerProfileId, expectedVersion: 1 })
        .expect(400);

      expect(envelopeOf(response).message).toBe('SELLER_PRECONDITION_FAILED');
      expect(onboarding.updateProfile).not.toHaveBeenCalled();
    });

    it('updates business information through the same versioned update (200)', async () => {
      useAal2Session();

      const response = await request(server)
        .patch('/seller/business')
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-biz-001')
        .send({ sellerProfileId, expectedVersion: 1, legalName: 'Walrus Retail Pvt Ltd' })
        .expect(200);

      expect(envelopeOf(response).data?.seller?.state).toBe('DRAFT');
      const command = firstCallArg(onboarding.updateProfile) as { legalName?: string } | undefined;
      expect(command?.legalName).toBe('Walrus Retail Pvt Ltd');
    });

    it('rejects an empty business update as 400', async () => {
      useAal2Session();

      const response = await request(server)
        .patch('/seller/business')
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-biz-002')
        .send({ sellerProfileId, expectedVersion: 1 })
        .expect(400);

      expect(envelopeOf(response).message).toBe('SELLER_PRECONDITION_FAILED');
      expect(onboarding.updateProfile).not.toHaveBeenCalled();
    });
  });

  describe('verification submit success and status error mapping', () => {
    it('records a verification submission (200)', async () => {
      useAal2Session();

      const response = await request(server)
        .post('/seller/verification')
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-ver-003')
        .send({
          sellerProfileId,
          expectedVersion: 2,
          verificationType: 'GST',
          evidence: [
            {
              evidenceType: 'GST_CERTIFICATE',
              evidenceReference: 'ref:object:abc',
              evidenceDigest: 'a'.repeat(64),
            },
          ],
        })
        .expect(200);

      expect(envelopeOf(response).data?.verification?.state).toBe('SUBMITTED');
      expect(verification.submitVerification).toHaveBeenCalledTimes(1);
    });

    it('maps a verification status failure to a non-enumerating 404', async () => {
      useAal2Session();
      verification.getVerificationStatus.mockRejectedValue(
        new SellerApplicationError('SELLER_OWNERSHIP_DENIED'),
      );

      const response = await request(server)
        .get('/seller/verification')
        .set(authHeader)
        .expect(404);

      expect(envelopeOf(response).message).toBe('SELLER_NOT_FOUND');
    });
  });

  describe('warehouse close and error mapping', () => {
    it('closes a warehouse for a granted SELLER with the session-resolved seller (200)', async () => {
      useAal2Session();

      const response = await request(server)
        .post('/seller/warehouses/0191310f-789a-7123-8123-000000000005/close')
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-wh-close-001')
        .send({
          expectedVersion: 5,
          warehouseId: '0191310f-789a-7123-8123-000000000005',
        })
        .expect(200);

      expect(envelopeOf(response).data?.warehouse?.state).toBe('CLOSED');
      const command = firstCallArg(warehouses.closeWarehouse) as
        { sellerProfileId?: { value?: string }; warehouseId?: { value?: string } } | undefined;
      expect(command?.sellerProfileId?.value).toBe(sellerProfileId);
      expect(command?.warehouseId?.value).toBe('0191310f-789a-7123-8123-000000000005');
    });

    it('maps a warehouse list failure to a generic 404', async () => {
      useAal2Session();
      read.listWarehouses.mockRejectedValue(new SellerApplicationError('SELLER_NOT_FOUND'));

      const response = await request(server).get('/seller/warehouses').set(authHeader).expect(404);

      expect(envelopeOf(response).message).toBe('SELLER_NOT_FOUND');
    });

    it('maps a warehouse create failure to a generic 409', async () => {
      useAal2Session();
      warehouses.createWarehouse.mockRejectedValue(
        new SellerApplicationError('SELLER_STATE_CONFLICT'),
      );

      const response = await request(server)
        .post('/seller/warehouses')
        .set(authHeader)
        .set('Idempotency-Key', 'idempotency-key-wh-002')
        .send({ expectedVersion: 5, name: 'Main', address: 'Sector 62' })
        .expect(409);

      expect(envelopeOf(response).message).toBe('SELLER_STATE_CONFLICT');
    });
  });

  describe('agreements and members reads (SELLER role)', () => {
    it('lists own agreements with the seller.agreement.read grant', async () => {
      useAal2Session();
      read.listAgreements.mockResolvedValue([
        {
          agreementId: '0191310f-789a-7123-8123-000000000007',
          agreementType: 'COMMISSION',
          reference: 'cmv:commission/2026/001',
          state: 'ACTIVE',
          effectiveFrom: new Date().toISOString(),
        },
      ]);

      const response = await request(server).get('/seller/agreements').set(authHeader).expect(200);

      expect(envelopeOf(response).data?.agreements).toHaveLength(1);
    });

    it('lists own members with the seller.member.read grant', async () => {
      useAal2Session();
      read.listMembers.mockResolvedValue([
        {
          identityId: '0191310f-789a-7123-8123-000000000001',
          associationRole: 'OWNER',
          isPrimary: true,
          state: 'ACTIVE',
          addedAt: new Date().toISOString(),
        },
      ]);

      const response = await request(server).get('/seller/members').set(authHeader).expect(200);

      expect(envelopeOf(response).data?.members).toHaveLength(1);
    });
  });
});
