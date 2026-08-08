import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { JwtCryptographicPort } from '../../application/ports/jwt-cryptographic.port';
import type { IdentityRepository } from '../../domain/identity/repositories/identity-repository';
import type { SessionRepository } from '../../domain/session/repositories/session-repository';
import { AuthoritativeSessionGuard } from './authoritative-session.guard';

const subject = '0191310f-789a-7123-8123-000000000001';
const sessionId = '0191310f-789a-7123-8123-000000000002';

function createContext(token: string | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { authorization: token === undefined ? undefined : `Bearer ${token}` },
      }),
    }),
  } as unknown as ExecutionContext;
}

function createGuard(
  overrides: {
    identityState?: string;
    verificationState?: string;
    lockedUntil?: Date;
    sessionState?: string;
    sessionVersion?: number;
    identityId?: string;
    sessionClass?: string;
    idleExpiresAt?: Date;
    absoluteExpiresAt?: Date;
  } = {},
): {
  guard: AuthoritativeSessionGuard;
  jwt: jest.Mocked<JwtCryptographicPort>;
  sessions: jest.Mocked<SessionRepository>;
  identities: jest.Mocked<IdentityRepository>;
} {
  const jwt = {
    verifyAccessToken: jest.fn().mockResolvedValue({
      subject,
      sessionId,
      sessionVersion: overrides.sessionVersion ?? 1,
    }),
  } as unknown as jest.Mocked<JwtCryptographicPort>;
  const sessions = {
    findById: jest.fn().mockResolvedValue({
      properties: {
        identityId: { value: overrides.identityId ?? subject },
        sessionState: overrides.sessionState ?? 'ACTIVE',
        sessionClass: overrides.sessionClass ?? 'INTERACTIVE_WEB',
        sessionVersion: { value: overrides.sessionVersion ?? 1 },
        idleExpiresAt: overrides.idleExpiresAt ?? new Date(Date.now() + 60_000),
        absoluteExpiresAt: overrides.absoluteExpiresAt ?? new Date(Date.now() + 120_000),
      },
    }),
  } as unknown as jest.Mocked<SessionRepository>;
  const identities = {
    findById: jest.fn().mockResolvedValue({
      properties: {
        identityId: { value: subject },
        identityState: overrides.identityState ?? 'ACTIVE',
        verificationState: overrides.verificationState ?? 'VERIFIED',
        lockedUntil: overrides.lockedUntil,
      },
    }),
    findAuthenticationById: jest.fn(),
  } as unknown as jest.Mocked<IdentityRepository>;
  const guard = new AuthoritativeSessionGuard(jwt, sessions, identities);
  return { guard, jwt, sessions, identities };
}

describe('AuthoritativeSessionGuard', () => {
  it('allows a valid Session for an ACTIVE and VERIFIED Identity', async () => {
    const { guard } = createGuard();
    await expect(guard.canActivate(createContext('token'))).resolves.toBe(true);
  });

  it('rejects a missing or malformed bearer token', async () => {
    const { guard } = createGuard();
    await expect(guard.canActivate(createContext(undefined))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(guard.canActivate(createContext(''))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a DISABLED identity even with a valid Session (defense-in-depth)', async () => {
    const { guard } = createGuard({ identityState: 'DISABLED' });
    await expect(guard.canActivate(createContext('token'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a DELETED (tombstoned) identity even with a valid Session', async () => {
    const { guard } = createGuard({ identityState: 'DELETED' });
    await expect(guard.canActivate(createContext('token'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an unverified identity even with a valid Session', async () => {
    const { guard } = createGuard({ verificationState: 'PENDING_VERIFICATION' });
    await expect(guard.canActivate(createContext('token'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an identity that is still locked', async () => {
    const { guard } = createGuard({ lockedUntil: new Date(Date.now() + 300_000) });
    await expect(guard.canActivate(createContext('token'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a Session whose identity does not match the token subject', async () => {
    const { guard } = createGuard({ identityId: '0191310f-789a-7123-8123-000000000099' });
    await expect(guard.canActivate(createContext('token'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a Session whose version does not match the token', async () => {
    const { guard, jwt, sessions } = createGuard();
    jwt.verifyAccessToken.mockResolvedValue({
      subject,
      sessionId,
      sessionVersion: 1,
    } as never);
    sessions.findById.mockResolvedValue({
      properties: {
        identityId: { value: subject },
        sessionState: 'ACTIVE',
        sessionClass: 'INTERACTIVE_WEB',
        sessionVersion: { value: 2 },
        idleExpiresAt: new Date(Date.now() + 60_000),
        absoluteExpiresAt: new Date(Date.now() + 120_000),
      },
    } as never);
    await expect(guard.canActivate(createContext('token'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a revoked Session', async () => {
    const { guard } = createGuard({ sessionState: 'REVOKED' });
    await expect(guard.canActivate(createContext('token'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a RECOVERY-class Session', async () => {
    const { guard } = createGuard({ sessionClass: 'RECOVERY' });
    await expect(guard.canActivate(createContext('token'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
