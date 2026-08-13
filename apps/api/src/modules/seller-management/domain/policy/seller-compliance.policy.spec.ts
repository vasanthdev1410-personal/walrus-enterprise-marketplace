import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { ProtectedValue } from '../../../identity-authentication/domain/shared/value-objects/protected-value';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { SellerBusinessVerification } from '../entities/seller-business-verification';
import { SellerOrganization } from '../entities/seller-organization';
import { SellerCompliancePolicy } from './seller-compliance.policy';
import type { VerificationState } from '../value-objects/verification-state';
import type { VerificationType } from '../value-objects/verification-type';

const SELLER = new UuidV7('0191310f-789a-7123-8123-000000000001');
const SUBMITTER = new UuidV7('0191310f-789a-7123-8123-000000000002');
const REVIEWER = new UuidV7('0191310f-789a-7123-8123-000000000003');
const NOW = new Date('2026-08-12T00:00:00.000Z');

function verification(
  verificationType: VerificationType,
  state: VerificationState,
  generation = 1,
  index = 1,
): SellerBusinessVerification {
  const reviewed = state === 'APPROVED' || state === 'REJECTED';
  return new SellerBusinessVerification({
    verificationId: new UuidV7(`0191310f-789a-7123-8123-0000000000${String(index).padStart(2, '0')}`),
    sellerProfileId: SELLER,
    verificationType,
    state,
    generation,
    submittedByIdentityId: SUBMITTER,
    ...(reviewed ? { reviewedByIdentityId: REVIEWER, reviewedAt: NOW } : {}),
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function organization(overrides: Partial<{ legalName: string; tradeName: string; digest: string; address: string }> = {}): SellerOrganization {
  return new SellerOrganization({
    organizationId: new UuidV7('0191310f-789a-7123-8123-000000000011'),
    legalName: overrides.legalName ?? 'Walrus Trading Ltd',
    tradeName: overrides.tradeName ?? 'Walrus Trading',
    registrationNumber: new ProtectedValue('GSTIN123456'),
    registrationLookupDigest: overrides.digest ?? 'a'.repeat(64),
    businessAddress: overrides.address ?? '1 Market Street, Bengaluru',
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

describe('SellerCompliancePolicy (M03-M1, WEMP-M03-SPEC-001 §5)', () => {
  const policy = new SellerCompliancePolicy();

  describe('derive (compliance summary is never writable)', () => {
    it('returns NOT_STARTED with no verification records', () => {
      expect(policy.derive([])).toBe('NOT_STARTED');
    });

    it('returns IN_PROGRESS while mandatory verifications are pending', () => {
      expect(
        policy.derive([
          verification('GST', 'PENDING'),
          verification('PAN', 'SUBMITTED'),
          verification('BANK', 'IN_REVIEW'),
        ]),
      ).toBe('IN_PROGRESS');
    });

    it('returns IN_PROGRESS when only some mandatory verifications are approved', () => {
      expect(
        policy.derive([
          verification('GST', 'APPROVED'),
          verification('PAN', 'SUBMITTED'),
          verification('BANK', 'SUBMITTED'),
        ]),
      ).toBe('IN_PROGRESS');
    });

    it('returns COMPLIANT only when all mandatory verifications are approved', () => {
      expect(
        policy.derive([
          verification('GST', 'APPROVED'),
          verification('PAN', 'APPROVED'),
          verification('BANK', 'APPROVED'),
        ]),
      ).toBe('COMPLIANT');
    });

    it('returns NON_COMPLIANT when any mandatory verification is rejected', () => {
      expect(
        policy.derive([
          verification('GST', 'APPROVED'),
          verification('PAN', 'REJECTED'),
          verification('BANK', 'APPROVED'),
        ]),
      ).toBe('NON_COMPLIANT');
    });

    it('returns VERIFICATION_REQUIRED when any mandatory verification is expired (D-12)', () => {
      expect(
        policy.derive([
          verification('GST', 'EXPIRED'),
          verification('PAN', 'APPROVED'),
          verification('BANK', 'APPROVED'),
        ]),
      ).toBe('VERIFICATION_REQUIRED');
    });

    it('resolves generations: a newer approved record supersedes an expired one', () => {
      expect(
        policy.derive([
          verification('GST', 'EXPIRED', 1),
          verification('GST', 'APPROVED', 2),
          verification('PAN', 'APPROVED', 1),
          verification('BANK', 'APPROVED', 1),
        ]),
      ).toBe('COMPLIANT');
    });

    it('resolves generations: a newer rejected record supersedes an older approval', () => {
      expect(
        policy.derive([
          verification('PAN', 'APPROVED', 1),
          verification('PAN', 'REJECTED', 2),
          verification('GST', 'APPROVED', 1),
          verification('BANK', 'APPROVED', 1),
        ]),
      ).toBe('NON_COMPLIANT');
    });
  });

  describe('isOnboardingComplete (DRAFT → SUBMITTED gate)', () => {
    it('accepts a complete organization with at least one submitted verification', () => {
      expect(
        policy.isOnboardingComplete(organization(), [
          verification('GST', 'SUBMITTED'),
        ]),
      ).toBe(true);
    });

    it('rejects a missing organization (fail closed)', () => {
      expect(policy.isOnboardingComplete(null, [verification('GST', 'SUBMITTED')])).toBe(false);
    });

    // Entity invariants (SellerOrganization) guarantee non-empty legal name,
    // trade name, digest and address, so the policy's field re-checks are
    // defense-in-depth for structurally-typed callers; the fail-closed cases
    // reachable with valid entities are the missing organization and the
    // missing verification submission below.

    it('rejects when no verification submission exists yet', () => {
      expect(policy.isOnboardingComplete(organization(), [verification('GST', 'PENDING')])).toBe(
        false,
      );
      expect(policy.isOnboardingComplete(organization(), [])).toBe(false);
    });
  });

  describe('areMandatoryVerificationsApproved (UNDER_REVIEW → APPROVED gate)', () => {
    it('is true only when compliance is COMPLIANT', () => {
      expect(
        policy.areMandatoryVerificationsApproved([
          verification('GST', 'APPROVED'),
          verification('PAN', 'APPROVED'),
          verification('BANK', 'APPROVED'),
        ]),
      ).toBe(true);
      expect(
        policy.areMandatoryVerificationsApproved([
          verification('GST', 'APPROVED'),
          verification('PAN', 'SUBMITTED'),
          verification('BANK', 'APPROVED'),
        ]),
      ).toBe(false);
    });
  });
});
