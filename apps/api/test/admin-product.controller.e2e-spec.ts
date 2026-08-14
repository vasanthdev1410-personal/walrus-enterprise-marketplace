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
import {
  PRODUCT_MODERATION_APPLICATION_SERVICE,
  PRODUCT_READ_APPLICATION_SERVICE,
} from '../src/modules/product-catalog/product-catalog.tokens';
import { AdminProductController } from '../src/modules/product-catalog/presentation/admin-product.controller';

interface AdminProductApiEnvelope {
  data?: {
    products?: unknown[];
    product?: { productId?: string; state?: string; version?: number };
    media?: unknown[];
  };
  message?: string;
}

function envelopeOf(response: request.Response): AdminProductApiEnvelope {
  return response.body as AdminProductApiEnvelope;
}

const adminId = '0191310f-789a-7123-8123-000000000001';
const sessionId = '0191310f-789a-7123-8123-000000000002';
const productId = '0191310f-789a-7123-8123-000000000004';

describe('Module 04 admin product API (integration)', () => {
  let application: INestApplication;
  let server: Server;

  const read = {
    listAllProducts: jest.fn().mockResolvedValue([]),
    getAdminProductDetail: jest.fn().mockResolvedValue({
      productId,
      sellerProfileId: '0191310f-789a-7123-8123-000000000003',
      categoryId: '0191310f-789a-7123-8123-000000000005',
      name: 'Walrus Espresso Machine',
      state: 'SUBMITTED',
      sellingPrice: 249.99,
      version: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      variants: [],
      skus: [],
      media: [],
      transitions: [],
      audit: [],
    }),
    listAdminMediaMetadata: jest.fn().mockResolvedValue([]),
  };
  const moderation = {
    claimReview: jest.fn().mockResolvedValue({ productId, state: 'UNDER_REVIEW', version: 2 }),
    requestCorrections: jest.fn().mockResolvedValue({
      productId,
      state: 'CORRECTIONS_REQUESTED',
      version: 2,
    }),
    decideApproval: jest.fn().mockResolvedValue({ productId, state: 'APPROVED', version: 2 }),
    decideRejection: jest.fn().mockResolvedValue({ productId, state: 'REJECTED', version: 2 }),
    publishApproved: jest.fn().mockResolvedValue({ productId, state: 'PUBLISHED', version: 2 }),
  };

  const authorization = {
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
      controllers: [AdminProductController],
      providers: [
        { provide: PRODUCT_READ_APPLICATION_SERVICE, useValue: read },
        { provide: PRODUCT_MODERATION_APPLICATION_SERVICE, useValue: moderation },
        { provide: AUTHORIZATION_APPLICATION_SERVICE, useValue: authorization },
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

  function useVerifiedIdentity(): void {
    identities.findById.mockResolvedValue({
      properties: {
        identityId: { value: adminId },
        identityState: 'ACTIVE',
        verificationState: 'VERIFIED',
        lockedUntil: undefined,
      },
    } as never);
  }

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
    useVerifiedIdentity();
  }

  beforeEach(() => {
    jest.resetAllMocks();
    read.listAllProducts.mockResolvedValue([]);
    read.getAdminProductDetail.mockResolvedValue({
      productId,
      sellerProfileId: '0191310f-789a-7123-8123-000000000003',
      categoryId: '0191310f-789a-7123-8123-000000000005',
      name: 'Walrus Espresso Machine',
      state: 'SUBMITTED',
      sellingPrice: 249.99,
      version: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      variants: [],
      skus: [],
      media: [],
      transitions: [],
      audit: [],
    });
    read.listAdminMediaMetadata.mockResolvedValue([]);
    moderation.claimReview.mockResolvedValue({
      productId,
      state: 'UNDER_REVIEW',
      version: 2,
    });
    moderation.requestCorrections.mockResolvedValue({
      productId,
      state: 'CORRECTIONS_REQUESTED',
      version: 2,
    });
    moderation.decideApproval.mockResolvedValue({ productId, state: 'APPROVED', version: 2 });
    moderation.decideRejection.mockResolvedValue({ productId, state: 'REJECTED', version: 2 });
    moderation.publishApproved.mockResolvedValue({
      productId,
      state: 'PUBLISHED',
      version: 2,
    });
    authorization.authorize.mockResolvedValue({ granted: true });
    rateLimiter.consume.mockResolvedValue({
      allowed: true,
      limit: 100,
      remaining: 99,
      resetAt: new Date(Date.now() + 60_000),
    });
    useAal2Session();
  });

  const authHeader = { Authorization: 'Bearer valid-jwt-token' };

  it('rejects unauthenticated requests (AAL2 guard)', async () => {
    await request(server).get('/admin/products').expect(401);
  });

  it('denies without the product.audit.view permission (fail closed)', async () => {
    authorization.authorize.mockResolvedValue({ granted: false });
    await request(server).get('/admin/products').set(authHeader).expect(403);
    expect(read.listAllProducts).not.toHaveBeenCalled();
  });

  it('lists products (non-enumerating) with optional state filter', async () => {
    await request(server)
      .get('/admin/products')
      .set(authHeader)
      .expect(200)
      .expect(({ body }: { body: AdminProductApiEnvelope }) => {
        expect(envelopeOf({ body } as request.Response).data?.products).toBeDefined();
      });

    await request(server).get('/admin/products?state=SUBMITTED').set(authHeader).expect(200);
    expect(read.listAllProducts).toHaveBeenNthCalledWith(1, expect.anything(), undefined);
    expect(read.listAllProducts).toHaveBeenNthCalledWith(2, expect.anything(), 'SUBMITTED');
  });

  it('rejects an invalid state filter', async () => {
    await request(server).get('/admin/products?state=INVALID').set(authHeader).expect(400);
  });

  it('reads product detail with lifecycle + audit episodes', async () => {
    await request(server).get(`/admin/products/${productId}`).set(authHeader).expect(200);
    expect(read.getAdminProductDetail).toHaveBeenCalledTimes(1);
  });

  it('requires an Idempotency-Key on the review mutation', async () => {
    await request(server)
      .post(`/admin/products/${productId}/review`)
      .set(authHeader)
      .send({ expectedVersion: 1, action: 'CLAIM_REVIEW' })
      .expect(400);
    expect(moderation.claimReview).not.toHaveBeenCalled();
  });

  it('claims review under product.review.decide', async () => {
    await request(server)
      .post(`/admin/products/${productId}/review`)
      .set(authHeader)
      .set('Idempotency-Key', 'req-review-0000001')
      .send({ expectedVersion: 1, action: 'CLAIM_REVIEW' })
      .expect(200)
      .expect(({ body }: { body: AdminProductApiEnvelope }) => {
        expect(envelopeOf({ body } as request.Response).data?.product?.state).toBe('UNDER_REVIEW');
      });
    expect(moderation.claimReview).toHaveBeenCalledTimes(1);
  });

  it('requests corrections with a mandatory reason', async () => {
    await request(server)
      .post(`/admin/products/${productId}/review`)
      .set(authHeader)
      .set('Idempotency-Key', 'req-review-0000002')
      .send({
        expectedVersion: 1,
        action: 'REQUEST_CORRECTIONS',
        reasonReference: 'missing imagery',
      })
      .expect(200);
    expect(moderation.requestCorrections).toHaveBeenCalledTimes(1);
  });

  it('rejects corrections without a reason (fail closed)', async () => {
    await request(server)
      .post(`/admin/products/${productId}/review`)
      .set(authHeader)
      .set('Idempotency-Key', 'req-review-0000003')
      .send({ expectedVersion: 1, action: 'REQUEST_CORRECTIONS' })
      .expect(400);
    expect(moderation.requestCorrections).not.toHaveBeenCalled();
  });

  it('approves and rejects through the moderation service', async () => {
    await request(server)
      .post(`/admin/products/${productId}/review`)
      .set(authHeader)
      .set('Idempotency-Key', 'req-review-0000004')
      .send({ expectedVersion: 1, action: 'APPROVE' })
      .expect(200)
      .expect(({ body }: { body: AdminProductApiEnvelope }) => {
        expect(envelopeOf({ body } as request.Response).data?.product?.state).toBe('APPROVED');
      });

    await request(server)
      .post(`/admin/products/${productId}/review`)
      .set(authHeader)
      .set('Idempotency-Key', 'req-review-0000005')
      .send({
        expectedVersion: 1,
        action: 'REJECT',
        reasonReference: 'policy violation',
      })
      .expect(200)
      .expect(({ body }: { body: AdminProductApiEnvelope }) => {
        expect(envelopeOf({ body } as request.Response).data?.product?.state).toBe('REJECTED');
      });
  });

  it('publishes an approved product through the SYSTEM-gated transition', async () => {
    await request(server)
      .post(`/admin/products/${productId}/review`)
      .set(authHeader)
      .set('Idempotency-Key', 'req-review-0000006')
      .send({ expectedVersion: 1, action: 'PUBLISH' })
      .expect(200)
      .expect(({ body }: { body: AdminProductApiEnvelope }) => {
        expect(envelopeOf({ body } as request.Response).data?.product?.state).toBe('PUBLISHED');
      });
    expect(moderation.publishApproved).toHaveBeenCalledTimes(1);
  });

  it('inspects media metadata under product.media.read (metadata only)', async () => {
    await request(server).get(`/admin/products/${productId}/media`).set(authHeader).expect(200);
    expect(read.listAdminMediaMetadata).toHaveBeenCalledTimes(1);
  });
});
