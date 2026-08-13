import type { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { SellerAgreement } from '../entities/seller-agreement';
import type { SellerBusinessAuditRecord } from '../entities/seller-business-audit-record';
import type { SellerBusinessVerification } from '../entities/seller-business-verification';
import type { SellerIdentityAssociation } from '../entities/seller-identity-association';
import type { SellerOrganization } from '../entities/seller-organization';
import type { SellerProfile } from '../entities/seller-profile';
import type { SellerStateTransition } from '../entities/seller-state-transition';
import type { SellerVerificationEvidence } from '../entities/seller-verification-evidence';
import type { SellerWarehouse } from '../entities/seller-warehouse';

/**
 * WEMP-M03-PLAN-001 M03-M2. Module 03-owned seller aggregate repository. All
 * mutations are atomic change sets guarded by the aggregate version; a stale
 * version throws OptimisticConcurrencyError without mutating any state.
 * Cross-module references (identityId) are logical UUIDv7 values — the
 * repository never reads Module 01 or Module 02 storage.
 */
export interface SellerProfileRepository {
  findById(sellerProfileId: UuidV7): Promise<SellerProfile | null>;
  findOrganization(organizationId: UuidV7): Promise<SellerOrganization | null>;
  findAssociations(sellerProfileId: UuidV7): Promise<readonly SellerIdentityAssociation[]>;
  findVerifications(sellerProfileId: UuidV7): Promise<readonly SellerBusinessVerification[]>;
  findEvidence(verificationId: UuidV7): Promise<readonly SellerVerificationEvidence[]>;
  findTransitions(sellerProfileId: UuidV7): Promise<readonly SellerStateTransition[]>;
  findWarehouses(sellerProfileId: UuidV7): Promise<readonly SellerWarehouse[]>;
  findAgreements(sellerProfileId: UuidV7): Promise<readonly SellerAgreement[]>;
  /**
   * WEMP-M03-SPEC-001 §4 / decision D-02. Returns the ACTIVE seller profile
   * whose organization registration digest matches, or null. Used to reject
   * duplicate active businesses at onboarding.
   */
  findActiveByRegistrationDigest(registrationLookupDigest: string): Promise<SellerProfile | null>;
  /**
   * Resolves the seller profile of an identity through its ACTIVE OWNER or
   * MEMBER association, or null when the identity has no association.
   */
  findProfileByAssociatedIdentityId(identityId: UuidV7): Promise<SellerProfile | null>;
  /**
   * WEMP-M03-SPEC-001 §13 (M03-M5). Lists all seller profiles for the admin
   * seller list/filter surface. Summary rows only; no evidence or policy.
   */
  findAllSellers(): Promise<readonly SellerProfile[]>;
  insert(changeSet: SellerAggregateChangeSet): Promise<void>;
  save(changeSet: SellerAggregateChangeSet, expectedVersion: AggregateVersion): Promise<void>;
}

export interface SellerAggregateChangeSet {
  readonly sellerProfile: SellerProfile;
  readonly organization?: SellerOrganization;
  readonly associationsToAppend: readonly SellerIdentityAssociation[];
  readonly verificationsToAppend: readonly SellerBusinessVerification[];
  readonly evidenceToAppend: readonly SellerVerificationEvidence[];
  readonly transitionsToAppend: readonly SellerStateTransition[];
  readonly warehousesToAppend: readonly SellerWarehouse[];
  readonly agreementsToAppend: readonly SellerAgreement[];
  /**
   * WEMP-M03-SPEC-001 §12.9 / decision D-03. Append-only Module 03 business
   * audit events committed atomically with the mutation that caused them.
   * Every state transition and retention/verification action is audited.
   */
  readonly auditRecordsToAppend: readonly SellerBusinessAuditRecord[];
}
