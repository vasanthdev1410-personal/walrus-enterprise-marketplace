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
import { Aal2SessionGuard } from '../src/modules/identity-authentication/presentation/guards/aal2-session.guard';
import { AuthoritativeSessionGuard } from '../src/modules/identity-authentication/presentation/guards/authoritative-session.guard';
import type { AuthorizationApplicationService } from '../src/modules/authorization/application/services/authorization-application.service';
import { AUTHORIZATION_APPLICATION_SERVICE } from '../src/modules/authorization/authorization.tokens';
import { AdminHealthController } from '../src/modules/authorization/presentation/admin-health.controller';
import { AuthorizationPermissionGuard } from '../src/modules/authorization/presentation/guards/authorization-permission.guard';

const identityId = '0191310f-789a-7123-8123-000000000001';
const sessionId = '0191310f-789a-7123-8123-000000000002';

describe('Module 02 admin health probe (integration)', () => {
  let application: INestApplication;
  let server: Server;

  const listIdentityRoleAssignments = jest
    .fn<Promise<readonly unknown[]>, [unknown]>()
    .mockResolvedValue([]);
  const authorize = jest.fn().mockResolvedValue({ granted: true });
  const authorization = {
    listIdentityRoleAssignments,
    authorize,
  } as unknown as jest.Mocked<AuthorizationApplicationService>;

  const jwt = { verifyAccessToken: jest.fn() } as unknown as jest.Mocked<JwtCryptographicPort>;
  const sessions = { findById: jest.fn() } as unknown as jest.Mocked<SessionRepository>;
  const identities = { findById: jest.fn() } as unknown as jest.Mocked<IdentityRepository>;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      controllers: [AdminHealthController],
      providers: [
        { provide: AUTHORIZATION_APPLICATION_SERVICE, useValue: authorization },
        { provide: JWT_CRYPTOGRAPHY, useValue: jwt },
        { provide: SESSION_REPOSITORY, useValue: sessions },
        { provide: IDENTITY_REPOSITORY, useValue: identities },
        AuthoritativeSessionGuard,
        Aal2SessionGuard,
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

  beforeEach(() => {
    jest.clearAllMocks();
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

  it('returns 401 when the access token is missing', async () => {
    useAal2Session();
    await request(server).get('/admin/health').expect(401);
    expect(authorize).not.toHaveBeenCalled();
  });

  it('returns 403 AUTHORIZATION_DENIED for an authenticated caller without the admin grant (CUSTOMER)', async () => {
    useAal2Session();
    authorize.mockResolvedValue({ granted: false });

    const response = await request(server)
      .get('/admin/health')
      .set('Authorization', 'Bearer valid-jwt-token')
      .expect(403);

    expect(response.body).toMatchObject({ message: 'AUTHORIZATION_DENIED' });
  });

  it('returns 200 {status ok, role ADMIN} for an ADMIN caller', async () => {
    useAal2Session();
    authorize.mockResolvedValue({ granted: true });
    listIdentityRoleAssignments.mockResolvedValue([
      {
        properties: {
          assignmentId: { value: '0191310f-789a-7123-8123-000000000003' },
          roleName: 'ADMIN',
          assignmentState: 'ACTIVE',
          assignedAt: new Date(),
          revokedAt: undefined,
        },
      },
    ]);

    const response = await request(server)
      .get('/admin/health')
      .set('Authorization', 'Bearer valid-jwt-token')
      .expect(200);

    expect(response.body).toMatchObject({ data: { status: 'ok', role: 'ADMIN' } });
    expect(listIdentityRoleAssignments).toHaveBeenCalledTimes(1);
  });

  it('reports SUPER_ADMIN for a SUPER_ADMIN caller', async () => {
    useAal2Session();
    authorize.mockResolvedValue({ granted: true });
    listIdentityRoleAssignments.mockResolvedValue([
      {
        properties: {
          assignmentId: { value: '0191310f-789a-7123-8123-000000000004' },
          roleName: 'SUPER_ADMIN',
          assignmentState: 'ACTIVE',
          assignedAt: new Date(),
          revokedAt: undefined,
        },
      },
    ]);

    const response = await request(server)
      .get('/admin/health')
      .set('Authorization', 'Bearer valid-jwt-token')
      .expect(200);

    expect(response.body).toMatchObject({ data: { status: 'ok', role: 'SUPER_ADMIN' } });
  });
});
