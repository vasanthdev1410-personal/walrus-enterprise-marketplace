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
import { InventoryQuantity } from '../src/modules/inventory/domain/value-objects/inventory-quantity';
import {
  INVENTORY_APPLICATION_SERVICE,
  INVENTORY_READ_APPLICATION_SERVICE,
} from '../src/modules/inventory/inventory.tokens';
import { AdminInventoryController } from '../src/modules/inventory/presentation/admin-inventory.controller';

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

const adminId = '0191310f-789a-7123-8123-000000000001';
const sessionId = '0191310f-789a-7123-8123-000000000002';
const skuId = '0191310f-789a-7123-8123-000000000007';

describe('Module 05 admin inventory API (integration)', () => {
  let application: INestApplication;
  let server: Server;

  const inventory = {
    adminCorrectStock: jest.fn().mockResolvedValue({
      skuId,
      onHand: 30,
      reserved: 0,
      available: 30,
      version: 3,
    }),
  };
  const read = {
    listAdminInventory: jest.fn().mockResolvedValue([
      {
        skuId,
        onHand: 30,
        reserved: 0,
        available: 30,
        version: 3,
        label: 'IN_STOCK',
      },
    ]),
    getAdminSkuDetail: jest.fn().mockResolvedValue({
      skuId,
      sellerProfileId: '0191310f-789a-7123-8123-000000000003',
      onHand: 30,
      reserved: 0,
      available: 30,
      version: 3,
      label: 'IN_STOCK',
      audit: [],
      movements: [],
    }),
    getAdminMovementLedger: jest.fn().mockResolvedValue([]),
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
      controllers: [AdminInventoryController],
      providers: [
        { provide: INVENTORY_APPLICATION_SERVICE, useValue: inventory },
        { provide: INVENTORY_READ_APPLICATION_SERVICE, useValue: read },
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
    rateLimiter.consume.mockResolvedValue({
      allowed: true,
      limit: 100,
      remaining: 99,
      resetAt: new Date(Date.now() + 60_000),
    });
    authorization.authorize.mockResolvedValue({ granted: true });
    read.listAdminInventory.mockResolvedValue([]);
    read.getAdminSkuDetail.mockResolvedValue({
      skuId,
      sellerProfileId: '0191310f-789a-7123-8123-000000000003',
      onHand: 30,
      reserved: 0,
      available: 30,
      version: 3,
      label: 'IN_STOCK',
      audit: [],
      movements: [],
    });
    read.getAdminMovementLedger.mockResolvedValue([]);
    inventory.adminCorrectStock.mockResolvedValue({
      skuId,
      onHand: 30,
      reserved: 0,
      available: 30,
      version: 3,
    });
    useAal2Session();
  });

  it('lists stock pools for an administrator (inventory.audit.view)', async () => {
    const response = await request(server)
      .get('/admin/inventory')
      .set('Authorization', 'Bearer token')
      .expect(200);

    expect(envelopeOf(response).data?.inventory).toEqual([]);
    expect(read.listAdminInventory).toHaveBeenCalledWith(
      expect.objectContaining({ value: adminId }),
    );
  });

  it('reads stock detail + audit records (inventory.audit.view)', async () => {
    const response = await request(server)
      .get(`/admin/inventory/${skuId}`)
      .set('Authorization', 'Bearer token')
      .expect(200);

    expect(envelopeOf(response).data?.inventory).toEqual(
      expect.objectContaining({ skuId, available: 30 }),
    );
  });

  it('reads the movement ledger (inventory.audit.view)', async () => {
    const response = await request(server)
      .get(`/admin/inventory/${skuId}/movements`)
      .set('Authorization', 'Bearer token')
      .expect(200);

    expect(envelopeOf(response).data?.movements).toEqual([]);
  });

  it('applies an administrative correction (inventory.adjust.admin, mandatory reason)', async () => {
    const response = await request(server)
      .post(`/admin/inventory/${skuId}/corrections`)
      .set('Authorization', 'Bearer token')
      .set('Idempotency-Key', 'inv-correct-0000000000000001')
      .send({ targetOnHand: 30, expectedVersion: 2, reasonReference: 'COUNT-CORRECTION-REF' })
      .expect(200);

    expect(envelopeOf(response).data?.inventory).toEqual(
      expect.objectContaining({ skuId, version: 3 }),
    );
    expect(inventory.adminCorrectStock).toHaveBeenCalledWith(
      expect.objectContaining({
        targetOnHand: new InventoryQuantity(30),
        expectedVersion: 2,
        reasonReference: 'COUNT-CORRECTION-REF',
      }),
    );
  });

  it('rejects an admin read without the inventory.audit.view grant', async () => {
    authorization.authorize.mockResolvedValue({ granted: false });
    const response = await request(server)
      .get('/admin/inventory')
      .set('Authorization', 'Bearer token')
      .expect(403);
    expect(envelopeOf(response).message).toBe('AUTHORIZATION_DENIED');
  });

  it('rejects a correction without the inventory.adjust.admin grant (no role bypass)', async () => {
    authorization.authorize.mockResolvedValue({ granted: false });
    await request(server)
      .post(`/admin/inventory/${skuId}/corrections`)
      .set('Authorization', 'Bearer token')
      .set('Idempotency-Key', 'inv-correct-0000000000000002')
      .send({ targetOnHand: 30, expectedVersion: 2, reasonReference: 'REF' })
      .expect(403);
  });

  it('rejects a correction without a mandatory reason (D-08)', async () => {
    await request(server)
      .post(`/admin/inventory/${skuId}/corrections`)
      .set('Authorization', 'Bearer token')
      .set('Idempotency-Key', 'inv-correct-0000000000000003')
      .send({ targetOnHand: 30, expectedVersion: 2 })
      .expect(400);
  });

  it('rejects a correction without an Idempotency-Key (A-11)', async () => {
    const response = await request(server)
      .post(`/admin/inventory/${skuId}/corrections`)
      .set('Authorization', 'Bearer token')
      .send({ targetOnHand: 30, expectedVersion: 2, reasonReference: 'REF' })
      .expect(400);
    expect(envelopeOf(response).message).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('rejects a negative targetOnHand (DTO validation)', async () => {
    await request(server)
      .post(`/admin/inventory/${skuId}/corrections`)
      .set('Authorization', 'Bearer token')
      .set('Idempotency-Key', 'inv-correct-0000000000000004')
      .send({ targetOnHand: -1, expectedVersion: 2, reasonReference: 'REF' })
      .expect(400);
  });

  it('maps a version conflict to 409 INVENTORY_STATE_CONFLICT', async () => {
    inventory.adminCorrectStock.mockRejectedValue(
      new InventoryApplicationError('INVENTORY_STATE_CONFLICT'),
    );
    await request(server)
      .post(`/admin/inventory/${skuId}/corrections`)
      .set('Authorization', 'Bearer token')
      .set('Idempotency-Key', 'inv-correct-0000000000000005')
      .send({ targetOnHand: 30, expectedVersion: 2, reasonReference: 'REF' })
      .expect(409);
  });

  it('maps an admin authorization denial to 403 AUTHORIZATION_DENIED', async () => {
    inventory.adminCorrectStock.mockRejectedValue(
      new InventoryApplicationError('INVENTORY_ADMIN_AUTHORIZATION_DENIED'),
    );
    const response = await request(server)
      .post(`/admin/inventory/${skuId}/corrections`)
      .set('Authorization', 'Bearer token')
      .set('Idempotency-Key', 'inv-correct-0000000000000006')
      .send({ targetOnHand: 30, expectedVersion: 2, reasonReference: 'REF' })
      .expect(403);
    expect(envelopeOf(response).message).toBe('AUTHORIZATION_DENIED');
  });

  it('returns a non-enumerating 404 for an unknown SKU', async () => {
    read.getAdminSkuDetail.mockRejectedValue(new InventoryApplicationError('INVENTORY_NOT_FOUND'));
    const response = await request(server)
      .get(`/admin/inventory/${skuId}`)
      .set('Authorization', 'Bearer token')
      .expect(404);
    expect(envelopeOf(response).message).toBe('INVENTORY_NOT_FOUND');
  });

  it('requires an AAL2 session (401 without authentication)', async () => {
    await request(server).get('/admin/inventory').expect(401);
  });
});
