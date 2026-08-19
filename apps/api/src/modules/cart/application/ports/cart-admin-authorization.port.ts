import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M07-AUTHZ-001 §2.2 (D-09, Module 02 owner sign-off RECORDED 2026-08-19).
 * Cart administrative authorization port. Module 07 never evaluates roles
 * itself (A-02): admin cart read/lifecycle actions are decided by Module 02
 * through this port (the approved `cart.admin.read` / `cart.admin.manage`
 * identifiers — WEMP-M07-AUTHZ-001). The M07-M4 milestone wires the Module 02
 * permission adapter; until then the production wiring fails closed (no
 * grant → denied). Fail closed: any resolution error denies the action;
 * no hidden SUPER_ADMIN bypass.
 */
export type CartAdminAction = 'cart.admin.read' | 'cart.admin.manage';

export interface CartAdminAuthorizationPort {
  isGranted(identityId: UuidV7, action: CartAdminAction): Promise<boolean>;
}
