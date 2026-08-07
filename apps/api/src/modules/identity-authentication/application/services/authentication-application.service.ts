import type {
  IdentityAuthenticationSnapshot,
  IdentityRepository,
} from '../../domain/identity/repositories/identity-repository';
import type { AuthenticationSecurityClassification } from '../../domain/identity/value-objects/authentication-security-classification';
import { CanonicalEmailAddress } from '../../domain/identity/value-objects/canonical-email-address';
import { CanonicalMobileNumber } from '../../domain/identity/value-objects/canonical-mobile-number';
import type { IdentifierType } from '../../domain/identity/value-objects/identifier-type';
import { RefreshTokenFamily } from '../../domain/session/entities/refresh-token-family';
import { RefreshTokenRecord } from '../../domain/session/entities/refresh-token-record';
import { Session } from '../../domain/session/entities/session';
import type { SessionRepository } from '../../domain/session/repositories/session-repository';
import type { AuthenticationAssuranceLevel } from '../../domain/session/value-objects/authentication-assurance-level';
import type { AuthenticationMethod } from '../../domain/session/value-objects/authentication-method';
import { RefreshTokenDigest } from '../../domain/session/value-objects/refresh-token-digest';
import type { SessionClass } from '../../domain/session/value-objects/session-class';
import { SessionVersion } from '../../domain/session/value-objects/session-version';
import { AggregateVersion } from '../../domain/shared/value-objects/aggregate-version';
import { ProtectedValue } from '../../domain/shared/value-objects/protected-value';
import type { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';
import { AuthenticationError } from '../errors/authentication.error';
import type { ClockPort, UuidV7GenerationPort } from '../ports/application-runtime.port';
import type { IdentifierLookupCryptographicPort } from '../ports/identifier-lookup-cryptographic.port';
import type { JwtCryptographicPort } from '../ports/jwt-cryptographic.port';
import type { MfaAuthenticationPort } from '../ports/mfa-authentication.port';
import type { PasswordHashingPort } from '../ports/password-hashing.port';
import type { RefreshTokenCryptographicPort } from '../ports/refresh-token-cryptographic.port';

export type AuthenticationClientType = 'WEB' | 'MOBILE';

export interface AuthenticationApplicationPolicy {
  readonly environment: string;
  readonly accessTokenLifetimeSeconds: number;
  readonly standardRefreshTokenLifetimeSeconds: number;
  readonly privilegedRefreshTokenLifetimeSeconds: number;
  readonly sessions: Readonly<Record<AuthenticationSecurityClassification, SessionPolicy>>;
}

export interface SessionPolicy {
  readonly idleTimeoutSeconds: number;
  readonly absoluteTimeoutSeconds: number;
}

export interface PasswordLoginCommand {
  readonly identifierType: IdentifierType;
  readonly identifier: string;
  readonly password: string;
  readonly clientType: AuthenticationClientType;
  readonly deviceSessionId?: UuidV7;
}

export type PasswordLoginResult =
  | ({ readonly authenticationOutcome: 'COMPLETED' } & IssuedAuthenticationSession)
  | {
      readonly authenticationOutcome: 'MFA_REQUIRED';
      readonly mfaChallengeId: string;
      readonly challengeVersion: number;
    };

export interface MfaLoginCompletionCommand {
  readonly challengeId: UuidV7;
  readonly evidence: string;
  readonly clientType: AuthenticationClientType;
  readonly deviceSessionId?: UuidV7;
}

export interface IssuedAuthenticationSession {
  readonly accessToken: string;
  readonly accessTokenExpiresIn: number;
  readonly refreshToken: string;
  readonly sessionId: string;
  readonly sessionVersion: number;
  readonly authenticationAssurance: AuthenticationAssuranceLevel;
}

interface SessionIssuanceRequest {
  readonly identityId: UuidV7;
  readonly classification: AuthenticationSecurityClassification;
  readonly authenticationMethods: readonly AuthenticationMethod[];
  readonly assurance: AuthenticationAssuranceLevel;
  readonly clientType: AuthenticationClientType;
  readonly deviceSessionId?: UuidV7;
}

export class AuthenticationApplicationService {
  public constructor(
    private readonly identityRepository: IdentityRepository,
    private readonly sessionRepository: SessionRepository,
    private readonly passwordHashing: PasswordHashingPort,
    private readonly identifierLookup: IdentifierLookupCryptographicPort,
    private readonly refreshTokens: RefreshTokenCryptographicPort,
    private readonly jwt: JwtCryptographicPort,
    private readonly mfa: MfaAuthenticationPort,
    private readonly clock: ClockPort,
    private readonly identifiers: UuidV7GenerationPort,
    private readonly policy: AuthenticationApplicationPolicy,
  ) {}

  public async login(command: PasswordLoginCommand): Promise<PasswordLoginResult> {
    let canonicalValue: string;
    try {
      canonicalValue = canonicalizeIdentifier(command.identifierType, command.identifier);
    } catch {
      // Malformed identifiers must never produce a distinguishable error; a
      // uniform authentication failure keeps the endpoint enumeration-safe.
      throw new AuthenticationError('AUTHENTICATION_FAILED');
    }
    const lookupDigests = this.identifierLookup.createLookupsForResolution({
      environment: this.policy.environment,
      identifierType: command.identifierType,
      canonicalValue,
    });
    const snapshot = await this.identityRepository.findByIdentifierLookups(
      command.identifierType,
      lookupDigests.map((value) => new ProtectedValue(value)),
    );
    const confirmed = await this.authenticatePassword(snapshot, command.password);
    const classification = effectiveClassification(confirmed);

    if (classification !== 'STANDARD_AUTHENTICATION') {
      const factor = confirmed.mfaFactors.find(
        (candidate) => candidate.properties.factorState === 'ACTIVE',
      );
      if (factor === undefined) throw new AuthenticationError('AUTHENTICATION_FAILED');
      const challenge = await this.mfa.issueChallenge(
        confirmed.identity.properties.identityId,
        factor.properties.mfaFactorId,
      );
      return {
        authenticationOutcome: 'MFA_REQUIRED',
        mfaChallengeId: challenge.challengeId.value,
        challengeVersion: challenge.version,
      };
    }

    return {
      authenticationOutcome: 'COMPLETED',
      ...(await this.issueSession({
        identityId: confirmed.identity.properties.identityId,
        classification,
        authenticationMethods: ['PASSWORD'],
        assurance: 'AAL1',
        clientType: command.clientType,
        ...(command.deviceSessionId === undefined
          ? {}
          : { deviceSessionId: command.deviceSessionId }),
      })),
    };
  }

  public async completeMfaLogin(
    command: MfaLoginCompletionCommand,
  ): Promise<IssuedAuthenticationSession> {
    const verified = await this.mfa.verifyChallenge(command.challengeId, command.evidence);
    const snapshot = await this.identityRepository.findAuthenticationById(verified.identityId);
    assertAuthenticatable(snapshot, this.clock.now());
    return this.issueSession({
      identityId: verified.identityId,
      classification: effectiveClassification(snapshot),
      authenticationMethods: ['PASSWORD', verified.authenticationMethod],
      assurance: 'AAL2',
      clientType: command.clientType,
      ...(command.deviceSessionId === undefined
        ? {}
        : { deviceSessionId: command.deviceSessionId }),
    });
  }

  public async refresh(refreshToken: string): Promise<IssuedAuthenticationSession> {
    let digest: RefreshTokenDigest;
    try {
      digest = new RefreshTokenDigest(this.refreshTokens.computeDigest(refreshToken));
    } catch {
      throw new AuthenticationError('REFRESH_TOKEN_INVALID');
    }
    const snapshot = await this.sessionRepository.findByRefreshTokenDigest(digest);
    if (
      snapshot === null ||
      !this.refreshTokens.matches(refreshToken, snapshot.token.properties.tokenDigest.value)
    ) {
      throw new AuthenticationError('REFRESH_TOKEN_INVALID');
    }
    const now = this.clock.now();
    if (snapshot.token.properties.tokenState === 'USED') {
      await this.sessionRepository.revokeRefreshTokenFamilyForReuse({
        tokenId: snapshot.token.properties.refreshTokenId,
        tokenDigest: digest,
        detectedAt: now,
        revocationReason: 'REFRESH_TOKEN_REUSE',
      });
      throw new AuthenticationError('TOKEN_REUSE_DETECTED');
    }
    if (!isRefreshable(snapshot, now)) throw new AuthenticationError('REFRESH_TOKEN_INVALID');

    const issued = this.refreshTokens.issue();
    const successor = new RefreshTokenRecord({
      refreshTokenId: this.identifiers.next(),
      tokenFamilyId: snapshot.family.properties.tokenFamilyId,
      tokenDigest: new RefreshTokenDigest(issued.digest),
      tokenState: 'ACTIVE',
      issuedAt: now,
      expiresAt: addSeconds(
        now,
        this.refreshLifetime(
          snapshot.session.properties.authenticationSecurityClassificationReference,
        ),
      ),
      createdAt: now,
      parentTokenId: snapshot.token.properties.refreshTokenId,
    });
    const accessToken = await this.jwt.signAccessToken({
      subject: snapshot.session.properties.identityId.value,
      sessionId: snapshot.session.properties.sessionId.value,
      jwtId: this.identifiers.next().value,
      authenticationMethods: snapshot.session.properties.authenticationMethods,
      authenticationAssurance: snapshot.session.properties.authenticationAssurance,
      sessionVersion: snapshot.session.properties.sessionVersion.value,
      ...(snapshot.session.properties.deviceSessionId === undefined
        ? {}
        : { deviceSessionId: snapshot.session.properties.deviceSessionId.value }),
    });
    await this.sessionRepository.rotateRefreshToken({
      presentedTokenId: snapshot.token.properties.refreshTokenId,
      presentedTokenDigest: digest,
      successorToken: successor,
      consumedAt: now,
    });
    return sessionResult(
      snapshot.session,
      accessToken,
      issued.rawToken,
      this.policy.accessTokenLifetimeSeconds,
    );
  }

  public async logout(
    identityId: UuidV7,
    sessionId: UuidV7,
    expectedSessionVersion: number,
  ): Promise<void> {
    await this.sessionRepository.revokeSession({
      identityId,
      sessionId,
      expectedSessionVersion,
      revokedAt: this.clock.now(),
      revocationReason: 'LOGOUT',
    });
  }

  public async logoutAll(
    identityId: UuidV7,
    authorizingSessionId: UuidV7,
    expectedSessionVersion: number,
  ): Promise<number> {
    return this.sessionRepository.revokeAllSessions({
      identityId,
      authorizingSessionId,
      expectedAuthorizingSessionVersion: expectedSessionVersion,
      revokedAt: this.clock.now(),
      revocationReason: 'LOGOUT_ALL',
    });
  }

  private async authenticatePassword(
    snapshot: IdentityAuthenticationSnapshot | null,
    password: string,
  ): Promise<IdentityAuthenticationSnapshot> {
    const credential = snapshot?.credentials.find(
      (candidate) =>
        candidate.properties.credentialType === 'PASSWORD' &&
        candidate.properties.credentialState === 'ACTIVE',
    );
    const passwordMatches = await this.passwordHashing.verifyForAuthentication(
      password,
      credential?.properties.protectedSecret.value,
    );
    assertAuthenticatable(snapshot, this.clock.now());
    if (!passwordMatches) {
      throw new AuthenticationError('AUTHENTICATION_FAILED');
    }
    return snapshot;
  }

  private async issueSession(
    request: SessionIssuanceRequest,
  ): Promise<IssuedAuthenticationSession> {
    const now = this.clock.now();
    const sessionPolicy = this.policy.sessions[request.classification];
    const session = new Session({
      sessionId: this.identifiers.next(),
      identityId: request.identityId,
      sessionClass: clientSessionClass(request.clientType),
      sessionState: 'ACTIVE',
      sessionVersion: new SessionVersion(1),
      authenticationAssurance: request.assurance,
      authenticationSecurityClassificationReference: request.classification,
      authenticationMethods: request.authenticationMethods,
      createdAt: now,
      lastActivityAt: now,
      idleExpiresAt: addSeconds(now, sessionPolicy.idleTimeoutSeconds),
      absoluteExpiresAt: addSeconds(now, sessionPolicy.absoluteTimeoutSeconds),
      aggregateVersion: new AggregateVersion(1),
      ...(request.deviceSessionId === undefined
        ? {}
        : { deviceSessionId: request.deviceSessionId }),
      ...(request.assurance === 'AAL2' ? { mfaVerifiedAt: now } : {}),
    });
    const family = new RefreshTokenFamily({
      tokenFamilyId: this.identifiers.next(),
      sessionId: session.properties.sessionId,
      familyState: 'ACTIVE',
      aggregateVersion: new AggregateVersion(1),
      createdAt: now,
    });
    const issued = this.refreshTokens.issue();
    const token = new RefreshTokenRecord({
      refreshTokenId: this.identifiers.next(),
      tokenFamilyId: family.properties.tokenFamilyId,
      tokenDigest: new RefreshTokenDigest(issued.digest),
      tokenState: 'ACTIVE',
      issuedAt: now,
      expiresAt: addSeconds(now, this.refreshLifetime(request.classification)),
      createdAt: now,
    });
    const accessToken = await this.jwt.signAccessToken({
      subject: request.identityId.value,
      sessionId: session.properties.sessionId.value,
      jwtId: this.identifiers.next().value,
      authenticationMethods: request.authenticationMethods,
      authenticationAssurance: request.assurance,
      sessionVersion: 1,
      ...(request.deviceSessionId === undefined
        ? {}
        : { deviceSessionId: request.deviceSessionId.value }),
    });
    await this.sessionRepository.insert({
      session,
      tokenFamilies: [family],
      refreshTokens: [token],
    });
    return sessionResult(
      session,
      accessToken,
      issued.rawToken,
      this.policy.accessTokenLifetimeSeconds,
    );
  }

  private refreshLifetime(classification: AuthenticationSecurityClassification): number {
    return classification === 'STANDARD_AUTHENTICATION'
      ? this.policy.standardRefreshTokenLifetimeSeconds
      : this.policy.privilegedRefreshTokenLifetimeSeconds;
  }
}

function canonicalizeIdentifier(type: IdentifierType, value: string): string {
  return type === 'EMAIL'
    ? new CanonicalEmailAddress(value).value
    : new CanonicalMobileNumber(value).value;
}

function assertAuthenticatable(
  snapshot: IdentityAuthenticationSnapshot | null,
  now: Date,
): asserts snapshot is IdentityAuthenticationSnapshot {
  if (
    snapshot?.identity.properties.identityState !== 'ACTIVE' ||
    snapshot.identity.properties.verificationState !== 'VERIFIED' ||
    (snapshot.identity.properties.lockedUntil !== undefined &&
      snapshot.identity.properties.lockedUntil > now)
  ) {
    throw new AuthenticationError('AUTHENTICATION_FAILED');
  }
}

function effectiveClassification(
  snapshot: IdentityAuthenticationSnapshot,
): AuthenticationSecurityClassification {
  const assignments = snapshot.classificationAssignments.filter(
    (assignment) => assignment.properties.assignmentState === 'EFFECTIVE',
  );
  const assignment = assignments[0];
  if (assignments.length !== 1 || assignment === undefined) {
    throw new AuthenticationError('AUTHENTICATION_FAILED');
  }
  return assignment.properties.classification;
}

function isRefreshable(
  snapshot: NonNullable<Awaited<ReturnType<SessionRepository['findByRefreshTokenDigest']>>>,
  now: Date,
): boolean {
  return (
    snapshot.token.properties.tokenState === 'ACTIVE' &&
    snapshot.family.properties.familyState === 'ACTIVE' &&
    snapshot.session.properties.sessionState === 'ACTIVE' &&
    snapshot.token.properties.expiresAt > now &&
    snapshot.session.properties.idleExpiresAt > now &&
    snapshot.session.properties.absoluteExpiresAt > now
  );
}

function clientSessionClass(clientType: AuthenticationClientType): SessionClass {
  return clientType === 'WEB' ? 'INTERACTIVE_WEB' : 'INTERACTIVE_MOBILE';
}

function addSeconds(value: Date, seconds: number): Date {
  return new Date(value.getTime() + seconds * 1_000);
}

function sessionResult(
  session: Session,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
): IssuedAuthenticationSession {
  return {
    accessToken,
    accessTokenExpiresIn: expiresIn,
    refreshToken,
    sessionId: session.properties.sessionId.value,
    sessionVersion: session.properties.sessionVersion.value,
    authenticationAssurance: session.properties.authenticationAssurance,
  };
}
