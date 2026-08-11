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
import type { Role } from '../src/modules/authorization/domain/entities/role';
import { RoleCatalog } from '../src/modules/authorization/domain/role-catalog';
import { AuthorizationController } from '../src/modules/authorization/presentation/authorization.controller';
import { AuthorizationPermissionGuard } from '../src/modules/authorization/presentation/guards/authorization-permission.guard';

const identityId = '0191310f-789a-7123-8123-000000000001';
const sessionId = '0191310f-789a-7123-8123-000000000002';
const assignmentId = '0191310f-789a-7123-8123-000000000003';

describe('Module 02 authorization API (integration)', () => {
  let application: INestApplication;
  let server: Server;

  const listRoleCatalog = jest
    .fn<readonly Role[], []>()
    .mockImplementation(() => new RoleCatalog().all());
  const listIdentityRoleAssignments = jest
    .fn<Promise<readonly unknown[]>, [unknown]>()
    .mockResolvedValue([]);
  const assignRole = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
    properties: {
      assignmentId: { value: assignmentId },
      roleName: 'ADMIN',
      assignmentState: 'ACTIVE',
      assignedAt: new Date(),
      revokedAt: undefined,
    },
  });
  const revokeRole = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
    properties: {
      assignmentId: { value: assignmentId },
      roleName: 'ADMIN',
      assignmentState: 'REVOKED',
      assignedAt: new Date(),
      revokedAt: new Date(),
    },
  });
  const authorization = {
    listRoleCatalog,
    listIdentityRoleAssignments,
    assignRole,
    revokeRole,
    authorize: jest.fn().mockResolvedValue({ granted: true }),
  } as unknown as jest.Mocked<AuthorizationApplicationService>;

  const jwt = { verifyAccessToken: jest.fn() } as unknown as jest.Mocked<JwtCryptographicPort>;
  const sessions = { findById: jest.fn() } as unknown as jest.Mocked<SessionRepository>;
  const identities = { findById: jest.fn() } as unknown as jest.Mocked<IdentityRepository>;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      controllers: [AuthorizationController],
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

  function useAal1Session(): void {
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
        authenticationAssurance: 'AAL1',
        idleExpiresAt: new Date(Date.now() + 60_000),
        absoluteExpiresAt: new Date(Date.now() + 120_000),
      },
    } as never);
    useVerifiedIdentity();
  }

  describe('GET /authorization/roles', () => {
    it('returns the approved role catalog for an AAL2 identity with the view permission', async () => {
      useAal2Session();

      const response = await request(server)
        .get('/authorization/roles')
        .set('Authorization', 'Bearer valid-jwt-token')
        .expect(200);

      const body = response.body as { data: { roles: Record<string, unknown>[] } };
      const roleNames = body.data.roles.map((role) => role.roleName).sort();
      expect(roleNames).toEqual(['ADMIN', 'CUSTOMER', 'SELLER', 'SUPER_ADMIN']);
      // Internal role configuration (the permission matrix) is never exposed.
      expect(body.data.roles[0]?.grantedPermissionIds).toBeUndefined();
    });

    it('returns 401 when the access token is missing', async () => {
      useAal2Session();
      await request(server).get('/authorization/roles').expect(401);
    });

    it('returns 401 AUTHENTICATION_ASSURANCE_INSUFFICIENT for an AAL1 session', async () => {
      useAal1Session();

      const response = await request(server)
        .get('/authorization/roles')
        .set('Authorization', 'Bearer valid-jwt-token')
        .expect(401);

      expect(response.body).toMatchObject({ message: 'AUTHENTICATION_ASSURANCE_INSUFFICIENT' });
    });
  });

  describe('GET /authorization/me', () => {
    it('lists the caller own role assignments', async () => {
      useAal2Session();
      listIdentityRoleAssignments.mockResolvedValue([
        {
          properties: {
            assignmentId: { value: assignmentId },
            roleName: 'ADMIN',
            assignmentState: 'ACTIVE',
            assignedAt: new Date(),
            revokedAt: undefined,
          },
        },
      ]);

      const response = await request(server)
        .get('/authorization/me')
        .set('Authorization', 'Bearer valid-jwt-token')
        .expect(200);

      const body = response.body as { data: { roleAssignments: Record<string, unknown>[] } };
      expect(body.data.roleAssignments[0]?.roleName).toBe('ADMIN');
      expect(listIdentityRoleAssignments).toHaveBeenCalledTimes(1);
      const calledIdentity = listIdentityRoleAssignments.mock.calls[0]?.[0] as
        { value?: string } | undefined;
      expect(calledIdentity?.value).toBe(identityId);
    });
  });

  describe('POST /authorization/role-assignments', () => {
    it('assigns a role for an AAL2 identity with the assign permission (201)', async () => {
      useAal2Session();

      const response = await request(server)
        .post('/authorization/role-assignments')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send({ targetIdentityId: identityId, roleName: 'ADMIN' })
        .expect(201);

      const body = response.body as { data: { roleAssignment: Record<string, unknown> } };
      expect(body.data.roleAssignment.roleName).toBe('ADMIN');
      expect(assignRole).toHaveBeenCalledTimes(1);
      const calledCommand = assignRole.mock.calls[0]?.[0] as
        { roleName?: string; assignedByIdentityId?: { value?: string } } | undefined;
      expect(calledCommand?.roleName).toBe('ADMIN');
      expect(calledCommand?.assignedByIdentityId?.value).toBe(identityId);
    });

    it('rejects an unknown role name with 400', async () => {
      useAal2Session();

      await request(server)
        .post('/authorization/role-assignments')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send({ targetIdentityId: identityId, roleName: 'HACKER' })
        .expect(400);
      expect(assignRole).not.toHaveBeenCalled();
    });

    it('rejects a malformed target identity with 400', async () => {
      useAal2Session();

      await request(server)
        .post('/authorization/role-assignments')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send({ targetIdentityId: 'not-a-uuid', roleName: 'ADMIN' })
        .expect(400);
      expect(assignRole).not.toHaveBeenCalled();
    });

    it('returns 401 for an AAL1 session', async () => {
      useAal1Session();

      await request(server)
        .post('/authorization/role-assignments')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send({ targetIdentityId: identityId, roleName: 'ADMIN' })
        .expect(401);
      expect(assignRole).not.toHaveBeenCalled();
    });
  });

  describe('POST /authorization/role-assignments/:assignmentId/revoke', () => {
    it('revokes an assignment for an AAL2 identity with the revoke permission', async () => {
      useAal2Session();

      const response = await request(server)
        .post(`/authorization/role-assignments/${assignmentId}/revoke`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .expect(200);

      const body = response.body as { data: { roleAssignment: Record<string, unknown> } };
      expect(body.data.roleAssignment.assignmentState).toBe('REVOKED');
      expect(revokeRole).toHaveBeenCalledTimes(1);
      const calledRevoke = revokeRole.mock.calls[0]?.[0] as
        { assignmentId?: { value?: string } } | undefined;
      expect(calledRevoke?.assignmentId?.value).toBe(assignmentId);
    });

    it('rejects a malformed assignment id with 400', async () => {
      useAal2Session();

      await request(server)
        .post('/authorization/role-assignments/not-a-uuid/revoke')
        .set('Authorization', 'Bearer valid-jwt-token')
        .expect(400);
    });
  });
});
