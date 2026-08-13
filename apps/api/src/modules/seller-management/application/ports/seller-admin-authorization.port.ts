import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M03-SPEC-001 §12.2/§12.4 / decision D-11. Seller administrative
 * authorization. Module 03 never evaluates roles itself: admin actions
 * (review claim, review decision, suspension/reactivation, evidence
 * inspection, legal-hold management) are decided by Module 02 through this
 * port. The M03-M4 milestone wires the Module 02 permission adapter; until
 * then the production wiring fails closed (no grant → denied). Fail closed:
 * any resolution error denies the action.
 */
export type SellerAdminAction =
  | 'seller.review.claim'
  | 'seller.review.decide'
  | 'seller.suspend.manage'
  | 'seller.evidence.read'
  | 'seller.audit.view'
  | 'seller.legalhold.manage';

export interface SellerAdminAuthorizationPort {
  isGranted(identityId: UuidV7, action: SellerAdminAction): Promise<boolean>;
}
