import type { ProtectedValue } from '../../shared/value-objects/protected-value';
import type { UuidV7 } from '../../shared/value-objects/uuid-v7';
import type { MfaFactorState } from '../value-objects/mfa-factor-state';
import type { MfaFactorType } from '../value-objects/mfa-factor-type';

export interface MfaFactorProperties {
  mfaFactorId: UuidV7;
  mfaEnrollmentId: UuidV7;
  factorType: MfaFactorType;
  factorState: MfaFactorState;
  encryptedSecretOrReference: ProtectedValue;
  encryptionKeyVersion: string;
  createdAt: Date;
  updatedAt: Date;
  verifiedAt?: Date;
  lastUsedAt?: Date;
  revokedAt?: Date;
  replacementReason?: string;
  lastAcceptedTimeStep?: bigint;
}

export class MfaFactor {
  public readonly properties: Readonly<MfaFactorProperties>;

  public constructor(properties: MfaFactorProperties) {
    if (properties.lastAcceptedTimeStep !== undefined && properties.lastAcceptedTimeStep < 0n) {
      throw new Error('Last accepted TOTP time step must be non-negative');
    }
    if (properties.factorState === 'ACTIVE' && properties.verifiedAt === undefined) {
      throw new Error('Active MFA factor requires verifiedAt');
    }
    if (properties.factorState === 'REVOKED' && properties.revokedAt === undefined) {
      throw new Error('Revoked MFA factor requires revokedAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
