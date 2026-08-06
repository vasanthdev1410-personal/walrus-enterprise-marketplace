import type { ProtectedValue } from '../../shared/value-objects/protected-value';
import type { UuidV7 } from '../../shared/value-objects/uuid-v7';
import type {
  RecoveryAttemptOutcome,
  RecoveryAttemptType,
} from '../value-objects/recovery-attempt';

export interface RecoveryAttemptProperties {
  recoveryAttemptId: UuidV7;
  recoveryRequestId: UuidV7;
  attemptType: RecoveryAttemptType;
  outcome: RecoveryAttemptOutcome;
  attemptedAt: Date;
  createdAt: Date;
  failureReason?: string;
  protectedSourceIpReference?: ProtectedValue;
  protectedDeviceReference?: ProtectedValue;
}

export class RecoveryAttempt {
  public readonly properties: Readonly<RecoveryAttemptProperties>;

  public constructor(properties: RecoveryAttemptProperties) {
    if (properties.createdAt < properties.attemptedAt) {
      throw new Error('Recovery Attempt createdAt cannot precede attemptedAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
