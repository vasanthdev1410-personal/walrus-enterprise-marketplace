import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { TrustedDeviceError } from '../src/modules/identity-authentication/application/errors/trusted-device.error';
import type { ApiIdempotencyService } from '../src/modules/identity-authentication/application/services/api-idempotency.service';
import type { TrustedDeviceManagementApplicationService } from '../src/modules/identity-authentication/application/services/trusted-device-management-application.service';
import type { JwtCryptographicPort } from '../src/modules/identity-authentication/application/ports/jwt-cryptographic.port';
import type { IdentityRepository } from '../src/modules/identity-authentication/domain/identity/repositories/identity-repository';
import type { SessionRepository } from '../src/modules/identity-authentication/domain/session/repositories/session-repository';
import { API_IDEMPOTENCY } from '../src/modules/identity-authentication/identity-authentication.tokens';
import { TrustedDevicesController } from '../src/modules/identity-authentication/presentation/trusted-devices.controller';
import {
  BASIC_AUDIT_LOGGER,
  RATE_LIMITER,
  TRUSTED_DEVICE_MANAGEMENT_APPLICATION_SERVICE,
} from '../src/modules/identity-authentication/presentation/authentication.tokens';
import { AuthoritativeSessionGuard } from '../src/modules/identity-authentication/presentation/guards/authoritative-session.guard';
import { NonProductionRateLimiterGuard } from '../src/modules/identity-authentication/presentation/guards/non-production-rate-limiter.guard';
import { BasicAuditInterceptor } from '../src/modules/identity-authentication/presentation/interceptors/basic-audit.interceptor';
import { JWT_CRYPTOGRAPHY } from '../src/modules/identity-authentication/identity-authentication.tokens';
import {
  IDENTITY_REPOSITORY,
  SESSION_REPOSITORY,
} from '../src/modules/identity-authentication/infrastructure/persistence/prisma/prisma.module';

const identityId = '0191310f-789a-7123-8123-000000000001';
const sessionId = '0191310f-789a-7123-8123-000000000002';
const deviceId = '0191310f-789a-7123-8123-00000000000a';
const otherDeviceId = '0191310f-789a-7123-8123-00000000000b';
const idempotencyKey = 'devices-key-1234567890abcdef';

describe('Module 01 Trusted Devices API (integration)', () => {
  let application: INestApplication;
  let server: Server;

  const listDevices = jest.fn() as jest.MockedFunction<
    TrustedDeviceManagementApplicationService['listDevices']
  >;
  const revokeDevice = jest.fn() as jest.MockedFunction<
    TrustedDeviceManagementApplicationService['revokeDevice']
  >;
  const devicesService = {
    listDevices,
    revokeDevice,
  } as unknown as jest.Mocked<TrustedDeviceManagementApplicationService>;

  const idempotency = {
    execute: jest.fn(async (execution: { execute: () => Promise<unknown> }) => execution.execute()),
  } as unknown as jest.Mocked<ApiIdempotencyService>;

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

  const auditLogger = {
    logEvent: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      controllers: [TrustedDevicesController],
      providers: [
        {
          provide: TRUSTED_DEVICE_MANAGEMENT_APPLICATION_SERVICE,
          useValue: devicesService,
        },
        { provide: API_IDEMPOTENCY, useValue: idempotency },
        { provide: RATE_LIMITER, useValue: rateLimiter },
        { provide: BASIC_AUDIT_LOGGER, useValue: auditLogger },
        { provide: JWT_CRYPTOGRAPHY, useValue: jwt },
        { provide: SESSION_REPOSITORY, useValue: sessions },
        { provide: IDENTITY_REPOSITORY, useValue: identities },
        AuthoritativeSessionGuard,
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
        idleExpiresAt: new Date(Date.now() + 60_000),
        absoluteExpiresAt: new Date(Date.now() + 120_000),
      },
    } as never);
    identities.findById.mockResolvedValue({
      properties: {
        identityId: { value: identityId },
        identityState: 'ACTIVE',
        verificationState: 'VERIFIED',
        lockedUntil: undefined,
      },
    } as never);
  });

  describe('M01-DEV-001 GET /trusted-devices', () => {
    it('lists the identity trusted devices with safe fields only (200)', async () => {
      listDevices.mockResolvedValueOnce([
        {
          properties: {
            trustedDeviceId: { value: deviceId },
            identityId: { value: identityId },
            protectedDeviceFingerprint: { value: 'envelope:device-fingerprint-a' },
            deviceState: 'TRUSTED',
            trustExpiresAt: new Date('2026-02-01T00:00:00.000Z'),
            aggregateVersion: { value: 1 },
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
            lastSeenAt: new Date('2026-01-01T01:00:00.000Z'),
          },
        },
        {
          properties: {
            trustedDeviceId: { value: otherDeviceId },
            identityId: { value: identityId },
            protectedDeviceFingerprint: { value: 'envelope:device-fingerprint-b' },
            deviceState: 'REVOKED',
            trustExpiresAt: new Date('2026-02-01T00:00:00.000Z'),
            aggregateVersion: { value: 2 },
            createdAt: new Date('2025-12-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
            revokedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        },
      ] as never);

      const response = await request(server)
        .get('/trusted-devices')
        .set('Authorization', 'Bearer valid-jwt-token')
        .expect(200);

      const body = response.body as {
        data: {
          devices: readonly Readonly<Record<string, unknown>>[];
          count: number;
        };
      };
      expect(body.data.count).toBe(2);
      expect(body.data.devices[0]).toMatchObject({
        trustedDeviceId: deviceId,
        state: 'TRUSTED',
        currentDevice: false,
        version: 1,
      });
      const deviceReference = (
        body.data.devices[0] as { safeDeviceSummary: { deviceReference: string } }
      ).safeDeviceSummary.deviceReference;
      expect(deviceReference).toMatch(/^[0-9a-f]{12}$/);
      // The protected fingerprint and any raw secret are never exposed.
      expect(JSON.stringify(body.data)).not.toContain('device-fingerprint');
      expect(response.headers['cache-control']).toBe('no-store');
      const listCommand = listDevices.mock.calls[0]?.[0];
      expect(listCommand?.identityId.value).toBe(identityId);
    });

    it('returns 401 when the access token is missing', async () => {
      await request(server).get('/trusted-devices').expect(401);
    });
  });

  describe('M01-DEV-002 DELETE /trusted-devices/:trustedDeviceId', () => {
    it('revokes one owned trusted device (204)', async () => {
      revokeDevice.mockResolvedValueOnce(undefined);

      const response = await request(server)
        .delete(`/trusted-devices/${deviceId}`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"trusted-device:${deviceId}:v1"`)
        .expect(204);

      const revokeCommand = revokeDevice.mock.calls[0]?.[0];
      expect(revokeCommand?.identityId.value).toBe(identityId);
      expect(revokeCommand?.trustedDeviceId.value).toBe(deviceId);
      expect(revokeCommand?.expectedDeviceVersion).toBe(1);
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('returns 400 when the Idempotency-Key is missing', async () => {
      await request(server)
        .delete(`/trusted-devices/${deviceId}`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('If-Match', `"trusted-device:${deviceId}:v1"`)
        .expect(400);
    });

    it('returns 400 when the If-Match precondition is missing', async () => {
      await request(server)
        .delete(`/trusted-devices/${deviceId}`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .expect(400);
    });

    it('returns 404 RESOURCE_NOT_AVAILABLE for an unknown or foreign device', async () => {
      revokeDevice.mockRejectedValueOnce(new TrustedDeviceError('RESOURCE_NOT_AVAILABLE'));
      await request(server)
        .delete(`/trusted-devices/${otherDeviceId}`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"trusted-device:${otherDeviceId}:v1"`)
        .expect(404);
    });

    it('returns 412 RESOURCE_STATE_CONFLICT for a stale version precondition', async () => {
      revokeDevice.mockRejectedValueOnce(new TrustedDeviceError('RESOURCE_STATE_CONFLICT'));
      await request(server)
        .delete(`/trusted-devices/${deviceId}`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"trusted-device:${deviceId}:v1"`)
        .expect(412);
    });

    it('answers a malformed locator uniformly with 404', async () => {
      await request(server)
        .delete('/trusted-devices/not-a-uuid')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', '"trusted-device:not-a-uuid:v1"')
        .expect(404);
    });
  });
});
