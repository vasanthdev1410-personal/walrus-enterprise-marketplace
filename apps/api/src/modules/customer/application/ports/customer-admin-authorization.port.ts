import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M06-SPEC-001 §12 / WEMP-M06-AUTHZ-001 (decision D-07, Module 02
 * owner sign-off PENDING — recorded for M06-M4). Customer administrative
 * authorization. Module 06 never evaluates roles itself: admin customer
 * read/lifecycle/audit actions are decided by Module 02 through this port
 * (the proposed `customer.*` identifiers — WEMP-M06-AUTHZ-001). The
 * M06-M4 milestone wires the Module 02 permission adapter; until then the
 * production wiring fails closed (no grant → denied). Fail closed: any
 * resolution error denies the action; no hidden SUPER_ADMIN bypass.
 */
export type CustomerAdminAction =
  'customer.read' | 'customer.lifecycle.manage' | 'customer.audit.view';

export interface CustomerAdminAuthorizationPort {
  isGranted(identityId: UuidV7, action: CustomerAdminAction): Promise<boolean>;
}
