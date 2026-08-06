import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import type { AuthenticationApplicationService } from '../src/modules/identity-authentication/application/services/authentication-application.service';
import { AuthenticationController } from '../src/modules/identity-authentication/presentation/authentication.controller';
import {
  AUTHENTICATION_APPLICATION_SERVICE,
  CSRF_PROTECTION,
} from '../src/modules/identity-authentication/presentation/authentication.tokens';
import type { CsrfProtectionPort } from '../src/modules/identity-authentication/presentation/ports/csrf-protection.port';
import { API_IDEMPOTENCY } from '../src/modules/identity-authentication/identity-authentication.tokens';
import type { ApiIdempotencyService } from '../src/modules/identity-authentication/application/services/api-idempotency.service';
import { AuthoritativeSessionGuard } from '../src/modules/identity-authentication/presentation/guards/authoritative-session.guard';
import { JWT_CRYPTOGRAPHY } from '../src/modules/identity-authentication/identity-authentication.tokens';
import { SESSION_REPOSITORY } from '../src/modules/identity-authentication/infrastructure/persistence/prisma/prisma.module';

const completedSession = {
  authenticationOutcome: 'COMPLETED' as const,
  accessToken: 'test-access-token',
  accessTokenExpiresIn: 600,
  refreshToken: 'test-refresh-token',
  sessionId: '01890f3e-7b5a-7cc0-8c9d-1234567890ab',
  sessionVersion: 1,
  authenticationAssurance: 'AAL1' as const,
};

describe('Module 01 public authentication API (integration)', () => {
  let application: INestApplication;
  let server: Server;
  const login = jest.fn();
  const completeMfaLogin = jest.fn();
  const refresh = jest.fn();
  const authentication = {
    login,
    completeMfaLogin,
    refresh,
  } as unknown as jest.Mocked<AuthenticationApplicationService>;
  const csrf: jest.Mocked<CsrfProtectionPort> = {
    verify: jest.fn(),
    issue: jest.fn().mockReturnValue('v1.test-nonce.test-mac'),
  };
  const idempotency = {
    execute: jest.fn(async (input: { execute: () => Promise<unknown> }) => input.execute()),
  } as unknown as jest.Mocked<ApiIdempotencyService>;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthenticationController],
      providers: [
        { provide: AUTHENTICATION_APPLICATION_SERVICE, useValue: authentication },
        { provide: CSRF_PROTECTION, useValue: csrf },
        { provide: API_IDEMPOTENCY, useValue: idempotency },
        { provide: AuthoritativeSessionGuard, useValue: { canActivate: () => true } },
        { provide: JWT_CRYPTOGRAPHY, useValue: {} },
        { provide: SESSION_REPOSITORY, useValue: {} },
      ],
    }).compile();
    application = module.createNestApplication();
    application.setGlobalPrefix('api/v1');
    application.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await application.init();
    server = application.getHttpServer() as Server;
  });

  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => application.close());

  it('returns Web tokens with protected cookies and never exposes the Refresh Token in JSON', async () => {
    login.mockResolvedValue(completedSession);
    const response = await request(server)
      .post('/api/v1/auth/login')
      .set('Idempotency-Key', '01890f3e-7b5a-7cc0-8c9d-1234567890ab')
      .send({
        identifierType: 'EMAIL',
        identifier: 'user@example.com',
        password: 'secret',
        clientType: 'WEB',
      })
      .expect(200)
      .expect('Cache-Control', 'no-store')
      .expect('Pragma', 'no-cache');

    expect(readData(response.body)).not.toHaveProperty('refreshToken');
    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(cookies.join(';')).toContain('__Secure-walrus_rt=');
    expect(cookies.join(';')).toContain('HttpOnly');
    expect(cookies.join(';')).toContain('__Host-walrus_csrf=');
  });

  it('returns the Refresh Token field only for Mobile', async () => {
    login.mockResolvedValue(completedSession);
    const response = await request(server)
      .post('/api/v1/auth/login')
      .set('Idempotency-Key', '01890f3e-7b5a-7cc0-8c9d-1234567890ab')
      .send({
        identifierType: 'MOBILE',
        identifier: '+919876543210',
        password: 'secret',
        clientType: 'MOBILE',
      })
      .expect(200);
    expect(readData(response.body)).toHaveProperty('refreshToken', 'test-refresh-token');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('returns 202 with a bounded MFA challenge contract', async () => {
    login.mockResolvedValue({
      authenticationOutcome: 'MFA_REQUIRED',
      mfaChallengeId: '01890f3e-7b5a-7cc0-8c9d-1234567890ae',
      challengeVersion: 1,
    });
    const response = await request(server)
      .post('/api/v1/auth/login')
      .set('Idempotency-Key', '01890f3e-7b5a-7cc0-8c9d-1234567890ab')
      .send({
        identifierType: 'EMAIL',
        identifier: 'user@example.com',
        password: 'secret',
        clientType: 'WEB',
      })
      .expect(202);
    expect(readData(response.body)).toEqual({
      authenticationOutcome: 'MFA_REQUIRED',
      mfaChallenge: { challengeId: '01890f3e-7b5a-7cc0-8c9d-1234567890ae', version: 1 },
    });
  });

  it('requires valid Web CSRF evidence before processing a cookie Refresh Token', async () => {
    csrf.verify.mockReturnValue(false);
    await request(server)
      .post('/api/v1/auth/token/refresh')
      .set('Idempotency-Key', '01890f3e-7b5a-7cc0-8c9d-1234567890ab')
      .set('Cookie', ['__Secure-walrus_rt=refresh', '__Host-walrus_csrf=csrf'])
      .set('X-CSRF-Token', 'different')
      .send({})
      .expect(401);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('rejects unknown request properties', async () => {
    await request(server)
      .post('/api/v1/auth/login')
      .set('Idempotency-Key', '01890f3e-7b5a-7cc0-8c9d-1234567890ab')
      .send({
        identifierType: 'EMAIL',
        identifier: 'user@example.com',
        password: 'secret',
        clientType: 'WEB',
        role: 'ADMIN',
      })
      .expect(400);
    expect(login).not.toHaveBeenCalled();
  });
});

function readData(body: unknown): unknown {
  if (typeof body !== 'object' || body === null || !('data' in body)) {
    throw new Error('Expected a success response envelope');
  }
  return body.data;
}
