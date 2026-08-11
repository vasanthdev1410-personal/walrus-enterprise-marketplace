import type { RoleName } from './value-objects/role-name';

/**
 * Part 6.2 §7 (Module 02 source material). The approved role hierarchy defines
 * administrative scope only — it never grants permissions and is never used as
 * permission inheritance. A role administers every role below it in the chain;
 * a role never administers itself.
 *
 * Super Admin → Admin → Seller → Customer
 */
const ADMINISTRATIVE_SCOPE: Readonly<Record<RoleName, readonly RoleName[]>> = Object.freeze({
  SUPER_ADMIN: Object.freeze<readonly RoleName[]>(['ADMIN', 'SELLER', 'CUSTOMER']),
  ADMIN: Object.freeze<readonly RoleName[]>(['SELLER', 'CUSTOMER']),
  SELLER: Object.freeze<readonly RoleName[]>(['CUSTOMER']),
  CUSTOMER: Object.freeze<readonly RoleName[]>([]),
});

export class RoleHierarchy {
  public manages(administrator: RoleName, subordinate: RoleName): boolean {
    return ADMINISTRATIVE_SCOPE[administrator].includes(subordinate);
  }

  public administrativeScope(administrator: RoleName): readonly RoleName[] {
    return ADMINISTRATIVE_SCOPE[administrator];
  }
}
