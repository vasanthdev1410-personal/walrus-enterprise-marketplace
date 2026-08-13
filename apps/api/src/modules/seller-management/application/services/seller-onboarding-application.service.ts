import type {
  ClockPort,
  UuidV7GenerationPort,
} from '../../../identity-authentication/application/ports/application-runtime.port';
import type { NonProductionRateLimiterPort } from '../../../identity-authentication/application/ports/non-production-rate-limiter.port';
import type { ApiIdempotencyService } from '../../../identity-authentication/application/services/api-idempotency.service';
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import { ProtectedValue } from '../../../identity-authentication/domain/shared/value-objects/protected-value';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { SellerIdentityAssociation } from '../../domain/entities/seller-identity-association';
import { SellerOrganization } from '../../domain/entities/seller-organization';
import { SellerProfile } from '../../domain/entities/seller-profile';
import { SellerStateTransition } from '../../domain/entities/seller-state-transition';
import { SellerBusinessAuditRecord } from '../../domain/entities/seller-business-audit-record';
import type { SellerLifecycle } from '../../domain/lifecycle/seller-lifecycle';
import type { SellerAssociationPolicy } from '../../domain/policy/seller-association.policy';
import type { SellerCompliancePolicy } from '../../domain/policy/seller-compliance.policy';
import type {
  SellerAggregateChangeSet,
  SellerProfileRepository,
} from '../../domain/ports/seller-repository.port';
import type { Module01IdentityContractPort } from '../../domain/ports/module-01-contract.port';
import { SellerApplicationError } from '../errors/seller-application.error';

export interface RequestSellerProfileCreationCommand {
  readonly identityId: UuidV7;
  readonly legalName: string;
  readonly tradeName: string;
  readonly registrationNumber: string;
  readonly registrationLookupDigest: string;
  readonly businessAddress: string;
  readonly correlationId?: CorrelationIdentifier;
}

export interface SellerProfileCreationResult {
  readonly sellerProfileId: string;
  readonly state: 'DRAFT';
  readonly version: number;
}

export interface SubmitOnboardingCommand {
  readonly sellerProfileId: UuidV7;
  readonly actorIdentityId: UuidV7;
  readonly expectedVersion: number;
  readonly correlationId?: CorrelationIdentifier;
}

export interface OnboardingSubmitResult {
  readonly sellerProfileId: string;
  readonly state: 'SUBMITTED';
  readonly version: number;
}

export interface UpdateSellerProfileCommand {
  readonly sellerProfileId: UuidV7;
  readonly actorIdentityId: UuidV7;
  readonly expectedVersion: number;
  readonly legalName?: string;
  readonly tradeName?: string;
  readonly businessAddress?: string;
  readonly correlationId?: CorrelationIdentifier;
}

export interface SellerProfileUpdateResult {
  readonly sellerProfileId: string;
  readonly state: 'DRAFT' | 'CORRECTIONS_REQUESTED' | 'ACTIVE' | 'SUSPENDED';
  readonly version: number;
}

/**
 * WEMP-M03-PLAN-001 M03-M3. Seller onboarding application service.
 * - requestSellerProfileCreation: Module 01 association entry (D-04 identity
 *   eligibility gate: ACTIVE + VERIFIED), D-02 duplicate prevention.
 * - submitOnboarding: DRAFT → SUBMITTED, idempotent, version-guarded.
 * - resubmitOnboarding: CORRECTIONS_REQUESTED → SUBMITTED (new review cycle).
 * - updateProfile: version-guarded business-information update.
 * Every mutation appends a mandatory SellerBusinessAuditRecord atomically.
 * Fail closed: any eligibility, ownership, or state violation denies.
 */
export class SellerOnboardingApplicationService {
  public constructor(
    private readonly repository: SellerProfileRepository,
    private readonly module01: Module01IdentityContractPort,
    private readonly lifecycle: SellerLifecycle,
    private readonly associations: SellerAssociationPolicy,
    private readonly compliance: SellerCompliancePolicy,
    private readonly clock: ClockPort,
    private readonly identifiers: UuidV7GenerationPort,
    private readonly idempotency: ApiIdempotencyService,
    private readonly rateLimiter: NonProductionRateLimiterPort,
  ) {}

  /**
   * M03-SPEC-001 §7 / D-04 / D-02. Creates the DRAFT seller profile with its
   * organization and the OWNER association after the identity eligibility
   * gate passes. Rejects an identity that already owns/associates a profile
   * or a business whose registration digest is already ACTIVE (non-enumerating).
   */
  public async requestSellerProfileCreation(
    command: RequestSellerProfileCreationCommand,
  ): Promise<SellerProfileCreationResult> {
    const rateLimit = await this.rateLimiter.consume({
      key: `seller-onboarding-create:${command.identityId.value}`,
      limit: 10,
      windowSeconds: 3600,
    });
    if (!rateLimit.allowed) {
      throw new SellerApplicationError('SELLER_PRECONDITION_FAILED');
    }

    const eligibility = await this.module01.getIdentityEligibility(command.identityId);
    if (eligibility.state !== 'ACTIVE' || eligibility.verificationState !== 'VERIFIED') {
      throw new SellerApplicationError('SELLER_IDENTITY_INELIGIBLE');
    }
    const existing = await this.repository.findProfileByAssociatedIdentityId(command.identityId);
    if (existing !== null) {
      // Re-association of the same identity to an existing seller is idempotent
      // in the contract, but a NEW profile creation for an already-associated
      // identity must fail closed (no duplicate profiles per identity).
      throw new SellerApplicationError('SELLER_DUPLICATE_DETECTED');
    }
    const activeDuplicate = await this.repository.findActiveByRegistrationDigest(
      command.registrationLookupDigest,
    );
    if (activeDuplicate !== null) {
      throw new SellerApplicationError('SELLER_DUPLICATE_DETECTED');
    }

    return this.idempotency.execute<SellerProfileCreationResult>({
      scope: `identity:${command.identityId.value}`,
      operationType: 'seller.onboarding.create',
      idempotencyKey: command.registrationLookupDigest,
      request: command,
      execute: async () => {
        const now = this.clock.now();
        const sellerProfileId = this.identifiers.next();
        const organizationId = this.identifiers.next();
        const profile = new SellerProfile({
          sellerProfileId,
          organizationId,
          state: 'DRAFT',
          complianceState: 'NOT_STARTED',
          aggregateVersion: new AggregateVersion(1),
          createdAt: now,
          updatedAt: now,
          ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
        });
        const organization = new SellerOrganization({
          organizationId,
          legalName: command.legalName,
          tradeName: command.tradeName,
          registrationNumber: new ProtectedValue(command.registrationNumber),
          registrationLookupDigest: command.registrationLookupDigest,
          businessAddress: command.businessAddress,
          aggregateVersion: new AggregateVersion(1),
          createdAt: now,
          updatedAt: now,
        });
        const ownerAssociation = new SellerIdentityAssociation({
          associationId: this.identifiers.next(),
          sellerProfileId,
          identityId: command.identityId,
          associationRole: 'OWNER',
          isPrimary: true,
          state: 'ACTIVE',
          aggregateVersion: new AggregateVersion(1),
          createdAt: now,
          updatedAt: now,
        });
        const initialTransition = new SellerStateTransition({
          sellerStateTransitionId: this.identifiers.next(),
          sellerProfileId,
          toState: 'DRAFT',
          stateVersion: 1,
          actorIdentityId: command.identityId,
          actorKind: 'SELLER_OWNER',
          transitionedAt: now,
          createdAt: now,
          ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
        });
        const audit = new SellerBusinessAuditRecord({
          auditEventId: this.identifiers.next(),
          sellerProfileId,
          eventType: 'SELLER_ONBOARDING_CREATED',
          actorIdentityId: command.identityId,
          occurredAt: now,
          createdAt: now,
          ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
        });
        const changeSet: SellerAggregateChangeSet = {
          sellerProfile: profile,
          organization,
          associationsToAppend: [ownerAssociation],
          verificationsToAppend: [],
          evidenceToAppend: [],
          transitionsToAppend: [initialTransition],
          warehousesToAppend: [],
          agreementsToAppend: [],
          auditRecordsToAppend: [audit],
        };
        await this.repository.insert(changeSet);
        return {
          sellerProfileId: sellerProfileId.value,
          state: 'DRAFT',
          version: 1,
        };
      },
    });
  }

  /**
   * M03-SPEC-001 §4. DRAFT → SUBMITTED. The actor must be the ACTIVE OWNER of
   * the seller; onboarding completeness (organization data + at least one
   * verification submission) is a hard precondition. Idempotent via the
   * request key; version-guarded save; mandatory audit appended atomically.
   */
  public async submitOnboarding(
    command: SubmitOnboardingCommand,
  ): Promise<OnboardingSubmitResult> {
    const profile = await this.repository.findById(command.sellerProfileId);
    if (profile === null) throw new SellerApplicationError('SELLER_NOT_FOUND');
    if (profile.properties.aggregateVersion.value !== command.expectedVersion) {
      throw new SellerApplicationError('SELLER_STATE_CONFLICT');
    }
    if (profile.properties.state !== 'DRAFT') {
      throw new SellerApplicationError('SELLER_STATE_CONFLICT');
    }
    await this.assertOwnerActor(profile, command.actorIdentityId);
    await this.assertIdentityEligible(command.actorIdentityId);

    return this.idempotency.execute<OnboardingSubmitResult>({
      scope: `seller:${command.sellerProfileId.value}`,
      operationType: 'seller.onboarding.submit',
      idempotencyKey: `submit:${String(profile.properties.aggregateVersion.value)}`,
      request: command,
      execute: async () => {
        const [organization, verifications] = await Promise.all([
          this.repository.findOrganization(profile.properties.organizationId),
          this.repository.findVerifications(command.sellerProfileId),
        ]);
        const onboardingComplete = this.compliance.isOnboardingComplete(
          organization,
          verifications,
        );
        const now = this.clock.now();
        const transition = this.lifecycle.transition({
          sellerProfile: profile,
          toState: 'SUBMITTED',
          actor: { identityId: command.actorIdentityId, kind: 'SELLER_OWNER' },
          now,
          transitionId: this.identifiers.next(),
          onboardingComplete,
          ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
        });
        const updated = this.lifecycle.updatedProfile(profile, 'SUBMITTED', now);
        await this.repository.save(
          this.changeSetWithAudit(
            updated,
            [transition],
            new SellerBusinessAuditRecord({
              auditEventId: this.identifiers.next(),
              sellerProfileId: command.sellerProfileId,
              eventType: 'SELLER_ONBOARDING_SUBMITTED',
              actorIdentityId: command.actorIdentityId,
              occurredAt: now,
              createdAt: now,
              ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
            }),
          ),
          profile.properties.aggregateVersion,
        );
        return {
          sellerProfileId: command.sellerProfileId.value,
          state: 'SUBMITTED',
          version: updated.properties.aggregateVersion.value,
        };
      },
    });
  }

  /**
   * M03-SPEC-001 §4. CORRECTIONS_REQUESTED → SUBMITTED by the seller OWNER,
   * starting a new review cycle. Version-guarded; mandatory audit appended.
   */
  public async resubmitOnboarding(
    command: SubmitOnboardingCommand,
  ): Promise<OnboardingSubmitResult> {
    const profile = await this.repository.findById(command.sellerProfileId);
    if (profile === null) throw new SellerApplicationError('SELLER_NOT_FOUND');
    if (profile.properties.aggregateVersion.value !== command.expectedVersion) {
      throw new SellerApplicationError('SELLER_STATE_CONFLICT');
    }
    if (profile.properties.state !== 'CORRECTIONS_REQUESTED') {
      throw new SellerApplicationError('SELLER_STATE_CONFLICT');
    }
    await this.assertOwnerActor(profile, command.actorIdentityId);
    await this.assertIdentityEligible(command.actorIdentityId);

    const now = this.clock.now();
    const transition = this.lifecycle.transition({
      sellerProfile: profile,
      toState: 'SUBMITTED',
      actor: { identityId: command.actorIdentityId, kind: 'SELLER_OWNER' },
      now,
      transitionId: this.identifiers.next(),
      ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
    });
    const updated = this.lifecycle.updatedProfile(profile, 'SUBMITTED', now);
    await this.repository.save(
      this.changeSetWithAudit(
        updated,
        [transition],
        new SellerBusinessAuditRecord({
          auditEventId: this.identifiers.next(),
          sellerProfileId: command.sellerProfileId,
          eventType: 'SELLER_ONBOARDING_RESUBMITTED',
          actorIdentityId: command.actorIdentityId,
          occurredAt: now,
          createdAt: now,
          ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
        }),
      ),
      profile.properties.aggregateVersion,
    );
    return {
      sellerProfileId: command.sellerProfileId.value,
      state: 'SUBMITTED',
      version: updated.properties.aggregateVersion.value,
    };
  }

  /**
   * M03-SPEC-001 §4. Version-guarded business-information update permitted in
   * DRAFT, CORRECTIONS_REQUESTED, ACTIVE and SUSPENDED (denied while locked
   * for review or terminal). Updates never change lifecycle state and never
   * create a state-transition episode; the change is audited.
   */
  public async updateProfile(
    command: UpdateSellerProfileCommand,
  ): Promise<SellerProfileUpdateResult> {
    const profile = await this.repository.findById(command.sellerProfileId);
    if (profile === null) throw new SellerApplicationError('SELLER_NOT_FOUND');
    if (profile.properties.aggregateVersion.value !== command.expectedVersion) {
      throw new SellerApplicationError('SELLER_STATE_CONFLICT');
    }
    this.lifecycle.assertCanUpdate(profile.properties.state);
    await this.assertOwnerActor(profile, command.actorIdentityId);
    await this.assertIdentityEligible(command.actorIdentityId);

    const organization = await this.repository.findOrganization(
      profile.properties.organizationId,
    );
    if (organization === null) throw new SellerApplicationError('SELLER_NOT_FOUND');

    const now = this.clock.now();
    const updatedOrganization = new SellerOrganization({
      ...organization.properties,
      ...(command.legalName !== undefined ? { legalName: command.legalName } : {}),
      ...(command.tradeName !== undefined ? { tradeName: command.tradeName } : {}),
      ...(command.businessAddress !== undefined
        ? { businessAddress: command.businessAddress }
        : {}),
      updatedAt: now,
      aggregateVersion: new AggregateVersion(
        organization.properties.aggregateVersion.value + 1,
      ),
    });
    const updatedProfile = new SellerProfile({
      ...profile.properties,
      updatedAt: now,
      aggregateVersion: new AggregateVersion(profile.properties.aggregateVersion.value + 1),
    });
    await this.repository.save(
      {
        sellerProfile: updatedProfile,
        organization: updatedOrganization,
        associationsToAppend: [],
        verificationsToAppend: [],
        evidenceToAppend: [],
        transitionsToAppend: [],
        warehousesToAppend: [],
        agreementsToAppend: [],
        auditRecordsToAppend: [
          new SellerBusinessAuditRecord({
            auditEventId: this.identifiers.next(),
            sellerProfileId: command.sellerProfileId,
            eventType: 'SELLER_PROFILE_UPDATED',
            actorIdentityId: command.actorIdentityId,
            occurredAt: now,
            createdAt: now,
            ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
          }),
        ],
      },
      profile.properties.aggregateVersion,
    );
    return {
      sellerProfileId: command.sellerProfileId.value,
      state: updatedProfile.properties.state as SellerProfileUpdateResult['state'],
      version: updatedProfile.properties.aggregateVersion.value,
    };
  }

  private async assertOwnerActor(
    profile: SellerProfile,
    actorIdentityId: UuidV7,
  ): Promise<void> {
    const associations = await this.repository.findAssociations(
      profile.properties.sellerProfileId,
    );
    this.associations.assertValidAssociations(associations);
    const association = this.associations.findActiveAssociation(
      associations,
      actorIdentityId.value,
    );
    if (association?.properties.associationRole !== 'OWNER') {
      throw new SellerApplicationError('SELLER_OWNERSHIP_DENIED');
    }
  }

  private async assertIdentityEligible(identityId: UuidV7): Promise<void> {
    const eligibility = await this.module01.getIdentityEligibility(identityId);
    if (eligibility.state !== 'ACTIVE' || eligibility.verificationState !== 'VERIFIED') {
      throw new SellerApplicationError('SELLER_IDENTITY_INELIGIBLE');
    }
  }

  private changeSetWithAudit(
    sellerProfile: SellerProfile,
    transitionsToAppend: readonly SellerStateTransition[],
    audit: SellerBusinessAuditRecord,
  ): SellerAggregateChangeSet {
    return {
      sellerProfile,
      associationsToAppend: [],
      verificationsToAppend: [],
      evidenceToAppend: [],
      transitionsToAppend,
      warehousesToAppend: [],
      agreementsToAppend: [],
      auditRecordsToAppend: [audit],
    };
  }
}
