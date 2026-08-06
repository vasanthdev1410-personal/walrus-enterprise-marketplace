import type { AggregateVersion } from '../../shared/value-objects/aggregate-version';
import type { CorrelationIdentifier } from '../../shared/value-objects/correlation-identifier';
import type { ProtectedValue } from '../../shared/value-objects/protected-value';
import type { UuidV7 } from '../../shared/value-objects/uuid-v7';
import type { VerificationChallengeState } from '../value-objects/challenge-state';
import type { VerificationChannel } from '../value-objects/verification-channel';
import type { VerificationPurpose } from '../value-objects/verification-purpose';

export interface VerificationChallengeProperties {
  challengeId: UuidV7;
  identityId?: UuidV7;
  purpose: VerificationPurpose;
  channelType: VerificationChannel;
  protectedDestinationReference: ProtectedValue;
  challengeDigest: ProtectedValue;
  challengeState: VerificationChallengeState;
  attemptCount: number;
  maximumAttempts: number;
  expiresAt: Date;
  aggregateVersion: AggregateVersion;
  createdAt: Date;
  updatedAt: Date;
  consumedAt?: Date;
  cancelledAt?: Date;
  correlationId?: CorrelationIdentifier;
}

export class VerificationChallenge {
  public readonly properties: Readonly<VerificationChallengeProperties>;

  public constructor(properties: VerificationChallengeProperties) {
    if (!Number.isSafeInteger(properties.attemptCount) || properties.attemptCount < 0) {
      throw new Error('Verification attempt count must be a non-negative integer');
    }
    if (!Number.isSafeInteger(properties.maximumAttempts) || properties.maximumAttempts < 1) {
      throw new Error('Verification maximum attempts must be a positive integer');
    }
    if (properties.attemptCount > properties.maximumAttempts) {
      throw new Error('Verification attempt count cannot exceed maximum attempts');
    }
    if (properties.expiresAt <= properties.createdAt) {
      throw new Error('Verification Challenge must expire after creation');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
