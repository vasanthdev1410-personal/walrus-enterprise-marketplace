import type { UuidV7 } from '../../shared/value-objects/uuid-v7';
import type { RecoveryCodeSetState } from '../value-objects/recovery-code-state';

export interface RecoveryCodeSetProperties {
  recoveryCodeSetId: UuidV7;
  identityId: UuidV7;
  setVersion: number;
  setState: RecoveryCodeSetState;
  createdAt: Date;
  invalidatedAt?: Date;
  invalidationReason?: string;
}

export class RecoveryCodeSet {
  public readonly properties: Readonly<RecoveryCodeSetProperties>;

  public constructor(properties: RecoveryCodeSetProperties) {
    if (!Number.isSafeInteger(properties.setVersion) || properties.setVersion < 1) {
      throw new Error('Recovery Code Set version must be positive');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
