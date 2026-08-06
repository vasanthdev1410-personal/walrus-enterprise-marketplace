import type { ProtectedValue } from '../../shared/value-objects/protected-value';
import type { UuidV7 } from '../../shared/value-objects/uuid-v7';
import type { VerificationAttemptOutcome } from '../value-objects/verification-attempt-outcome';

export interface VerificationAttemptProperties {
  verificationAttemptId: UuidV7;
  challengeId: UuidV7;
  outcome: VerificationAttemptOutcome;
  attemptedAt: Date;
  createdAt: Date;
  sourceIpReference?: ProtectedValue;
  deviceReference?: ProtectedValue;
  failureReason?: string;
}

export class VerificationAttempt {
  public readonly properties: Readonly<VerificationAttemptProperties>;

  public constructor(properties: VerificationAttemptProperties) {
    if (properties.createdAt < properties.attemptedAt) {
      throw new Error('Verification Attempt createdAt cannot precede attemptedAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
