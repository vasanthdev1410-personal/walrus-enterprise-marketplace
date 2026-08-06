import type { AggregateVersion } from '../../shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../shared/value-objects/uuid-v7';
import type { IdentityState } from '../value-objects/identity-state';
import type { IdentityVerificationState } from '../value-objects/verification-state';

export interface IdentityProperties {
  identityId: UuidV7;
  identityState: IdentityState;
  verificationState: IdentityVerificationState;
  aggregateVersion: AggregateVersion;
  createdAt: Date;
  updatedAt: Date;
  lockedUntil?: Date;
  disabledAt?: Date;
  anonymizedAt?: Date;
  deletionRequestedAt?: Date;
}

export class Identity {
  public readonly properties: Readonly<IdentityProperties>;

  public constructor(properties: IdentityProperties) {
    if (properties.updatedAt < properties.createdAt) {
      throw new Error('Identity updatedAt cannot precede createdAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
