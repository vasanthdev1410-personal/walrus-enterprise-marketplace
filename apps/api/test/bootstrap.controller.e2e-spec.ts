import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { DirectMtlsIngressService } from '../src/modules/authorization/infrastructure/trusted-workload/direct-mtls-ingress.service';
import { SignedBoundaryEvidenceService } from '../src/modules/authorization/infrastructure/trusted-workload/signed-boundary-evidence.service';
import { ProvisioningError } from '../src/modules/identity-authentication/application/errors/provisioning.error';
import type { ApiIdempotencyService } from '../src/modules/identity-authentication/application/services/api-idempotency.service';
import type { PrivilegedProvisioningApplicationService } from '../src/modules/identity-authentication/application/services/privileged-provisioning-application.service';
import { API_IDEMPOTENCY } from '../src/modules/identity-authentication/identity-authentication.tokens';
import { BootstrapController } from '../src/modules/identity-authentication/presentation/bootstrap.controller';
import {
  BASIC_AUDIT_LOGGER,
  PRIVILEGED_PROVISIONING_APPLICATION_SERVICE,
  RATE_LIMITER,
} from '../src/modules/identity-authentication/presentation/authentication.tokens';
import { NonProductionRateLimiterGuard } from '../src/modules/identity-authentication/presentation/guards/non-production-rate-limiter.guard';
import { BasicAuditInterceptor } from '../src/modules/identity-authentication/presentation/interceptors/basic-audit.interceptor';

const idempotencyKey = 'bootstrap-key-1234567890abcdef';

describe('Module 01 Bootstrap API (integration)', () => {
  let application: INestApplication;
  let server: Server;

  const bootstrapSuperAdminIdentity = jest.fn() as jest.MockedFunction<
    PrivilegedProvisioningApplicationService['bootstrapSuperAdminIdentity']
  >;
  const provisioning = {
    bootstrapSuperAdminIdentity,
  } as unknown as jest.Mocked<PrivilegedProvisioningApplicationService>;

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
      controllers: [BootstrapController],
      providers: [
        {
          provide: DirectMtlsIngressService,
          useValue: {
            verify: jest.fn().mockResolvedValue({
              subject: 'urn:walrus:service:bootstrap-orchestrator',
              environment: 'development',
              operationId: '0191310f-789a-7123-8123-0000000000dd',
              verificationReference: 'wiv:test',
              requestDigest: 'digest',
              expiresAt: new Date(Date.now() + 60_000),
            }),
          },
        },
        {
          provide: SignedBoundaryEvidenceService,
          useValue: { verifyBootstrap: jest.fn().mockResolvedValue('verified-bsv1-digest') },
        },
        { provide: PRIVILEGED_PROVISIONING_APPLICATION_SERVICE, useValue: provisioning },
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

  describe('M01-ADM-002 POST /bootstrap/super-admin-identity', () => {
    it('bootstraps the super-admin identity when the controlled bootstrap is available (201)', async () => {
      bootstrapSuperAdminIdentity.mockResolvedValueOnce({
        identityId: '0191310f-789a-7123-8123-0000000000bb',
        bootstrapState: 'PENDING_VERIFICATION',
      });

      const response = await request(server)
        .post('/bootstrap/super-admin-identity')
        .set('Idempotency-Key', idempotencyKey)
        .set('Walrus-Bootstrap-Assertion', 'test-bsv1')
        .send({
          bootstrapEvidence: 'M01-BOOTSTRAP-EVIDENCE-1',
          identifierType: 'EMAIL',
          identifier: 'superadmin@example.com',
        })
        .expect(201);

      const body = response.body as { data: Readonly<Record<string, unknown>> };
      expect(body.data).toEqual({
        identityId: '0191310f-789a-7123-8123-0000000000bb',
        bootstrapState: 'PENDING_VERIFICATION',
      });
      expect(response.headers['cache-control']).toBe('no-store');
      const command = bootstrapSuperAdminIdentity.mock.calls[0]?.[0];
      expect(command?.bootstrapEvidence).toBe('M01-BOOTSTRAP-EVIDENCE-1');
      expect(command?.identifierType).toBe('EMAIL');
      // No Module 02 role is ever returned.
      expect(Object.keys(body.data)).not.toContain('role');
    });

    it('returns 404 BOOTSTRAP_UNAVAILABLE when no controlled bootstrap is approved', async () => {
      bootstrapSuperAdminIdentity.mockRejectedValueOnce(
        new ProvisioningError('BOOTSTRAP_UNAVAILABLE'),
      );
      await request(server)
        .post('/bootstrap/super-admin-identity')
        .set('Idempotency-Key', idempotencyKey)
        .set('Walrus-Bootstrap-Assertion', 'test-bsv1')
        .send({
          bootstrapEvidence: 'M01-BOOTSTRAP-EVIDENCE-2',
          identifierType: 'EMAIL',
          identifier: 'superadmin@example.com',
        })
        .expect(404);
    });

    it('returns 409 IDENTIFIER_ALREADY_REGISTERED for an existing identifier', async () => {
      bootstrapSuperAdminIdentity.mockRejectedValueOnce(
        new ProvisioningError('IDENTIFIER_ALREADY_REGISTERED'),
      );
      await request(server)
        .post('/bootstrap/super-admin-identity')
        .set('Idempotency-Key', idempotencyKey)
        .set('Walrus-Bootstrap-Assertion', 'test-bsv1')
        .send({
          bootstrapEvidence: 'M01-BOOTSTRAP-EVIDENCE-3',
          identifierType: 'EMAIL',
          identifier: 'superadmin@example.com',
        })
        .expect(409);
    });

    it('rejects an unknown classification field with 400 (classification is server-fixed)', async () => {
      await request(server)
        .post('/bootstrap/super-admin-identity')
        .set('Idempotency-Key', idempotencyKey)
        .set('Walrus-Bootstrap-Assertion', 'test-bsv1')
        .send({
          bootstrapEvidence: 'M01-BOOTSTRAP-EVIDENCE-4',
          identifierType: 'EMAIL',
          identifier: 'superadmin@example.com',
          targetAuthenticationSecurityClassification: 'SUPER_ADMIN_AUTHENTICATION',
        })
        .expect(400);
      expect(bootstrapSuperAdminIdentity).not.toHaveBeenCalled();
    });

    it('returns 400 when the Idempotency-Key is missing', async () => {
      await request(server)
        .post('/bootstrap/super-admin-identity')
        .send({
          bootstrapEvidence: 'M01-BOOTSTRAP-EVIDENCE-5',
          identifierType: 'EMAIL',
          identifier: 'superadmin@example.com',
        })
        .expect(400);
    });

    it('returns 400 IDENTIFIER_INVALID when canonicalization fails', async () => {
      bootstrapSuperAdminIdentity.mockRejectedValueOnce(
        new ProvisioningError('IDENTIFIER_INVALID'),
      );
      await request(server)
        .post('/bootstrap/super-admin-identity')
        .set('Idempotency-Key', idempotencyKey)
        .set('Walrus-Bootstrap-Assertion', 'test-bsv1')
        .send({
          bootstrapEvidence: 'M01-BOOTSTRAP-EVIDENCE-6',
          identifierType: 'EMAIL',
          identifier: 'not-an-email',
        })
        .expect(400);
    });
  });
});
