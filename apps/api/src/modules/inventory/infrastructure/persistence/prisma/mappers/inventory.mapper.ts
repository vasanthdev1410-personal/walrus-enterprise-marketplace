import type {
  InventoryAuditRecord as InventoryAuditRecordRow,
  InventoryConfigRecord as InventoryConfigRecordRow,
  InventoryMovementRecord as InventoryMovementRecordRow,
  Prisma,
  StockPool as StockPoolRow,
} from '../../../../../../generated/prisma/client';
import { AggregateVersion } from '../../../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { CorrelationIdentifier } from '../../../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import { UuidV7 } from '../../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { compactProperties } from '../../../../../identity-authentication/infrastructure/persistence/prisma/mappers/compact-properties';
import { InventoryAuditRecord } from '../../../../domain/entities/inventory-audit-record';
import { InventoryMovementRecord } from '../../../../domain/entities/inventory-movement-record';
import { StockPool } from '../../../../domain/entities/stock-pool';
import { InventoryQuantity } from '../../../../domain/value-objects/inventory-quantity';

/**
 * WEMP-M05-PLAN-001 M05-M2 persistence mappers. The shared platform
 * primitives (UuidV7, AggregateVersion, CorrelationIdentifier) and the
 * generic compactProperties helper are reused from the identity-authentication
 * module; Module 05 never reads Module 01/02/03/04 storage (A-06).
 * Movement-type enum columns map directly because the domain union uses the
 * identical vocabulary. No monetary values are ever stored (A-17); only
 * integer quantities and logical UUIDv7 references.
 */
export const stockPoolMapper = {
  toDomain(record: StockPoolRow): StockPool {
    return new StockPool({
      stockPoolId: new UuidV7(record.stockPoolId),
      skuId: new UuidV7(record.skuId),
      sellerProfileId: new UuidV7(record.sellerProfileId),
      onHand: new InventoryQuantity(record.onHand),
      reserved: new InventoryQuantity(record.reserved),
      aggregateVersion: new AggregateVersion(record.aggregateVersion),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  },
  toPersistence(entity: StockPool): Prisma.StockPoolUncheckedCreateInput {
    const value = entity.properties;
    return {
      stockPoolId: value.stockPoolId.value,
      skuId: value.skuId.value,
      sellerProfileId: value.sellerProfileId.value,
      onHand: value.onHand.value,
      reserved: value.reserved.value,
      aggregateVersion: value.aggregateVersion.value,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    };
  },
};

export const inventoryMovementRecordMapper = {
  toDomain(record: InventoryMovementRecordRow): InventoryMovementRecord {
    return new InventoryMovementRecord(
      compactProperties({
        movementId: new UuidV7(record.movementId),
        stockPoolId: new UuidV7(record.stockPoolId),
        movementType: record.movementType,
        delta: record.delta,
        resultingOnHand: record.resultingOnHand,
        resultingReserved: record.resultingReserved,
        actorIdentityId: new UuidV7(record.actorIdentityId),
        reasonReference: record.reasonReference ?? undefined,
        correlationId:
          record.correlationId === null
            ? undefined
            : new CorrelationIdentifier(record.correlationId),
        causationId: record.causationId === null ? undefined : new UuidV7(record.causationId),
        aggregateVersion: new AggregateVersion(record.aggregateVersion),
        occurredAt: record.occurredAt,
        createdAt: record.createdAt,
      }),
    );
  },
  toPersistence(
    entity: InventoryMovementRecord,
  ): Prisma.InventoryMovementRecordUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      movementId: value.movementId.value,
      stockPoolId: value.stockPoolId.value,
      movementType: value.movementType,
      delta: value.delta,
      resultingOnHand: value.resultingOnHand,
      resultingReserved: value.resultingReserved,
      actorIdentityId: value.actorIdentityId.value,
      reasonReference: value.reasonReference,
      correlationId: value.correlationId?.value,
      causationId: value.causationId?.value,
      aggregateVersion: value.aggregateVersion.value,
      occurredAt: value.occurredAt,
      createdAt: value.createdAt,
    });
  },
};

export const inventoryAuditRecordMapper = {
  toDomain(record: InventoryAuditRecordRow): InventoryAuditRecord {
    return new InventoryAuditRecord(
      compactProperties({
        auditEventId: new UuidV7(record.auditEventId),
        stockPoolId: new UuidV7(record.stockPoolId),
        eventType: record.eventType,
        actorIdentityId: new UuidV7(record.actorIdentityId),
        occurredAt: record.occurredAt,
        createdAt: record.createdAt,
        correlationId:
          record.correlationId === null
            ? undefined
            : new CorrelationIdentifier(record.correlationId),
        evidenceDigest: record.evidenceDigest ?? undefined,
      }),
    );
  },
  toPersistence(entity: InventoryAuditRecord): Prisma.InventoryAuditRecordUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      auditEventId: value.auditEventId.value,
      stockPoolId: value.stockPoolId.value,
      eventType: value.eventType,
      actorIdentityId: value.actorIdentityId.value,
      occurredAt: value.occurredAt,
      createdAt: value.createdAt,
      correlationId: value.correlationId?.value,
      evidenceDigest: value.evidenceDigest,
    });
  },
};

/**
 * WEMP-M05-SPEC-001 §14 / decision D-14. InventoryConfigRecord — the
 * platform-defined, admin-managed configuration table (D-14). The D-14
 * threshold values remain PENDING (Gate #4); no config value is invented or
 * seeded here. The row type exists so the M05-M3/M05-M5 config surface can
 * read/update it; the mapper is symmetric to the other Module 05 mappers.
 */
export const inventoryConfigRecordMapper = {
  toDomain(record: InventoryConfigRecordRow): {
    configId: UuidV7;
    configKey: string;
    configValue: string;
    state: 'ACTIVE' | 'RETIRED';
    aggregateVersion: AggregateVersion;
    changedByIdentityId: UuidV7;
    createdAt: Date;
    updatedAt: Date;
  } {
    return {
      configId: new UuidV7(record.configId),
      configKey: record.configKey,
      configValue: record.configValue,
      state: record.state,
      aggregateVersion: new AggregateVersion(record.aggregateVersion),
      changedByIdentityId: new UuidV7(record.changedByIdentityId),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  },
  toPersistence(entity: {
    configId: UuidV7;
    configKey: string;
    configValue: string;
    state: 'ACTIVE' | 'RETIRED';
    aggregateVersion: AggregateVersion;
    changedByIdentityId: UuidV7;
    createdAt: Date;
    updatedAt: Date;
  }): Prisma.InventoryConfigRecordUncheckedCreateInput {
    return {
      configId: entity.configId.value,
      configKey: entity.configKey,
      configValue: entity.configValue,
      state: entity.state,
      aggregateVersion: entity.aggregateVersion.value,
      changedByIdentityId: entity.changedByIdentityId.value,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  },
};
