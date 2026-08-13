import { SellerBusinessAuditRecord } from '../entities/seller-business-audit-record';
import { SellerEvidenceLegalHold } from '../entities/seller-evidence-legal-hold';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { SellerDomainError } from '../errors/seller-domain.error';
import { SellerRetentionPolicy } from './seller-retention.policy';

const SELLER = new UuidV7('0191310f-789a-7123-8123-000000000001');
const NOW = new Date('2026-08-12T00:00:00.000Z');
const UPLOADED = new Date('2025-08-12T00:00:00.000Z');

describe('SellerRetentionPolicy (D-03, WEMP-M03-SPEC-001)', () => {
  const policy = new SellerRetentionPolicy();

  describe('evaluateRule — configurable retention, fail closed', () => {
    it('accepts a valid category rule', () => {
      expect(policy.evaluateRule({ category: 'GST_CERTIFICATE', retentionDays: 365 })).toEqual({
        category: 'GST_CERTIFICATE',
        retentionDays: 365,
      });
    });

    it('fails closed when the category rule is missing', () => {
      expect(() => policy.evaluateRule(undefined)).toThrow(
        new SellerDomainError('SELLER_RETENTION_CONFIG_MISSING'),
      );
    });

    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
      'fails closed on invalid retention window %p',
      (retentionDays) => {
        expect(() =>
          policy.evaluateRule({ category: 'GST_CERTIFICATE', retentionDays }),
        ).toThrow(new SellerDomainError('SELLER_RETENTION_CONFIG_INVALID'));
      },
    );
  });

  describe('evaluate — expiry decisions', () => {
    const rule = { category: 'GST_CERTIFICATE', retentionDays: 365 };

    it('keeps evidence WITHIN_RETENTION before the window elapses', () => {
      const now = new Date(UPLOADED.getTime() + 100 * 86_400_000);
      expect(policy.evaluate(UPLOADED, now, rule, false)).toEqual({
        outcome: 'WITHIN_RETENTION',
        expiresAt: new Date(UPLOADED.getTime() + 365 * 86_400_000),
      });
    });

    it('marks evidence RETENTION_EXPIRED at the exact expiry instant', () => {
      const now = new Date(UPLOADED.getTime() + 365 * 86_400_000);
      expect(policy.evaluate(UPLOADED, now, rule, false)).toEqual({
        outcome: 'RETENTION_EXPIRED',
        expiredAt: now,
      });
    });

    it('marks evidence RETENTION_EXPIRED after the window elapses', () => {
      const now = new Date(UPLOADED.getTime() + 400 * 86_400_000);
      expect(policy.evaluate(UPLOADED, now, rule, false)).toEqual({
        outcome: 'RETENTION_EXPIRED',
        expiredAt: new Date(UPLOADED.getTime() + 365 * 86_400_000),
      });
    });

    it('a legal hold always wins, even on expired evidence', () => {
      const now = new Date(UPLOADED.getTime() + 800 * 86_400_000);
      expect(policy.evaluate(UPLOADED, now, rule, true)).toEqual({
        outcome: 'HELD',
        legalHoldActive: true,
      });
    });

    it('a legal hold wins even when the category rule is missing (never delete)', () => {
      const now = new Date(UPLOADED.getTime() + 800 * 86_400_000);
      expect(policy.evaluate(UPLOADED, now, undefined, true)).toEqual({
        outcome: 'HELD',
        legalHoldActive: true,
      });
    });
  });
});

describe('D-03 entity invariants (WEMP-M03-SPEC-001)', () => {
  describe('SellerEvidenceLegalHold', () => {
    const base = {
      legalHoldId: new UuidV7('0191310f-789a-7123-8123-000000000011'),
      sellerProfileId: SELLER,
      authorizedByIdentityId: new UuidV7('0191310f-789a-7123-8123-000000000012'),
      reasonReference: 'WEMP-LIT-2026-0001',
      active: true,
      placedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    };

    it('accepts an active hold', () => {
      expect(new SellerEvidenceLegalHold(base).properties.active).toBe(true);
    });

    it('requires a reason reference', () => {
      expect(() => new SellerEvidenceLegalHold({ ...base, reasonReference: ' ' })).toThrow(
        'Legal hold requires a reason reference',
      );
    });

    it('rejects a release timestamp on an active hold', () => {
      expect(
        () =>
          new SellerEvidenceLegalHold({
            ...base,
            releasedByIdentityId: base.authorizedByIdentityId,
            releasedAt: NOW,
          }),
      ).toThrow('Active legal hold cannot have a release timestamp');
    });

    it('requires release actor and timestamp on a released hold', () => {
      expect(() => new SellerEvidenceLegalHold({ ...base, active: false })).toThrow(
        'Released legal hold requires release actor and timestamp',
      );
    });

    it('rejects release before placement', () => {
      expect(
        () =>
          new SellerEvidenceLegalHold({
            ...base,
            active: false,
            releasedByIdentityId: base.authorizedByIdentityId,
            releasedAt: new Date('2026-08-11T00:00:00.000Z'),
          }),
      ).toThrow('Legal hold release cannot precede placement');
    });
  });

  describe('SellerBusinessAuditRecord', () => {
    const base = {
      auditEventId: new UuidV7('0191310f-789a-7123-8123-000000000021'),
      sellerProfileId: SELLER,
      eventType: 'SELLER_EVIDENCE_RETENTION_EXPIRED',
      actorIdentityId: new UuidV7('0191310f-789a-7123-8123-000000000022'),
      occurredAt: NOW,
      createdAt: NOW,
    };

    it('accepts a valid audit record', () => {
      expect(new SellerBusinessAuditRecord(base).properties.eventType).toBe(
        'SELLER_EVIDENCE_RETENTION_EXPIRED',
      );
    });

    it('requires an event type', () => {
      expect(() => new SellerBusinessAuditRecord({ ...base, eventType: ' ' })).toThrow(
        'Audit event type is required',
      );
    });

    it('rejects a non-SHA-256 evidence digest (never logs raw content)', () => {
      expect(
        () => new SellerBusinessAuditRecord({ ...base, evidenceDigest: 'not-a-digest' }),
      ).toThrow('Audit evidence digest must be a SHA-256 hex digest');
    });

    it('accepts a SHA-256 digest reference', () => {
      const record = new SellerBusinessAuditRecord({
        ...base,
        evidenceDigest: 'c'.repeat(64),
      });
      expect(record.properties.evidenceDigest).toBe('c'.repeat(64));
    });

    it('rejects createdAt before occurredAt', () => {
      expect(
        () =>
          new SellerBusinessAuditRecord({
            ...base,
            createdAt: new Date('2026-08-11T00:00:00.000Z'),
          }),
      ).toThrow('Audit createdAt cannot precede occurredAt');
    });
  });
});
