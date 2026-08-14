import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M04-SPEC-001 §15 (decision D-11). Product administrative
 * authorization. Module 04 never evaluates roles itself: admin moderation
 * actions are decided by Module 02 through this port (the approved
 * `product.*` catalog entries — WEMP-M04-AUTHZ-001). The M04-M4 milestone
 * wires the Module 02 permission adapter; until then the production wiring
 * fails closed (no grant → denied). Fail closed: any resolution error denies
 * the action.
 */
export type ProductAdminAction =
  'product.review.decide' | 'product.audit.view' | 'product.media.read';

export interface ProductAdminAuthorizationPort {
  isGranted(identityId: UuidV7, action: ProductAdminAction): Promise<boolean>;
}
