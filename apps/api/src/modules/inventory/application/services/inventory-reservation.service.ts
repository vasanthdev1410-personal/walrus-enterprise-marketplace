import type {
  ClockPort,
  UuidV7GenerationPort,
} from '../../../identity-authentication/application/ports/application-runtime.port';
import type { ApiIdempotencyService } from '../../../identity-authentication/application/services/api-idempotency.service';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { InventoryDomainError } from '../../domain/errors/inventory-domain.error';
import type { InventoryStockPolicy } from '../../domain/policy/inventory-stock-policy';
import type { InventoryStockPoolRepository } from '../../domain/ports/inventory-repository.port';
import type {
  InventoryReservationPort,
  InventoryReservationRequest,
  InventoryReservationResult,
} from '../../domain/ports/inventory-reservation.port';
import { InventoryDelta } from '../../domain/value-objects/inventory-delta';

/**
 * WEMP-M05-SPEC-001 §7/§11.1 (decision D-06). Application-level
 * implementation of the fail-closed `InventoryReservationPort` for future
 * cart/orders modules (07/08) to wire through approved contracts. No
 * expiry timers, allocation policies, or checkout logic exist in Phase 1
 * (deferred to 07/08/10 specs); no reservation record is persisted (D-06 —
 * domain-level, port-only). No HTTP surface exists for reserve/release
 * (D-11: no rate class).
 *
 * Each operation runs through the repository `mutate` path: single
 * transaction, PostgreSQL row lock (D-07), version-checked policy apply
 * (reserve ≤ available; release ≤ reserved, never below zero — D-02/D-06),
 * commit; any failure rolls back and resolves to DENIED/FAILED
 * non-disclosingly. Idempotency (A-11) is keyed on the correlation ID when
 * the caller supplies one (future contract wiring supplies keys per its
 * approved contract).
 */
export class InventoryReservationService implements InventoryReservationPort {
  public constructor(
    private readonly repository: InventoryStockPoolRepository,
    private readonly policy: InventoryStockPolicy,
    private readonly clock: ClockPort,
    private readonly identifiers: UuidV7GenerationPort,
    private readonly idempotency: ApiIdempotencyService,
  ) {}

  public reserve(request: InventoryReservationRequest): Promise<InventoryReservationResult> {
    return this.idempotent('inventory.reserve', request, () => this.mutate(request, 'RESERVE'));
  }

  public release(request: InventoryReservationRequest): Promise<InventoryReservationResult> {
    return this.idempotent('inventory.release', request, () => this.mutate(request, 'RELEASE'));
  }

  private async idempotent(
    operationType: string,
    request: InventoryReservationRequest,
    execute: () => Promise<InventoryReservationResult>,
  ): Promise<InventoryReservationResult> {
    const key = request.correlationId;
    if (key === undefined) {
      // No correlation ID — execute directly. Future 07/08 contract wiring
      // supplies idempotency keys per its approved contract (A-11).
      return execute();
    }
    return this.idempotency.execute<InventoryReservationResult>({
      scope: `inventory:${request.skuId.value}`,
      operationType,
      idempotencyKey: `reservation:${key}`,
      request,
      execute,
    });
  }

  private async mutate(
    request: InventoryReservationRequest,
    operation: 'RESERVE' | 'RELEASE',
  ): Promise<InventoryReservationResult> {
    let quantity: InventoryDelta;
    try {
      quantity = new InventoryDelta(request.quantity);
    } catch {
      return denied(request.skuId, 'INVALID_QUANTITY');
    }
    let outcome: InventoryReservationResult | undefined;
    try {
      await this.repository.mutate(request.skuId, (pool) => {
        if (pool === null) {
          throw new InventoryDomainError('INVENTORY_RESERVE_EXCEEDS_AVAILABLE');
        }
        const now = this.clock.now();
        // reserve/release append no ledger or audit record (D-06 — no
        // reservation record persisted in Phase 1); the correlation ID is
        // used only as the idempotency key at the application boundary.
        const updated =
          operation === 'RESERVE'
            ? this.policy.reserve({
                pool,
                quantity,
                expectedVersion: pool.properties.aggregateVersion,
                occurredAt: now,
              })
            : this.policy.release({
                pool,
                quantity,
                expectedVersion: pool.properties.aggregateVersion,
                occurredAt: now,
              });
        outcome = {
          outcome: 'RESERVED',
          skuId: request.skuId,
          quantity: request.quantity,
          availableQuantity: updated.available.value,
        };
        return {
          pool: updated,
          movementsToAppend: [],
          auditRecordsToAppend: [],
        };
      });
    } catch (error) {
      // Domain-level denials (insufficient quantity, stale state, missing
      // pool) resolve to DENIED non-disclosingly; anything else is FAILED.
      if (error instanceof InventoryDomainError) {
        return denied(request.skuId, error.code);
      }
      return { outcome: 'FAILED', skuId: request.skuId, reason: 'internal' };
    }
    return outcome ?? { outcome: 'FAILED', skuId: request.skuId, reason: 'internal' };
  }
}

function denied(skuId: UuidV7, reason: string): InventoryReservationResult {
  return { outcome: 'DENIED', skuId, reason };
}
