import type { ProtectedValue } from '../../shared/value-objects/protected-value';
import type { UuidV7 } from '../../shared/value-objects/uuid-v7';
import type { RecoveryCodeState } from '../value-objects/recovery-code-state';

export interface RecoveryCodeRecordProperties {
  recoveryCodeId: UuidV7;
  recoveryCodeSetId: UuidV7;
  codeDigest: ProtectedValue;
  codeState: RecoveryCodeState;
  createdAt: Date;
  consumedAt?: Date;
  invalidatedAt?: Date;
}

export class RecoveryCodeRecord {
  public readonly properties: Readonly<RecoveryCodeRecordProperties>;

  public constructor(properties: RecoveryCodeRecordProperties) {
    if (properties.codeState === 'CONSUMED' && properties.consumedAt === undefined) {
      throw new Error('Consumed Recovery Code requires consumedAt');
    }
    if (properties.codeState === 'INVALIDATED' && properties.invalidatedAt === undefined) {
      throw new Error('Invalidated Recovery Code requires invalidatedAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
