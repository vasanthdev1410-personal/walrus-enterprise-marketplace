import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M03-CONTRACT-001 §B / WEMP-M03-AUTHZ-001 (decision D-11). The Module 02
 * ↔ Module 03 authorization contract. Module 03 never evaluates roles itself
 * and never reads Module 02 storage: seller operations depend on Module 02
 * decisions consumed through this port. APPROVED → ACTIVE is gated on a
 * successful SELLER role assignment — no assignment, no activation.
 */
export interface SellerRoleAssignmentRequest {
  readonly targetIdentityId: UuidV7;
  readonly sellerProfileId: UuidV7;
  readonly correlationId?: string;
}

export interface SellerRoleRevocationRequest {
  readonly identityId: UuidV7;
  readonly revokedByIdentityId?: UuidV7;
  readonly reasonReference?: string;
  readonly correlationId?: string;
}

export type SellerRoleAssignmentResult =
  | { readonly outcome: 'GRANTED' }
  | { readonly outcome: 'DENIED'; readonly reason: string }
  | { readonly outcome: 'FAILED'; readonly reason: string };

export interface Module02AuthorizationContractPort {
  /** True when the identity holds an ACTIVE SELLER role assignment. */
  isSellerRoleGranted(identityId: UuidV7): Promise<boolean>;
  /**
   * Requests the SELLER role assignment through the approved Module 02 path.
   * Idempotent: an already-granted SELLER role resolves to GRANTED.
   */
  requestSellerRoleAssignment(
    request: SellerRoleAssignmentRequest,
  ): Promise<SellerRoleAssignmentResult>;
  /**
   * Revokes the identity's ACTIVE SELLER role assignment(s). Idempotent:
   * nothing to revoke resolves to GRANTED. Used for explicit revocation and
   * as the compensating action when a seller activation cannot commit, so a
   * SELLER role is never left effective for a seller that did not reach the
   * required lifecycle state.
   */
  revokeSellerRole(request: SellerRoleRevocationRequest): Promise<SellerRoleAssignmentResult>;
}
