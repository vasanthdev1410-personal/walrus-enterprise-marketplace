import type { ProtectedValue } from '../../shared/value-objects/protected-value';
import type { UuidV7 } from '../../shared/value-objects/uuid-v7';

export interface PasswordHistoryRecordProperties {
  passwordHistoryId: UuidV7;
  identityId: UuidV7;
  passwordHash: ProtectedValue;
  hashAlgorithmReference: string;
  createdAt: Date;
}

export class PasswordHistoryRecord {
  public readonly properties: Readonly<PasswordHistoryRecordProperties>;

  public constructor(properties: PasswordHistoryRecordProperties) {
    if (properties.hashAlgorithmReference.trim().length === 0) {
      throw new Error('Hash algorithm reference cannot be empty');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
