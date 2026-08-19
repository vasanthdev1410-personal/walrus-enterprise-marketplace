import { Injectable } from '@nestjs/common';
import type { InventoryReservationPort } from '../../../inventory/domain/ports/inventory-reservation.port';
import type {
  CartReservationPort,
  CartReservationRequest,
  CartReservationResult,
} from '../../domain/ports/cart-reservation.port';

/**
 * WEMP-M07-SPEC-001 (decision D-06). Adapts the Module 05
 * InventoryReservationPort for Module 07 cart-level consumption. The
 * adapter translates between the cart reservation port shape (which carries
 * the same semantics as M05) and the M05 port.
 *
 * Reserves at add-to-cart (quantity change = adjust delta reservation).
 * Releases on cart clear, line remove, cart expiry, or checkout handoff.
 * Uses M05's 15-minute TTL (D-06).
 *
 * Fail closed: any M05 denial or failure propagates as DENIED/FAILED
 * through the cart reservation port.
 */
@Injectable()
export class CartInventoryReservationAdapter implements CartReservationPort {
  public constructor(private readonly inventoryReservation: InventoryReservationPort) {}

  public async reserve(request: CartReservationRequest): Promise<CartReservationResult> {
    const result = await this.inventoryReservation.reserve({
      skuId: request.skuId,
      quantity: request.quantity,
      ...(request.correlationId !== undefined ? { correlationId: request.correlationId } : {}),
    });
    return translateResult(result);
  }

  public async release(request: CartReservationRequest): Promise<CartReservationResult> {
    const result = await this.inventoryReservation.release({
      skuId: request.skuId,
      quantity: request.quantity,
      ...(request.correlationId !== undefined ? { correlationId: request.correlationId } : {}),
    });
    return translateResult(result);
  }
}

function translateResult(
  result: Awaited<ReturnType<InventoryReservationPort['reserve']>>,
): CartReservationResult {
  switch (result.outcome) {
    case 'RESERVED':
      return {
        outcome: 'RESERVED',
        skuId: result.skuId,
        quantity: result.quantity,
        availableQuantity: result.availableQuantity,
      };
    case 'DENIED':
      return { outcome: 'DENIED', skuId: result.skuId, reason: result.reason };
    case 'FAILED':
      return { outcome: 'FAILED', skuId: result.skuId, reason: result.reason };
  }
}
