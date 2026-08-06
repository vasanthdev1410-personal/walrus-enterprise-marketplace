import type { UuidV7 } from '../../shared/value-objects/uuid-v7';
import type { MfaEnrollmentState } from '../value-objects/mfa-factor-type';

export interface MfaEnrollmentProperties {
  mfaEnrollmentId: UuidV7;
  identityId: UuidV7;
  enrollmentState: MfaEnrollmentState;
  createdAt: Date;
  updatedAt: Date;
  activatedAt?: Date;
  disabledAt?: Date;
  replacementRequiredAt?: Date;
}

export class MfaEnrollment {
  public readonly properties: Readonly<MfaEnrollmentProperties>;

  public constructor(properties: MfaEnrollmentProperties) {
    if (properties.enrollmentState === 'ACTIVE' && properties.activatedAt === undefined) {
      throw new Error('Active MFA enrollment requires activatedAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
