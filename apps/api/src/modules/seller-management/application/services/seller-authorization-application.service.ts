import type {
  ClockPort,
  UuidV7GenerationPort,
} from '../../../identity-authentication/application/ports/application-runtime.port';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import { SellerBusinessAuditRecord } from '../../domain/entities/seller-business-audit-record';
import type { SellerProfile } from '../../domain/entities/seller-profile';
import type { SellerStateTransition } from '../../domain/entities/seller-state-transition';
import type { SellerLifecycle } from '../../domain/lifecycle/seller-lifecycle';
import type { SellerAssociationPolicy } from '../../domain/policy/seller-association.policy';
import type {
  SellerAggregateChangeSet,
  SellerProfileRepository,
} from '../../domain/ports/seller-repository.port';
import type { Module01IdentityContractPort } from '../../domain/ports/module-01-contract.port';
import type { Module02AuthorizationContractPort } from '../../domain/ports/module-02-contract.port';
import { SellerApplicationError } from '../errors/seller-application.error';
import type { SellerAdminAuthorizationPort } from '../ports/seller-admin-authorization.port';

/**
 * The reserved system actor identity for the SYSTEM-activated APPROVED → ACTIVE
 * transition (WEMP-M03-SPEC-001 §4). SYSTEM activation carries no human
 * identity; the transition episode records this reserved platform identity
 * with actorKind SYSTEM plus the correlation/provenance of the SELLER role
 * assignment. No human can ever authenticate as this identifier.
 */
const SELLER_SYSTEM_ACTOR_IDENTITY = new UuidV7('0191310f-789a-7fff-8000-000000000001');

export interface ActivateSellerCommand {
  readonly sellerProfileId: UuidV7;
  readonly expectedVersion: number;
  readonly correlationId?: CorrelationIdentifier;
}

export interface SuspendSellerCommand {
  readonly sellerProfileId: UuidV7;
  readonly actorIdentityId: UuidV7;
  readonly expectedVersion: number;
  readonly reasonReference: string;
  readonly correlationId?: CorrelationIdentifier;
}

export interface ReactivateSellerCommand {
  readonly sellerProfileId: UuidV7;
  readonly actorIdentityId: UuidV7;
  readonly expectedVersion: number;
  readonly correlationId?: CorrelationIdentifier;
}

export interface RevokeSellerAuthorizationCommand {
  readonly sellerProfileId: UuidV7;
  readonly actorIdentityId: UuidV7;
  readonly expectedVersion: number;
  readonly reasonReference: string;
  readonly correlationId?: CorrelationIdentifier;
}

export interface SellerAuthorizationResult {
  readonly sellerProfileId: string;
  readonly state: 'APPROVED' | 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
  readonly version: number;
  readonly sellerRoleGranted: boolean;
}

/**
 * WEMP-M03-PLAN-001 M03-M4 / decision D-11. The seller role-assignment
 * lifecycle:
 *
 *  - activateApprovedSeller: APPROVED → identity eligibility (D-04) → SELLER
 *    role assignment through the Module 02 contract → ACTIVE. Fail closed on
 *    any denial/failure; a transition commit failure compensates by revoking
 *    the role so a SELLER role is never left effective for a seller that did
 *    not reach ACTIVE. Idempotent: an already-ACTIVE seller with the role is a
 *    success; concurrent/duplicate activation resolves without partial state.
 *  - suspendSeller: ACTIVE → SUSPENDED (admin, reason, seller.suspend.manage).
 *    Effective authorization is removed by the approved lifecycle state rules
 *    (the SELLER role stays but grants nothing further; terminal sellers are
 *    additionally denied by the ownership resolver gate).
 *  - reactivateSeller: SUSPENDED → ACTIVE (admin, seller.suspend.manage,
 *    identity still eligible). The SELLER role is idempotently ensured first —
 *    if it was revoked meanwhile, re-assignment is requested and its failure
 *    fails the reactivation closed (no ACTIVE seller without a role).
 *  - revokeSellerAuthorization: explicit SELLER role revocation (admin,
 *    seller.suspend.manage) for terminal closure / administrative action.
 *
 * Every mutation is version-guarded, idempotent and audited; no partial
 * privileged/SELLER access is ever created.
 */
export class SellerAuthorizationApplicationService {
  public constructor(
    private readonly repository: SellerProfileRepository,
    private readonly module01: Module01IdentityContractPort,
    private readonly lifecycle: SellerLifecycle,
    private readonly associations: SellerAssociationPolicy,
    private readonly adminAuthorization: SellerAdminAuthorizationPort,
    private readonly module02: Module02AuthorizationContractPort,
    private readonly clock: ClockPort,
    private readonly identifiers: UuidV7GenerationPort,
  ) {}

  /**
   * APPROVED → eligibility → SELLER role assignment → ACTIVE. The role is
   * assigned FIRST (the lifecycle precondition); if the ACTIVE transition
   * cannot commit (stale/concurrent version), the role assignment is
   * compensated (revoked) so no partial SELLER access remains.
   */
  public async activateApprovedSeller(
    command: ActivateSellerCommand,
  ): Promise<SellerAuthorizationResult> {
    const profile = await this.repository.findById(command.sellerProfileId);
    if (profile === null) throw new SellerApplicationError('SELLER_NOT_FOUND');
    if (profile.properties.aggregateVersion.value !== command.expectedVersion) {
      throw new SellerApplicationError('SELLER_STATE_CONFLICT');
    }
    if (profile.properties.state === 'ACTIVE') {
      // Idempotent re-activation: an already ACTIVE seller is a success when
      // the role is present; the role was mandatory for the original activation.
      const granted = await this.module02.isSellerRoleGranted(
        await this.requireOwnerIdentityId(profile),
      );
      if (granted) {
        return {
          sellerProfileId: profile.properties.sellerProfileId.value,
          state: 'ACTIVE',
          version: profile.properties.aggregateVersion.value,
          sellerRoleGranted: true,
        };
      }
      throw new SellerApplicationError('SELLER_STATE_CONFLICT');
    }
    if (profile.properties.state !== 'APPROVED') {
      throw new SellerApplicationError('SELLER_STATE_CONFLICT');
    }

    const ownerIdentityId = await this.requireOwnerIdentityId(profile);
    await this.assertIdentityEligible(ownerIdentityId);

    const assignment = await this.module02.requestSellerRoleAssignment({
      targetIdentityId: ownerIdentityId,
      sellerProfileId: command.sellerProfileId,
      ...(command.correlationId === undefined
        ? {}
        : { correlationId: command.correlationId.value }),
    });
    if (assignment.outcome !== 'GRANTED') {
      // Denied/failed assignment: no role, no activation (fail closed).
      throw new SellerApplicationError('SELLER_ROLE_ASSIGNMENT_DENIED');
    }

    const now = this.clock.now();
    const transition = this.lifecycle.transition({
      sellerProfile: profile,
      toState: 'ACTIVE',
      actor: { identityId: SELLER_SYSTEM_ACTOR_IDENTITY, kind: 'SYSTEM' },
      now,
      transitionId: this.identifiers.next(),
      roleAssignmentGranted: true,
      ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
      causationId: command.sellerProfileId,
    });
    const updated = this.lifecycle.updatedProfile(profile, 'ACTIVE', now);
    try {
      await this.repository.save(
        this.changeSet(
          updated,
          [transition],
          SELLER_SYSTEM_ACTOR_IDENTITY,
          now,
          'SELLER_ACTIVATED',
          command.correlationId,
        ),
        profile.properties.aggregateVersion,
      );
    } catch (error) {
      // Compensate: the transition did not commit, so the freshly granted role
      // must not remain effective for a seller that is still APPROVED.
      await this.module02.revokeSellerRole({
        identityId: ownerIdentityId,
        reasonReference: 'SELLER_ACTIVATION_ROLLED_BACK',
        ...(command.correlationId === undefined
          ? {}
          : { correlationId: command.correlationId.value }),
      });
      throw error;
    }
    return {
      sellerProfileId: command.sellerProfileId.value,
      state: 'ACTIVE',
      version: updated.properties.aggregateVersion.value,
      sellerRoleGranted: true,
    };
  }

  /**
   * ACTIVE → SUSPENDED by an admin holding seller.suspend.manage, with a
   * mandatory reason. Version-guarded and audited. The SELLER role stays
   * assigned (per the approved lifecycle the suspension itself is the
   * authorization removal); the ownership-resolver coarse gate and the
   * application-layer state rules deny seller operations while suspended.
   */
  public async suspendSeller(command: SuspendSellerCommand): Promise<SellerAuthorizationResult> {
    const granted = await this.adminAuthorization.isGranted(
      command.actorIdentityId,
      'seller.suspend.manage',
    );
    if (!granted) throw new SellerApplicationError('SELLER_ADMIN_AUTHORIZATION_DENIED');
    if (command.reasonReference.trim().length === 0) {
      throw new SellerApplicationError('SELLER_PRECONDITION_FAILED');
    }
    const profile = await this.repository.findById(command.sellerProfileId);
    if (profile === null) throw new SellerApplicationError('SELLER_NOT_FOUND');
    if (profile.properties.aggregateVersion.value !== command.expectedVersion) {
      throw new SellerApplicationError('SELLER_STATE_CONFLICT');
    }
    if (profile.properties.state !== 'ACTIVE') {
      throw new SellerApplicationError('SELLER_STATE_CONFLICT');
    }

    const now = this.clock.now();
    const transition = this.lifecycle.transition({
      sellerProfile: profile,
      toState: 'SUSPENDED',
      actor: { identityId: command.actorIdentityId, kind: 'ADMIN' },
      now,
      transitionId: this.identifiers.next(),
      reasonReference: command.reasonReference,
      ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
    });
    const updated = this.lifecycle.updatedProfile(profile, 'SUSPENDED', now);
    await this.repository.save(
      this.changeSet(
        updated,
        [transition],
        command.actorIdentityId,
        now,
        'SELLER_SUSPENDED',
        command.correlationId,
      ),
      profile.properties.aggregateVersion,
    );
    return {
      sellerProfileId: command.sellerProfileId.value,
      state: 'SUSPENDED',
      version: updated.properties.aggregateVersion.value,
      sellerRoleGranted: await this.module02.isSellerRoleGranted(
        await this.requireOwnerIdentityId(updated),
      ),
    };
  }

  /**
   * SUSPENDED → ACTIVE by an admin holding seller.suspend.manage. The identity
   * must still be eligible (D-04); the SELLER role is idempotently ensured
   * before the transition — if it was revoked meanwhile, the re-assignment is
   * requested and a failure fails the reactivation closed (no ACTIVE seller
   * without an effective SELLER role).
   */
  public async reactivateSeller(
    command: ReactivateSellerCommand,
  ): Promise<SellerAuthorizationResult> {
    const granted = await this.adminAuthorization.isGranted(
      command.actorIdentityId,
      'seller.suspend.manage',
    );
    if (!granted) throw new SellerApplicationError('SELLER_ADMIN_AUTHORIZATION_DENIED');
    const profile = await this.repository.findById(command.sellerProfileId);
    if (profile === null) throw new SellerApplicationError('SELLER_NOT_FOUND');
    if (profile.properties.aggregateVersion.value !== command.expectedVersion) {
      throw new SellerApplicationError('SELLER_STATE_CONFLICT');
    }
    if (profile.properties.state !== 'SUSPENDED') {
      throw new SellerApplicationError('SELLER_STATE_CONFLICT');
    }
    const ownerIdentityId = await this.requireOwnerIdentityId(profile);
    await this.assertIdentityEligible(ownerIdentityId);

    // Idempotent role ensure: already granted resolves to GRANTED; a denied or
    // failed re-assignment fails the reactivation closed.
    const assignment = await this.module02.requestSellerRoleAssignment({
      targetIdentityId: ownerIdentityId,
      sellerProfileId: command.sellerProfileId,
      ...(command.correlationId === undefined
        ? {}
        : { correlationId: command.correlationId.value }),
    });
    if (assignment.outcome !== 'GRANTED') {
      throw new SellerApplicationError('SELLER_ROLE_ASSIGNMENT_DENIED');
    }

    const now = this.clock.now();
    const transition = this.lifecycle.transition({
      sellerProfile: profile,
      toState: 'ACTIVE',
      actor: { identityId: command.actorIdentityId, kind: 'ADMIN' },
      now,
      transitionId: this.identifiers.next(),
      ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
    });
    const updated = this.lifecycle.updatedProfile(profile, 'ACTIVE', now);
    await this.repository.save(
      this.changeSet(
        updated,
        [transition],
        command.actorIdentityId,
        now,
        'SELLER_REACTIVATED',
        command.correlationId,
      ),
      profile.properties.aggregateVersion,
    );
    return {
      sellerProfileId: command.sellerProfileId.value,
      state: 'ACTIVE',
      version: updated.properties.aggregateVersion.value,
      sellerRoleGranted: true,
    };
  }

  /**
   * Explicit SELLER role revocation (admin, seller.suspend.manage) — used for
   * terminal closure and administrative revocation so the identity no longer
   * holds effective seller authorization for this seller. Version-guarded and
   * audited; idempotent when the role is already gone.
   */
  public async revokeSellerAuthorization(
    command: RevokeSellerAuthorizationCommand,
  ): Promise<SellerAuthorizationResult> {
    const granted = await this.adminAuthorization.isGranted(
      command.actorIdentityId,
      'seller.suspend.manage',
    );
    if (!granted) throw new SellerApplicationError('SELLER_ADMIN_AUTHORIZATION_DENIED');
    if (command.reasonReference.trim().length === 0) {
      throw new SellerApplicationError('SELLER_PRECONDITION_FAILED');
    }
    const profile = await this.repository.findById(command.sellerProfileId);
    if (profile === null) throw new SellerApplicationError('SELLER_NOT_FOUND');
    if (profile.properties.aggregateVersion.value !== command.expectedVersion) {
      throw new SellerApplicationError('SELLER_STATE_CONFLICT');
    }
    const ownerIdentityId = await this.requireOwnerIdentityId(profile);
    const outcome = await this.module02.revokeSellerRole({
      identityId: ownerIdentityId,
      revokedByIdentityId: command.actorIdentityId,
      reasonReference: command.reasonReference,
      ...(command.correlationId === undefined
        ? {}
        : { correlationId: command.correlationId.value }),
    });
    if (outcome.outcome !== 'GRANTED') {
      throw new SellerApplicationError('SELLER_ROLE_REVOCATION_FAILED');
    }
    const now = this.clock.now();
    await this.repository.save(
      this.changeSet(
        profile,
        [],
        command.actorIdentityId,
        now,
        'SELLER_ROLE_REVOKED',
        command.correlationId,
      ),
      profile.properties.aggregateVersion,
    );
    return {
      sellerProfileId: command.sellerProfileId.value,
      state: profile.properties.state as SellerAuthorizationResult['state'],
      version: profile.properties.aggregateVersion.value + 1,
      sellerRoleGranted: false,
    };
  }

  private async requireOwnerIdentityId(profile: SellerProfile): Promise<UuidV7> {
    const associations = await this.repository.findAssociations(
      profile.properties.sellerProfileId,
    );
    const owner = this.associations.assertValidAssociations(associations);
    return owner.properties.identityId;
  }

  private async assertIdentityEligible(identityId: UuidV7): Promise<void> {
    const eligibility = await this.module01.getIdentityEligibility(identityId);
    if (eligibility.state !== 'ACTIVE' || eligibility.verificationState !== 'VERIFIED') {
      throw new SellerApplicationError('SELLER_IDENTITY_INELIGIBLE');
    }
  }

  private changeSet(
    sellerProfile: SellerProfile,
    transitionsToAppend: readonly SellerStateTransition[],
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
