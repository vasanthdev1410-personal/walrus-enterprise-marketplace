import type { UuidV7 } from '../../shared/value-objects/uuid-v7';
import type { ProtectedValue } from '../../shared/value-objects/protected-value';
import type { IdentifierType } from '../value-objects/identifier-type';
import type { IdentifierVerificationState } from '../value-objects/verification-state';

export interface IdentityIdentifierProperties {
  identifierId: UuidV7;
  identityId: UuidV7;
  identifierType: IdentifierType;
  protectedNormalizedValue: ProtectedValue;
  lookupDigest: ProtectedValue;
  lookupKeyVersion: string;
  verificationState: IdentifierVerificationState;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
  verifiedAt?: Date;
  retiredAt?: Date;
  anonymizedAt?: Date;
}

export class IdentityIdentifier {
  public readonly properties: Readonly<IdentityIdentifierProperties>;

  public constructor(properties: IdentityIdentifierProperties) {
    if (properties.lookupKeyVersion.length === 0) {
      throw new Error('Identifier lookup key version cannot be empty');
    }
    if (properties.verificationState === 'VERIFIED' && properties.verifiedAt === undefined) {
      throw new Error('Verified identifier requires verifiedAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
