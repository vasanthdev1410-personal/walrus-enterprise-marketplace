import type { AggregateVersion } from '../../shared/value-objects/aggregate-version';
import type { ProtectedValue } from '../../shared/value-objects/protected-value';
import type { UuidV7 } from '../../shared/value-objects/uuid-v7';
import type { TrustedDeviceState } from '../value-objects/trusted-device-state';

export interface TrustedDeviceProperties {
  trustedDeviceId: UuidV7;
  identityId: UuidV7;
  protectedDeviceFingerprint: ProtectedValue;
  deviceState: TrustedDeviceState;
  trustExpiresAt: Date;
  aggregateVersion: AggregateVersion;
  createdAt: Date;
  updatedAt: Date;
  lastSeenAt?: Date;
  revokedAt?: Date;
  revocationReason?: string;
}

export class TrustedDevice {
  public readonly properties: Readonly<TrustedDeviceProperties>;

  public constructor(properties: TrustedDeviceProperties) {
    if (properties.trustExpiresAt <= properties.createdAt) {
      throw new Error('Trusted Device expiry must follow creation');
    }
    if (properties.deviceState === 'REVOKED' && properties.revokedAt === undefined) {
      throw new Error('Revoked Trusted Device requires revokedAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
