import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import type { AuthenticationApplicationService } from '../src/modules/identity-authentication/application/services/authentication-application.service';
import type { ApiIdempotencyService } from '../src/modules/identity-authentication/application/services/api-idempotency.service';
import type { JwtCryptographicPort } from '../src/modules/identity-authentication/application/ports/jwt-cryptographic.port';
import { AuthenticationController } from '../src/modules/identity-authentication/presentation/authentication.controller';
import { AUTHENTICATION_APPLICATION_SERVICE, CSRF_PROTECTION } from '../src/modules/identity-authentication/presentation/authentication.tokens';
import { AuthoritativeSessionGuard } from '../src/modules/identity-authentication/presentation/guards/authoritative-session.guard';
import { API_IDEMPOTENCY, JWT_CRYPTOGRAPHY } from '../src/modules/identity-authentication/identity-authentication.tokens';
import { SESSION_REPOSITORY } from '../src/modules/identity-authentication/infrastructure/persistence/prisma/prisma.module';
import type { SessionRepository } from '../src/modules/identity-authentication/domain/session/repositories/session-repository';

const identityId = '01890f3e-7b5a-7cc0-8c9d-1234567890ab';
const sessionId = '01890f3e-7b5a-7cc0-8c9d-1234567890ac';

describe('Module 01 protected authentication API (integration)', () => {
  let application: INestApplication;
  let server: Server;
  const authentication = { logout: jest.fn(), logoutAll: jest.fn() } as unknown as jest.Mocked<AuthenticationApplicationService>;
  const jwt = { verifyAccessToken: jest.fn() } as unknown as jest.Mocked<JwtCryptographicPort>;
  const sessions = { findById: jest.fn() } as unknown as jest.Mocked<SessionRepository>;
  const idempotency = { execute: jest.fn(async (input: { execute: () => Promise<unknown> }) => input.execute()) } as unknown as jest.Mocked<ApiIdempotencyService>;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthenticationController],
      providers: [
        AuthoritativeSessionGuard,
        { provide: AUTHENTICATION_APPLICATION_SERVICE, useValue: authentication },
        { provide: CSRF_PROTECTION, useValue: { issue: () => 'csrf', verify: () => true } },
        { provide: API_IDEMPOTENCY, useValue: idempotency },
        { provide: JWT_CRYPTOGRAPHY, useValue: jwt },
        { provide: SESSION_REPOSITORY, useValue: sessions },
      ],
    }).compile();
    application = module.createNestApplication();
    application.setGlobalPrefix('api/v1');
    await application.init();
    server = application.getHttpServer() as Server;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jwt.verifyAccessToken.mockResolvedValue({
      subject: identityId, sessionId, jwtId: 'jwt', issuer: 'issuer', audience: 'audience',
      issuedAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
      authenticationMethods: ['PASSWORD'], authenticationAssurance: 'AAL1', sessionVersion: 1,
    });
    sessions.findById.mockResolvedValue({
      properties: {
        identityId: { value: identityId }, sessionState: 'ACTIVE', sessionClass: 'INTERACTIVE_WEB',
        sessionVersion: { value: 1 }, idleExpiresAt: new Date(Date.now() + 60_000),
        absoluteExpiresAt: new Date(Date.now() + 120_000),
      },
    } as never);
  });
  afterAll(async () => application.close());

  it('authoritatively revokes the current Session and clears Web credentials', async () => {
    authentication.logout.mockResolvedValue();
    const response = await request(server).post('/api/v1/auth/logout')
      .set('Authorization', 'Bearer access-token')
      .set('Idempotency-Key', '01890f3e-7b5a-7cc0-8c9d-1234567890ad')
      .set('If-Match', `"session:${sessionId}:v1"`).expect(204);
    expect(authentication.logout.mock.calls).toHaveLength(1);
    expect((response.headers['set-cookie'] as unknown as string[]).join(';')).toContain('__Secure-walrus_rt=;');
  });

  it('revokes all Sessions and returns the approved accepted contract', async () => {
    authentication.logoutAll.mockResolvedValue(3);
    const response = await request(server).post('/api/v1/auth/logout-all')
      .set('Authorization', 'Bearer access-token')
      .set('Idempotency-Key', '01890f3e-7b5a-7cc0-8c9d-1234567890ae')
      .set('If-Match', `"session:${sessionId}:v1"`).expect(202);
    expect(readData(response.body)).toMatchObject({ accepted: true });
    expect(authentication.logoutAll.mock.calls).toHaveLength(1);
  });

  it('fails closed when the authoritative Session version differs from the JWT', async () => {
    sessions.findById.mockResolvedValue({
      properties: {
        identityId: { value: identityId }, sessionState: 'ACTIVE', sessionClass: 'INTERACTIVE_WEB',
        sessionVersion: { value: 2 }, idleExpiresAt: new Date(Date.now() + 60_000),
        absoluteExpiresAt: new Date(Date.now() + 120_000),
      },
    } as never);
    await request(server).post('/api/v1/auth/logout')
      .set('Authorization', 'Bearer access-token')
      .set('Idempotency-Key', '01890f3e-7b5a-7cc0-8c9d-1234567890af')
      .set('If-Match', `"session:${sessionId}:v1"`).expect(401);
    expect(authentication.logout.mock.calls).toHaveLength(0);
  });
});

function readData(body: unknown): unknown {
  if (typeof body !== 'object' || body === null || !('data' in body)) throw new Error('Missing data');
  return body.data;
}
