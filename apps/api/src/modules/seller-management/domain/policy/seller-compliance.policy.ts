import type { SellerBusinessVerification } from '../entities/seller-business-verification';
import type { SellerOrganization } from '../entities/seller-organization';
import type { ComplianceState } from '../value-objects/compliance-state';
import type { VerificationType } from '../value-objects/verification-type';

/**
 * WEMP-M03-SPEC-001 §5. Mandatory verification set (GST, PAN, BANK) named by
 * approved Module 01 v1.12 §7. ADDRESS verification is not mandatory for the
 * compliance summary.
 */
export const MANDATORY_VERIFICATION_TYPES: readonly VerificationType[] = [
  'GST',
  'PAN',
  'BANK',
];

/**
 * Pure compliance derivation. The compliance state is recomputed on read and
 * is never a writable input. Fail closed: an empty verification set is
 * NOT_STARTED; any EXPIRED mandatory verification yields VERIFICATION_REQUIRED
 * (decision D-12); any REJECTED mandatory verification yields NON_COMPLIANT;
 * all mandatory verifications APPROVED yields COMPLIANT; otherwise IN_PROGRESS.
 */
export class SellerCompliancePolicy {
  public derive(verifications: readonly SellerBusinessVerification[]): ComplianceState {
    const mandatory = verifications.filter((verification) =>
      MANDATORY_VERIFICATION_TYPES.includes(verification.properties.verificationType),
    );
    if (mandatory.length === 0) {
      return 'NOT_STARTED';
    }
    const latest = new Map<string, SellerBusinessVerification>();
    for (const verification of mandatory) {
      const current = latest.get(verification.properties.verificationType);
      if (current === undefined || verification.properties.generation > current.properties.generation) {
        latest.set(verification.properties.verificationType, verification);
      }
    }
    const latestRecords = [...latest.values()];
    if (latestRecords.some((record) => record.properties.state === 'EXPIRED')) {
      return 'VERIFICATION_REQUIRED';
    }
    if (latestRecords.some((record) => record.properties.state === 'REJECTED')) {
      return 'NON_COMPLIANT';
    }
    if (MANDATORY_VERIFICATION_TYPES.every((type) =>
      latestRecords.some(
        (record) =>
          record.properties.verificationType === type &&
          record.properties.state === 'APPROVED',
      ),
    )) {
      return 'COMPLIANT';
    }
    return 'IN_PROGRESS';
  }

  /**
   * WEMP-M03-SPEC-001 §4. DRAFT → SUBMITTED requires onboarding completeness:
   * the legal organization is complete (legal name, trade name, registration
   * digest, business address) and at least one verification submission
   * exists (any state other than PENDING). Fail closed on missing data.
   */
  public isOnboardingComplete(
    organization: SellerOrganization | null,
    verifications: readonly SellerBusinessVerification[],
  ): boolean {
    if (organization === null) {
      return false;
    }
    const org = organization.properties;
    if (
      org.legalName.trim().length === 0 ||
      org.tradeName.trim().length === 0 ||
      org.registrationLookupDigest.length === 0 ||
      org.businessAddress.trim().length === 0
    ) {
      return false;
    }
    return verifications.some((verification) => verification.properties.state !== 'PENDING');
  }

  /**
   * WEMP-M03-SPEC-001 §4. UNDER_REVIEW → APPROVED requires every mandatory
   * verification type to hold an APPROVED record in its latest generation.
   */
  public areMandatoryVerificationsApproved(
    verifications: readonly SellerBusinessVerification[],
  ): boolean {
    return this.derive(verifications) === 'COMPLIANT';
  }
}
