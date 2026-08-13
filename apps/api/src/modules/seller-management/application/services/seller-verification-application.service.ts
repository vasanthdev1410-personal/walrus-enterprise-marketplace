import type {
  ClockPort,
  UuidV7GenerationPort,
} from '../../../identity-authentication/application/ports/application-runtime.port';
import type { NonProductionRateLimiterPort } from '../../../identity-authentication/application/ports/non-production-rate-limiter.port';
import type { ApiIdempotencyService } from '../../../identity-authentication/application/services/api-idempotency.service';
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { SellerBusinessAuditRecord } from '../../domain/entities/seller-business-audit-record';
import { SellerBusinessVerification } from '../../domain/entities/seller-business-verification';
import type { SellerProfile } from '../../domain/entities/seller-profile';
import { SellerVerificationEvidence } from '../../domain/entities/seller-verification-evidence';
import type { SellerLifecycle } from '../../domain/lifecycle/seller-lifecycle';
import type { SellerAssociationPolicy } from '../../domain/policy/seller-association.policy';
import type { SellerCompliancePolicy } from '../../domain/policy/seller-compliance.policy';
import type {
  SellerAggregateChangeSet,
  SellerProfileRepository,
} from '../../domain/ports/seller-repository.port';
import type { Module01IdentityContractPort } from '../../domain/ports/module-01-contract.port';
import type { VerificationType } from '../../domain/value-objects/verification-type';
import { SellerApplicationError } from '../errors/seller-application.error';
import type { SellerAdminAuthorizationPort } from '../ports/seller-admin-authorization.port';
import type { SellerEvidenceStoragePort } from '../ports/seller-evidence-storage.port';

export interface EvidenceDescriptor {
  readonly evidenceType: string;
  readonly evidenceReference: string;
  readonly evidenceDigest: string;
}

export interface SubmitVerificationCommand {
  readonly sellerProfileId: UuidV7;
  readonly actorIdentityId: UuidV7;
  readonly verificationType: VerificationType;
  readonly expectedVersion: number;
  readonly evidence: readonly EvidenceDescriptor[];
  readonly correlationId?: CorrelationIdentifier;
}

export interface VerificationSubmitResult {
  readonly verificationId: string;
  readonly state: 'SUBMITTED';
  readonly generation: number;
  readonly sellerVersion: number;
}

export interface ClaimReviewCommand {
  readonly sellerProfileId: UuidV7;
  readonly reviewerIdentityId: UuidV7;
  readonly expectedVersion: number;
  readonly correlationId?: CorrelationIdentifier;
}

export interface ReviewDecisionCommand {
  readonly sellerProfileId: UuidV7;
  readonly approverIdentityId: UuidV7;
  readonly expectedVersion: number;
  readonly decision: 'APPROVED' | 'REJECTED';
  readonly reasonReference?: string;
  readonly correlationId?: CorrelationIdentifier;
}

export interface RequestCorrectionsCommand {
  readonly sellerProfileId: UuidV7;
  readonly reviewerIdentityId: UuidV7;
  readonly expectedVersion: number;
  readonly reasonReference: string;
  readonly correlationId?: CorrelationIdentifier;
}

export interface ReviewResult {
  readonly sellerProfileId: string;
  readonly state: 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'CORRECTIONS_REQUESTED';
  readonly version: number;
}

export interface VerificationStatusResult {
  readonly sellerProfileId: string;
  readonly complianceState: string;
  readonly verifications: readonly {
    readonly verificationType: VerificationType;
    readonly state: string;
    readonly generation: number;
  }[];
}

/**
 * WEMP-M03-PLAN-001 M03-M3. KYC/KYB verification and admin review workflow.
 * - submitVerification: records evidence references + digests only (never
 *   content), integrity-verified, idempotent, version-guarded.
 * - claimReview: SUBMITTED → UNDER_REVIEW (reviewer claims; recorded for SoD).
 * - requestCorrections: UNDER_REVIEW → CORRECTIONS_REQUESTED (reason required).
 * - decideReview: APPROVED (approver ≠ reviewer, mandatory verifications
 *   approved) or REJECTED (reason required). The applicant identity can never
 *   approve its own onboarding (no self-approval).
 * Every decision is version-guarded, audited, and rate-limited.
 */
export class SellerVerificationApplicationService {
  public constructor(
    private readonly repository: SellerProfileRepository,
    private readonly module01: Module01IdentityContractPort,
    private readonly lifecycle: SellerLifecycle,
    private readonly associations: SellerAssociationPolicy,
    private readonly compliance: SellerCompliancePolicy,
    private readonly adminAuthorization: SellerAdminAuthorizationPort,
    private readonly evidenceStorage: SellerEvidenceStoragePort,
    private readonly clock: ClockPort,
    private readonly identifiers: UuidV7GenerationPort,
    private readonly idempotency: ApiIdempotencyService,
    private readonly rateLimiter: NonProductionRateLimiterPort,
  ) {}

  /**
   * M03-SPEC-001 §5/§12.5. Submits KYC/KYB evidence for a verification type.
   * Every evidence descriptor is integrity-verified against the storage
   * boundary before recording (fail closed on mismatch); only the opaque
   * reference and SHA-256 digest are persisted. A re-submission creates a new
   * generation; prior generations remain append-only. Idempotent.
   */
  public async submitVerification(
    command: SubmitVerificationCommand,
  ): Promise<VerificationSubmitResult> {
    const rateLimit = await this.rateLimiter.consume({
      key: `seller-verification-submit:${command.actorIdentityId.value}`,
      limit: 10,
      windowSeconds: 3600,
    });
    if (!rateLimit.allowed) {
      throw new SellerApplicationError('SELLER_PRECONDITION_FAILED');
    }
    const profile = await this.repository.findById(command.sellerProfileId);
    if (profile === null) throw new SellerApplicationError('SELLER_NOT_FOUND');
    if (profile.properties.aggregateVersion.value !== command.expectedVersion) {
      throw new SellerApplicationError('SELLER_STATE_CONFLICT');
    }
    await this.assertOwnerActor(profile, command.actorIdentityId);
    await this.assertIdentityEligible(command.actorIdentityId);
    this.assertCanSubmitVerification(profile.properties.state);

    return this.idempotency.execute<VerificationSubmitResult>({
      scope: `seller:${command.sellerProfileId.value}`,
      operationType: `seller.verification.submit:${command.verificationType}`,
      idempotencyKey: `verification:${command.verificationType}:${String(command.expectedVersion)}`,
      request: command,
      execute: async () => {
        for (const descriptor of command.evidence) {
          const valid = await this.evidenceStorage.verifyEvidenceIntegrity(
            descriptor.evidenceReference,
            descriptor.evidenceDigest,
          );
          if (!valid) {
            throw new SellerApplicationError('SELLER_EVIDENCE_INTEGRITY_FAILED');
          }
        }
        const now = this.clock.now();
        const existing = await this.repository.findVerifications(command.sellerProfileId);
        const generation =
          existing.reduce((max, record) => {
            return record.properties.verificationType === command.verificationType &&
              record.properties.generation > max
              ? record.properties.generation
              : max;
          }, 0) + 1;
        const verificationId = this.identifiers.next();
        const verification = new SellerBusinessVerification({
          verificationId,
          sellerProfileId: command.sellerProfileId,
          verificationType: command.verificationType,
          state: 'SUBMITTED',
          generation,
          submittedByIdentityId: command.actorIdentityId,
          aggregateVersion: new AggregateVersion(1),
          createdAt: now,
          updatedAt: now,
        });
        const evidence = command.evidence.map(
          (descriptor) =>
            new SellerVerificationEvidence({
              evidenceId: this.identifiers.next(),
              verificationId,
              evidenceType: descriptor.evidenceType,
              evidenceReference: descriptor.evidenceReference,
              evidenceDigest: descriptor.evidenceDigest,
              uploadedByIdentityId: command.actorIdentityId,
              uploadedAt: now,
              createdAt: now,
            }),
        );
        await this.repository.save(
          {
            sellerProfile: profile,
            associationsToAppend: [],
            verificationsToAppend: [verification],
            evidenceToAppend: evidence,
            transitionsToAppend: [],
            warehousesToAppend: [],
            agreementsToAppend: [],
            auditRecordsToAppend: [
              new SellerBusinessAuditRecord({
                auditEventId: this.identifiers.next(),
                sellerProfileId: command.sellerProfileId,
                eventType: 'SELLER_VERIFICATION_SUBMITTED',
                actorIdentityId: command.actorIdentityId,
                occurredAt: now,
                createdAt: now,
                ...(command.correlationId !== undefined
                  ? { correlationId: command.correlationId }
                  : {}),
              }),
            ],
          },
          profile.properties.aggregateVersion,
        );
        return {
          verificationId: verificationId.value,
          state: 'SUBMITTED',
          generation,
          sellerVersion: profile.properties.aggregateVersion.value,
        };
      },
    });
  }

  /**
   * M03-SPEC-001 §4/§12.8. SUBMITTED → UNDER_REVIEW. The reviewer is recorded
   * in the transition episode; the same identity can never be the approver
   * (separation of duties) nor the applicant.
   */
  public async claimReview(command: ClaimReviewCommand): Promise<ReviewResult> {
    const granted = await this.adminAuthorization.isGranted(
      command.reviewerIdentityId,
      'seller.review.claim',
    );
    if (!granted) throw new SellerApplicationError('SELLER_ADMIN_AUTHORIZATION_DENIED');
    const profile = await this.repository.findById(command.sellerProfileId);
    if (profile === null) throw new SellerApplicationError('SELLER_NOT_FOUND');
    if (profile.properties.aggregateVersion.value !== command.expectedVersion) {
      throw new SellerApplicationError('SELLER_STATE_CONFLICT');
    }
    if (profile.properties.state !== 'SUBMITTED') {
      throw new SellerApplicationError('SELLER_STATE_CONFLICT');
    }
    await this.assertReviewerNotApplicant(profile, command.reviewerIdentityId);

    const now = this.clock.now();
    const transition = this.lifecycle.transition({
      sellerProfile: profile,
      toState: 'UNDER_REVIEW',
      actor: { identityId: command.reviewerIdentityId, kind: 'ADMIN_REVIEWER' },
      now,
      transitionId: this.identifiers.next(),
      ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
    });
    const updated = this.lifecycle.updatedProfile(profile, 'UNDER_REVIEW', now);
    await this.repository.save(
      this.changeSet(
        updated,
        [transition],
        command.reviewerIdentityId,
        now,
        'SELLER_REVIEW_CLAIMED',
        command.correlationId,
      ),
      profile.properties.aggregateVersion,
    );
    return {
      sellerProfileId: command.sellerProfileId.value,
      state: 'UNDER_REVIEW',
      version: updated.properties.aggregateVersion.value,
    };
  }

  /**
   * M03-SPEC-001 §4. UNDER_REVIEW → CORRECTIONS_REQUESTED. The same reviewer
   * that claimed the review requests corrections; a non-disclosing reason
   * reference is mandatory. The seller may then resubmit (new review cycle).
   */
  public async requestCorrections(command: RequestCorrectionsCommand): Promise<ReviewResult> {
    const granted = await this.adminAuthorization.isGranted(
      command.reviewerIdentityId,
      'seller.review.claim',
    );
    if (!granted) throw new SellerApplicationError('SELLER_ADMIN_AUTHORIZATION_DENIED');
    const profile = await this.repository.findById(command.sellerProfileId);
    if (profile === null) throw new SellerApplicationError('SELLER_NOT_FOUND');
    if (profile.properties.aggregateVersion.value !== command.expectedVersion) {
      throw new SellerApplicationError('SELLER_STATE_CONFLICT');
    }
    if (profile.properties.state !== 'UNDER_REVIEW') {
      throw new SellerApplicationError('SELLER_STATE_CONFLICT');
    }
    if (command.reasonReference.trim().length === 0) {
      throw new SellerApplicationError('SELLER_PRECONDITION_FAILED');
    }

    const now = this.clock.now();
    const transition = this.lifecycle.transition({
      sellerProfile: profile,
      toState: 'CORRECTIONS_REQUESTED',
      actor: { identityId: command.reviewerIdentityId, kind: 'ADMIN_REVIEWER' },
      now,
      transitionId: this.identifiers.next(),
      reasonReference: command.reasonReference,
      ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
    });
    const updated = this.lifecycle.updatedProfile(profile, 'CORRECTIONS_REQUESTED', now);
    await this.repository.save(
      this.changeSet(
        updated,
        [transition],
        command.reviewerIdentityId,
        now,
        'SELLER_CORRECTIONS_REQUESTED',
        command.correlationId,
      ),
      profile.properties.aggregateVersion,
    );
    return {
      sellerProfileId: command.sellerProfileId.value,
      state: 'CORRECTIONS_REQUESTED',
      version: updated.properties.aggregateVersion.value,
    };
  }

  /**
   * M03-SPEC-001 §4/§12.8. UNDER_REVIEW → APPROVED (approver ≠ reviewer,
   * mandatory verifications approved, applicant never self-approves) or
   * → REJECTED (reason required). The reviewer identity is resolved from the
   * transition log (the episode that moved the seller into UNDER_REVIEW).
   */
  public async decideReview(command: ReviewDecisionCommand): Promise<ReviewResult> {
    const granted = await this.adminAuthorization.isGranted(
      command.approverIdentityId,
      'seller.review.decide',
    );
    if (!granted) throw new SellerApplicationError('SELLER_ADMIN_AUTHORIZATION_DENIED');
    const profile = await this.repository.findById(command.sellerProfileId);
    if (profile === null) throw new SellerApplicationError('SELLER_NOT_FOUND');
    if (profile.properties.aggregateVersion.value !== command.expectedVersion) {
      throw new SellerApplicationError('SELLER_STATE_CONFLICT');
    }
    if (profile.properties.state !== 'UNDER_REVIEW') {
      throw new SellerApplicationError('SELLER_STATE_CONFLICT');
    }
    if (
      command.decision === 'REJECTED' &&
      (command.reasonReference === undefined || command.reasonReference.trim().length === 0)
    ) {
      throw new SellerApplicationError('SELLER_PRECONDITION_FAILED');
    }
    await this.assertReviewerNotApplicant(profile, command.approverIdentityId);

    const transitions = await this.repository.findTransitions(command.sellerProfileId);
    const reviewerEpisode = [...transitions]
      .reverse()
      .find(
        (transition) =>
          transition.properties.toState === 'UNDER_REVIEW' &&
          transition.properties.actorKind === 'ADMIN_REVIEWER',
      );
    const reviewerIdentityId = reviewerEpisode?.properties.actorIdentityId;
    if (reviewerIdentityId === undefined) {
      throw new SellerApplicationError('SELLER_SOD_VIOLATION');
    }

    const now = this.clock.now();
    let mandatoryVerificationsApproved = false;
    if (command.decision === 'APPROVED') {
      const verifications = await this.repository.findVerifications(command.sellerProfileId);
      mandatoryVerificationsApproved =
        this.compliance.areMandatoryVerificationsApproved(verifications);
    }
    const transition = this.lifecycle.transition({
      sellerProfile: profile,
      toState: command.decision,
      actor: { identityId: command.approverIdentityId, kind: 'ADMIN_APPROVER' },
      now,
      transitionId: this.identifiers.next(),
      ...(command.reasonReference !== undefined
        ? { reasonReference: command.reasonReference }
        : {}),
      reviewerIdentityId,
      mandatoryVerificationsApproved,
      ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
    });
    const updated = this.lifecycle.updatedProfile(profile, command.decision, now);
    await this.repository.save(
      this.changeSet(
        updated,
        [transition],
        command.approverIdentityId,
        now,
        command.decision === 'APPROVED' ? 'SELLER_APPROVED' : 'SELLER_REJECTED',
        command.correlationId,
      ),
      profile.properties.aggregateVersion,
    );
    return {
      sellerProfileId: command.sellerProfileId.value,
      state: command.decision,
      version: updated.properties.aggregateVersion.value,
    };
  }

  /**
   * M03-SPEC-001 §5. Non-enumerating verification status: compliance state and
   * per-type state/generation only — no evidence content, no reviewer
   * internals. The caller must be an ACTIVE association of the seller.
   */
  public async getVerificationStatus(
    sellerProfileId: UuidV7,
    callerIdentityId: UuidV7,
  ): Promise<VerificationStatusResult> {
    const profile = await this.repository.findById(sellerProfileId);
    if (profile === null) throw new SellerApplicationError('SELLER_NOT_FOUND');
    await this.assertCallerIsAssociated(profile, callerIdentityId);
    const verifications = await this.repository.findVerifications(sellerProfileId);
    return {
      sellerProfileId: sellerProfileId.value,
      complianceState: this.compliance.derive(verifications),
      verifications: verifications.map((record) => ({
        verificationType: record.properties.verificationType,
        state: record.properties.state,
        generation: record.properties.generation,
      })),
    };
  }

  private assertCanSubmitVerification(state: string): void {
    const submittable = ['DRAFT', 'CORRECTIONS_REQUESTED', 'ACTIVE', 'SUSPENDED'];
    if (!submittable.includes(state)) {
      throw new SellerApplicationError('SELLER_STATE_CONFLICT');
    }
  }

  private async assertOwnerActor(profile: SellerProfile, actorIdentityId: UuidV7): Promise<void> {
    const associations = await this.repository.findAssociations(profile.properties.sellerProfileId);
    this.associations.assertValidAssociations(associations);
    const association = this.associations.findActiveAssociation(
      associations,
      actorIdentityId.value,
    );
    if (association?.properties.associationRole !== 'OWNER') {
      throw new SellerApplicationError('SELLER_OWNERSHIP_DENIED');
    }
  }

  private async assertCallerIsAssociated(
    profile: SellerProfile,
    callerIdentityId: UuidV7,
  ): Promise<void> {
    const associations = await this.repository.findAssociations(profile.properties.sellerProfileId);
    const association = this.associations.findActiveAssociation(
      associations,
      callerIdentityId.value,
    );
    if (association === null) {
      throw new SellerApplicationError('SELLER_OWNERSHIP_DENIED');
    }
  }

  private async assertReviewerNotApplicant(
    profile: SellerProfile,
    actorIdentityId: UuidV7,
  ): Promise<void> {
    const associations = await this.repository.findAssociations(profile.properties.sellerProfileId);
    const applicant = this.associations.findActiveAssociation(associations, actorIdentityId.value);
    if (applicant !== null) {
      // A seller-associated identity can never review or approve its own seller.
      throw new SellerApplicationError('SELLER_SOD_VIOLATION');
    }
  }

  private async assertIdentityEligible(identityId: UuidV7): Promise<void> {
    const eligibility = await this.module01.getIdentityEligibility(identityId);
    if (eligibility.state !== 'ACTIVE' || eligibility.verificationState !== 'VERIFIED') {
      throw new SellerApplicationError('SELLER_IDENTITY_INELIGIBLE');
    }
  }

  private changeSet(
    sellerProfile: SellerProfile,
    transitionsToAppend: readonly ReturnType<SellerLifecycle['transition']>[],
    actorIdentityId: UuidV7,
    now: Date,
    eventType: string,
    correlationId?: CorrelationIdentifier,
  ): SellerAggregateChangeSet {
    return {
      sellerProfile,
      associationsToAppend: [],
      verificationsToAppend: [],
      evidenceToAppend: [],
      transitionsToAppend,
      warehousesToAppend: [],
      agreementsToAppend: [],
      auditRecordsToAppend: [
        new SellerBusinessAuditRecord({
          auditEventId: this.identifiers.next(),
          sellerProfileId: sellerProfile.properties.sellerProfileId,
          eventType,
          actorIdentityId,
          occurredAt: now,
          createdAt: now,
          ...(correlationId !== undefined ? { correlationId } : {}),
        }),
      ],
    };
  }
}
