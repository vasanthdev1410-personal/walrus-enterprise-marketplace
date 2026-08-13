import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { SellerProfile } from '../../domain/entities/seller-profile';
import type { SellerCompliancePolicy } from '../../domain/policy/seller-compliance.policy';
import type { SellerAssociationPolicy } from '../../domain/policy/seller-association.policy';
import type { SellerProfileRepository } from '../../domain/ports/seller-repository.port';
import { SellerApplicationError } from '../errors/seller-application.error';
import type { SellerAdminAuthorizationPort } from '../ports/seller-admin-authorization.port';
import type { VerificationType } from '../../domain/value-objects/verification-type';
import type { ComplianceState } from '../../domain/value-objects/compliance-state';
import type { SellerState } from '../../domain/value-objects/seller-state';

export interface OwnOnboardingStatusResult {
  readonly sellerProfileId: string;
  readonly state: SellerState;
  readonly complianceState: ComplianceState;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly submittedAt?: string;
  readonly approvedAt?: string;
  readonly suspendedAt?: string;
  readonly organization: {
    readonly legalName: string;
    readonly tradeName: string;
    readonly businessAddress: string;
  };
  readonly verifications: readonly {
    readonly verificationType: VerificationType;
    readonly state: string;
    readonly generation: number;
  }[];
}

export interface OwnProfileResult {
  readonly sellerProfileId: string;
  readonly state: SellerState;
  readonly complianceState: ComplianceState;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly submittedAt?: string;
  readonly approvedAt?: string;
  readonly suspendedAt?: string;
  readonly organization: {
    readonly legalName: string;
    readonly tradeName: string;
    readonly businessAddress: string;
  };
  readonly members: readonly {
    readonly identityId: string;
    readonly associationRole: 'OWNER' | 'MEMBER';
    readonly isPrimary: boolean;
    readonly state: 'ACTIVE' | 'REMOVED';
    readonly addedAt: string;
  }[];
}

export interface WarehouseSummary {
  readonly warehouseId: string;
  readonly name: string;
  readonly state: 'ACTIVE' | 'CLOSED';
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AgreementSummary {
  readonly agreementId: string;
  readonly agreementType: string;
  readonly reference: string;
  readonly state: string;
  readonly effectiveFrom: string;
  readonly effectiveTo?: string;
  readonly signedAt?: string;
}

export interface MemberSummary {
  readonly identityId: string;
  readonly associationRole: 'OWNER' | 'MEMBER';
  readonly isPrimary: boolean;
  readonly state: 'ACTIVE' | 'REMOVED';
  readonly addedAt: string;
}

export interface AdminSellerListEntry {
  readonly sellerProfileId: string;
  readonly state: SellerState;
  readonly complianceState: ComplianceState;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type AdminSellerDetailResult = OwnProfileResult;

export interface EvidenceMetadataEntry {
  readonly verificationId: string;
  readonly verificationType: VerificationType;
  readonly verificationState: string;
  readonly generation: number;
  readonly evidenceId: string;
  readonly evidenceType: string;
  readonly evidenceReference: string;
  readonly evidenceDigest: string;
  readonly uploadedByIdentityId: string;
  readonly uploadedAt: string;
}

/**
 * WEMP-M03-PLAN-001 M03-M5. Read-only seller queries for the presentation
 * layer. Every seller-scoped read resolves ownership through the authoritative
 * SellerIdentityAssociation store (never from a client claim): self-service
 * reads require an ACTIVE association of the caller to the target seller;
 * admin reads require the approved Module 02 administrative grant. Fail closed:
 * missing sellers, missing associations, or denied administrative grants
 * surface as SellerApplicationError and are mapped to non-enumerating
 * responses by the presentation layer.
 */
export class SellerReadApplicationService {
  public constructor(
    private readonly repository: SellerProfileRepository,
    private readonly associations: SellerAssociationPolicy,
    private readonly compliance: SellerCompliancePolicy,
    private readonly adminAuthorization: SellerAdminAuthorizationPort,
  ) {}

  /**
   * Reads the caller's own onboarding status. The seller is resolved from the
   * authenticated identity through the authoritative association store — the
   * client never supplies a seller identifier.
   */
  public async getOwnOnboardingStatus(identityId: UuidV7): Promise<OwnOnboardingStatusResult> {
    const profile = await this.requireOwnProfile(identityId);
    const [organization, verifications] = await Promise.all([
      this.repository.findOrganization(profile.properties.organizationId),
      this.repository.findVerifications(profile.properties.sellerProfileId),
    ]);
    if (organization === null) {
      throw new SellerApplicationError('SELLER_NOT_FOUND');
    }
    return toOnboardingStatus(
      profile,
      organization,
      this.compliance.derive(verifications),
      verifications,
    );
  }

  /**
   * Reads the caller's own seller profile. The seller is resolved from the
   * authenticated identity (server-side); members are non-sensitive summary
   * rows (no PII beyond the logical identity reference).
   */
  public async getOwnProfile(identityId: UuidV7): Promise<OwnProfileResult> {
    const profile = await this.requireOwnProfile(identityId);
    const [organization, associations, verifications] = await Promise.all([
      this.repository.findOrganization(profile.properties.organizationId),
      this.repository.findAssociations(profile.properties.sellerProfileId),
      this.repository.findVerifications(profile.properties.sellerProfileId),
    ]);
    if (organization === null) {
      throw new SellerApplicationError('SELLER_NOT_FOUND');
    }
    const members = associations.map((association) => ({
      identityId: association.properties.identityId.value,
      associationRole: association.properties.associationRole,
      isPrimary: association.properties.isPrimary,
      state: association.properties.state,
      addedAt: association.properties.createdAt.toISOString(),
    }));
    return {
      ...toOnboardingStatus(
        profile,
        organization,
        this.compliance.derive(verifications),
        verifications,
      ),
      members,
    };
  }

  public async listWarehouses(
    sellerProfileId: UuidV7,
    callerIdentityId: UuidV7,
  ): Promise<readonly WarehouseSummary[]> {
    const profile = await this.requireAssociated(sellerProfileId, callerIdentityId);
    const warehouses = await this.repository.findWarehouses(profile.properties.sellerProfileId);
    return warehouses.map((warehouse) => ({
      warehouseId: warehouse.properties.warehouseId.value,
      name: warehouse.properties.name,
      state: warehouse.properties.state,
      createdAt: warehouse.properties.createdAt.toISOString(),
      updatedAt: warehouse.properties.updatedAt.toISOString(),
    }));
  }

  public async listAgreements(
    sellerProfileId: UuidV7,
    callerIdentityId: UuidV7,
  ): Promise<readonly AgreementSummary[]> {
    const profile = await this.requireAssociated(sellerProfileId, callerIdentityId);
    const agreements = await this.repository.findAgreements(profile.properties.sellerProfileId);
    return agreements.map((agreement) => ({
      agreementId: agreement.properties.agreementId.value,
      agreementType: agreement.properties.agreementType,
      reference: agreement.properties.reference,
      state: agreement.properties.state,
      effectiveFrom: agreement.properties.effectiveFrom.toISOString(),
      ...(agreement.properties.effectiveTo === undefined
        ? {}
        : { effectiveTo: agreement.properties.effectiveTo.toISOString() }),
      ...(agreement.properties.signedAt === undefined
        ? {}
        : { signedAt: agreement.properties.signedAt.toISOString() }),
    }));
  }

  public async listMembers(
    sellerProfileId: UuidV7,
    callerIdentityId: UuidV7,
  ): Promise<readonly MemberSummary[]> {
    const profile = await this.requireAssociated(sellerProfileId, callerIdentityId);
    const associations = await this.repository.findAssociations(profile.properties.sellerProfileId);
    return associations.map((association) => ({
      identityId: association.properties.identityId.value,
      associationRole: association.properties.associationRole,
      isPrimary: association.properties.isPrimary,
      state: association.properties.state,
      addedAt: association.properties.createdAt.toISOString(),
    }));
  }

  /**
   * Admin list (WEMP-M03-SPEC-001 §13). Requires the approved
   * `seller.audit.view` grant; returns non-enumerating summary rows only
   * (never evidence, never internal policy). Optional state filter.
   */
  public async listSellers(
    adminIdentityId: UuidV7,
    stateFilter?: SellerState,
  ): Promise<readonly AdminSellerListEntry[]> {
    await this.requireAdminGrant(adminIdentityId, 'seller.audit.view');
    const sellers = await this.repository.findAllSellers();
    const filtered =
      stateFilter === undefined
        ? sellers
        : sellers.filter((seller) => seller.properties.state === stateFilter);
    return filtered.map((seller) => ({
      sellerProfileId: seller.properties.sellerProfileId.value,
      state: seller.properties.state,
      complianceState: seller.properties.complianceState,
      version: seller.properties.aggregateVersion.value,
      createdAt: seller.properties.createdAt.toISOString(),
      updatedAt: seller.properties.updatedAt.toISOString(),
    }));
  }

  public async getSellerDetail(
    adminIdentityId: UuidV7,
    sellerProfileId: UuidV7,
  ): Promise<AdminSellerDetailResult> {
    await this.requireAdminGrant(adminIdentityId, 'seller.audit.view');
    const profile = await this.repository.findById(sellerProfileId);
    if (profile === null) throw new SellerApplicationError('SELLER_NOT_FOUND');
    const [organization, associations, verifications] = await Promise.all([
      this.repository.findOrganization(profile.properties.organizationId),
      this.repository.findAssociations(sellerProfileId),
      this.repository.findVerifications(sellerProfileId),
    ]);
    if (organization === null) throw new SellerApplicationError('SELLER_NOT_FOUND');
    const members = associations.map((association) => ({
      identityId: association.properties.identityId.value,
      associationRole: association.properties.associationRole,
      isPrimary: association.properties.isPrimary,
      state: association.properties.state,
      addedAt: association.properties.createdAt.toISOString(),
    }));
    return {
      ...toOnboardingStatus(
        profile,
        organization,
        this.compliance.derive(verifications),
        verifications,
      ),
      members,
    };
  }

  /**
   * Admin evidence inspection (WEMP-M03-SPEC-001 §13, `seller.evidence.read`).
   * Returns evidence METADATA only — opaque reference, SHA-256 digest, type,
   * timestamps — never document contents. Evidence contents require the
   * approved signed short-lived read-reference boundary (D-03), which is not
   * exposed here.
   */
  public async listEvidenceMetadata(
    adminIdentityId: UuidV7,
    sellerProfileId: UuidV7,
  ): Promise<readonly EvidenceMetadataEntry[]> {
    await this.requireAdminGrant(adminIdentityId, 'seller.evidence.read');
    const profile = await this.repository.findById(sellerProfileId);
    if (profile === null) throw new SellerApplicationError('SELLER_NOT_FOUND');
    const verifications = await this.repository.findVerifications(sellerProfileId);
    const entries: EvidenceMetadataEntry[] = [];
    for (const verification of verifications) {
      const evidence = await this.repository.findEvidence(verification.properties.verificationId);
      for (const item of evidence) {
        entries.push({
          verificationId: verification.properties.verificationId.value,
          verificationType: verification.properties.verificationType,
          verificationState: verification.properties.state,
          generation: verification.properties.generation,
          evidenceId: item.properties.evidenceId.value,
          evidenceType: item.properties.evidenceType,
          evidenceReference: item.properties.evidenceReference,
          evidenceDigest: item.properties.evidenceDigest,
          uploadedByIdentityId: item.properties.uploadedByIdentityId.value,
          uploadedAt: item.properties.uploadedAt.toISOString(),
        });
      }
    }
    return entries;
  }

  private async requireOwnProfile(identityId: UuidV7): Promise<SellerProfile> {
    const profile = await this.repository.findProfileByAssociatedIdentityId(identityId);
    if (profile === null) {
      // Non-enumerating: a caller without an association sees the same
      // SELLER_NOT_FOUND as an unknown seller.
      throw new SellerApplicationError('SELLER_NOT_FOUND');
    }
    return profile;
  }

  private async requireAssociated(
    sellerProfileId: UuidV7,
    callerIdentityId: UuidV7,
  ): Promise<SellerProfile> {
    const profile = await this.repository.findById(sellerProfileId);
    if (profile === null) throw new SellerApplicationError('SELLER_NOT_FOUND');
    const associations = await this.repository.findAssociations(sellerProfileId);
    const association = this.associations.findActiveAssociation(
      associations,
      callerIdentityId.value,
    );
    if (association === null) {
      throw new SellerApplicationError('SELLER_NOT_FOUND');
    }
    return profile;
  }

  private async requireAdminGrant(
    adminIdentityId: UuidV7,
    action: 'seller.audit.view' | 'seller.evidence.read',
  ): Promise<void> {
    const granted = await this.adminAuthorization.isGranted(adminIdentityId, action);
    if (!granted) {
      throw new SellerApplicationError('SELLER_ADMIN_AUTHORIZATION_DENIED');
    }
  }
}

function toOnboardingStatus(
  profile: SellerProfile,
  organization: { properties: { legalName: string; tradeName: string; businessAddress: string } },
  complianceState: ComplianceState,
  verifications: readonly {
    properties: {
      verificationType: VerificationType;
      state: string;
      generation: number;
    };
  }[],
): Omit<OwnOnboardingStatusResult, 'members'> {
  const properties = profile.properties;
  return {
    sellerProfileId: properties.sellerProfileId.value,
    state: properties.state,
    complianceState,
    version: properties.aggregateVersion.value,
    createdAt: properties.createdAt.toISOString(),
    updatedAt: properties.updatedAt.toISOString(),
    ...(properties.submittedAt === undefined
      ? {}
      : { submittedAt: properties.submittedAt.toISOString() }),
    ...(properties.approvedAt === undefined
      ? {}
      : { approvedAt: properties.approvedAt.toISOString() }),
    ...(properties.suspendedAt === undefined
      ? {}
      : { suspendedAt: properties.suspendedAt.toISOString() }),
    organization: {
      legalName: organization.properties.legalName,
      tradeName: organization.properties.tradeName,
      businessAddress: organization.properties.businessAddress,
    },
    verifications: verifications.map((record) => ({
      verificationType: record.properties.verificationType,
      state: record.properties.state,
      generation: record.properties.generation,
    })),
  };
}
