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
import { SellerProfile } from '../../domain/entities/seller-profile';
import { SellerWarehouse } from '../../domain/entities/seller-warehouse';
import type { SellerAssociationPolicy } from '../../domain/policy/seller-association.policy';
import type { SellerProfileRepository } from '../../domain/ports/seller-repository.port';
import { SellerApplicationError } from '../errors/seller-application.error';

export interface CreateWarehouseCommand {
  readonly sellerProfileId: UuidV7;
  readonly actorIdentityId: UuidV7;
  readonly expectedVersion: number;
  readonly name: string;
  readonly address: string;
  readonly idempotencyKey?: string;
  readonly correlationId?: CorrelationIdentifier;
}

export interface CloseWarehouseCommand {
  readonly sellerProfileId: UuidV7;
  readonly warehouseId: UuidV7;
  readonly actorIdentityId: UuidV7;
  readonly expectedVersion: number;
  readonly correlationId?: CorrelationIdentifier;
}

export interface WarehouseResult {
  readonly warehouseId: string;
  readonly state: 'ACTIVE' | 'CLOSED';
  readonly sellerVersion: number;
}

/**
 * WEMP-M03-PLAN-001 M03-M5 / WEMP-M03-SPEC-001 §13 (`seller.warehouse.manage`).
 * Warehouse/location records (decision D-09: minimal record model, no
 * activation gate). Creation and closure are owner actions, version-guarded,
 * idempotent, rate-limited and audited — mirroring the M03-M3 aggregate
 * mutation pattern. Ownership is always resolved from the authoritative
 * SellerIdentityAssociation store; a forged seller identifier fails closed.
 */
export class SellerWarehouseApplicationService {
  public constructor(
    private readonly repository: SellerProfileRepository,
    private readonly associations: SellerAssociationPolicy,
    private readonly clock: ClockPort,
    private readonly identifiers: UuidV7GenerationPort,
    private readonly idempotency: ApiIdempotencyService,
    private readonly rateLimiter: NonProductionRateLimiterPort,
  ) {}

  public async createWarehouse(command: CreateWarehouseCommand): Promise<WarehouseResult> {
    const rateLimit = await this.rateLimiter.consume({
      key: `seller-warehouse-create:${command.actorIdentityId.value}`,
      limit: 30,
      windowSeconds: 3600,
    });
    if (!rateLimit.allowed) {
      throw new SellerApplicationError('SELLER_PRECONDITION_FAILED');
    }
    // Existence first: a forged/unknown seller identifier is indistinguishable
    // from a missing seller (non-enumerating), then ownership is validated.
    const profile = await this.repository.findById(command.sellerProfileId);
    if (profile === null) throw new SellerApplicationError('SELLER_NOT_FOUND');
    await this.assertOwnerActor(command.sellerProfileId, command.actorIdentityId);
    if (profile.properties.aggregateVersion.value !== command.expectedVersion) {
      throw new SellerApplicationError('SELLER_STATE_CONFLICT');
    }

    return this.idempotency.execute<WarehouseResult>({
      scope: `seller:${command.sellerProfileId.value}`,
      operationType: 'seller.warehouse.create',
      idempotencyKey:
        command.idempotencyKey ?? `warehouse-create:${String(command.expectedVersion)}`,
      request: command,
      execute: async () => {
        const now = this.clock.now();
        const warehouseId = this.identifiers.next();
        const warehouse = new SellerWarehouse({
          warehouseId,
          sellerProfileId: command.sellerProfileId,
          name: command.name,
          address: command.address,
          state: 'ACTIVE',
          aggregateVersion: new AggregateVersion(1),
          createdAt: now,
          updatedAt: now,
        });
        const updated = new SellerProfile({
          ...profile.properties,
          updatedAt: now,
          aggregateVersion: new AggregateVersion(profile.properties.aggregateVersion.value + 1),
        });
        await this.repository.save(
          {
            sellerProfile: updated,
            associationsToAppend: [],
            verificationsToAppend: [],
            evidenceToAppend: [],
            transitionsToAppend: [],
            warehousesToAppend: [warehouse],
            agreementsToAppend: [],
            auditRecordsToAppend: [
              new SellerBusinessAuditRecord({
                auditEventId: this.identifiers.next(),
                sellerProfileId: command.sellerProfileId,
                eventType: 'SELLER_WAREHOUSE_CREATED',
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
          warehouseId: warehouseId.value,
          state: 'ACTIVE',
          sellerVersion: updated.properties.aggregateVersion.value,
        };
      },
    });
  }

  public async closeWarehouse(command: CloseWarehouseCommand): Promise<WarehouseResult> {
    const rateLimit = await this.rateLimiter.consume({
      key: `seller-warehouse-close:${command.actorIdentityId.value}`,
      limit: 30,
      windowSeconds: 3600,
    });
    if (!rateLimit.allowed) {
      throw new SellerApplicationError('SELLER_PRECONDITION_FAILED');
    }
    const profile = await this.repository.findById(command.sellerProfileId);
    if (profile === null) throw new SellerApplicationError('SELLER_NOT_FOUND');
    await this.assertOwnerActor(command.sellerProfileId, command.actorIdentityId);
    if (profile.properties.aggregateVersion.value !== command.expectedVersion) {
      throw new SellerApplicationError('SELLER_STATE_CONFLICT');
    }
    const warehouses = await this.repository.findWarehouses(command.sellerProfileId);
    const existing = warehouses.find(
      (warehouse) => warehouse.properties.warehouseId.value === command.warehouseId.value,
    );
    if (existing === undefined) {
      throw new SellerApplicationError('SELLER_NOT_FOUND');
    }
    if (existing.properties.state === 'CLOSED') {
      throw new SellerApplicationError('SELLER_STATE_CONFLICT');
    }

    const now = this.clock.now();
    const closed = new SellerWarehouse({
      ...existing.properties,
      state: 'CLOSED',
      closedAt: now,
      updatedAt: now,
      aggregateVersion: new AggregateVersion(existing.properties.aggregateVersion.value + 1),
    });
    const updated = new SellerProfile({
      ...profile.properties,
      updatedAt: now,
      aggregateVersion: new AggregateVersion(profile.properties.aggregateVersion.value + 1),
    });
    await this.repository.save(
      {
        sellerProfile: updated,
        associationsToAppend: [],
        verificationsToAppend: [],
        evidenceToAppend: [],
        transitionsToAppend: [],
        warehousesToAppend: [closed],
        agreementsToAppend: [],
        auditRecordsToAppend: [
          new SellerBusinessAuditRecord({
            auditEventId: this.identifiers.next(),
            sellerProfileId: command.sellerProfileId,
            eventType: 'SELLER_WAREHOUSE_CLOSED',
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
      warehouseId: command.warehouseId.value,
      state: 'CLOSED',
      sellerVersion: updated.properties.aggregateVersion.value,
    };
  }

  private async assertOwnerActor(sellerProfileId: UuidV7, actorIdentityId: UuidV7): Promise<void> {
    const associations = await this.repository.findAssociations(sellerProfileId);
    this.associations.assertValidAssociations(associations);
    const association = this.associations.findActiveAssociation(
      associations,
      actorIdentityId.value,
    );
    if (association?.properties.associationRole !== 'OWNER') {
      throw new SellerApplicationError('SELLER_OWNERSHIP_DENIED');
    }
  }
}
