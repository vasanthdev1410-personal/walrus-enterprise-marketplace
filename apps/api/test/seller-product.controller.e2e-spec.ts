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
  PRODUCT_APPLICATION_SERVICE,
  PRODUCT_CATEGORY_READ_SERVICE,
  PRODUCT_MEDIA_APPLICATION_SERVICE,
  PRODUCT_READ_APPLICATION_SERVICE,
  PRODUCT_VARIANT_SKU_APPLICATION_SERVICE,
} from '../src/modules/product-catalog/product-catalog.tokens';
import {
  SellerCategoryController,
  SellerProductController,
} from '../src/modules/product-catalog/presentation/seller-product.controller';
import { ProductSellerPermissionGuard } from '../src/modules/product-catalog/presentation/guards/product-seller-permission.guard';

interface ProductApiEnvelope {
  data?: {
    product?: { productId?: string; state?: string; version?: number };
    products?: unknown[];
    variant?: { variantId?: string; skuCode?: string };
    sku?: { skuId?: string; skuCode?: string };
    media?: unknown[];
    categories?: unknown[];
  };
  message?: string;
}

function envelopeOf(response: request.Response): ProductApiEnvelope {
  return response.body as ProductApiEnvelope;
}

const identityId = '0191310f-789a-7123-8123-000000000001';
const sessionId = '0191310f-789a-7123-8123-000000000002';
const sellerProfileId = '0191310f-789a-7123-8123-000000000003';
const productId = '0191310f-789a-7123-8123-000000000004';
const categoryId = '0191310f-789a-7123-8123-000000000005';
const variantId = '0191310f-789a-7123-8123-000000000006';
const skuId = '0191310f-789a-7123-8123-000000000007';

describe('Module 04 seller product API (integration)', () => {
  let application: INestApplication;
  let server: Server;

  const products = {
    createProduct: jest.fn().mockResolvedValue({
      productId,
      state: 'DRAFT',
      version: 1,
    }),
    updateProduct: jest.fn().mockResolvedValue({
      productId,
      state: 'DRAFT',
      version: 2,
    }),
    submitProduct: jest.fn().mockResolvedValue({
      productId,
      state: 'SUBMITTED',
      version: 2,
    }),
    closeProduct: jest.fn().mockResolvedValue({
      productId,
      state: 'CLOSED',
      version: 2,
    }),
  };
  const variants = {
    addVariant: jest.fn().mockResolvedValue({
      variantId,
      skuCode: 'WLR-ESPRESSO-SS',
      version: 2,
    }),
    addSku: jest.fn().mockResolvedValue({
      skuId,
      skuCode: 'WLR-ESPRESSO-002',
      version: 2,
    }),
    closeSku: jest.fn().mockResolvedValue({
      skuId,
      skuCode: 'WLR-ESPRESSO-002',
      version: 2,
    }),
  };
  const media = {
    recordMediaReference: jest.fn().mockResolvedValue({
      mediaId: '0191310f-789a-7123-8123-000000000008',
      productId,
      version: 2,
    }),
  };
  const read = {
    listOwnProducts: jest.fn().mockResolvedValue([]),
    getOwnProductDetail: jest.fn().mockResolvedValue({
      productId,
      sellerProfileId,
      categoryId,
      name: 'Walrus Espresso Machine',
      state: 'DRAFT',
      sellingPrice: 249.99,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      variants: [],
      skus: [],
      media: [],
    }),
    listOwnMediaMetadata: jest.fn().mockResolvedValue([]),
  };
  const categories = {
    findActiveCategories: jest
      .fn()
      .mockResolvedValue([{ categoryId, name: 'Home Appliances', state: 'ACTIVE' }]),
  };

  // Untyped mocks (cast at the provider): the guard consumes these at runtime
  // only; test code configures them loosely.
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
      controllers: [SellerProductController, SellerCategoryController],
      providers: [
        { provide: PRODUCT_APPLICATION_SERVICE, useValue: products },
        { provide: PRODUCT_VARIANT_SKU_APPLICATION_SERVICE, useValue: variants },
        { provide: PRODUCT_MEDIA_APPLICATION_SERVICE, useValue: media },
        { provide: PRODUCT_READ_APPLICATION_SERVICE, useValue: read },
        { provide: PRODUCT_CATEGORY_READ_SERVICE, useValue: categories },
        { provide: AUTHORIZATION_APPLICATION_SERVICE, useValue: authorization },
        { provide: JWT_CRYPTOGRAPHY, useValue: jwt },
        { provide: SESSION_REPOSITORY, useValue: sessions },
        { provide: IDENTITY_REPOSITORY, useValue: identities },
        { provide: RATE_LIMITER, useValue: rateLimiter },
        AuthoritativeSessionGuard,
        Aal2SessionGuard,
        NonProductionRateLimiterGuard,
        ProductSellerPermissionGuard,
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

  beforeEach(() => {
    jest.resetAllMocks();
    products.createProduct.mockResolvedValue({ productId, state: 'DRAFT', version: 1 });
    products.updateProduct.mockResolvedValue({ productId, state: 'DRAFT', version: 2 });
    products.submitProduct.mockResolvedValue({ productId, state: 'SUBMITTED', version: 2 });
    products.closeProduct.mockResolvedValue({ productId, state: 'CLOSED', version: 2 });
    variants.addVariant.mockResolvedValue({ variantId, skuCode: 'WLR-ESPRESSO-SS', version: 2 });
    variants.addSku.mockResolvedValue({ skuId, skuCode: 'WLR-ESPRESSO-002', version: 2 });
    variants.closeSku.mockResolvedValue({ skuId, skuCode: 'WLR-ESPRESSO-002', version: 2 });
    media.recordMediaReference.mockResolvedValue({
      mediaId: '0191310f-789a-7123-8123-000000000008',
      productId,
      version: 2,
    });
    read.listOwnProducts.mockResolvedValue([]);
    read.getOwnProductDetail.mockResolvedValue({
      productId,
      sellerProfileId,
      categoryId,
      name: 'Walrus Espresso Machine',
      state: 'DRAFT',
      sellingPrice: 249.99,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      variants: [],
      skus: [],
      media: [],
    });
    read.listOwnMediaMetadata.mockResolvedValue([]);
    categories.findActiveCategories.mockResolvedValue([
      { categoryId, name: 'Home Appliances', state: 'ACTIVE' },
    ]);
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
  const validCreate = {
    sellerProfileId,
    name: 'Walrus Espresso Machine',
    categoryId,
    sellingPrice: 249.99,
    skus: [{ skuCode: 'WLR-ESPRESSO-001' }],
  };

  it('rejects unauthenticated requests (AAL2 guard)', async () => {
    await request(server).post('/seller/products').send(validCreate).expect(401);
  });

  it('denies when the Module 02 engine denies the permission (fail closed)', async () => {
    authorization.authorize.mockResolvedValue({ granted: false });
    await request(server).post('/seller/products').set(authHeader).send(validCreate).expect(403);
    expect(products.createProduct).not.toHaveBeenCalled();
  });

  it('denies when the engine cannot decide (authorization failure, fail closed)', async () => {
    authorization.authorize.mockRejectedValue(new Error('engine unavailable'));
    await request(server).post('/seller/products').set(authHeader).send(validCreate).expect(403);
    expect(products.createProduct).not.toHaveBeenCalled();
  });

  it('requires an Idempotency-Key on mutations', async () => {
    await request(server).post('/seller/products').set(authHeader).send(validCreate).expect(400);
    expect(products.createProduct).not.toHaveBeenCalled();
  });

  it('creates a DRAFT product with the validated seller scope', async () => {
    await request(server)
      .post('/seller/products')
      .set(authHeader)
      .set('Idempotency-Key', 'req-create-0000001')
      .send(validCreate)
      .expect(201)
      .expect(({ body }: { body: ProductApiEnvelope }) => {
        expect(envelopeOf({ body } as request.Response).data?.product?.state).toBe('DRAFT');
      });
    expect(products.createProduct).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid product data (D-16 validation, whitelist)', async () => {
    await request(server)
      .post('/seller/products')
      .set(authHeader)
      .set('Idempotency-Key', 'req-create-0000002')
      .send({ ...validCreate, name: '' })
      .expect(400);
    expect(products.createProduct).not.toHaveBeenCalled();
  });

  it('lists own products via the resolved seller scope', async () => {
    await request(server)
      .get('/seller/products')
      .query({ sellerProfileId })
      .set(authHeader)
      .expect(200)
      .expect(({ body }: { body: ProductApiEnvelope }) => {
        expect(envelopeOf({ body } as request.Response).data?.products).toBeDefined();
      });
  });

  it('reads own product detail with variants and SKUs', async () => {
    await request(server)
      .get(`/seller/products/${productId}`)
      .query({ sellerProfileId })
      .set(authHeader)
      .expect(200);
    expect(read.getOwnProductDetail).toHaveBeenCalled();
  });

  it('submits a product for moderation (idempotent)', async () => {
    await request(server)
      .post(`/seller/products/${productId}/submit`)
      .set(authHeader)
      .set('Idempotency-Key', 'req-submit-0000001')
      .send({ sellerProfileId, expectedVersion: 1 })
      .expect(200)
      .expect(({ body }: { body: ProductApiEnvelope }) => {
        expect(envelopeOf({ body } as request.Response).data?.product?.state).toBe('SUBMITTED');
      });
    expect(products.submitProduct).toHaveBeenCalledTimes(1);
  });

  it('closes a product with the mandatory reason', async () => {
    await request(server)
      .post(`/seller/products/${productId}/close`)
      .set(authHeader)
      .set('Idempotency-Key', 'req-close-0000001')
      .send({ sellerProfileId, expectedVersion: 1, reasonReference: 'cls:withdrawal' })
      .expect(200)
      .expect(({ body }: { body: ProductApiEnvelope }) => {
        expect(envelopeOf({ body } as request.Response).data?.product?.state).toBe('CLOSED');
      });
  });

  it('adds a variant with its own SKU', async () => {
    await request(server)
      .post(`/seller/products/${productId}/variants`)
      .set(authHeader)
      .set('Idempotency-Key', 'req-variant-00001')
      .send({
        sellerProfileId,
        expectedVersion: 1,
        name: 'Stainless Steel',
        sellingPrice: 259.99,
        skuCode: 'WLR-ESPRESSO-SS',
      })
      .expect(201);
    expect(variants.addVariant).toHaveBeenCalledTimes(1);
  });

  it('records media reference + digest (metadata only)', async () => {
    await request(server)
      .post(`/seller/products/${productId}/media`)
      .set(authHeader)
      .set('Idempotency-Key', 'req-media-0000001')
      .send({
        sellerProfileId,
        expectedVersion: 1,
        mediaReference: 'https://media.example.test/objects/x.webp',
        mediaDigest: 'a'.repeat(64),
        mimeType: 'image/webp',
        sizeBytes: 1024,
      })
      .expect(201);
    expect(media.recordMediaReference).toHaveBeenCalledTimes(1);
  });

  it('lists active platform categories (catalog.category.read)', async () => {
    await request(server)
      .get('/seller/categories')
      .set(authHeader)
      .expect(200)
      .expect(({ body }: { body: ProductApiEnvelope }) => {
        expect(envelopeOf({ body } as request.Response).data?.categories).toHaveLength(1);
      });
  });
});
