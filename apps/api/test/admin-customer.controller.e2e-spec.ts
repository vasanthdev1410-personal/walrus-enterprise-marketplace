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
import { AdminCustomerController } from '../src/modules/customer/presentation/admin-customer.controller';
import {
  CUSTOMER_ADMIN_READ_APPLICATION_SERVICE,
  CUSTOMER_LIFECYCLE_APPLICATION_SERVICE,
} from '../src/modules/customer/customer.tokens';

interface AdminCustomerApiEnvelope {
  data?: {
    customers?: unknown[];
    customer?: { state?: string; audit?: unknown[]; transitions?: unknown[] };
    audit?: unknown[];
  };
  message?: string;
}

function envelopeOf(response: request.Response): AdminCustomerApiEnvelope {
  return response.body as AdminCustomerApiEnvelope;
}

const adminIdentityId = '0191310f-789a-7123-8123-000000000001';
const sessionId = '0191310f-789a-7123-8123-000000000002';
const customerProfileId = '0191310f-789a-7123-8123-000000000003';
const auditEventId = '0191310f-789a-7123-8123-000000000004';
const transitionId = '0191310f-789a-7123-8123-000000000005';

describe('Module 06 admin customer API (integration)', () => {
  let application: INestApplication;
  let server: Server;

  const read = {
    listCustomers: jest.fn().mockResolvedValue([
      {
        customerProfileId,
        state: 'ACTIVE',
        version: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]),
    getCustomerDetail: jest.fn().mockResolvedValue({
      customerProfileId,
      identityId: '0191310f-789a-7123-8123-000000000006',
      state: 'ACTIVE',
      version: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      audit: [
        {
          auditEventId,
          eventType: 'CUSTOMER_PROFILE_UPDATED',
          actorIdentityId: adminIdentityId,
          occurredAt: new Date().toISOString(),
        },
      ],
      transitions: [
        {
          transitionId,
          fromState: 'ACTIVE',
          toState: 'ACTIVE',
          stateVersion: 2,
          actorIdentityId: adminIdentityId,
          actorKind: 'ADMIN',
          reasonReference: 'AZR-REF-001',
          transitionedAt: new Date().toISOString(),
        },
      ],
    }),
    getAuditTrail: jest.fn().mockResolvedValue([
      {
        auditEventId,
        eventType: 'CUSTOMER_PROFILE_UPDATED',
        actorIdentityId: adminIdentityId,
        occurredAt: new Date().toISOString(),
      },
    ]),
  };
  const lifecycle = {
    suspendCustomer: jest.fn().mockResolvedValue({
      customerProfileId,
      state: 'SUSPENDED',
      version: 3,
    }),
    reactivateCustomer: jest.fn().mockResolvedValue({
      customerProfileId,
      state: 'ACTIVE',
      version: 4,
    }),
    closeCustomer: jest.fn().mockResolvedValue({
      customerProfileId,
      state: 'CLOSED',
      version: 5,
    }),
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
      controllers: [AdminCustomerController],
      providers: [
        { provide: CUSTOMER_ADMIN_READ_APPLICATION_SERVICE, useValue: read },
        { provide: CUSTOMER_LIFECYCLE_APPLICATION_SERVICE, useValue: lifecycle },
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
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await application.init();
    server = application.getHttpServer() as Server;
  });

  afterAll(async () => {
    await application.close();
  });

  function useAal2Session(): void {
    jwt.verifyAccessToken.mockResolvedValue({
      subject: adminIdentityId,
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
        identityId: { value: adminIdentityId },
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
        identityId: { value: adminIdentityId },
        identityState: 'ACTIVE',
        verificationState: 'VERIFIED',
        lockedUntil: undefined,
      },
    } as never);
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
    read.listCustomers.mockResolvedValue([
      {
        customerProfileId,
        state: 'ACTIVE',
        version: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    read.getCustomerDetail.mockResolvedValue({
      customerProfileId,
      identityId: '0191310f-789a-7123-8123-000000000006',
      state: 'ACTIVE',
      version: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      audit: [
        {
          auditEventId,
          eventType: 'CUSTOMER_PROFILE_UPDATED',
          actorIdentityId: adminIdentityId,
          occurredAt: new Date().toISOString(),
        },
      ],
      transitions: [
        {
          transitionId,
          fromState: 'ACTIVE',
          toState: 'ACTIVE',
          stateVersion: 2,
          actorIdentityId: adminIdentityId,
          actorKind: 'ADMIN',
          reasonReference: 'AZR-REF-001',
          transitionedAt: new Date().toISOString(),
        },
      ],
    });
    read.getAuditTrail.mockResolvedValue([
      {
        auditEventId,
        eventType: 'CUSTOMER_PROFILE_UPDATED',
        actorIdentityId: adminIdentityId,
        occurredAt: new Date().toISOString(),
      },
    ]);
    lifecycle.suspendCustomer.mockResolvedValue({
      customerProfileId,
      state: 'SUSPENDED',
      version: 3,
    });
    lifecycle.reactivateCustomer.mockResolvedValue({
      customerProfileId,
      state: 'ACTIVE',
      version: 4,
    });
    lifecycle.closeCustomer.mockResolvedValue({
      customerProfileId,
      state: 'CLOSED',
      version: 5,
    });
    useAal2Session();
  });

  const AUTH = { Authorization: 'Bearer token' };

  it('lists customers for an admin with customer.read', async () => {
    const response = await request(server).get('/admin/customers').set(AUTH);
    expect(response.status).toBe(200);
    expect(envelopeOf(response).data?.customers).toHaveLength(1);
    expect(read.listCustomers).toHaveBeenCalled();
  });

  it('reads customer detail with audit episodes and transitions', async () => {
    const response = await request(server).get(`/admin/customers/${customerProfileId}`).set(AUTH);
    expect(response.status).toBe(200);
    expect(envelopeOf(response).data?.customer?.audit).toHaveLength(1);
    expect(envelopeOf(response).data?.customer?.transitions).toHaveLength(1);
  });

  it('rejects a malformed customer id as 404 (non-enumerating)', async () => {
    const response = await request(server).get('/admin/customers/not-a-uuid').set(AUTH);
    expect(response.status).toBe(404);
  });

  it('suspends a customer (mandatory reason, version-checked)', async () => {
    const response = await request(server)
      .post(`/admin/customers/${customerProfileId}/lifecycle`)
      .set(AUTH)
      .set('Idempotency-Key', 'test-key-0000000000000000')
      .send({ action: 'SUSPEND', reasonReference: 'AZR-REF-002', expectedVersion: 2 });
    expect(response.status).toBe(200);
    expect(envelopeOf(response).data?.customer?.state).toBe('SUSPENDED');
    expect(lifecycle.suspendCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ reasonReference: 'AZR-REF-002' }),
    );
  });

  it('reactivates a suspended customer', async () => {
    const response = await request(server)
      .post(`/admin/customers/${customerProfileId}/lifecycle`)
      .set(AUTH)
      .set('Idempotency-Key', 'test-key-0000000000000000')
      .send({ action: 'REACTIVATE', reasonReference: 'AZR-REF-003', expectedVersion: 3 });
    expect(response.status).toBe(200);
    expect(envelopeOf(response).data?.customer?.state).toBe('ACTIVE');
  });

  it('closes a customer', async () => {
    const response = await request(server)
      .post(`/admin/customers/${customerProfileId}/lifecycle`)
      .set(AUTH)
      .set('Idempotency-Key', 'test-key-0000000000000000')
      .send({ action: 'CLOSE', reasonReference: 'AZR-REF-004', expectedVersion: 4 });
    expect(response.status).toBe(200);
    expect(envelopeOf(response).data?.customer?.state).toBe('CLOSED');
  });

  it('rejects a lifecycle action without a reason reference (D-02)', async () => {
    const response = await request(server)
      .post(`/admin/customers/${customerProfileId}/lifecycle`)
      .set(AUTH)
      .set('Idempotency-Key', 'test-key-0000000000000000')
      .send({ action: 'SUSPEND', expectedVersion: 2 });
    expect(response.status).toBe(400);
  });

  it('rejects an unknown lifecycle action', async () => {
    const response = await request(server)
      .post(`/admin/customers/${customerProfileId}/lifecycle`)
      .set(AUTH)
      .set('Idempotency-Key', 'test-key-0000000000000000')
      .send({ action: 'PURGE', reasonReference: 'AZR-REF-005', expectedVersion: 2 });
    expect(response.status).toBe(400);
  });

  it('rejects a lifecycle action without an idempotency key', async () => {
    const response = await request(server)
      .post(`/admin/customers/${customerProfileId}/lifecycle`)
      .set(AUTH)
      .send({ action: 'SUSPEND', reasonReference: 'AZR-REF-006', expectedVersion: 2 });
    expect(response.status).toBe(400);
  });

  it('reads the customer audit trail (customer.audit.view)', async () => {
    const response = await request(server)
      .get(`/admin/customers/${customerProfileId}/audit`)
      .set(AUTH);
    expect(response.status).toBe(200);
    expect(envelopeOf(response).data?.audit).toHaveLength(1);
    expect(read.getAuditTrail).toHaveBeenCalled();
  });

  it('denies when the Module 02 engine denies (fail closed)', async () => {
    authorization.authorize.mockResolvedValue({ granted: false });
    const response = await request(server).get('/admin/customers').set(AUTH);
    expect(response.status).toBe(403);
  });
});
