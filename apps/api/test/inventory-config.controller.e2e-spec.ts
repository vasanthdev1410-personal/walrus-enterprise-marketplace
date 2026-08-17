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
import { INVENTORY_CONFIG_APPLICATION_SERVICE } from '../src/modules/inventory/inventory.tokens';
import { InventoryConfigController } from '../src/modules/inventory/presentation/inventory-config.controller';
import { UuidV7 } from '../src/modules/identity-authentication/domain/shared/value-objects/uuid-v7';
import { InventoryThresholdConfig } from '../src/modules/inventory/domain/value-objects/inventory-threshold-config';

interface ConfigApiEnvelope {
  data?: {
    config?: {
      lowStockThreshold?: number;
      outOfStockThreshold?: number;
      version?: number;
    };
  };
  message?: string;
}

function envelopeOf(response: request.Response): ConfigApiEnvelope {
  return response.body as ConfigApiEnvelope;
}

const adminId = '0191310f-789a-7123-8123-000000000001';
const sessionId = '0191310f-789a-7123-8123-000000000002';

const CONFIG = new InventoryThresholdConfig({ lowStockThreshold: 1, outOfStockThreshold: 0 });

describe('Module 05 inventory-config API (integration)', () => {
  let application: INestApplication;
  let server: Server;

  const config = {
    getThresholdConfig: jest.fn().mockResolvedValue({ config: CONFIG, version: 0 }),
    updateThresholdConfig: jest.fn().mockResolvedValue({ config: CONFIG, version: 1 }),
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
      controllers: [InventoryConfigController],
      providers: [
        { provide: INVENTORY_CONFIG_APPLICATION_SERVICE, useValue: config },
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
    config.getThresholdConfig.mockResolvedValue({ config: CONFIG, version: 0 });
    config.updateThresholdConfig.mockResolvedValue({ config: CONFIG, version: 1 });
    useAal2Session();
  });

  it('reads the D-14 thresholds (inventory.audit.view)', async () => {
    const response = await request(server)
      .get('/admin/inventory-config')
      .set('Authorization', 'Bearer token')
      .expect(200);

    expect(envelopeOf(response).data?.config).toEqual({
      lowStockThreshold: 1,
      outOfStockThreshold: 0,
      version: 0,
    });
  });

  it('updates the D-14 thresholds (inventory.adjust.admin, version-checked)', async () => {
    const response = await request(server)
      .patch('/admin/inventory-config')
      .set('Authorization', 'Bearer token')
      .set('Idempotency-Key', 'inv-config-0000000000000001')
      .send({ lowStockThreshold: 3, outOfStockThreshold: 2, expectedVersion: 0 })
      .expect(200);

    expect(envelopeOf(response).data?.config).toEqual({
      lowStockThreshold: 1,
      outOfStockThreshold: 0,
      version: 1,
    });
    expect(config.updateThresholdConfig).toHaveBeenCalledWith({
      actorIdentityId: new UuidV7(adminId),
      lowStockThreshold: 3,
      outOfStockThreshold: 2,
      expectedVersion: 0,
      idempotencyKey: 'inv-config-0000000000000001',
    });
  });

  it('denies a config read without the inventory.audit.view grant', async () => {
    authorization.authorize.mockResolvedValue({ granted: false });
    const response = await request(server)
      .get('/admin/inventory-config')
      .set('Authorization', 'Bearer token')
      .expect(403);
    expect(envelopeOf(response).message).toBe('AUTHORIZATION_DENIED');
  });

  it('denies a config update without the inventory.adjust.admin grant', async () => {
    authorization.authorize.mockResolvedValue({ granted: false });
    await request(server)
      .patch('/admin/inventory-config')
      .set('Authorization', 'Bearer token')
      .set('Idempotency-Key', 'inv-config-0000000000000002')
      .send({ lowStockThreshold: 3, outOfStockThreshold: 2, expectedVersion: 0 })
      .expect(403);
  });

  it('rejects invalid thresholds (out-of-stock exceeding low-stock, D-14)', async () => {
    await request(server)
      .patch('/admin/inventory-config')
      .set('Authorization', 'Bearer token')
      .set('Idempotency-Key', 'inv-config-0000000000000003')
      .send({ lowStockThreshold: 1, outOfStockThreshold: 5, expectedVersion: 0 })
      .expect(400);
  });

  it('rejects a negative threshold (DTO validation)', async () => {
    await request(server)
      .patch('/admin/inventory-config')
      .set('Authorization', 'Bearer token')
      .set('Idempotency-Key', 'inv-config-0000000000000004')
      .send({ lowStockThreshold: -1, outOfStockThreshold: 0, expectedVersion: 0 })
      .expect(400);
  });

  it('rejects an update without an Idempotency-Key (A-11)', async () => {
    const response = await request(server)
      .patch('/admin/inventory-config')
      .set('Authorization', 'Bearer token')
      .send({ lowStockThreshold: 3, outOfStockThreshold: 2, expectedVersion: 0 })
      .expect(400);
    expect(envelopeOf(response).message).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('maps a version conflict to 409 INVENTORY_STATE_CONFLICT', async () => {
    config.updateThresholdConfig.mockRejectedValue(
      new InventoryApplicationError('INVENTORY_STATE_CONFLICT'),
    );
    await request(server)
      .patch('/admin/inventory-config')
      .set('Authorization', 'Bearer token')
      .set('Idempotency-Key', 'inv-config-0000000000000005')
      .send({ lowStockThreshold: 3, outOfStockThreshold: 2, expectedVersion: 0 })
      .expect(409);
  });

  it('fails closed when no valid configuration is available', async () => {
    config.getThresholdConfig.mockRejectedValue(
      new InventoryApplicationError('INVENTORY_THRESHOLD_CONFIG_UNAVAILABLE'),
    );
    await request(server)
      .get('/admin/inventory-config')
      .set('Authorization', 'Bearer token')
      .expect(400);
  });

  it('requires an AAL2 session (401 without authentication)', async () => {
    await request(server).get('/admin/inventory-config').expect(401);
  });
});
