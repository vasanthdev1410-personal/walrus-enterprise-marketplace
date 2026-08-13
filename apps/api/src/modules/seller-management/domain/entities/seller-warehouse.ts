import type { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M03-SPEC-001 §3 / decision D-09. Warehouse/location record owned by
 * the seller profile. Warehouses are NOT required before APPROVED/ACTIVE in
 * Phase 1 — no activation gate is invented.
 */
export interface SellerWarehouseProperties {
  readonly warehouseId: UuidV7;
  readonly sellerProfileId: UuidV7;
  readonly name: string;
  readonly address: string;
  readonly state: 'ACTIVE' | 'CLOSED';
  readonly aggregateVersion: AggregateVersion;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly closedAt?: Date;
}

export class SellerWarehouse {
  public readonly properties: Readonly<SellerWarehouseProperties>;

  public constructor(properties: SellerWarehouseProperties) {
    if (properties.name.trim().length === 0) {
      throw new Error('Warehouse name is required');
    }
    if (properties.address.trim().length === 0) {
      throw new Error('Warehouse address is required');
    }
    if (properties.state === 'CLOSED' && properties.closedAt === undefined) {
      throw new Error('Closed warehouse requires closedAt');
    }
    if (properties.closedAt !== undefined && properties.state !== 'CLOSED') {
      throw new Error('closedAt requires the CLOSED warehouse state');
    }
    if (properties.updatedAt < properties.createdAt) {
      throw new Error('Warehouse updatedAt cannot precede createdAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
