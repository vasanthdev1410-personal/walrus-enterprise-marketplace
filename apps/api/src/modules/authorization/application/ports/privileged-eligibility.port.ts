import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { RoleName } from '../../domain/value-objects/role-name';

export interface PrivilegedEligibilityPort {
  isEligible(identityId: UuidV7, roleName: RoleName): Promise<boolean>;
}
