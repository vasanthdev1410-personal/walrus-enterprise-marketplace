import type { AggregateVersion } from '../../shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../shared/value-objects/uuid-v7';
import type { RefreshTokenFamilyState } from '../value-objects/refresh-token-state';

export interface RefreshTokenFamilyProperties {
  tokenFamilyId: UuidV7;
  sessionId: UuidV7;
  familyState: RefreshTokenFamilyState;
  aggregateVersion: AggregateVersion;
  createdAt: Date;
  revokedAt?: Date;
  revocationReason?: string;
  reuseDetectedAt?: Date;
}

export class RefreshTokenFamily {
  public readonly properties: Readonly<RefreshTokenFamilyProperties>;

  public constructor(properties: RefreshTokenFamilyProperties) {
    if (properties.familyState === 'REVOKED' && properties.revokedAt === undefined) {
      throw new Error('Revoked Refresh Token Family requires revokedAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
