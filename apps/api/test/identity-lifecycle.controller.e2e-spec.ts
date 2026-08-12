import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { ClassificationTransitionError } from '../src/modules/identity-authentication/application/errors/classification-transition.error';
import { IdentityLifecycleError } from '../src/modules/identity-authentication/application/errors/identity-lifecycle.error';
import { ProvisioningError } from '../src/modules/identity-authentication/application/errors/provisioning.error';
import type { ApiIdempotencyService } from '../src/modules/identity-authentication/application/services/api-idempotency.service';
import type { ClassificationTransitionApplicationService } from '../src/modules/identity-authentication/application/services/classification-transition-application.service';
import type { IdentityLifecycleApplicationService } from '../src/modules/identity-authentication/application/services/identity-lifecycle-application.service';
import type { PrivilegedProvisioningApplicationService } from '../src/modules/identity-authentication/application/services/privileged-provisioning-application.service';
import type { JwtCryptographicPort } from '../src/modules/identity-authentication/application/ports/jwt-cryptographic.port';
import type { IdentityRepository } from '../src/modules/identity-authentication/domain/identity/repositories/identity-repository';
import type { SessionRepository } from '../src/modules/identity-authentication/domain/session/repositories/session-repository';
import { API_IDEMPOTENCY } from '../src/modules/identity-authentication/identity-authentication.tokens';
import { IdentityLifecycleController } from '../src/modules/identity-authentication/presentation/identity-lifecycle.controller';
import { InternalIdentityController } from '../src/modules/identity-authentication/presentation/internal-identity.controller';
import {
  BASIC_AUDIT_LOGGER,
  CLASSIFICATION_TRANSITION_APPLICATION_SERVICE,
  IDENTITY_LIFECYCLE_APPLICATION_SERVICE,
  PRIVILEGED_PROVISIONING_APPLICATION_SERVICE,
  RATE_LIMITER,
} from '../src/modules/identity-authentication/presentation/authentication.tokens';
import { AuthoritativeSessionGuard } from '../src/modules/identity-authentication/presentation/guards/authoritative-session.guard';
import { Aal2SessionGuard } from '../src/modules/identity-authentication/presentation/guards/aal2-session.guard';
import { NonProductionRateLimiterGuard } from '../src/modules/identity-authentication/presentation/guards/non-production-rate-limiter.guard';
import { BasicAuditInterceptor } from '../src/modules/identity-authentication/presentation/interceptors/basic-audit.interceptor';
import { JWT_CRYPTOGRAPHY } from '../src/modules/identity-authentication/identity-authentication.tokens';
import {
  IDENTITY_REPOSITORY,
  SESSION_REPOSITORY,
} from '../src/modules/identity-authentication/infrastructure/persistence/prisma/prisma.module';
import { DirectMtlsIngressService } from '../src/modules/authorization/infrastructure/trusted-workload/direct-mtls-ingress.service';
import { SignedBoundaryEvidenceService } from '../src/modules/authorization/infrastructure/trusted-workload/signed-boundary-evidence.service';

const identityId = '0191310f-789a-7123-8123-000000000001';
const sessionId = '0191310f-789a-7123-8123-000000000003';
const idempotencyKey = 'identity-key-1234567890abcdef';

describe('Module 01 Identity Lifecycle API (integration)', () => {
  let application: INestApplication;
  let server: Server;

  const readAuthenticationState = jest.fn() as jest.MockedFunction<
    IdentityLifecycleApplicationService['readAuthenticationState']
  >;
  const changeIdentityState = jest.fn() as jest.MockedFunction<
    IdentityLifecycleApplicationService['changeIdentityState']
  >;
  const transitionClassification = jest.fn() as jest.MockedFunction<
    ClassificationTransitionApplicationService['transitionClassification']
  >;
  const classificationService = {
    transitionClassification,
  } as unknown as jest.Mocked<ClassificationTransitionApplicationService>;

  const provisionPrivilegedIdentity = jest.fn() as jest.MockedFunction<
    PrivilegedProvisioningApplicationService['provisionPrivilegedIdentity']
  >;
  const provisioningService = {
    provisionPrivilegedIdentity,
  } as unknown as jest.Mocked<PrivilegedProvisioningApplicationService>;

  const lifecycleService = {
    readAuthenticationState,
    changeIdentityState,
  } as unknown as jest.Mocked<IdentityLifecycleApplicationService>;

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
  const trustedIngress = {
    verify: jest.fn().mockResolvedValue({
      subject: 'urn:walrus:service:test',
      environment: 'development',
      operationId: '0191310f-789a-7123-8123-0000000000dd',
      verificationReference: 'wiv:test',
      requestDigest: 'digest',
      expiresAt: new Date(Date.now() + 60_000),
    }),
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      controllers: [IdentityLifecycleController, InternalIdentityController],
      providers: [
        { provide: IDENTITY_LIFECYCLE_APPLICATION_SERVICE, useValue: lifecycleService },
        {
          provide: CLASSIFICATION_TRANSITION_APPLICATION_SERVICE,
          useValue: classificationService,
        },
        {
          provide: PRIVILEGED_PROVISIONING_APPLICATION_SERVICE,
          useValue: provisioningService,
        },
        { provide: API_IDEMPOTENCY, useValue: idempotency },
        { provide: RATE_LIMITER, useValue: rateLimiter },
        { provide: BASIC_AUDIT_LOGGER, useValue: auditLogger },
        { provide: JWT_CRYPTOGRAPHY, useValue: jwt },
        { provide: SESSION_REPOSITORY, useValue: sessions },
        { provide: IDENTITY_REPOSITORY, useValue: identities },
        { provide: DirectMtlsIngressService, useValue: trustedIngress },
        {
          provide: SignedBoundaryEvidenceService,
          useValue: { verifyProvisioning: jest.fn().mockResolvedValue('verified-prv1-digest') },
        },
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
      subject: identityId,
      sessionId,
      jwtId: 'jwt',
      issuer: 'issuer',
      audience: 'audience',
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      authenticationMethods: ['PASSWORD', 'TOTP'],
      authenticationAssurance: 'AAL2',
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
        authenticationAssurance: 'AAL2',
        mfaVerifiedAt: new Date(),
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

  describe('M01-ID-001 GET /identity/authentication-state', () => {
    it('reads the authentication state with approved fields only (200)', async () => {
      readAuthenticationState.mockResolvedValueOnce({
        identityId,
        identityState: 'ACTIVE',
        verificationState: 'VERIFIED',
        authenticationSecurityClassification: 'STANDARD_AUTHENTICATION',
        mfaState: 'NOT_ENROLLED',
        deletionState: 'NONE',
        version: 3,
      });

      const response = await request(server)
        .get('/identity/authentication-state')
        .set('Authorization', 'Bearer valid-jwt-token')
        .expect(200);

      const body = response.body as { data: { state: Readonly<Record<string, unknown>> } };
      expect(body.data.state).toMatchObject({
        identityId,
        identityState: 'ACTIVE',
        verificationState: 'VERIFIED',
        mfaState: 'NOT_ENROLLED',
        version: 3,
      });
      expect(response.headers['cache-control']).toBe('no-store');
      const command = readAuthenticationState.mock.calls[0]?.[0];
      expect(command?.identityId.value).toBe(identityId);
    });

    it('returns 401 when the access token is missing', async () => {
      await request(server).get('/identity/authentication-state').expect(401);
    });
  });

  describe('M01-ID-004 POST /internal/identities/:identityId/state-transitions', () => {
    it('transitions the identity state when authorized (200)', async () => {
      changeIdentityState.mockResolvedValueOnce({
        identityId,
        identityState: 'LOCKED',
        version: 4,
      });

      const response = await request(server)
        .post(`/internal/identities/${identityId}/state-transitions`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('Walrus-Provisioning-Assertion', 'test-prv1')
        .set('If-Match', `"identity:${identityId}:v3"`)
        .send({
          targetIdentityState: 'LOCKED',
          reasonCode: 'SECURITY_CONTROL',
          sourceContractReference: 'M02-CONTRACT-REF-1',
        })
        .expect(200);

      const body = response.body as { data: Readonly<Record<string, unknown>> };
      expect(body.data).toEqual({
        identityId,
        identityState: 'LOCKED',
        version: 4,
      });
      expect(response.headers['cache-control']).toBe('no-store');
      const command = changeIdentityState.mock.calls[0]?.[0];
      expect(command?.targetIdentityId.value).toBe(identityId);
      expect(command?.targetIdentityState).toBe('LOCKED');
      expect(command?.expectedIdentityVersion).toBe(3);
      expect(command?.actorIdentityId.value).toBe(identityId);
    });

    it('returns 403 AUTHORIZATION_DENIED when Module 02 refuses', async () => {
      changeIdentityState.mockRejectedValueOnce(new IdentityLifecycleError('AUTHORIZATION_DENIED'));
      await request(server)
        .post(`/internal/identities/${identityId}/state-transitions`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"identity:${identityId}:v3"`)
        .send({
          targetIdentityState: 'LOCKED',
          reasonCode: 'SECURITY_CONTROL',
          sourceContractReference: 'M02-CONTRACT-REF-2',
        })
        .expect(403);
    });

    it('returns 412 RESOURCE_STATE_CONFLICT for a stale version precondition', async () => {
      changeIdentityState.mockRejectedValueOnce(
        new IdentityLifecycleError('RESOURCE_STATE_CONFLICT'),
      );
      await request(server)
        .post(`/internal/identities/${identityId}/state-transitions`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"identity:${identityId}:v3"`)
        .send({
          targetIdentityState: 'LOCKED',
          reasonCode: 'SECURITY_CONTROL',
          sourceContractReference: 'M02-CONTRACT-REF-3',
        })
        .expect(412);
    });

    it('rejects DELETED as a target state (privacy-gated) with 400', async () => {
      await request(server)
        .post(`/internal/identities/${identityId}/state-transitions`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"identity:${identityId}:v3"`)
        .send({
          targetIdentityState: 'DELETED',
          reasonCode: 'PRIVACY_REQUEST',
          sourceContractReference: 'M02-CONTRACT-REF-4',
        })
        .expect(400);
      expect(changeIdentityState).not.toHaveBeenCalled();
    });

    it('returns 400 when the Idempotency-Key is missing', async () => {
      await request(server)
        .post(`/internal/identities/${identityId}/state-transitions`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('If-Match', `"identity:${identityId}:v3"`)
        .send({
          targetIdentityState: 'LOCKED',
          reasonCode: 'SECURITY_CONTROL',
          sourceContractReference: 'M02-CONTRACT-REF-5',
        })
        .expect(400);
    });

    it('answers a malformed locator uniformly with 404', async () => {
      await request(server)
        .post('/internal/identities/not-a-uuid/state-transitions')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', '"identity:not-a-uuid:v3"')
        .send({
          targetIdentityState: 'LOCKED',
          reasonCode: 'SECURITY_CONTROL',
          sourceContractReference: 'M02-CONTRACT-REF-6',
        })
        .expect(404);
    });
  });

  describe('M01-CLS-001 POST /internal/identities/:identityId/authentication-classification-transitions', () => {
    it('transitions the classification when the coordination contract is valid (200)', async () => {
      transitionClassification.mockResolvedValueOnce({
        identityId,
        authenticationSecurityClassification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
        version: 4,
      });

      const response = await request(server)
        .post(`/internal/identities/${identityId}/authentication-classification-transitions`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"identity:${identityId}:v3"`)
        .send({
          targetAuthenticationSecurityClassification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
          reasonCode: 'ADMIN_PROVISIONED',
          sourceContractReference: 'M02-CONTRACT-CLS-1',
        })
        .expect(200);

      const body = response.body as { data: Readonly<Record<string, unknown>> };
      expect(body.data).toEqual({
        identityId,
        authenticationSecurityClassification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
        version: 4,
      });
      expect(response.headers['cache-control']).toBe('no-store');
      const command = transitionClassification.mock.calls[0]?.[0];
      expect(command?.targetIdentityId.value).toBe(identityId);
      expect(command?.targetAuthenticationSecurityClassification).toBe(
        'PRIVILEGED_ADMIN_AUTHENTICATION',
      );
      expect(command?.expectedIdentityVersion).toBe(3);
    });

    it('returns 400 CONTRACT_INVALID when the coordination contract is not approved', async () => {
      transitionClassification.mockRejectedValueOnce(
        new ClassificationTransitionError('CONTRACT_INVALID'),
      );
      await request(server)
        .post(`/internal/identities/${identityId}/authentication-classification-transitions`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"identity:${identityId}:v3"`)
        .send({
          targetAuthenticationSecurityClassification: 'SUPER_ADMIN_AUTHENTICATION',
          reasonCode: 'BOOTSTRAP',
          sourceContractReference: 'M02-CONTRACT-CLS-2',
        })
        .expect(400);
    });

    it('returns 412 RESOURCE_STATE_CONFLICT for a stale version precondition', async () => {
      transitionClassification.mockRejectedValueOnce(
        new ClassificationTransitionError('RESOURCE_STATE_CONFLICT'),
      );
      await request(server)
        .post(`/internal/identities/${identityId}/authentication-classification-transitions`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('If-Match', `"identity:${identityId}:v3"`)
        .send({
          targetAuthenticationSecurityClassification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
          reasonCode: 'ADMIN_PROVISIONED',
          sourceContractReference: 'M02-CONTRACT-CLS-3',
        })
        .expect(412);
    });

    it('returns 400 when the Idempotency-Key is missing', async () => {
      await request(server)
        .post(`/internal/identities/${identityId}/authentication-classification-transitions`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('If-Match', `"identity:${identityId}:v3"`)
        .send({
          targetAuthenticationSecurityClassification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
          reasonCode: 'ADMIN_PROVISIONED',
          sourceContractReference: 'M02-CONTRACT-CLS-4',
        })
        .expect(400);
    });
  });

  describe('M01-ADM-001 POST /internal/identities/provisioning', () => {
    it('provisions a privileged identity when authorized (202)', async () => {
      provisionPrivilegedIdentity.mockResolvedValueOnce({
        operationId: '0191310f-789a-7123-8123-0000000000aa',
        state: 'PENDING_VERIFICATION',
      });

      const response = await request(server)
        .post('/internal/identities/provisioning')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('Walrus-Provisioning-Assertion', 'test-prv1')
        .send({
          provisioningReference: 'M02-PROVISIONING-REF-1',
          identifierType: 'EMAIL',
          identifier: 'admin@example.com',
          targetAuthenticationSecurityClassification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
        })
        .expect(202);

      const body = response.body as { data: Readonly<Record<string, unknown>> };
      expect(body.data).toEqual({
        operationId: '0191310f-789a-7123-8123-0000000000aa',
        state: 'PENDING_VERIFICATION',
      });
      expect(response.headers['cache-control']).toBe('no-store');
      const command = provisionPrivilegedIdentity.mock.calls[0]?.[0];
      expect(command?.workload?.subject).toBe('urn:walrus:service:test');
      expect(command?.provisioningReference).toBe('M02-PROVISIONING-REF-1');
      expect(command?.targetAuthenticationSecurityClassification).toBe(
        'PRIVILEGED_ADMIN_AUTHENTICATION',
      );
    });

    it('returns 403 AUTHORIZATION_DENIED when the service boundary refuses', async () => {
      provisionPrivilegedIdentity.mockRejectedValueOnce(
        new ProvisioningError('AUTHORIZATION_DENIED'),
      );
      await request(server)
        .post('/internal/identities/provisioning')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('Walrus-Provisioning-Assertion', 'test-prv1')
        .send({
          provisioningReference: 'M02-PROVISIONING-REF-2',
          identifierType: 'EMAIL',
          identifier: 'admin@example.com',
          targetAuthenticationSecurityClassification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
        })
        .expect(403);
    });

    it('returns 400 when the SUPER_ADMIN classification is requested (hidden super-admin prevented)', async () => {
      await request(server)
        .post('/internal/identities/provisioning')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('Walrus-Provisioning-Assertion', 'test-prv1')
        .send({
          provisioningReference: 'M02-PROVISIONING-REF-3',
          identifierType: 'EMAIL',
          identifier: 'admin@example.com',
          targetAuthenticationSecurityClassification: 'SUPER_ADMIN_AUTHENTICATION',
        })
        .expect(400);
      expect(provisionPrivilegedIdentity).not.toHaveBeenCalled();
    });

    it('returns 409 IDENTIFIER_ALREADY_REGISTERED for an existing identifier', async () => {
      provisionPrivilegedIdentity.mockRejectedValueOnce(
        new ProvisioningError('IDENTIFIER_ALREADY_REGISTERED'),
      );
      await request(server)
        .post('/internal/identities/provisioning')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .set('Walrus-Provisioning-Assertion', 'test-prv1')
        .send({
          provisioningReference: 'M02-PROVISIONING-REF-4',
          identifierType: 'EMAIL',
          identifier: 'admin@example.com',
          targetAuthenticationSecurityClassification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
        })
        .expect(409);
    });

    it('does not use a public bearer token as workload authority', async () => {
      provisionPrivilegedIdentity.mockRejectedValueOnce(
        new ProvisioningError('AUTHORIZATION_DENIED'),
      );
      await request(server)
        .post('/internal/identities/provisioning')
        .set('Idempotency-Key', idempotencyKey)
        .set('Walrus-Provisioning-Assertion', 'test-prv1')
        .send({
          provisioningReference: 'M02-PROVISIONING-REF-5',
          identifierType: 'EMAIL',
          identifier: 'admin@example.com',
          targetAuthenticationSecurityClassification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
        })
        .expect(403);
    });

    it('returns 400 when the Idempotency-Key is missing', async () => {
      await request(server)
        .post('/internal/identities/provisioning')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send({
          provisioningReference: 'M02-PROVISIONING-REF-6',
          identifierType: 'EMAIL',
          identifier: 'admin@example.com',
          targetAuthenticationSecurityClassification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
        })
        .expect(400);
    });
  });
});
