import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { ProtectedValue } from '../../../identity-authentication/domain/shared/value-objects/protected-value';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { SellerAgreement } from './seller-agreement';
import { SellerBusinessVerification } from './seller-business-verification';
import { SellerIdentityAssociation } from './seller-identity-association';
import { SellerOrganization } from './seller-organization';
import { SellerProfile } from './seller-profile';
import { SellerStateTransition } from './seller-state-transition';
import { SellerVerificationEvidence } from './seller-verification-evidence';
import { SellerWarehouse } from './seller-warehouse';

const SELLER = new UuidV7('0191310f-789a-7123-8123-000000000001');
const ORG = new UuidV7('0191310f-789a-7123-8123-000000000002');
const IDENTITY = new UuidV7('0191310f-789a-7123-8123-000000000003');
const NOW = new Date('2026-08-12T00:00:00.000Z');

function uu(seed: string): UuidV7 {
  return new UuidV7(`0191310f-789a-7123-8123-${seed.padStart(12, '0')}`);
}

describe('Seller domain entity invariants (M03-M1)', () => {
  describe('SellerProfile', () => {
    const base = {
      sellerProfileId: SELLER,
      organizationId: ORG,
      state: 'DRAFT' as const,
      complianceState: 'NOT_STARTED' as const,
      aggregateVersion: new AggregateVersion(1),
      createdAt: NOW,
      updatedAt: NOW,
    };

    it('accepts a valid draft profile', () => {
      expect(new SellerProfile(base).properties.state).toBe('DRAFT');
    });

    it('rejects timestamps before creation', () => {
      expect(
        () =>
          new SellerProfile({
            ...base,
            submittedAt: new Date('2026-08-11T00:00:00.000Z'),
          }),
      ).toThrow('Seller profile submittedAt cannot precede createdAt');
    });
  });

  describe('SellerStateTransition', () => {
    const base = {
      sellerProfileId: SELLER,
      actorIdentityId: IDENTITY,
      actorKind: 'SELLER_OWNER',
      transitionedAt: NOW,
      createdAt: NOW,
    };

    it('requires the initial transition to establish DRAFT without fromState', () => {
      expect(
        () =>
          new SellerStateTransition({
            ...base,
            sellerStateTransitionId: uu('1'),
            toState: 'DRAFT',
            stateVersion: 1,
          }),
      ).not.toThrow();
      expect(
        () =>
          new SellerStateTransition({
            ...base,
            sellerStateTransitionId: uu('1'),
            fromState: 'DRAFT',
            toState: 'SUBMITTED',
            stateVersion: 1,
          }),
      ).toThrow('Initial Seller transition must establish DRAFT without fromState');
    });

    it('requires fromState on non-initial transitions', () => {
      expect(
        () =>
          new SellerStateTransition({
            ...base,
            sellerStateTransitionId: uu('1'),
            toState: 'SUBMITTED',
            stateVersion: 2,
          }),
      ).toThrow('Non-initial Seller transition requires fromState');
    });

    it('rejects same-state transitions and non-positive versions', () => {
      expect(
        () =>
          new SellerStateTransition({
            ...base,
            sellerStateTransitionId: uu('1'),
            fromState: 'DRAFT',
            toState: 'DRAFT',
            stateVersion: 2,
          }),
      ).toThrow('Seller state transition must change state');
      expect(
        () =>
          new SellerStateTransition({
            ...base,
            sellerStateTransitionId: uu('1'),
            fromState: 'DRAFT',
            toState: 'SUBMITTED',
            stateVersion: 0,
          }),
      ).toThrow('Seller state version must be a positive safe integer');
    });
  });

  describe('SellerIdentityAssociation', () => {
    const base = {
      sellerProfileId: SELLER,
      identityId: IDENTITY,
      aggregateVersion: new AggregateVersion(1),
      createdAt: NOW,
      updatedAt: NOW,
    };

    it('requires the owner association to be primary', () => {
      expect(
        () =>
          new SellerIdentityAssociation({
            ...base,
            associationId: uu('1'),
            associationRole: 'OWNER',
            isPrimary: false,
            state: 'ACTIVE',
          }),
      ).toThrow('Owner association must be the primary association');
    });

    it('forbids a member association from being primary', () => {
      expect(
        () =>
          new SellerIdentityAssociation({
            ...base,
            associationId: uu('1'),
            associationRole: 'MEMBER',
            isPrimary: true,
            state: 'ACTIVE',
          }),
      ).toThrow('Member association cannot be the primary association');
    });

    it('requires removedAt for REMOVED associations', () => {
      expect(
        () =>
          new SellerIdentityAssociation({
            ...base,
            associationId: uu('1'),
            associationRole: 'MEMBER',
            isPrimary: false,
            state: 'REMOVED',
          }),
      ).toThrow('Removed association requires removedAt');
    });
  });

  describe('SellerBusinessVerification', () => {
    const base = {
      sellerProfileId: SELLER,
      verificationType: 'GST' as const,
      state: 'SUBMITTED' as const,
      generation: 1,
      submittedByIdentityId: IDENTITY,
      aggregateVersion: new AggregateVersion(1),
      createdAt: NOW,
      updatedAt: NOW,
    };

    it('rejects a reviewed record without an approved/rejected state', () => {
      expect(
        () =>
          new SellerBusinessVerification({
            ...base,
            verificationId: uu('1'),
            state: 'IN_REVIEW',
            reviewedByIdentityId: IDENTITY,
            reviewedAt: NOW,
          }),
      ).toThrow('Reviewed verification must be APPROVED or REJECTED');
    });

    it('requires review identity and time together', () => {
      expect(
        () =>
          new SellerBusinessVerification({
            ...base,
            verificationId: uu('1'),
            state: 'APPROVED',
            reviewedByIdentityId: IDENTITY,
          }),
      ).toThrow('Verification review identity and review time must be provided together');
    });

    it('rejects a zero generation', () => {
      expect(
        () =>
          new SellerBusinessVerification({
            ...base,
            verificationId: uu('1'),
            generation: 0,
          }),
      ).toThrow('Verification generation must be a positive safe integer');
    });
  });

  describe('SellerVerificationEvidence (append-only, digests only)', () => {
    it('accepts a valid evidence record', () => {
      const evidence = new SellerVerificationEvidence({
        evidenceId: uu('1'),
        verificationId: uu('2'),
        evidenceType: 'GST_CERTIFICATE',
        evidenceReference: 'obj:seller/0191310f-789a-7123-8123-000000000001/gst/1',
        evidenceDigest: 'a'.repeat(64),
        uploadedByIdentityId: IDENTITY,
        uploadedAt: NOW,
        createdAt: NOW,
      });
      expect(evidence.properties.evidenceReference).toContain('obj:');
    });

    it('rejects a non-SHA-256 digest', () => {
      expect(
        () =>
          new SellerVerificationEvidence({
            evidenceId: uu('1'),
            verificationId: uu('2'),
            evidenceType: 'GST_CERTIFICATE',
            evidenceReference: 'obj:ref',
            evidenceDigest: 'not-a-digest',
            uploadedByIdentityId: IDENTITY,
            uploadedAt: NOW,
            createdAt: NOW,
          }),
      ).toThrow('Evidence digest must be a SHA-256 hex digest');
    });

    it('rejects a missing reference', () => {
      expect(
        () =>
          new SellerVerificationEvidence({
            evidenceId: uu('1'),
            verificationId: uu('2'),
            evidenceType: 'GST_CERTIFICATE',
            evidenceReference: '   ',
            evidenceDigest: 'a'.repeat(64),
            uploadedByIdentityId: IDENTITY,
            uploadedAt: NOW,
            createdAt: NOW,
          }),
      ).toThrow('Evidence reference is required');
    });
  });

  describe('SellerOrganization', () => {
    it('rejects an invalid registration lookup digest', () => {
      expect(
        () =>
          new SellerOrganization({
            organizationId: ORG,
            legalName: 'Walrus Trading Ltd',
            tradeName: 'Walrus Trading',
            registrationNumber: new ProtectedValue('GSTIN123456'),
            registrationLookupDigest: 'short',
            businessAddress: '1 Market Street',
            aggregateVersion: new AggregateVersion(1),
            createdAt: NOW,
            updatedAt: NOW,
          }),
      ).toThrow('Seller organization registration lookup digest must be a SHA-256 hex digest');
    });

    it('requires a legal name', () => {
      expect(
        () =>
          new SellerOrganization({
            organizationId: ORG,
            legalName: '   ',
            tradeName: 'Walrus Trading',
            registrationNumber: new ProtectedValue('GSTIN123456'),
            registrationLookupDigest: 'a'.repeat(64),
            businessAddress: '1 Market Street',
            aggregateVersion: new AggregateVersion(1),
            createdAt: NOW,
            updatedAt: NOW,
          }),
      ).toThrow('Seller organization legal name is required');
    });
  });

  describe('SellerWarehouse', () => {
    it('requires closedAt when closing a warehouse', () => {
      expect(
        () =>
          new SellerWarehouse({
            warehouseId: uu('1'),
            sellerProfileId: SELLER,
            name: 'Main warehouse',
            address: 'Plot 9, Industrial Area',
            state: 'CLOSED',
            aggregateVersion: new AggregateVersion(1),
            createdAt: NOW,
            updatedAt: NOW,
          }),
      ).toThrow('Closed warehouse requires closedAt');
    });
  });

  describe('SellerAgreement', () => {
    it('requires effectiveTo after effectiveFrom', () => {
      expect(
        () =>
          new SellerAgreement({
            agreementId: uu('1'),
            sellerProfileId: SELLER,
            agreementType: 'COMMISSION',
            reference: 'cmv:commission/2026/001',
            state: 'ACTIVE',
            effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
            effectiveTo: new Date('2026-01-01T00:00:00.000Z'),
            aggregateVersion: new AggregateVersion(1),
            createdAt: NOW,
            updatedAt: NOW,
          }),
      ).toThrow('Agreement effectiveTo must be after effectiveFrom');
    });
  });
});
