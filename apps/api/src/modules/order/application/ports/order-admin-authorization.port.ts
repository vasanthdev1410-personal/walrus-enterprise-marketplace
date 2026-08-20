import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M08-AUTHZ-001 §2.2 (D-08, Module 02 owner sign-off RECORDED
 * 2026-08-20; M08-M4). Order administrative authorization port. Module 08
 * never evaluates roles itself (A-02): admin order read/lifecycle actions are
 * decided by Module 02 through this port (the approved `order.admin.read` /
 * `order.admin.manage` identifiers — WEMP-M08-AUTHZ-001). The M08-M4
 * milestone wires the Module 02 permission adapter; until then the production
 * wiring fails closed (no grant → denied). Fail closed: any resolution error
 * denies the action; no hidden SUPER_ADMIN bypass.
 */
export type OrderAdminAction = 'order.admin.read' | 'order.admin.manage';

export interface OrderAdminAuthorizationPort {
  isGranted(identityId: UuidV7, action: OrderAdminAction): Promise<boolean>;
}
