import type { AggregateVersion } from '../../shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../shared/value-objects/uuid-v7';
import type { AuthenticationSecurityClassification } from '../value-objects/authentication-security-classification';

export const CLASSIFICATION_ASSIGNMENT_STATES = ['EFFECTIVE', 'ENDED'] as const;
export type ClassificationAssignmentState = (typeof CLASSIFICATION_ASSIGNMENT_STATES)[number];

export interface AuthenticationSecurityClassificationAssignmentProperties {
  classificationAssignmentId: UuidV7;
  identityId: UuidV7;
  classification: AuthenticationSecurityClassification;
  effectiveAt: Date;
  assignmentState: ClassificationAssignmentState;
  aggregateVersion: AggregateVersion;
  createdAt: Date;
  updatedAt: Date;
  endedAt?: Date;
  sourceContractReference?: string;
  reasonCode?: string;
}

export class AuthenticationSecurityClassificationAssignment {
  public readonly properties: Readonly<AuthenticationSecurityClassificationAssignmentProperties>;

  public constructor(properties: AuthenticationSecurityClassificationAssignmentProperties) {
    if (properties.assignmentState === 'ENDED' && properties.endedAt === undefined) {
      throw new Error('Ended classification assignment requires endedAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
