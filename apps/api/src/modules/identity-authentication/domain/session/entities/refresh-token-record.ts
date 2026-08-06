import type { UuidV7 } from '../../shared/value-objects/uuid-v7';
import type { RefreshTokenDigest } from '../value-objects/refresh-token-digest';
import type { RefreshTokenState } from '../value-objects/refresh-token-state';

export interface RefreshTokenRecordProperties {
  refreshTokenId: UuidV7;
  tokenFamilyId: UuidV7;
  tokenDigest: RefreshTokenDigest;
  tokenState: RefreshTokenState;
  issuedAt: Date;
  expiresAt: Date;
  createdAt: Date;
  consumedAt?: Date;
  revokedAt?: Date;
  successorTokenId?: UuidV7;
  parentTokenId?: UuidV7;
  reuseDetectedAt?: Date;
}

export class RefreshTokenRecord {
  public readonly properties: Readonly<RefreshTokenRecordProperties>;

  public constructor(properties: RefreshTokenRecordProperties) {
    if (properties.expiresAt <= properties.issuedAt) {
      throw new Error('Refresh Token expiry must follow issuance');
    }
    if (properties.tokenState === 'USED' && properties.consumedAt === undefined) {
      throw new Error('Used Refresh Token requires consumedAt');
    }
    if (properties.tokenState === 'REVOKED' && properties.revokedAt === undefined) {
      throw new Error('Revoked Refresh Token requires revokedAt');
    }
    if (properties.successorTokenId?.value === properties.refreshTokenId.value) {
      throw new Error('Refresh Token cannot succeed itself');
    }
    if (properties.parentTokenId?.value === properties.refreshTokenId.value) {
      throw new Error('Refresh Token cannot parent itself');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
