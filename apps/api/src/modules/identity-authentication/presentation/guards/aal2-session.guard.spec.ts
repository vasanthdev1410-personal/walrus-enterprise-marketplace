import type { ExecutionContext } from '@nestjs/common';
import type { JwtCryptographicPort } from '../../application/ports/jwt-cryptographic.port';
import type { IdentityRepository } from '../../domain/identity/repositories/identity-repository';
import type { SessionRepository } from '../../domain/session/repositories/session-repository';
import { Aal2SessionGuard } from './aal2-session.guard';
import { AuthoritativeSessionGuard } from './authoritative-session.guard';

const subject = '0191310f-789a-7123-8123-000000000001';
const sessionId = '0191310f-789a-7123-8123-000000000002';

function createContext(token: string | undefined): ExecutionContext {
  // The same request object must be returned on every getRequest() call: the
  // composed AuthoritativeSessionGuard writes request.authentication onto it
  // and Aal2SessionGuard reads it back.
  const request: Record<string, unknown> = {
    headers: { authorization: token === undefined ? undefined : `Bearer ${token}` },
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function createGuard(
  overrides: {
    claimAssurance?: string;
    sessionAssurance?: string;
    omitMfaVerifiedAt?: boolean;
    mfaVerifiedAt?: Date;
    identityState?: string;
    verificationState?: string;
    lockedUntil?: Date;
    sessionState?: string;
    sessionVersion?: number;
    claimSessionVersion?: number;
    identityId?: string;
    sessionClass?: string;
    idleExpiresAt?: Date;
    absoluteExpiresAt?: Date;
  } = {},
): {
  guard: Aal2SessionGuard;
  jwt: jest.Mocked<JwtCryptographicPort>;
  sessions: jest.Mocked<SessionRepository>;
  identities: jest.Mocked<IdentityRepository>;
} {
  const jwt = {
    verifyAccessToken: jest.fn().mockResolvedValue({
      subject,
      sessionId,
      sessionVersion: overrides.claimSessionVersion ?? overrides.sessionVersion ?? 1,
      authenticationAssurance: overrides.claimAssurance ?? 'AAL2',
    }),
  } as unknown as jest.Mocked<JwtCryptographicPort>;
  const sessions = {
    findById: jest.fn().mockResolvedValue({
      properties: {
        identityId: { value: overrides.identityId ?? subject },
        sessionState: overrides.sessionState ?? 'ACTIVE',
        sessionClass: overrides.sessionClass ?? 'INTERACTIVE_WEB',
        sessionVersion: { value: overrides.sessionVersion ?? 1 },
        authenticationAssurance: overrides.sessionAssurance ?? 'AAL2',
        mfaVerifiedAt: overrides.omitMfaVerifiedAt
          ? undefined
          : (overrides.mfaVerifiedAt ?? new Date(Date.now() - 60_000)),
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
  } as unknown as jest.Mocked<IdentityRepository>;
  const authoritative = new AuthoritativeSessionGuard(jwt, sessions, identities);
  const guard = new Aal2SessionGuard(authoritative, sessions);
  return { guard, jwt, sessions, identities };
}

describe('Aal2SessionGuard', () => {
  it('accepts a current ordinary Session that reached AAL2', async () => {
    const { guard } = createGuard();
    await expect(guard.canActivate(createContext('valid-jwt-token'))).resolves.toBe(true);
  });

  it('rejects an AAL1 Session from an AAL2-protected operation', async () => {
    const { guard } = createGuard({
      claimAssurance: 'AAL1',
      sessionAssurance: 'AAL1',
    });
    await expect(guard.canActivate(createContext('valid-jwt-token'))).rejects.toThrow(
      'AUTHENTICATION_ASSURANCE_INSUFFICIENT',
    );
  });

  it('rejects a forged or stale acr claim that the Session row does not support', async () => {
    // The token claims AAL2 but the authoritative Session is AAL1: a token
    // whose acr was never established server-side is rejected.
    const { guard } = createGuard({ sessionAssurance: 'AAL1' });
    await expect(guard.canActivate(createContext('forged-jwt-token'))).rejects.toThrow(
      'AUTHENTICATION_ASSURANCE_INSUFFICIENT',
    );
  });

  it('rejects an AAL2 claim when the Session has no recorded MFA verification', async () => {
    const { guard } = createGuard({ omitMfaVerifiedAt: true });
    await expect(guard.canActivate(createContext('valid-jwt-token'))).rejects.toThrow(
      'AUTHENTICATION_ASSURANCE_INSUFFICIENT',
    );
  });

  it('rejects a Session bound to a different identity', async () => {
    const { guard } = createGuard({ identityId: '0191310f-789a-7123-8123-000000009999' });
    await expect(guard.canActivate(createContext('valid-jwt-token'))).rejects.toThrow(
      'SESSION_INVALID',
    );
  });

  it('rejects a revoked Session before assurance is evaluated', async () => {
    const { guard } = createGuard({ sessionState: 'REVOKED' });
    await expect(guard.canActivate(createContext('valid-jwt-token'))).rejects.toThrow(
      'SESSION_INVALID',
    );
  });

  it('rejects an expired Session before assurance is evaluated', async () => {
    const { guard } = createGuard({
      idleExpiresAt: new Date(Date.now() - 60_000),
      absoluteExpiresAt: new Date(Date.now() - 30_000),
    });
    await expect(guard.canActivate(createContext('valid-jwt-token'))).rejects.toThrow(
      'SESSION_INVALID',
    );
  });

  it('rejects a RECOVERY-class Session before assurance is evaluated', async () => {
    const { guard } = createGuard({ sessionClass: 'RECOVERY' });
    await expect(guard.canActivate(createContext('valid-jwt-token'))).rejects.toThrow(
      'SESSION_INVALID',
    );
  });

  it('rejects a request without an access token', async () => {
    const { guard } = createGuard();
    await expect(guard.canActivate(createContext(undefined))).rejects.toThrow('SESSION_INVALID');
  });

  it('rejects a Session version mismatch', async () => {
    const { guard } = createGuard({ sessionVersion: 2, claimSessionVersion: 1 });
    await expect(guard.canActivate(createContext('valid-jwt-token'))).rejects.toThrow(
      'SESSION_INVALID',
    );
  });

  it('rejects a Session whose identity is no longer authenticatable', async () => {
    const { guard } = createGuard({ identityState: 'SUSPENDED' });
    await expect(guard.canActivate(createContext('valid-jwt-token'))).rejects.toThrow(
      'SESSION_INVALID',
    );
  });

  it('rejects a Session revoked between the authoritative read and the assurance cross-check', async () => {
    // The composed guard's read sees an ACTIVE AAL2 Session; the cross-check's
    // fresh read sees the same Session already REVOKED (mid-request revocation
    // race). The fresh read is authoritative and must not grant AAL2 access.
    // NOTE: mock call order is load-bearing — the first findById call is the
    // composed guard's read, the second is the cross-check read. If the
    // composed guard ever changes its fetch pattern, this test's semantics
    // would silently change.
    const activeProperties = {
      identityId: { value: subject },
      sessionState: 'ACTIVE',
      sessionClass: 'INTERACTIVE_WEB',
      sessionVersion: { value: 1 },
      authenticationAssurance: 'AAL2',
      mfaVerifiedAt: new Date(Date.now() - 60_000),
      idleExpiresAt: new Date(Date.now() + 60_000),
      absoluteExpiresAt: new Date(Date.now() + 120_000),
    };
    const active = { properties: activeProperties };
    const revoked = { properties: { ...activeProperties, sessionState: 'REVOKED' } };
    const jwt = {
      verifyAccessToken: jest.fn().mockResolvedValue({
        subject,
        sessionId,
        sessionVersion: 1,
        authenticationAssurance: 'AAL2',
      }),
    } as unknown as jest.Mocked<JwtCryptographicPort>;
    const sessions = {
      findById: jest.fn().mockResolvedValueOnce(active).mockResolvedValueOnce(revoked),
    } as unknown as jest.Mocked<SessionRepository>;
    const identities = {
      findById: jest.fn().mockResolvedValue({
        properties: {
          identityId: { value: subject },
          identityState: 'ACTIVE',
          verificationState: 'VERIFIED',
          lockedUntil: undefined,
        },
      }),
    } as unknown as jest.Mocked<IdentityRepository>;
    const guard = new Aal2SessionGuard(
      new AuthoritativeSessionGuard(jwt, sessions, identities),
      sessions,
    );

    await expect(guard.canActivate(createContext('valid-jwt-token'))).rejects.toThrow(
      'AUTHENTICATION_ASSURANCE_INSUFFICIENT',
    );
  });
});
