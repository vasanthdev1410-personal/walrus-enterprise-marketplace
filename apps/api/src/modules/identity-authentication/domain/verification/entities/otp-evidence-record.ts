import type { ProtectedValue } from '../../shared/value-objects/protected-value';
import type { UuidV7 } from '../../shared/value-objects/uuid-v7';
import type { OtpEvidenceState } from '../value-objects/otp-evidence-state';

export interface OtpEvidenceRecordProperties {
  otpEvidenceId: UuidV7;
  challengeId: UuidV7;
  evidenceDigest: ProtectedValue;
  evidenceState: OtpEvidenceState;
  expiresAt: Date;
  createdAt: Date;
  consumedAt?: Date;
}

export class OtpEvidenceRecord {
  public readonly properties: Readonly<OtpEvidenceRecordProperties>;

  public constructor(properties: OtpEvidenceRecordProperties) {
    if (properties.expiresAt <= properties.createdAt) {
      throw new Error('OTP Evidence must expire after creation');
    }
    if (properties.evidenceState === 'CONSUMED' && properties.consumedAt === undefined) {
      throw new Error('Consumed OTP Evidence requires consumedAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
