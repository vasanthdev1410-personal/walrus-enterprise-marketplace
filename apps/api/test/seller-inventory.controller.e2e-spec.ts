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
import { InventoryApplicationError } from '../src/modules/inventory/application/errors/inventory-application.error';
import {
  INVENTORY_APPLICATION_SERVICE,
  INVENTORY_READ_APPLICATION_SERVICE,
  MODULE04_PRODUCT_CATALOG_READ,
} from '../src/modules/inventory/inventory.tokens';
import { SellerInventoryController } from '../src/modules/inventory/presentation/seller-inventory.controller';
import { InventorySellerPermissionGuard } from '../src/modules/inventory/presentation/guards/inventory-seller-permission.guard';
import { UuidV7 } from '../src/modules/identity-authentication/domain/shared/value-objects/uuid-v7';

interface InventoryApiEnvelope {
  data?: {
    inventory?: unknown;
    movements?: unknown[];
  };
  message?: string;
}

function envelopeOf(response: request.Response): InventoryApiEnvelope {
  return response.body as InventoryApiEnvelope;
}

const identityId = '0191310f-789a-7123-8123-000000000001';
const sessionId = '0191310f-789a-7123-8123-000000000002';
const sellerProfileId = '0191310f-789a-7123-8123-000000000003';
const skuId = '0191310f-789a-7123-8123-000000000007';

describe('Module 05 seller inventory API (integration)', () => {
  let application: INestApplication;
  let server: Server;

  const inventory = {
    adjustStock: jest.fn().mockResolvedValue({
      skuId,
      onHand: 12,
      reserved: 2,
      available: 10,
      version: 2,
    }),
  };
  const read = {
    listOwnInventory: jest.fn().mockResolvedValue([
      {
        skuId,
        onHand: 12,
        reserved: 2,
        available: 10,
        version: 2,
        label: 'IN_STOCK',
      },
    ]),
    getOwnSkuDetail: jest.fn().mockResolvedValue({
      skuId,
      onHand: 12,
      reserved: 2,
      available: 10,
      version: 2,
      label: 'IN_STOCK',
    }),
    getOwnMovementLedger: jest.fn().mockResolvedValue([
      {
        movementId: '0191310f-789a-7123-8123-000000000010',
        movementType: 'STOCK_IN',
        delta: 12,
        resultingOnHand: 12,
        resultingReserved: 0,
        actorIdentityId: identityId,
        occurredAt: new Date().toISOString(),
      },
    ]),
  };

  // Untyped mocks (cast at the provider): the guard consumes these at runtime
  // only; test code configures them loosely.
  const authorization = {
    authorize: jest.fn().mockResolvedValue({ granted: true }),
  };
  const module04 = {
    getConsumableSkuFact: jest.fn().mockResolvedValue({
      skuId: new UuidV7(skuId),
      sellerProfileId: new UuidV7(sellerProfileId),
      skuCode: 'WLR-ESPRESSO-001',
      state: 'ACTIVE',
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
      controllers: [SellerInventoryController],
      providers: [
        { provide: INVENTORY_APPLICATION_SERVICE, useValue: inventory },
        { provide: INVENTORY_READ_APPLICATION_SERVICE, useValue: read },
        { provide: AUTHORIZATION_APPLICATION_SERVICE, useValue: authorization },
        { provide: MODULE04_PRODUCT_CATALOG_READ, useValue: module04 },
        { provide: JWT_CRYPTOGRAPHY, useValue: jwt },
        { provide: SESSION_REPOSITORY, useValue: sessions },
        { provide: IDENTITY_REPOSITORY, useValue: identities },
        { provide: RATE_LIMITER, useValue: rateLimiter },
        AuthoritativeSessionGuard,
        Aal2SessionGuard,
        NonProductionRateLimiterGuard,
        InventorySellerPermissionGuard,
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
    rateLimiter.consume.mockResolvedValue({
      allowed: true,
      limit: 100,
      remaining: 99,
      resetAt: new Date(Date.now() + 60_000),
    });
    authorization.authorize.mockResolvedValue({ granted: true });
    module04.getConsumableSkuFact.mockResolvedValue({
      skuId: new UuidV7(skuId),
      sellerProfileId: new UuidV7(sellerProfileId),
      skuCode: 'WLR-ESPRESSO-001',
      state: 'ACTIVE',
    });
    read.listOwnInventory.mockResolvedValue([
      {
        skuId,
        onHand: 12,
        reserved: 2,
        available: 10,
        version: 2,
        label: 'IN_STOCK',
      },
    ]);
    read.getOwnSkuDetail.mockResolvedValue({
      skuId,
      onHand: 12,
      reserved: 2,
      available: 10,
      version: 2,
      label: 'IN_STOCK',
    });
    read.getOwnMovementLedger.mockResolvedValue([]);
    inventory.adjustStock.mockResolvedValue({
      skuId,
      onHand: 12,
      reserved: 2,
      available: 10,
      version: 2,
    });
    useAal2Session();
  });

  // ----- Reads -----

  it('lists own inventory for the authenticated seller (inventory.read)', async () => {
    const response = await request(server)
      .get('/seller/inventory')
      .query({ sellerProfileId })
      .set('Authorization', 'Bearer token')
      .expect(200);

    expect(envelopeOf(response).data?.inventory).toHaveLength(1);
    expect(read.listOwnInventory).toHaveBeenCalledWith(
      expect.objectContaining({ value: sellerProfileId }),
      expect.objectContaining({ value: identityId }),
    );
  });

  it('reads own SKU detail (inventory.read)', async () => {
    const response = await request(server)
      .get(`/seller/inventory/${skuId}`)
      .query({ sellerProfileId })
      .set('Authorization', 'Bearer token')
      .expect(200);

    expect(envelopeOf(response).data?.inventory).toEqual(
      expect.objectContaining({ skuId, available: 10 }),
    );
  });

  it('reads own movement ledger (inventory.read)', async () => {
    const response = await request(server)
      .get(`/seller/inventory/${skuId}/movements`)
      .query({ sellerProfileId })
      .set('Authorization', 'Bearer token')
      .expect(200);

    expect(envelopeOf(response).data?.movements).toEqual([]);
  });

  it('denies a read when the caller lacks the inventory.read grant (fail closed)', async () => {
    authorization.authorize.mockResolvedValue({ granted: false });
    const response = await request(server)
      .get('/seller/inventory')
      .query({ sellerProfileId })
      .set('Authorization', 'Bearer token')
      .expect(403);
    expect(envelopeOf(response).message).toBe('AUTHORIZATION_DENIED');
  });

  it('denies a SKU-scoped read when the SKU belongs to another organization (non-disclosing)', async () => {
    module04.getConsumableSkuFact.mockResolvedValue({
      skuId: new UuidV7(skuId),
      sellerProfileId: new UuidV7('0191310f-789a-7123-8123-000000000004'),
      skuCode: 'OTHER-SKU',
      state: 'ACTIVE',
    });
    const response = await request(server)
      .get(`/seller/inventory/${skuId}`)
      .query({ sellerProfileId })
      .set('Authorization', 'Bearer token')
      .expect(403);
    expect(envelopeOf(response).message).toBe('AUTHORIZATION_DENIED');
  });

  it('denies a SKU-scoped read when the SKU is unknown/non-PUBLISHED (fail closed)', async () => {
    module04.getConsumableSkuFact.mockResolvedValue(null);
    const response = await request(server)
      .get(`/seller/inventory/${skuId}`)
      .query({ sellerProfileId })
      .set('Authorization', 'Bearer token')
      .expect(403);
    expect(envelopeOf(response).message).toBe('AUTHORIZATION_DENIED');
  });

  it('denies a read with a malformed seller reference (fail closed)', async () => {
    const response = await request(server)
      .get('/seller/inventory')
      .query({ sellerProfileId: 'not-a-uuid' })
      .set('Authorization', 'Bearer token')
      .expect(403);
    expect(envelopeOf(response).message).toBe('AUTHORIZATION_DENIED');
  });

  it('returns a non-enumerating 404 when the own SKU pool does not exist', async () => {
    read.getOwnSkuDetail.mockRejectedValue(new InventoryApplicationError('INVENTORY_NOT_FOUND'));
    const response = await request(server)
      .get(`/seller/inventory/${skuId}`)
      .query({ sellerProfileId })
      .set('Authorization', 'Bearer token')
      .expect(404);
    expect(envelopeOf(response).message).toBe('INVENTORY_NOT_FOUND');
  });

  it('requires an AAL2 session (401 without authentication)', async () => {
    await request(server).get('/seller/inventory').query({ sellerProfileId }).expect(401);
  });

  // ----- Adjustments -----

  it('applies a seller STOCK_IN adjustment (inventory.adjust.self, owner-only)', async () => {
    const response = await request(server)
      .post(`/seller/inventory/${skuId}/movements`)
      .set('Authorization', 'Bearer token')
      .set('Idempotency-Key', 'inv-adjust-0000000000000001')
      .send({ sellerProfileId, movementType: 'STOCK_IN', delta: 5, expectedVersion: 2 })
      .expect(200);

    expect(envelopeOf(response).data?.inventory).toEqual(
      expect.objectContaining({ skuId, version: 2 }),
    );
    expect(inventory.adjustStock).toHaveBeenCalledWith(
      expect.objectContaining({
        sellerProfileId: new UuidV7(sellerProfileId),
        movementType: 'STOCK_IN',
        expectedVersion: 2,
        idempotencyKey: 'inv-adjust-0000000000000001',
      }),
    );
  });

  it('rejects an adjustment without an Idempotency-Key (A-11)', async () => {
    const response = await request(server)
      .post(`/seller/inventory/${skuId}/movements`)
      .set('Authorization', 'Bearer token')
      .send({ sellerProfileId, movementType: 'STOCK_OUT', delta: 2, expectedVersion: 2 })
      .expect(400);
    expect(envelopeOf(response).message).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('rejects an adjustment with a malformed movementType (DTO validation)', async () => {
    await request(server)
      .post(`/seller/inventory/${skuId}/movements`)
      .set('Authorization', 'Bearer token')
      .set('Idempotency-Key', 'inv-adjust-0000000000000002')
      .send({ sellerProfileId, movementType: 'COUNT_CORRECTION', delta: 5, expectedVersion: 2 })
      .expect(400);
  });

  it('rejects an adjustment with a delta above the 1,000,000 bound (D-08)', async () => {
    await request(server)
      .post(`/seller/inventory/${skuId}/movements`)
      .set('Authorization', 'Bearer token')
      .set('Idempotency-Key', 'inv-adjust-0000000000000003')
      .send({ sellerProfileId, movementType: 'STOCK_IN', delta: 1_000_001, expectedVersion: 2 })
      .expect(400);
  });

  it('denies an adjustment without the inventory.adjust.self grant (fail closed)', async () => {
    authorization.authorize.mockResolvedValue({ granted: false });
    await request(server)
      .post(`/seller/inventory/${skuId}/movements`)
      .set('Authorization', 'Bearer token')
      .set('Idempotency-Key', 'inv-adjust-0000000000000004')
      .send({ sellerProfileId, movementType: 'STOCK_IN', delta: 5, expectedVersion: 2 })
      .expect(403);
  });

  it('maps an idempotency conflict to 409 INVENTORY_STATE_CONFLICT', async () => {
    inventory.adjustStock.mockRejectedValue(
      new InventoryApplicationError('INVENTORY_IDEMPOTENCY_CONFLICT'),
    );
    await request(server)
      .post(`/seller/inventory/${skuId}/movements`)
      .set('Authorization', 'Bearer token')
      .set('Idempotency-Key', 'inv-adjust-0000000000000005')
      .send({ sellerProfileId, movementType: 'STOCK_IN', delta: 5, expectedVersion: 2 })
      .expect(409);
  });

  it('maps an adjustment rate limit to 403 RATE_LIMIT_EXCEEDED', async () => {
    inventory.adjustStock.mockRejectedValue(
      new InventoryApplicationError('INVENTORY_RATE_LIMITED'),
    );
    const response = await request(server)
      .post(`/seller/inventory/${skuId}/movements`)
      .set('Authorization', 'Bearer token')
      .set('Idempotency-Key', 'inv-adjust-0000000000000006')
      .send({ sellerProfileId, movementType: 'STOCK_IN', delta: 5, expectedVersion: 2 })
      .expect(403);
    expect(envelopeOf(response).message).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('maps a cross-organization ownership denial to a non-enumerating 404', async () => {
    inventory.adjustStock.mockRejectedValue(
      new InventoryApplicationError('INVENTORY_OWNERSHIP_DENIED'),
    );
    const response = await request(server)
      .post(`/seller/inventory/${skuId}/movements`)
      .set('Authorization', 'Bearer token')
      .set('Idempotency-Key', 'inv-adjust-0000000000000007')
      .send({ sellerProfileId, movementType: 'STOCK_IN', delta: 5, expectedVersion: 2 })
      .expect(404);
    expect(envelopeOf(response).message).toBe('INVENTORY_NOT_FOUND');
  });
});
