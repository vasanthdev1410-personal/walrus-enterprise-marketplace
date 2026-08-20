import { Injectable } from '@nestjs/common';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { InventoryReservationPort } from '../../../inventory/domain/ports/inventory-reservation.port';

/**
 * WEMP-M08-SPEC-001 (decision D-04). Adapts the Module 05
 * InventoryReservationPort for Module 08 order-level inventory confirmation.
 * At order creation time, M08 confirms inventory reservations with M05.
 * M07 already holds soft reservations (15-minute TTL). M08 converts these
 * to order-level allocations.
 *
 * Fail closed: any M05 denial or failure propagates as DENIED/FAILED;
 * the application service treats DENIED/FAILED as ORDER_INVENTORY_INSUFFICIENT.
 */
export interface OrderInventoryConfirmationResult {
  readonly outcome: 'CONFIRMED' | 'DENIED' | 'FAILED';
  readonly skuId: UuidV7;
  readonly reason?: string;
}

export interface OrderInventoryConfirmationRequest {
  readonly skuId: UuidV7;
  readonly quantity: number;
  readonly correlationId?: string;
}

@Injectable()
export class OrderInventoryConfirmationAdapter {
  public constructor(private readonly inventoryReservation: InventoryReservationPort) {}

  public async confirm(
    request: OrderInventoryConfirmationRequest,
  ): Promise<OrderInventoryConfirmationResult> {
    const result = await this.inventoryReservation.reserve({
      skuId: request.skuId,
      quantity: request.quantity,
      ...(request.correlationId !== undefined ? { correlationId: request.correlationId } : {}),
    });

    switch (result.outcome) {
      case 'RESERVED':
        return { outcome: 'CONFIRMED', skuId: result.skuId };
      case 'DENIED':
        return { outcome: 'DENIED', skuId: result.skuId, reason: result.reason };
      case 'FAILED':
        return { outcome: 'FAILED', skuId: result.skuId, reason: result.reason };
    }
  }

  public async release(request: OrderInventoryConfirmationRequest): Promise<void> {
    await this.inventoryReservation.release({
      skuId: request.skuId,
      quantity: request.quantity,
      ...(request.correlationId !== undefined ? { correlationId: request.correlationId } : {}),
    });
  }
}
