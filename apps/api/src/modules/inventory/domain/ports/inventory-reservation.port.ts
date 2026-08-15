import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M05-SPEC-001 §7/§11.1 (decision D-06). Fail-closed domain-level
 * reservation port for future cart/orders modules (07/08) to wire through
 * approved contracts. No expiry timers, allocation policies, or checkout
 * logic exist in Phase 1 (deferred to 07/08/10 specs); no reservation
 * record is persisted in Phase 1 (D-06 — port only, domain-level).
 *
 * Fail closed: any unknown/missing pool state, insufficient quantity, or
 * internal error denies. Idempotency is handled by the application layer
 * via `ApiIdempotencyRecord` (A-11) — not by this port.
 */
export type InventoryReservationResult =
  | {
      readonly outcome: 'RESERVED';
      readonly skuId: UuidV7;
      readonly quantity: number;
      readonly availableQuantity: number;
    }
  | { readonly outcome: 'DENIED'; readonly skuId: UuidV7; readonly reason: string }
  | { readonly outcome: 'FAILED'; readonly skuId: UuidV7; readonly reason: string };

export interface InventoryReservationRequest {
  readonly skuId: UuidV7;
  readonly quantity: number;
  readonly correlationId?: string;
}

export interface InventoryReservationPort {
  reserve(request: InventoryReservationRequest): Promise<InventoryReservationResult>;
  release(request: InventoryReservationRequest): Promise<InventoryReservationResult>;
}
