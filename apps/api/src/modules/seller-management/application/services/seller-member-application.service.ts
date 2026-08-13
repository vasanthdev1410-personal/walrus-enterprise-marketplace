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
import { SellerIdentityAssociation } from '../../domain/entities/seller-identity-association';
import { SellerProfile } from '../../domain/entities/seller-profile';
import type { SellerAssociationPolicy } from '../../domain/policy/seller-association.policy';
import type { SellerProfileRepository } from '../../domain/ports/seller-repository.port';
import { SellerApplicationError } from '../errors/seller-application.error';

export interface AddMemberCommand {
  readonly sellerProfileId: UuidV7;
  readonly actorIdentityId: UuidV7;
  readonly expectedVersion: number;
  readonly memberIdentityId: UuidV7;
  readonly idempotencyKey?: string;
  readonly correlationId?: CorrelationIdentifier;
}

export interface RemoveMemberCommand {
  readonly sellerProfileId: UuidV7;
  readonly actorIdentityId: UuidV7;
  readonly expectedVersion: number;
  readonly memberIdentityId: UuidV7;
  readonly correlationId?: CorrelationIdentifier;
}

export interface MemberResult {
  readonly sellerProfileId: string;
  readonly memberIdentityId: string;
  readonly associationRole: 'OWNER' | 'MEMBER';
  readonly associationState: 'ACTIVE' | 'REMOVED';
  readonly sellerVersion: number;
}

/**
 * WEMP-M03-PLAN-001 M03-M5 / WEMP-M03-SPEC-001 §13 (`seller.member.manage`),
 * decision D-01 (single SELLER role; OWNER/MEMBER carried by the association).
 * Member management is an OWNER action only; a MEMBER may read only. Exactly
 * one OWNER per seller is preserved — the OWNER can never be removed through
 * this surface. Version-guarded, idempotent, rate-limited and audited.
 */
export class SellerMemberApplicationService {
  public constructor(
    private readonly repository: SellerProfileRepository,
    private readonly associations: SellerAssociationPolicy,
    private readonly clock: ClockPort,
    private readonly identifiers: UuidV7GenerationPort,
    private readonly idempotency: ApiIdempotencyService,
    private readonly rateLimiter: NonProductionRateLimiterPort,
  ) {}

  public async addMember(command: AddMemberCommand): Promise<MemberResult> {
    const rateLimit = await this.rateLimiter.consume({
      key: `seller-member-add:${command.actorIdentityId.value}`,
      limit: 30,
      windowSeconds: 3600,
    });
    if (!rateLimit.allowed) {
      throw new SellerApplicationError('SELLER_PRECONDITION_FAILED');
    }
    const profile = await this.requireOwnerProfile(command.sellerProfileId, command.actorIdentityId);
    if (profile.properties.aggregateVersion.value !== command.expectedVersion) {
      throw new SellerApplicationError('SELLER_STATE_CONFLICT');
    }
    const associations = await this.repository.findAssociations(command.sellerProfileId);
    const existing = this.associations.findActiveAssociation(
      associations,
      command.memberIdentityId.value,
    );
    if (existing !== null) {
      // The OWNER itself is already associated; adding an already-active
      // member is a duplicate (D-02 — never a silent second association).
      throw new SellerApplicationError('SELLER_DUPLICATE_DETECTED');
    }

    return this.idempotency.execute<MemberResult>({
      scope: `seller:${command.sellerProfileId.value}`,
      operationType: 'seller.member.add',
      idempotencyKey:
        command.idempotencyKey ??
        `member-add:${command.memberIdentityId.value}:${String(command.expectedVersion)}`,
      request: command,
      execute: async () => {
        const now = this.clock.now();
        const association = new SellerIdentityAssociation({
          associationId: this.identifiers.next(),
          sellerProfileId: command.sellerProfileId,
          identityId: command.memberIdentityId,
          associationRole: 'MEMBER',
          isPrimary: false,
          state: 'ACTIVE',
          aggregateVersion: new AggregateVersion(1),
          createdAt: now,
          updatedAt: now,
        });
        const updated = this.bumpedProfile(profile, now);
        await this.repository.save(
          {
            sellerProfile: updated,
            associationsToAppend: [association],
            verificationsToAppend: [],
            evidenceToAppend: [],
            transitionsToAppend: [],
            warehousesToAppend: [],
            agreementsToAppend: [],
            auditRecordsToAppend: [
              new SellerBusinessAuditRecord({
                auditEventId: this.identifiers.next(),
                sellerProfileId: command.sellerProfileId,
                eventType: 'SELLER_MEMBER_ADDED',
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
          sellerProfileId: command.sellerProfileId.value,
          memberIdentityId: command.memberIdentityId.value,
          associationRole: 'MEMBER',
          associationState: 'ACTIVE',
          sellerVersion: updated.properties.aggregateVersion.value,
        };
      },
    });
  }

  public async removeMember(command: RemoveMemberCommand): Promise<MemberResult> {
    const rateLimit = await this.rateLimiter.consume({
      key: `seller-member-remove:${command.actorIdentityId.value}`,
      limit: 30,
      windowSeconds: 3600,
    });
    if (!rateLimit.allowed) {
      throw new SellerApplicationError('SELLER_PRECONDITION_FAILED');
    }
    const profile = await this.requireOwnerProfile(command.sellerProfileId, command.actorIdentityId);
    if (profile.properties.aggregateVersion.value !== command.expectedVersion) {
      throw new SellerApplicationError('SELLER_STATE_CONFLICT');
    }
    const associations = await this.repository.findAssociations(command.sellerProfileId);
    const target = this.associations.findActiveAssociation(
      associations,
      command.memberIdentityId.value,
    );
    if (target === null) {
      throw new SellerApplicationError('SELLER_NOT_FOUND');
    }
    if (target.properties.associationRole === 'OWNER') {
      // The OWNER association can never be removed through member management
      // (exactly one OWNER per seller, D-01 / SellerAssociationPolicy).
      throw new SellerApplicationError('SELLER_STATE_CONFLICT');
    }

    const now = this.clock.now();
    const removed = new SellerIdentityAssociation({
      ...target.properties,
      state: 'REMOVED',
      removedAt: now,
      updatedAt: now,
      aggregateVersion: new AggregateVersion(target.properties.aggregateVersion.value + 1),
    });
    const updated = this.bumpedProfile(profile, now);
    await this.repository.save(
      {
        sellerProfile: updated,
        associationsToAppend: [removed],
        verificationsToAppend: [],
        evidenceToAppend: [],
        transitionsToAppend: [],
        warehousesToAppend: [],
        agreementsToAppend: [],
        auditRecordsToAppend: [
          new SellerBusinessAuditRecord({
            auditEventId: this.identifiers.next(),
            sellerProfileId: command.sellerProfileId,
            eventType: 'SELLER_MEMBER_REMOVED',
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
      sellerProfileId: command.sellerProfileId.value,
      memberIdentityId: command.memberIdentityId.value,
      associationRole: 'MEMBER',
      associationState: 'REMOVED',
      sellerVersion: updated.properties.aggregateVersion.value,
    };
  }

  private async requireOwnerProfile(
    sellerProfileId: UuidV7,
    actorIdentityId: UuidV7,
  ): Promise<SellerProfile> {
    const profile = await this.repository.findById(sellerProfileId);
    if (profile === null) throw new SellerApplicationError('SELLER_NOT_FOUND');
    const associations = await this.repository.findAssociations(sellerProfileId);
    this.associations.assertValidAssociations(associations);
    const association = this.associations.findActiveAssociation(
      associations,
      actorIdentityId.value,
    );
    if (association?.properties.associationRole !== 'OWNER') {
      throw new SellerApplicationError('SELLER_OWNERSHIP_DENIED');
    }
    return profile;
  }

  private bumpedProfile(profile: SellerProfile, now: Date): SellerProfile {
    return new SellerProfile({
      ...profile.properties,
      updatedAt: now,
      aggregateVersion: new AggregateVersion(profile.properties.aggregateVersion.value + 1),
    });
  }
}
