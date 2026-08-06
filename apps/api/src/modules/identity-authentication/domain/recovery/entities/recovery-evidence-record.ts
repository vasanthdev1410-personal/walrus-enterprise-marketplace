import type { ProtectedValue } from '../../shared/value-objects/protected-value';
import type { UuidV7 } from '../../shared/value-objects/uuid-v7';
import type {
  RecoveryEvidenceBoundary,
  RecoveryEvidenceState,
  RecoveryEvidenceType,
} from '../value-objects/recovery-evidence';

export interface RecoveryEvidenceRecordProperties {
  recoveryEvidenceId: UuidV7;
  recoveryRequestId: UuidV7;
  evidenceType: RecoveryEvidenceType;
  protectedEvidenceReference: ProtectedValue;
  evidenceState: RecoveryEvidenceState;
  evidenceBoundary: RecoveryEvidenceBoundary;
  expiresAt: Date;
  createdAt: Date;
  verifiedAt?: Date;
  consumedAt?: Date;
  failureReason?: string;
}

export class RecoveryEvidenceRecord {
  public readonly properties: Readonly<RecoveryEvidenceRecordProperties>;

  public constructor(properties: RecoveryEvidenceRecordProperties) {
    if (properties.expiresAt <= properties.createdAt) {
      throw new Error('Recovery Evidence must expire after creation');
    }
    if (properties.evidenceState === 'VERIFIED' && properties.verifiedAt === undefined) {
      throw new Error('Verified Recovery Evidence requires verifiedAt');
    }
    if (properties.evidenceState === 'CONSUMED' && properties.consumedAt === undefined) {
      throw new Error('Consumed Recovery Evidence requires consumedAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
