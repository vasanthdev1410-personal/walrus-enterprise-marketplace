import { Injectable, Inject } from '@nestjs/common';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { OrderWritePort } from '../../application/ports/order-write.port';
import type { OrderApplicationService } from '../../../order/application/services/order-application.service';
import type { OrderState } from '../../../order/domain/value-objects/order-state';
import { ORDER_APPLICATION_SERVICE } from '../../../order/order.tokens';

/**
 * WEMP-M09-PLAN-001 M09-M3 (decision D-05). Cross-module adapter that
 * transitions M08 Orders via the D-05 payment handoff boundary. This
 * adapter implements the OrderWritePort and wraps the M08
 * OrderApplicationService.
 *
 * Transitions are performed with SYSTEM actor (D-05):
 * - PENDING → CONFIRMED (payment initiation)
 * - CONFIRMED → PAID (payment capture)
 *
 * Fail closed: any rejection from M08 propagates as-is.
 */
@Injectable()
export class Module08OrderWriteAdapter implements OrderWritePort {
  public constructor(
    @Inject(ORDER_APPLICATION_SERVICE)
    private readonly orderApplicationService: OrderApplicationService,
  ) {}

  public async transitionOrder(params: {
    readonly orderId: UuidV7;
    readonly toState: string;
    readonly reasonReference: string;
    readonly actorIdentityId: UuidV7;
    readonly correlationId?: CorrelationIdentifier;
  }): Promise<void> {
    await this.orderApplicationService.transitionOrder({
      orderId: params.orderId,
      toState: params.toState as OrderState,
      actorIdentityId: params.actorIdentityId,
      actorKind: 'SYSTEM',
      reasonReference: params.reasonReference,
      ...(params.correlationId !== undefined ? { correlationId: params.correlationId } : {}),
    });
  }
}
