import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { AuthorizationDecisionOutcome } from '../value-objects/authorization-decision-outcome';
import type { AuthorizationDenialReason } from '../value-objects/authorization-denial-reason';
import type { ResourceClassification } from '../value-objects/resource-classification';

/**
 * Part 6.5 §22 (Module 02 source material). The immutable authorization audit
 * record. Every decision is recorded with correlation/session identifiers for
 * forensics; sensitive authentication secrets are never recorded. The record
 * is append-only and never updated.
 */
export interface AuthorizationDecisionRecordProperties {
  readonly authorizationReference: string;
  /** Actor performing the operation; distinct from the target/subject for administration. */
  readonly actorIdentityId?: UuidV7;
  readonly subjectIdentityId: UuidV7;
  readonly permissionId: string;
  readonly resourceClassification?: ResourceClassification;
  readonly decisionOutcome: AuthorizationDecisionOutcome;
  readonly denialReason?: AuthorizationDenialReason;
  readonly sessionIdentifier?: string;
  readonly correlationId?: string;
  readonly decidedAt: Date;
  readonly createdAt: Date;
}

export class AuthorizationDecisionRecord {
  public readonly properties: Readonly<AuthorizationDecisionRecordProperties>;

  public constructor(properties: AuthorizationDecisionRecordProperties) {
    if (properties.authorizationReference.trim() === '') {
      throw new Error('Authorization decision record requires a reference');
    }
    if (properties.permissionId.trim() === '') {
      throw new Error('Authorization decision record requires a permission identifier');
    }
    if (properties.decisionOutcome === 'GRANTED' && properties.denialReason !== undefined) {
      throw new Error('Granted decision record must not carry a denial reason');
    }
    if (properties.decisionOutcome === 'DENIED' && properties.denialReason === undefined) {
      throw new Error('Denied decision record requires a denial reason');
    }
    if (properties.sessionIdentifier?.trim() === '') {
      throw new Error('Session identifier must not be empty');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
