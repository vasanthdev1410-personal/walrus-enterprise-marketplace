import type { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { VerificationState } from '../value-objects/verification-state';
import type { VerificationType } from '../value-objects/verification-type';

/**
 * WEMP-M03-SPEC-001 §5. Per-type KYC/KYB verification record. Re-verification
 * creates a new generation; prior generations are retained append-only.
 * submittedByIdentityId is mandatory once a submission exists; a reviewed
 * record requires the reviewing identity.
 */
export interface SellerBusinessVerificationProperties {
  readonly verificationId: UuidV7;
  readonly sellerProfileId: UuidV7;
  readonly verificationType: VerificationType;
  readonly state: VerificationState;
  readonly generation: number;
  readonly submittedByIdentityId: UuidV7;
  readonly reviewedByIdentityId?: UuidV7;
  readonly reviewedAt?: Date;
  readonly aggregateVersion: AggregateVersion;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class SellerBusinessVerification {
  public readonly properties: Readonly<SellerBusinessVerificationProperties>;

  public constructor(properties: SellerBusinessVerificationProperties) {
    if (!Number.isSafeInteger(properties.generation) || properties.generation < 1) {
      throw new Error('Verification generation must be a positive safe integer');
    }
    if (
      (properties.reviewedByIdentityId === undefined) !== (properties.reviewedAt === undefined)
    ) {
      throw new Error('Verification review identity and review time must be provided together');
    }
    if (
      properties.reviewedByIdentityId !== undefined &&
      properties.state !== 'APPROVED' &&
      properties.state !== 'REJECTED'
    ) {
      throw new Error('Reviewed verification must be APPROVED or REJECTED');
    }
    if (properties.updatedAt < properties.createdAt) {
      throw new Error('Verification updatedAt cannot precede createdAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
