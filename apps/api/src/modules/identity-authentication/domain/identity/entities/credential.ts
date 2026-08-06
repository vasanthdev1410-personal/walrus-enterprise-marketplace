import type { ProtectedValue } from '../../shared/value-objects/protected-value';
import type { UuidV7 } from '../../shared/value-objects/uuid-v7';
import type { CredentialState } from '../value-objects/credential-state';
import type { CredentialType } from '../value-objects/credential-type';

export interface CredentialProperties {
  credentialId: UuidV7;
  identityId: UuidV7;
  credentialType: CredentialType;
  credentialVersion: number;
  credentialState: CredentialState;
  protectedSecret: ProtectedValue;
  protectionKeyVersion?: string;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt?: Date;
  compromisedAt?: Date;
  revokedAt?: Date;
  replacedAt?: Date;
}

export class Credential {
  public readonly properties: Readonly<CredentialProperties>;

  public constructor(properties: CredentialProperties) {
    if (!Number.isSafeInteger(properties.credentialVersion) || properties.credentialVersion < 1) {
      throw new Error('Credential version must be a positive safe integer');
    }
    if (properties.credentialState === 'COMPROMISED' && properties.compromisedAt === undefined) {
      throw new Error('Compromised Credential requires compromisedAt');
    }
    if (properties.credentialState === 'REVOKED' && properties.revokedAt === undefined) {
      throw new Error('Revoked Credential requires revokedAt');
    }
    if (properties.credentialState === 'REPLACED' && properties.replacedAt === undefined) {
      throw new Error('Replaced Credential requires replacedAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
