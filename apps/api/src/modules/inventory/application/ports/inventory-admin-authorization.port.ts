import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M05-SPEC-001 §15 / WEMP-M05-AUTHZ-001 (decision D-05, Module 02
 * owner sign-off RECORDED 2026-08-15). Inventory administrative
 * authorization. Module 05 never evaluates roles itself: admin
 * corrections and audit views are decided by Module 02 through this port
 * (the approved `inventory.*` identifiers — WEMP-M05-AUTHZ-001). The
 * M05-M4 milestone wires the Module 02 permission adapter; until then the
 * production wiring fails closed (no grant → denied). Fail closed: any
 * resolution error denies the action.
 */
export type InventoryAdminAction = 'inventory.adjust.admin' | 'inventory.audit.view';

export interface InventoryAdminAuthorizationPort {
  isGranted(identityId: UuidV7, action: InventoryAdminAction): Promise<boolean>;
}
