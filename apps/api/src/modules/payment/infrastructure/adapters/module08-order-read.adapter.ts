import { Injectable, Inject } from '@nestjs/common';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { OrderPaymentFacts, OrderReadPort } from '../../application/ports/order-read.port';
import type { OrderRepository } from '../../../order/domain/ports/order-repository.port';
import { ORDER_REPOSITORY } from '../../../order/order.tokens';

/**
 * WEMP-M09-PLAN-001 M09-M3 (decision D-05). Cross-module adapter that
 * reads M08 Order facts for M09 payment processing. This adapter
 * implements the OrderReadPort and wraps the M08 OrderRepository.
 *
 * Only exposes minimal, non-mutating order facts needed by M09:
 * orderId, customerProfileId, state, subtotalAmountCents, subtotalCurrency.
 * Never exposes order lines, snapshots, or cart internals (A-05 isolation).
 */
@Injectable()
export class Module08OrderReadAdapter implements OrderReadPort {
  public constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: OrderRepository,
  ) {}

  public async readOrderFacts(orderId: UuidV7): Promise<OrderPaymentFacts | null> {
    const order = await this.orderRepository.findById(orderId);
    if (order === null) {
      return null;
    }
    const p = order.properties;
    return {
      orderId: p.orderId,
      customerProfileId: p.customerProfileId,
      state: p.state,
      subtotalAmountCents: p.subtotalAmountCents,
      subtotalCurrency: p.subtotalCurrency,
      aggregateVersion: p.aggregateVersion.value,
    };
  }
}
