import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M09-AUTHZ-001 §2.2 (M09-M4). Payment administrative authorization
 * port. Module 09 never evaluates roles itself (A-02): admin payment
 * read/refund actions are decided by Module 02 through this port (the
 * approved `payment.admin.read` / `payment.admin.manage` identifiers).
 * Fail closed: any resolution error denies the action.
 */
export type PaymentAdminAction = 'payment.admin.read' | 'payment.admin.manage';

export interface PaymentAdminAuthorizationPort {
  isGranted(identityId: UuidV7, action: PaymentAdminAction): Promise<boolean>;
}
