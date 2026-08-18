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
import { CustomerSelfServiceController } from '../src/modules/customer/presentation/customer-self-service.controller';
import { CustomerSelfServicePermissionGuard } from '../src/modules/customer/presentation/guards/customer-self-service-permission.guard';
import {
  CUSTOMER_ADDRESS_APPLICATION_SERVICE,
  CUSTOMER_BUSINESS_PROFILE_APPLICATION_SERVICE,
  CUSTOMER_PREFERENCE_APPLICATION_SERVICE,
  CUSTOMER_PROFILE_APPLICATION_SERVICE,
  CUSTOMER_PROFILE_REPOSITORY,
} from '../src/modules/customer/customer.tokens';

interface CustomerApiEnvelope {
  data?: {
    profile?: { customerProfileId?: string; version?: number };
    addresses?: unknown[];
    removed?: boolean;
    preferences?: { preferenceKey?: string }[];
  };
  message?: string;
}

function envelopeOf(response: request.Response): CustomerApiEnvelope {
  return response.body as CustomerApiEnvelope;
}

/** First argument of the first recorded call (cast at the assertion site). */
function firstCallArg(mock: jest.Mock, argIndex = 0): unknown {
  const calls = mock.mock.calls as unknown as unknown[][];
  return calls[0]?.[argIndex];
}

const identityId = '0191310f-789a-7123-8123-000000000001';
const sessionId = '0191310f-789a-7123-8123-000000000002';
const customerProfileId = '0191310f-789a-7123-8123-000000000003';
const addressId = '0191310f-789a-7123-8123-000000000004';

describe('Module 06 customer self-service API (integration)', () => {
  let application: INestApplication;
  let server: Server;

  const profile = {
    getOwnProfileByReference: jest.fn().mockResolvedValue({
      customerProfileId,
      state: 'ACTIVE',
      version: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    updateProfile: jest.fn().mockResolvedValue({
      customerProfileId,
      state: 'ACTIVE',
      version: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  };
  const addresses = {
    listAddresses: jest.fn().mockResolvedValue([
      {
        addressId,
        recipientName: 'Ada Lovelace',
        line1: '1 Analytical Way',
        city: 'London',
        postalCode: 'SW1A 1AA',
        countryCode: 'GB',
        roles: ['SHIPPING'],
        isDefaultShipping: true,
        isDefaultBilling: false,
        state: 'ACTIVE',
      },
    ]),
    addAddress: jest.fn().mockResolvedValue({
      addressId,
      recipientName: 'Ada Lovelace',
      line1: '1 Analytical Way',
      city: 'London',
      postalCode: 'SW1A 1AA',
      countryCode: 'GB',
      roles: ['SHIPPING'],
      isDefaultShipping: false,
      isDefaultBilling: false,
      state: 'ACTIVE',
    }),
    updateAddress: jest.fn().mockResolvedValue({
      addressId,
      recipientName: 'Ada Lovelace',
      line1: '2 Analytical Way',
      city: 'London',
      postalCode: 'SW1A 1AA',
      countryCode: 'GB',
      roles: ['SHIPPING'],
      isDefaultShipping: false,
      isDefaultBilling: false,
      state: 'ACTIVE',
    }),
    setDefaultAddress: jest.fn().mockResolvedValue({
      addressId,
      recipientName: 'Ada Lovelace',
      line1: '1 Analytical Way',
      city: 'London',
      postalCode: 'SW1A 1AA',
      countryCode: 'GB',
      roles: ['SHIPPING'],
      isDefaultShipping: true,
      isDefaultBilling: false,
      state: 'ACTIVE',
    }),
    removeAddress: jest.fn().mockResolvedValue({ removed: true }),
  };
  const business = {
    getBusinessProfile: jest.fn().mockResolvedValue(null),
    createBusinessProfile: jest.fn().mockResolvedValue({
      customerBusinessProfileId: '0191310f-789a-7123-8123-000000000005',
      companyName: 'Analytical Engines Ltd',
      businessType: 'Manufacturer',
    }),
    updateBusinessProfile: jest.fn().mockResolvedValue({
      customerBusinessProfileId: '0191310f-789a-7123-8123-000000000005',
      companyName: 'Analytical Engines Ltd',
      businessType: 'Manufacturer',
    }),
  };
  const preferences = {
    getPreferences: jest.fn().mockResolvedValue([
      {
        preferenceId: '0191310f-789a-7123-8123-000000000006',
        preferenceKey: 'language',
        preferenceValue: 'en',
      },
    ]),
    updatePreference: jest.fn().mockResolvedValue({
      preferenceId: '0191310f-789a-7123-8123-000000000006',
      preferenceKey: 'language',
      preferenceValue: 'en-GB',
    }),
  };

  const authorization = {
    authorize: jest.fn().mockResolvedValue({ granted: true }),
  };
  const customers = {
    findByIdentityId: jest.fn().mockResolvedValue({
      properties: {
        customerProfileId: { value: customerProfileId },
        identityId: { value: identityId },
        state: 'ACTIVE',
        aggregateVersion: { value: 2 },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
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
      controllers: [CustomerSelfServiceController],
      providers: [
        { provide: CUSTOMER_PROFILE_APPLICATION_SERVICE, useValue: profile },
        { provide: CUSTOMER_ADDRESS_APPLICATION_SERVICE, useValue: addresses },
        { provide: CUSTOMER_BUSINESS_PROFILE_APPLICATION_SERVICE, useValue: business },
        { provide: CUSTOMER_PREFERENCE_APPLICATION_SERVICE, useValue: preferences },
        { provide: AUTHORIZATION_APPLICATION_SERVICE, useValue: authorization },
        { provide: CUSTOMER_PROFILE_REPOSITORY, useValue: customers },
        { provide: JWT_CRYPTOGRAPHY, useValue: jwt },
        { provide: SESSION_REPOSITORY, useValue: sessions },
        { provide: IDENTITY_REPOSITORY, useValue: identities },
        { provide: RATE_LIMITER, useValue: rateLimiter },
        AuthoritativeSessionGuard,
        Aal2SessionGuard,
        NonProductionRateLimiterGuard,
        CustomerSelfServicePermissionGuard,
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
    identities.findById.mockResolvedValue({
      properties: {
        identityId: { value: identityId },
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
    customers.findByIdentityId.mockResolvedValue({
      properties: {
        customerProfileId: { value: customerProfileId },
        identityId: { value: identityId },
        state: 'ACTIVE',
        aggregateVersion: { value: 2 },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    profile.getOwnProfileByReference.mockResolvedValue({
      customerProfileId,
      state: 'ACTIVE',
      version: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    profile.updateProfile.mockResolvedValue({
      customerProfileId,
      state: 'ACTIVE',
      version: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    addresses.listAddresses.mockResolvedValue([
      {
        addressId,
        recipientName: 'Ada Lovelace',
        line1: '1 Analytical Way',
        city: 'London',
        postalCode: 'SW1A 1AA',
        countryCode: 'GB',
        roles: ['SHIPPING'],
        isDefaultShipping: true,
        isDefaultBilling: false,
        state: 'ACTIVE',
      },
    ]);
    addresses.addAddress.mockResolvedValue({
      addressId,
      recipientName: 'Ada Lovelace',
      line1: '1 Analytical Way',
      city: 'London',
      postalCode: 'SW1A 1AA',
      countryCode: 'GB',
      roles: ['SHIPPING'],
      isDefaultShipping: false,
      isDefaultBilling: false,
      state: 'ACTIVE',
    });
    addresses.updateAddress.mockResolvedValue({
      addressId,
      recipientName: 'Ada Lovelace',
      line1: '2 Analytical Way',
      city: 'London',
      postalCode: 'SW1A 1AA',
      countryCode: 'GB',
      roles: ['SHIPPING'],
      isDefaultShipping: false,
      isDefaultBilling: false,
      state: 'ACTIVE',
    });
    addresses.setDefaultAddress.mockResolvedValue({
      addressId,
      recipientName: 'Ada Lovelace',
      line1: '1 Analytical Way',
      city: 'London',
      postalCode: 'SW1A 1AA',
      countryCode: 'GB',
      roles: ['SHIPPING'],
      isDefaultShipping: true,
      isDefaultBilling: false,
      state: 'ACTIVE',
    });
    addresses.removeAddress.mockResolvedValue({ removed: true });
    business.getBusinessProfile.mockResolvedValue(null);
    business.createBusinessProfile.mockResolvedValue({
      customerBusinessProfileId: '0191310f-789a-7123-8123-000000000005',
      companyName: 'Analytical Engines Ltd',
      businessType: 'Manufacturer',
    });
    business.updateBusinessProfile.mockResolvedValue({
      customerBusinessProfileId: '0191310f-789a-7123-8123-000000000005',
      companyName: 'Analytical Engines Ltd',
      businessType: 'Manufacturer',
    });
    preferences.getPreferences.mockResolvedValue([
      {
        preferenceId: '0191310f-789a-7123-8123-000000000006',
        preferenceKey: 'language',
        preferenceValue: 'en',
      },
    ]);
    preferences.updatePreference.mockResolvedValue({
      preferenceId: '0191310f-789a-7123-8123-000000000006',
      preferenceKey: 'language',
      preferenceValue: 'en-GB',
    });
    useAal2Session();
  });

  const AUTH = { Authorization: 'Bearer token' };

  it('reads the own profile through the guard chain', async () => {
    const response = await request(server).get('/customer/profile').set(AUTH);
    expect(response.status).toBe(200);
    expect(envelopeOf(response).data?.profile?.customerProfileId).toBe(customerProfileId);
  });

  it('rejects unknown fields (whitelist / mass-assignment protection)', async () => {
    const response = await request(server)
      .patch('/customer/profile')
      .set(AUTH)
      .set('Idempotency-Key', 'test-key-0000000000000000')
      .send({ expectedVersion: 2, state: 'CLOSED', customerProfileId });
    expect(response.status).toBe(400);
  });

  it('updates the profile with a valid idempotency key', async () => {
    const response = await request(server)
      .patch('/customer/profile')
      .set(AUTH)
      .set('Idempotency-Key', 'test-key-0000000000000000')
      .send({ expectedVersion: 2 });
    expect(response.status).toBe(200);
    expect(envelopeOf(response).data?.profile?.version).toBe(3);
  });

  it('rejects a missing idempotency key on mutations', async () => {
    const response = await request(server)
      .patch('/customer/profile')
      .set(AUTH)
      .send({ expectedVersion: 2 });
    expect(response.status).toBe(400);
  });

  it('lists own addresses', async () => {
    const response = await request(server).get('/customer/addresses').set(AUTH);
    expect(response.status).toBe(200);
    expect(envelopeOf(response).data?.addresses).toHaveLength(1);
  });

  it('creates an own address (roles allow-listed)', async () => {
    const response = await request(server)
      .post('/customer/addresses')
      .set(AUTH)
      .set('Idempotency-Key', 'test-key-0000000000000000')
      .send({
        recipientName: 'Ada Lovelace',
        line1: '1 Analytical Way',
        city: 'London',
        postalCode: 'SW1A 1AA',
        countryCode: 'GB',
        roles: ['SHIPPING'],
        expectedVersion: 2,
      });
    expect(response.status).toBe(201);
    expect(addresses.addAddress).toHaveBeenCalled();
  });

  it('rejects an unknown address role', async () => {
    const response = await request(server)
      .post('/customer/addresses')
      .set(AUTH)
      .set('Idempotency-Key', 'test-key-0000000000000000')
      .send({
        recipientName: 'Ada Lovelace',
        line1: '1 Analytical Way',
        city: 'London',
        postalCode: 'SW1A 1AA',
        countryCode: 'GB',
        roles: ['PICKUP'],
        expectedVersion: 2,
      });
    expect(response.status).toBe(400);
  });

  it('updates an own address', async () => {
    const response = await request(server)
      .patch(`/customer/addresses/${addressId}`)
      .set(AUTH)
      .set('Idempotency-Key', 'test-key-0000000000000000')
      .send({
        recipientName: 'Ada Lovelace',
        line1: '2 Analytical Way',
        city: 'London',
        postalCode: 'SW1A 1AA',
        countryCode: 'GB',
        expectedVersion: 2,
      });
    expect(response.status).toBe(200);
    expect(addresses.updateAddress).toHaveBeenCalled();
  });

  it('sets the default shipping flag without touching address fields', async () => {
    const response = await request(server)
      .patch(`/customer/addresses/${addressId}`)
      .set(AUTH)
      .set('Idempotency-Key', 'test-key-0000000000000000')
      .send({ setDefaultRole: 'SHIPPING', expectedVersion: 2 });
    expect(response.status).toBe(200);
    expect(addresses.setDefaultAddress).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'SHIPPING' }),
    );
  });

  it('soft-removes an own address (idempotent)', async () => {
    const response = await request(server)
      .delete(`/customer/addresses/${addressId}`)
      .set(AUTH)
      .set('Idempotency-Key', 'test-key-0000000000000000')
      .send({ expectedVersion: 2 });
    expect(response.status).toBe(200);
    expect(envelopeOf(response).data?.removed).toBe(true);
  });

  it('returns 404 for an absent business profile (optional 0..1)', async () => {
    business.getBusinessProfile.mockResolvedValue(null);
    const response = await request(server).get('/customer/business').set(AUTH);
    expect(response.status).toBe(404);
  });

  it('attaches the business profile when absent (upsert semantics)', async () => {
    business.getBusinessProfile.mockResolvedValue(null);
    const response = await request(server)
      .patch('/customer/business')
      .set(AUTH)
      .set('Idempotency-Key', 'test-key-0000000000000000')
      .send({
        companyName: 'Analytical Engines Ltd',
        registrationReference: 'GB123456789',
        businessType: 'Manufacturer',
        expectedVersion: 2,
      });
    expect(response.status).toBe(200);
    expect(business.createBusinessProfile).toHaveBeenCalled();
    // The raw registration reference is never passed to the application
    // layer — only its SHA-256 digest (D-05).
    const command = firstCallArg(business.createBusinessProfile) as
      { registrationLookupDigest?: string } | undefined;
    expect(command?.registrationLookupDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(business.updateBusinessProfile).not.toHaveBeenCalled();
  });

  it('updates the business profile when already attached', async () => {
    business.getBusinessProfile.mockResolvedValue({
      customerBusinessProfileId: '0191310f-789a-7123-8123-000000000005',
      companyName: 'Analytical Engines Ltd',
      businessType: 'Manufacturer',
    });
    const response = await request(server)
      .patch('/customer/business')
      .set(AUTH)
      .set('Idempotency-Key', 'test-key-0000000000000000')
      .send({ companyName: 'Analytical Engines Ltd', expectedVersion: 2 });
    expect(response.status).toBe(200);
    expect(business.updateBusinessProfile).toHaveBeenCalled();
    expect(business.createBusinessProfile).not.toHaveBeenCalled();
  });

  it('reads own preferences', async () => {
    const response = await request(server).get('/customer/preferences').set(AUTH);
    expect(response.status).toBe(200);
    expect(envelopeOf(response).data?.preferences?.[0]?.preferenceKey).toBe('language');
  });

  it('updates an allow-listed preference', async () => {
    const response = await request(server)
      .patch('/customer/preferences')
      .set(AUTH)
      .set('Idempotency-Key', 'test-key-0000000000000000')
      .send({ preferenceKey: 'language', preferenceValue: 'en-GB', expectedVersion: 2 });
    expect(response.status).toBe(200);
    expect(preferences.updatePreference).toHaveBeenCalledWith(
      expect.objectContaining({ preferenceKey: 'language', preferenceValue: 'en-GB' }),
    );
  });

  it('rejects a non-allow-listed preference key (D-06 deny by default)', async () => {
    const response = await request(server)
      .patch('/customer/preferences')
      .set(AUTH)
      .set('Idempotency-Key', 'test-key-0000000000000000')
      .send({ preferenceKey: 'theme', preferenceValue: 'dark', expectedVersion: 2 });
    expect(response.status).toBe(400);
  });

  it('denies when the Module 02 engine denies (fail closed)', async () => {
    authorization.authorize.mockResolvedValue({ granted: false });
    const response = await request(server).get('/customer/profile').set(AUTH);
    expect(response.status).toBe(403);
  });

  it('denies when no profile resolves (fail closed, non-enumerating)', async () => {
    customers.findByIdentityId.mockResolvedValue(null);
    const response = await request(server).get('/customer/profile').set(AUTH);
    expect(response.status).toBe(403);
  });
});
