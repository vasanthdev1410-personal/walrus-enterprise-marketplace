import type { AuthenticationSecurityClassification } from '../../identity/value-objects/authentication-security-classification';
import type { AggregateVersion } from '../../shared/value-objects/aggregate-version';
import type { CorrelationIdentifier } from '../../shared/value-objects/correlation-identifier';
import type { UuidV7 } from '../../shared/value-objects/uuid-v7';
import type { AuthenticationAssuranceLevel } from '../value-objects/authentication-assurance-level';
import type { AuthenticationMethod } from '../value-objects/authentication-method';
import type { SessionClass } from '../value-objects/session-class';
import type { SessionState } from '../value-objects/session-state';
import type { SessionVersion } from '../value-objects/session-version';

export interface SessionProperties {
  sessionId: UuidV7;
  identityId: UuidV7;
  sessionClass: SessionClass;
  sessionState: SessionState;
  sessionVersion: SessionVersion;
  authenticationAssurance: AuthenticationAssuranceLevel;
  authenticationSecurityClassificationReference: AuthenticationSecurityClassification;
  authenticationMethods: readonly AuthenticationMethod[];
  createdAt: Date;
  lastActivityAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  aggregateVersion: AggregateVersion;
  revokedAt?: Date;
  revocationReason?: string;
  deviceSessionId?: UuidV7;
  mfaVerifiedAt?: Date;
  correlationId?: CorrelationIdentifier;
}

export class Session {
  public readonly properties: Readonly<SessionProperties>;

  public constructor(properties: SessionProperties) {
    if (properties.idleExpiresAt > properties.absoluteExpiresAt) {
      throw new Error('Session idle expiry cannot exceed absolute expiry');
    }
    if (properties.lastActivityAt < properties.createdAt) {
      throw new Error('Session last activity cannot precede creation');
    }
    if (properties.sessionState === 'REVOKED' && properties.revokedAt === undefined) {
      throw new Error('Revoked Session requires revokedAt');
    }
    if (properties.sessionClass !== 'RECOVERY' && properties.authenticationAssurance === 'AAL0') {
      throw new Error('Ordinary authenticated Session cannot have AAL0');
    }
    // AAL2 is established only after an approved MFA factor is successfully
    // verified for the current authentication event (approved Module 01
    // assurance model); mfaVerifiedAt records that event.
    if (properties.authenticationAssurance === 'AAL2' && properties.mfaVerifiedAt === undefined) {
      throw new Error('AAL2 Session requires mfaVerifiedAt');
    }
    this.properties = Object.freeze({
      ...properties,
      authenticationMethods: Object.freeze([...properties.authenticationMethods]),
    });
    Object.freeze(this);
  }
}
