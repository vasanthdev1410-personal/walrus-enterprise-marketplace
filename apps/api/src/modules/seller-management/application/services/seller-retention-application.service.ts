import type {
  ClockPort,
  UuidV7GenerationPort,
} from '../../../identity-authentication/application/ports/application-runtime.port';
import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { SellerBusinessAuditRecord } from '../../domain/entities/seller-business-audit-record';
import { SellerEvidenceLegalHold } from '../../domain/entities/seller-evidence-legal-hold';
import type { SellerVerificationEvidence } from '../../domain/entities/seller-verification-evidence';
import type { SellerRetentionPolicy } from '../../domain/policy/seller-retention.policy';
import type { SellerLegalHoldRepository } from '../../domain/ports/seller-legal-hold-repository.port';
import type { SellerProfileRepository } from '../../domain/ports/seller-repository.port';
import type { Module01IdentityContractPort } from '../../domain/ports/module-01-contract.port';
import { SellerApplicationError } from '../errors/seller-application.error';
import type { EvidenceRetentionConfigurationPort } from '../ports/evidence-retention-configuration.port';
import type { SellerAdminAuthorizationPort } from '../ports/seller-admin-authorization.port';
import type { SellerEvidenceStoragePort } from '../ports/seller-evidence-storage.port';

export interface PlaceLegalHoldCommand {
  readonly sellerProfileId: UuidV7;
  readonly authorizedByIdentityId: UuidV7;
  readonly reasonReference: string;
  readonly correlationId?: CorrelationIdentifier;
}

export interface ReleaseLegalHoldCommand {
  readonly sellerProfileId: UuidV7;
  readonly releasedByIdentityId: UuidV7;
  readonly correlationId?: CorrelationIdentifier;
}

export interface LegalHoldResult {
  readonly sellerProfileId: string;
  readonly active: boolean;
}

export interface ProcessEvidenceRetentionCommand {
  readonly sellerProfileId: UuidV7;
  readonly triggeredByIdentityId: UuidV7;
  readonly correlationId?: CorrelationIdentifier;
}

export interface RetentionProcessingResult {
  readonly sellerProfileId: string;
  readonly evidenceChecked: number;
  readonly evidenceExpired: number;
  readonly evidenceHeld: number;
  readonly skippedDueToConfig: number;
}

/**
 * WEMP-M03-SPEC-001 / decision D-03 (owner-approved). Evidence retention
 * processing and legal holds.
 * - Retention periods are centrally configurable per evidence category and
 *   are never hard-coded into business logic; missing or invalid configuration
 *   fails closed (nothing is deleted).
 * - An authorized legal hold prevents automatic deletion while active.
 * - Deletion/retention processing is auditable (append-only audit records).
 * - Only references and digests are stored; content deletion is delegated to
 *   the storage boundary and never touches the Module 03 database.
 */
export class SellerRetentionApplicationService {
  public constructor(
    private readonly repository: SellerProfileRepository,
    private readonly legalHolds: SellerLegalHoldRepository,
    private readonly module01: Module01IdentityContractPort,
    private readonly retentionConfiguration: EvidenceRetentionConfigurationPort,
    private readonly evidenceStorage: SellerEvidenceStoragePort,
    private readonly retentionPolicy: SellerRetentionPolicy,
    private readonly adminAuthorization: SellerAdminAuthorizationPort,
    private readonly clock: ClockPort,
    private readonly identifiers: UuidV7GenerationPort,
  ) {}

  /**
   * Places an authorized legal hold. While active, the retention processor
   * must not delete any of the seller's evidence. Fail closed: an already
   * active hold rejects the placement (no silent overwrite).
   */
  public async placeLegalHold(command: PlaceLegalHoldCommand): Promise<LegalHoldResult> {
    const granted = await this.adminAuthorization.isGranted(
      command.authorizedByIdentityId,
      'seller.legalhold.manage',
    );
    if (!granted) throw new SellerApplicationError('SELLER_ADMIN_AUTHORIZATION_DENIED');
    const profile = await this.repository.findById(command.sellerProfileId);
    if (profile === null) throw new SellerApplicationError('SELLER_NOT_FOUND');
    const active = await this.legalHolds.findActiveBySellerProfileId(command.sellerProfileId);
    if (active !== null) {
      throw new SellerApplicationError('SELLER_LEGAL_HOLD_CONFLICT');
    }
    const now = this.clock.now();
    const hold = new SellerEvidenceLegalHold({
      legalHoldId: this.identifiers.next(),
      sellerProfileId: command.sellerProfileId,
      authorizedByIdentityId: command.authorizedByIdentityId,
      reasonReference: command.reasonReference,
      active: true,
      placedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await this.legalHolds.insert(hold);
    await this.appendAudit(
      command.sellerProfileId,
      command.authorizedByIdentityId,
      'SELLER_LEGAL_HOLD_PLACED',
      now,
      command.correlationId,
    );
    return { sellerProfileId: command.sellerProfileId.value, active: true };
  }

  /**
   * Releases an active legal hold, re-enabling normal retention processing.
   * Release is recorded (who and when); holds are never deleted.
   */
  public async releaseLegalHold(command: ReleaseLegalHoldCommand): Promise<LegalHoldResult> {
    const granted = await this.adminAuthorization.isGranted(
      command.releasedByIdentityId,
      'seller.legalhold.manage',
    );
    if (!granted) throw new SellerApplicationError('SELLER_ADMIN_AUTHORIZATION_DENIED');
    const active = await this.legalHolds.findActiveBySellerProfileId(command.sellerProfileId);
    if (active === null) {
      throw new SellerApplicationError('SELLER_LEGAL_HOLD_CONFLICT');
    }
    const now = this.clock.now();
    const released = new SellerEvidenceLegalHold({
      ...active.properties,
      active: false,
      releasedByIdentityId: command.releasedByIdentityId,
      releasedAt: now,
      updatedAt: now,
    });
    await this.legalHolds.save(released);
    await this.appendAudit(
      command.sellerProfileId,
      command.releasedByIdentityId,
      'SELLER_LEGAL_HOLD_RELEASED',
      now,
      command.correlationId,
    );
    return { sellerProfileId: command.sellerProfileId.value, active: false };
  }

  /**
   * Runs the retention processor for a seller's evidence. Fail closed by
   * design (decision D-03): every category rule is resolved BEFORE any
   * deletion, so missing or invalid retention configuration aborts the whole
   * run with nothing deleted. An active legal hold forces HELD (never
   * delete). Expired evidence content is deleted through the storage boundary
   * and every deletion is audited append-only; only references and digests
   * are ever persisted.
   */
  public async processEvidenceRetention(
    command: ProcessEvidenceRetentionCommand,
  ): Promise<RetentionProcessingResult> {
    await this.assertIdentityEligible(command.triggeredByIdentityId);
    const profile = await this.repository.findById(command.sellerProfileId);
    if (profile === null) throw new SellerApplicationError('SELLER_NOT_FOUND');
    const [verifications, activeHold] = await Promise.all([
      this.repository.findVerifications(command.sellerProfileId),
      this.legalHolds.findActiveBySellerProfileId(command.sellerProfileId),
    ]);

    const now = this.clock.now();
    const collected: SellerVerificationEvidence[] = [];
    for (const verification of verifications) {
      const evidence = await this.repository.findEvidence(verification.properties.verificationId);
      for (const item of evidence) {
        collected.push(item);
      }
    }

    // Phase 1 — resolve every category rule up front. Any missing or invalid
    // rule throws before a single reference is deleted (fail closed).
    const resolved = new Map<string, { category: string; retentionDays: number }>();
    for (const item of collected) {
      const rule = await this.retentionConfiguration.findRule(item.properties.evidenceType);
      const key = item.properties.evidenceType;
      if (!resolved.has(key)) {
        resolved.set(key, this.retentionPolicy.evaluateRule(rule));
      }
    }

    // Phase 2 — evaluate and process. No rule resolution happens here, so a
    // configuration problem can no longer interrupt after deletion begins.
    let evidenceChecked = 0;
    let evidenceExpired = 0;
    let evidenceHeld = 0;
    const auditEvents: SellerBusinessAuditRecord[] = [];
    for (const item of collected) {
      evidenceChecked += 1;
      const rule = resolved.get(item.properties.evidenceType);
      const evaluation = this.retentionPolicy.evaluate(
        item.properties.uploadedAt,
        now,
        rule,
        activeHold !== null,
      );
      if (evaluation.outcome === 'HELD') {
        evidenceHeld += 1;
        continue;
      }
      if (evaluation.outcome === 'WITHIN_RETENTION') {
        continue;
      }
      {
        await this.evidenceStorage.deleteEvidence(
          item.properties.evidenceReference,
          command.sellerProfileId,
        );
        evidenceExpired += 1;
        auditEvents.push(
          new SellerBusinessAuditRecord({
            auditEventId: this.identifiers.next(),
            sellerProfileId: command.sellerProfileId,
            eventType: 'SELLER_EVIDENCE_RETENTION_EXPIRED',
            actorIdentityId: command.triggeredByIdentityId,
            occurredAt: now,
            createdAt: now,
            ...(command.correlationId !== undefined
              ? { correlationId: command.correlationId }
              : {}),
            evidenceDigest: item.properties.evidenceDigest,
          }),
        );
      }
    }
    if (auditEvents.length > 0) {
      await this.repository.save(
        {
          sellerProfile: profile,
          associationsToAppend: [],
          verificationsToAppend: [],
          evidenceToAppend: [],
          transitionsToAppend: [],
          warehousesToAppend: [],
          agreementsToAppend: [],
          auditRecordsToAppend: auditEvents,
        },
        profile.properties.aggregateVersion,
      );
    }
    return {
      sellerProfileId: command.sellerProfileId.value,
      evidenceChecked,
      evidenceExpired,
      evidenceHeld,
      skippedDueToConfig: 0,
    };
  }

  private async appendAudit(
    sellerProfileId: UuidV7,
    actorIdentityId: UuidV7,
    eventType: string,
    now: Date,
    correlationId?: CorrelationIdentifier,
  ): Promise<void> {
    const profile = await this.repository.findById(sellerProfileId);
    if (profile === null) throw new SellerApplicationError('SELLER_NOT_FOUND');
    await this.repository.save(
      {
        sellerProfile: profile,
        associationsToAppend: [],
        verificationsToAppend: [],
        evidenceToAppend: [],
        transitionsToAppend: [],
        warehousesToAppend: [],
        agreementsToAppend: [],
        auditRecordsToAppend: [
          new SellerBusinessAuditRecord({
            auditEventId: this.identifiers.next(),
            sellerProfileId,
            eventType,
            actorIdentityId,
            occurredAt: now,
            createdAt: now,
            ...(correlationId !== undefined ? { correlationId } : {}),
          }),
        ],
      },
      profile.properties.aggregateVersion,
    );
  }

  private async assertIdentityEligible(identityId: UuidV7): Promise<void> {
    const eligibility = await this.module01.getIdentityEligibility(identityId);
    if (eligibility.state !== 'ACTIVE' || eligibility.verificationState !== 'VERIFIED') {
      throw new SellerApplicationError('SELLER_IDENTITY_INELIGIBLE');
    }
  }
}
