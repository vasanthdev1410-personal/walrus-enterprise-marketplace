import type { NonProductionRateLimiterPort } from '../../../identity-authentication/application/ports/non-production-rate-limiter.port';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { InventoryStockPolicy } from '../../domain/policy/inventory-stock-policy';
import type {
  InventoryEvidenceReadRepository,
  InventoryStockPoolRepository,
} from '../../domain/ports/inventory-repository.port';
import type { Module02InventoryAuthorizationContractPort } from '../../domain/ports/module-02-authorization.port';
import type { Module04ProductCatalogReadPort } from '../../domain/ports/module-04-product-catalog.port';
import type { InventoryAvailabilityOutcome } from '../../domain/value-objects/inventory-availability-outcome';
import { failedOutcome } from '../../domain/value-objects/inventory-availability-outcome';
import type { DerivedStockLabel } from '../../domain/value-objects/inventory-stock-label';
import type { InventoryThresholdConfigurationPort } from '../ports/inventory-threshold-configuration.port';
import type { InventoryAdminAuthorizationPort } from '../ports/inventory-admin-authorization.port';
import { InventoryApplicationError } from '../errors/inventory-application.error';
import type { InventoryQuantity } from '../../domain/value-objects/inventory-quantity';

/**
 * WEMP-M05-PLAN-001 M05-M3 (WEMP-M05-SPEC-001 §5/§11/§15/§22, decisions
 * D-03, D-10, D-14). Read-only inventory queries for the application
 * layer (controllers are M05-M5):
 *
 * - `getAvailability`: the D-10 availability derivation Module 05 serves
 *   through the Module 04 ↔ Module 05 contract port — AVAILABLE when the
 *   SKU is PUBLISHED per the Module 04 fact and `available > 0`,
 *   UNAVAILABLE on unknown/non-PUBLISHED SKU or `available ≤ 0`, FAILED on
 *   internal error (never fabricated).
 * - Seller reads: non-enumerating own-seller pool list/detail/movements
 *   with derived low/out-of-stock labels (D-03/D-14), resolving the
 *   caller's ACTIVE association through the Module 02 ownership contract
 *   (A-02 — never a client scope claim); fail closed without it.
 * - Admin reads: non-enumerating admin list/detail/audit gated on the
 *   approved `inventory.audit.view` grant (D-05, fail closed).
 *
 * Labels are derived only when valid D-14 threshold configuration exists;
 * missing/invalid configuration disables label derivation (fail closed,
 * D-14) rather than fabricating a label. Rate limits follow the recorded
 * D-11 policy (seller reads 60/hour; admin corrections/audit 50/hour).
 */
export class InventoryReadApplicationService {
  public constructor(
    private readonly repository: InventoryStockPoolRepository,
    private readonly evidence: InventoryEvidenceReadRepository,
    private readonly module02: Module02InventoryAuthorizationContractPort,
    private readonly module04: Module04ProductCatalogReadPort,
    private readonly adminAuthorization: InventoryAdminAuthorizationPort,
    private readonly thresholdConfiguration: InventoryThresholdConfigurationPort,
    private readonly policy: InventoryStockPolicy,
    private readonly rateLimiter: NonProductionRateLimiterPort,
  ) {}

  /** WEMP-M05-SPEC-001 §11 (D-10): derived availability for the contract boundary. */
  public async getAvailability(skuId: UuidV7): Promise<InventoryAvailabilityOutcome> {
    try {
      const fact = await this.module04.getConsumableSkuFact(skuId);
      const pool = await this.repository.findBySkuId(skuId);
      // D-15: a CLOSED SKU resolves to UNAVAILABLE (pool retained, read-only).
      const consumable = fact !== null && fact.state === 'ACTIVE';
      return this.policy.deriveAvailability(pool, consumable);
    } catch {
      // Fail closed (D-10): an internal error never fabricates availability.
      return failedOutcome('internal');
    }
  }

  /** WEMP-M05-SPEC-001 §15. Seller own-inventory list with derived labels. */
  public async listOwnInventory(
    sellerProfileId: UuidV7,
    callerIdentityId: UuidV7,
  ): Promise<readonly InventoryListEntry[]> {
    await this.requireSellerRead(callerIdentityId);
    await this.requireAssociated(sellerProfileId, callerIdentityId);
    const pools = await this.repository.findBySeller(sellerProfileId);
    const config = await this.thresholdConfiguration.findThresholdConfig();
    return pools.map((pool) => this.toListEntry(pool, config));
  }

  /** WEMP-M05-SPEC-001 §15. Seller own-SKU detail (non-enumerating). */
  public async getOwnSkuDetail(
    skuId: UuidV7,
    sellerProfileId: UuidV7,
    callerIdentityId: UuidV7,
  ): Promise<InventoryListEntry> {
    await this.requireSellerRead(callerIdentityId);
    await this.requireAssociated(sellerProfileId, callerIdentityId);
    const pool = await this.repository.findBySkuId(skuId);
    if (pool?.properties.sellerProfileId.value !== sellerProfileId.value) {
      // Non-enumerating: another seller's (or missing) pool is
      // indistinguishable from an unknown pool.
      throw new InventoryApplicationError('INVENTORY_NOT_FOUND');
    }
    const config = await this.thresholdConfiguration.findThresholdConfig();
    return this.toListEntry(pool, config);
  }

  /** WEMP-M05-SPEC-001 §15. Seller own movement ledger (non-disclosing). */
  public async getOwnMovementLedger(
    skuId: UuidV7,
    sellerProfileId: UuidV7,
    callerIdentityId: UuidV7,
  ): Promise<readonly InventoryMovementEntry[]> {
    await this.requireSellerRead(callerIdentityId);
    await this.requireAssociated(sellerProfileId, callerIdentityId);
    const pool = await this.repository.findBySkuId(skuId);
    if (pool?.properties.sellerProfileId.value !== sellerProfileId.value) {
      throw new InventoryApplicationError('INVENTORY_NOT_FOUND');
    }
    const records = await this.evidence.findMovements(pool.properties.stockPoolId);
    return records.map(toMovementEntry);
  }

  /** WEMP-M05-SPEC-001 §15. Admin non-enumerating stock list/filter. */
  public async listAdminInventory(adminIdentityId: UuidV7): Promise<readonly InventoryListEntry[]> {
    await this.requireAdminRead(adminIdentityId);
    const pools = await this.repository.findAll();
    const config = await this.thresholdConfiguration.findThresholdConfig();
    return pools.map((pool) => this.toListEntry(pool, config));
  }

  /** WEMP-M05-SPEC-001 §15. Admin stock detail + audit records. */
  public async getAdminSkuDetail(
    adminIdentityId: UuidV7,
    skuId: UuidV7,
  ): Promise<AdminInventoryDetailResult> {
    await this.requireAdminRead(adminIdentityId);
    const pool = await this.repository.findBySkuId(skuId);
    if (pool === null) throw new InventoryApplicationError('INVENTORY_NOT_FOUND');
    const [audit, movements] = await Promise.all([
      this.evidence.findAuditRecords(pool.properties.stockPoolId),
      this.evidence.findMovements(pool.properties.stockPoolId),
    ]);
    const config = await this.thresholdConfiguration.findThresholdConfig();
    return {
      skuId: pool.properties.skuId.value,
      sellerProfileId: pool.properties.sellerProfileId.value,
      onHand: pool.properties.onHand.value,
      reserved: pool.properties.reserved.value,
      available: pool.available.value,
      version: pool.properties.aggregateVersion.value,
      ...this.labelSpread(pool.available, config),
      audit: audit.map((record) => ({
        eventType: record.properties.eventType,
        actorIdentityId: record.properties.actorIdentityId.value,
        occurredAt: record.properties.occurredAt.toISOString(),
      })),
      movements: movements.map(toMovementEntry),
    };
  }

  /** WEMP-M05-SPEC-001 §15. Admin movement ledger. */
  public async getAdminMovementLedger(
    adminIdentityId: UuidV7,
    skuId: UuidV7,
  ): Promise<readonly InventoryMovementEntry[]> {
    await this.requireAdminRead(adminIdentityId);
    const pool = await this.repository.findBySkuId(skuId);
    if (pool === null) throw new InventoryApplicationError('INVENTORY_NOT_FOUND');
    const records = await this.evidence.findMovements(pool.properties.stockPoolId);
    return records.map(toMovementEntry);
  }

  private toListEntry(
    pool: { available: InventoryQuantity } & {
      properties: {
        skuId: { value: string };
        onHand: { value: number };
        reserved: { value: number };
        aggregateVersion: { value: number };
      };
    },
    config: Parameters<InventoryStockPolicy['deriveStockLabel']>[1],
  ): InventoryListEntry {
    return {
      skuId: pool.properties.skuId.value,
      onHand: pool.properties.onHand.value,
      reserved: pool.properties.reserved.value,
      available: pool.available.value,
      version: pool.properties.aggregateVersion.value,
      ...this.labelSpread(pool.available, config),
    };
  }

  /** D-14 (fail closed): a label is only present when valid thresholds exist. */
  private labelSpread(
    available: InventoryQuantity,
    config: Parameters<InventoryStockPolicy['deriveStockLabel']>[1],
  ): { label: NonNullable<DerivedStockLabel> } | Record<string, never> {
    const label = this.policy.deriveStockLabel(available, config);
    return label === undefined ? {} : { label };
  }

  private async requireAssociated(
    sellerProfileId: UuidV7,
    callerIdentityId: UuidV7,
  ): Promise<void> {
    const association = await this.module02.resolveActiveAssociation(
      callerIdentityId,
      sellerProfileId,
    );
    if (association?.associationState !== 'ACTIVE') {
      throw new InventoryApplicationError('INVENTORY_OWNERSHIP_DENIED');
    }
  }

  private async requireAdminGrant(adminIdentityId: UuidV7): Promise<void> {
    const granted = await this.adminAuthorization.isGranted(
      adminIdentityId,
      'inventory.audit.view',
    );
    if (!granted) {
      throw new InventoryApplicationError('INVENTORY_ADMIN_AUTHORIZATION_DENIED');
    }
  }

  /** D-11 (recorded 2026-08-15): seller inventory reads 60/hour. */
  private async requireSellerRead(identityId: UuidV7): Promise<void> {
    const rateLimit = await this.rateLimiter.consume({
      key: `inventory-read:${identityId.value}`,
      limit: 60,
      windowSeconds: 3600,
    });
    if (!rateLimit.allowed) {
      throw new InventoryApplicationError('INVENTORY_RATE_LIMITED');
    }
  }

  /** D-11 (recorded 2026-08-15): admin corrections/audit 50/hour. */
  private async requireAdminRead(adminIdentityId: UuidV7): Promise<void> {
    const rateLimit = await this.rateLimiter.consume({
      key: `inventory-admin:${adminIdentityId.value}`,
      limit: 50,
      windowSeconds: 3600,
    });
    if (!rateLimit.allowed) {
      throw new InventoryApplicationError('INVENTORY_RATE_LIMITED');
    }
    await this.requireAdminGrant(adminIdentityId);
  }
}

export interface InventoryListEntry {
  readonly skuId: string;
  readonly onHand: number;
  readonly reserved: number;
  readonly available: number;
  readonly version: number;
  readonly label?: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
}

export interface InventoryMovementEntry {
  readonly movementId: string;
  readonly movementType: string;
  readonly delta: number;
  readonly resultingOnHand: number;
  readonly resultingReserved: number;
  readonly actorIdentityId: string;
  readonly reasonReference?: string;
  readonly occurredAt: string;
}

export interface AdminInventoryDetailResult extends InventoryListEntry {
  readonly sellerProfileId: string;
  readonly audit: readonly {
    readonly eventType: string;
    readonly actorIdentityId: string;
    readonly occurredAt: string;
  }[];
  readonly movements: readonly InventoryMovementEntry[];
}

function toMovementEntry(record: {
  properties: {
    movementId: { value: string };
    movementType: string;
    delta: number;
    resultingOnHand: number;
    resultingReserved: number;
    actorIdentityId: { value: string };
    reasonReference?: string;
    occurredAt: Date;
  };
}): InventoryMovementEntry {
  const properties = record.properties;
  return {
    movementId: properties.movementId.value,
    movementType: properties.movementType,
    delta: properties.delta,
    resultingOnHand: properties.resultingOnHand,
    resultingReserved: properties.resultingReserved,
    actorIdentityId: properties.actorIdentityId.value,
    ...(properties.reasonReference === undefined
      ? {}
      : { reasonReference: properties.reasonReference }),
    occurredAt: properties.occurredAt.toISOString(),
  };
}
