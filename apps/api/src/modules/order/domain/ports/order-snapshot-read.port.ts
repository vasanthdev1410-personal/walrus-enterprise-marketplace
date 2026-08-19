import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M08-SPEC-001 (decision D-03). Read-only port for consuming the
 * immutable CartSnapshot at order creation time. M08 never reads M07
 * live cart data — it consumes only the snapshot produced by M07's
 * checkoutHandoff. Port-only in M08-M1; the adapter is implemented
 * in M08-M3.
 */
export interface CartSnapshotData {
  readonly snapshotId: UuidV7;
  readonly cartId: UuidV7;
  readonly customerProfileId: UuidV7;
  readonly items: readonly CartSnapshotItemData[];
  readonly totalLines: number;
  readonly totalItems: number;
  readonly subtotalAmountCents: number;
  readonly subtotalCurrency: string;
  readonly createdAt: Date;
  readonly correlationId?: UuidV7;
}

export interface CartSnapshotItemData {
  readonly cartLineId: UuidV7;
  readonly skuId: UuidV7;
  readonly productId: UuidV7;
  readonly skuCode: string;
  readonly quantity: number;
  readonly unitPriceAmount: number;
  readonly unitPriceCurrency: string;
  readonly snapshotTaxIncluded: boolean;
  readonly productUnavailable: boolean;
}

export interface OrderSnapshotReadPort {
  /** Read a CartSnapshot by its snapshotId, or null if not found. */
  readCartSnapshot(snapshotId: UuidV7): Promise<CartSnapshotData | null>;
}
