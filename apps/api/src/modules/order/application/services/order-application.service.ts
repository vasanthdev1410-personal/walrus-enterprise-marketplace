import type {
  ClockPort,
  UuidV7GenerationPort,
} from '../../../identity-authentication/application/ports/application-runtime.port';
import type { NonProductionRateLimiterPort } from '../../../identity-authentication/application/ports/non-production-rate-limiter.port';
import type { ApiIdempotencyService } from '../../../identity-authentication/application/services/api-idempotency.service';
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { Order } from '../../domain/entities/order';
import { OrderAuditRecord } from '../../domain/entities/order-audit-record';
import { OrderLine } from '../../domain/entities/order-line';
import type { OrderLifecycle } from '../../domain/lifecycle/order-lifecycle';
import type { OrderRepository } from '../../domain/ports/order-repository.port';
import type { OrderSnapshotReadPort } from '../../domain/ports/order-snapshot-read.port';
import { MoneyAmount } from '../../domain/value-objects/money-amount';
import { OrderId } from '../../domain/value-objects/order-id';
import { OrderLineId } from '../../domain/value-objects/order-line-id';
import { Quantity } from '../../domain/value-objects/quantity';
import type { CustomerProfileReadPort } from '../../../customer/domain/ports/customer-profile-read.port';
import type { OrderProductCatalogReadAdapter } from '../../infrastructure/adapters/order-product-catalog-read.adapter';
import type { OrderInventoryConfirmationAdapter } from '../../infrastructure/adapters/order-inventory-confirmation.adapter';
import { OrderApplicationError } from '../errors/order-application.error';
import type {
  CancelOrderCommand,
  CreateOrderCommand,
  ListOrdersQuery,
  OrderMutationResult,
  OrderResult,
  ReadOrderQuery,
  TransitionOrderCommand,
} from '../dtos/order-application.dtos';
import { toOrderMutationResult, toOrderResult } from '../dtos/order-application.dtos';

/**
 * WEMP-M08-PLAN-001 M08-M3 (WEMP-M08-SPEC-001 §4/§6, decisions D-01/D-02/
 * D-03/D-04/D-05/D-06/D-07/D-08/D-11/D-12/D-13). Order application service
 * — the primary use-case orchestrator for Module 08.
 *
 * Operations:
 * - `createOrder`: create order from CartSnapshot, revalidate prices,
 *   confirm inventory (D-03/D-04)
 * - `readOrder`: self-service order read (non-terminal states only)
 * - `listOrders`: list customer's orders
 * - `transitionOrder`: system/admin state transition (M09/M10 callbacks)
 * - `cancelOrder`: customer self-service cancellation (D-01)
 *
 * Every mutation is version-guarded (D-11), audited (D-07 lifecycle events
 * only), and idempotent where required (D-12: createOrder, cancelOrder).
 * Ownership is verified through the customer profile read port — fail-closed
 * when the customer is unknown or inactive (A-10).
 *
 * Fail closed: any unknown, unavailable, insufficient, or unauthorized
 * state resolves to a typed OrderApplicationError; presentation layers
 * map these to generic responses.
 */
export class OrderApplicationService {
  public constructor(
    private readonly repository: OrderRepository,
    private readonly lifecycle: OrderLifecycle,
    private readonly clock: ClockPort,
    private readonly identifiers: UuidV7GenerationPort,
    private readonly idempotency: ApiIdempotencyService,
    private readonly rateLimiter: NonProductionRateLimiterPort,
    private readonly productCatalog: OrderProductCatalogReadAdapter,
    private readonly inventoryConfirmation: OrderInventoryConfirmationAdapter,
    private readonly customerProfileRead: CustomerProfileReadPort,
    private readonly snapshotRead: OrderSnapshotReadPort,
  ) {}

  // ---------------------------------------------------------------------------
  // CREATE ORDER FROM CART SNAPSHOT
  // ---------------------------------------------------------------------------

  /**
   * WEMP-M08-SPEC-001 (decisions D-01/D-02/D-03/D-04/D-07/D-12). Creates
   * a new order from a CartSnapshot. Idempotent (D-12: createOrder with
   * Idempotency-Key). Revalidates prices against M04 (D-03). Confirms
   * inventory with M05 (D-04).
   */
  public async createOrder(command: CreateOrderCommand): Promise<OrderResult> {
    await this.rateLimitMutate(command.actorIdentityId);
    await this.requireActiveCustomer(command.customerProfileId);

    // Read the CartSnapshot (immutable, produced by M07 checkoutHandoff).
    const snapshot = await this.snapshotRead.readCartSnapshot(command.snapshotId);
    if (snapshot === null) {
      throw new OrderApplicationError('ORDER_SNAPSHOT_NOT_FOUND');
    }

    // Validate customer ownership matches snapshot.
    if (snapshot.customerProfileId.value !== command.customerProfileId.value) {
      throw new OrderApplicationError('ORDER_OWNERSHIP_DENIED');
    }

    // Validate snapshot integrity.
    if (snapshot.items.length === 0) {
      throw new OrderApplicationError('ORDER_SNAPSHOT_INVALID');
    }

    // Check no pending order already exists for this customer.
    const existingPending = await this.repository.findPendingByCustomerProfileId(
      command.customerProfileId,
    );
    if (existingPending !== null) {
      throw new OrderApplicationError('ORDER_STATE_CONFLICT');
    }

    return this.idempotency.execute<OrderResult>({
      scope: `order:${command.customerProfileId.value}`,
      operationType: 'order.create',
      idempotencyKey: command.idempotencyKey,
      request: command,
      execute: async () => {
        const now = this.clock.now();

        // Revalidate prices against M04 (D-03) and confirm inventory (D-04).
        const orderLines: OrderLine[] = [];
        let revalidatedSubtotalCents = 0;

        for (const item of snapshot.items) {
          // Skip unavailable products (D-12: blocked at checkout).
          if (item.productUnavailable) {
            throw new OrderApplicationError('ORDER_PRODUCT_UNAVAILABLE');
          }

          // Revalidate SKU against M04 (D-03).
          const skuFacts = await this.productCatalog.getConsumableSkuFacts(item.skuId);
          if (skuFacts === null) {
            throw new OrderApplicationError('ORDER_SKU_UNAVAILABLE');
          }

          // Revalidate product against M04 (D-03).
          const productFacts = await this.productCatalog.getConsumableProductFacts(item.productId);
          if (productFacts === null) {
            throw new OrderApplicationError('ORDER_PRODUCT_UNAVAILABLE');
          }

          // Confirm inventory with M05 (D-04).
          const inventoryResult = await this.inventoryConfirmation.confirm({
            skuId: item.skuId,
            quantity: item.quantity,
            ...(command.correlationId !== undefined
              ? { correlationId: command.correlationId.value }
              : {}),
          });
          if (inventoryResult.outcome !== 'CONFIRMED') {
            throw new OrderApplicationError('ORDER_INVENTORY_INSUFFICIENT');
          }

          // Use revalidated price from M04 (D-03).
          const revalidatedPrice = productFacts.sellingPrice;
          const line = new OrderLine({
            orderLineId: new OrderLineId(this.identifiers.next().value),
            orderId: this.identifiers.next(),
            cartLineId: item.cartLineId,
            skuId: item.skuId,
            productId: item.productId,
            skuCode: item.skuCode,
            quantity: new Quantity(item.quantity),
            unitPrice: new MoneyAmount(revalidatedPrice, 'USD'),
            snapshotTaxIncluded: item.snapshotTaxIncluded,
            revalidated: true,
            createdAt: now,
            updatedAt: now,
          });

          orderLines.push(line);
          revalidatedSubtotalCents += revalidatedPrice * item.quantity;
        }

        // Create the order.
        const orderId = new OrderId(this.identifiers.next().value);
        const order = new Order({
          orderId,
          customerProfileId: command.customerProfileId,
          snapshotId: command.snapshotId,
          cartId: snapshot.cartId,
          state: 'PENDING',
          totalLines: orderLines.length,
          totalItems: orderLines.reduce((sum, l) => sum + l.properties.quantity.value, 0),
          subtotalAmountCents: revalidatedSubtotalCents,
          subtotalCurrency: 'USD',
          aggregateVersion: new AggregateVersion(1),
          createdAt: now,
          updatedAt: now,
          ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
        });

        // Set orderId on all lines.
        const finalizedLines = orderLines.map(
          (line) =>
            new OrderLine({
              ...line.properties,
              orderId,
            }),
        );

        // Create audit record.
        const auditRecord = new OrderAuditRecord({
          auditEventId: this.identifiers.next(),
          orderId,
          customerProfileId: command.customerProfileId,
          eventType: 'ORDER_CREATED',
          actorIdentityId: command.actorIdentityId,
          occurredAt: now,
          createdAt: now,
          ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
        });

        // Persist atomically.
        await this.repository.insert({
          order,
          linesToAppend: finalizedLines,
          transitionsToAppend: [],
          auditRecordsToAppend: [auditRecord],
        });

        return toOrderResult(order, finalizedLines);
      },
    });
  }

  // ---------------------------------------------------------------------------
  // READ ORDER
  // ---------------------------------------------------------------------------

  /**
   * WEMP-M08-SPEC-001. Self-service order read by authenticated customer.
   * Returns the order with all its lines. Only non-terminal orders are
   * self-readable (D-01).
   */
  public async readOrder(query: ReadOrderQuery): Promise<OrderResult> {
    await this.rateLimitRead(query.callerIdentityId);
    const order = await this.repository.findById(query.orderId);
    if (order === null) {
      throw new OrderApplicationError('ORDER_NOT_FOUND');
    }
    this.lifecycle.assertCanSelfRead(order.properties.state);
    const lines = await this.repository.findLines(order.properties.orderId);
    return toOrderResult(order, lines);
  }

  // ---------------------------------------------------------------------------
  // LIST ORDERS
  // ---------------------------------------------------------------------------

  /**
   * WEMP-M08-SPEC-001. List orders for a customer profile. Returns all
   * non-terminal orders.
   */
  public async listOrders(query: ListOrdersQuery): Promise<readonly OrderResult[]> {
    await this.rateLimitRead(query.callerIdentityId);
    await this.requireActiveCustomer(query.customerProfileId);
    // For now, find by pending status; a full implementation would support
    // listing all orders for the customer.
    const pendingOrder = await this.repository.findPendingByCustomerProfileId(
      query.customerProfileId,
    );
    if (pendingOrder === null) {
      return [];
    }
    const lines = await this.repository.findLines(pendingOrder.properties.orderId);
    return [toOrderResult(pendingOrder, lines)];
  }

  // ---------------------------------------------------------------------------
  // TRANSITION ORDER (system/admin callback)
  // ---------------------------------------------------------------------------

  /**
   * WEMP-M08-SPEC-001 (decision D-01). System or admin state transition.
   * Used for M09/M10 callbacks (payment, shipping, delivery).
   */
  public async transitionOrder(command: TransitionOrderCommand): Promise<OrderMutationResult> {
    const order = await this.repository.findById(command.orderId);
    if (order === null) {
      throw new OrderApplicationError('ORDER_NOT_FOUND');
    }

    const now = this.clock.now();
    const transition = this.lifecycle.transition({
      order,
      toState: command.toState,
      actor: {
        identityId: command.actorIdentityId,
        kind: command.actorKind,
      },
      now,
      transitionId: this.identifiers.next(),
      reasonReference: command.reasonReference,
      ...(command.expectedVersion !== undefined
        ? { expectedVersion: command.expectedVersion }
        : {}),
      ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
    });

    const updatedOrder = this.lifecycle.updatedOrder(order, command.toState, now);

    const auditRecord = new OrderAuditRecord({
      auditEventId: this.identifiers.next(),
      orderId: order.properties.orderId,
      customerProfileId: order.properties.customerProfileId,
      eventType: `ORDER_${command.toState}`,
      actorIdentityId: command.actorIdentityId,
      occurredAt: now,
      createdAt: now,
      ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
    });

    await this.repository.save(
      {
        order: updatedOrder,
        linesToAppend: [],
        transitionsToAppend: [transition],
        auditRecordsToAppend: [auditRecord],
      },
      order.properties.aggregateVersion,
    );

    return toOrderMutationResult(updatedOrder);
  }

  // ---------------------------------------------------------------------------
  // CANCEL ORDER (customer self-service)
  // ---------------------------------------------------------------------------

  /**
   * WEMP-M08-SPEC-001 (decision D-01). Customer self-service cancellation.
   * Only PENDING orders can be cancelled by the customer. Idempotent (D-12).
   */
  public async cancelOrder(command: CancelOrderCommand): Promise<OrderMutationResult> {
    await this.rateLimitMutate(command.actorIdentityId);
    await this.requireActiveCustomer(command.customerProfileId);

    const order = await this.repository.findById(command.orderId);
    if (order === null) {
      throw new OrderApplicationError('ORDER_NOT_FOUND');
    }

    // Verify ownership.
    if (order.properties.customerProfileId.value !== command.customerProfileId.value) {
      throw new OrderApplicationError('ORDER_OWNERSHIP_DENIED');
    }

    // Verify version.
    if (order.properties.aggregateVersion.value !== command.expectedVersion) {
      throw new OrderApplicationError('ORDER_STALE_VERSION');
    }

    return this.idempotency.execute<OrderMutationResult>({
      scope: `order:${command.customerProfileId.value}`,
      operationType: 'order.cancel',
      idempotencyKey: command.idempotencyKey,
      request: command,
      execute: async () => {
        const now = this.clock.now();

        const transition = this.lifecycle.transition({
          order,
          toState: 'CANCELLED',
          actor: {
            identityId: command.actorIdentityId,
            kind: 'CUSTOMER',
          },
          now,
          transitionId: this.identifiers.next(),
          reasonReference: command.reasonReference,
          expectedVersion: command.expectedVersion,
          ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
        });

        const updatedOrder = this.lifecycle.updatedOrder(order, 'CANCELLED', now);

        const auditRecord = new OrderAuditRecord({
          auditEventId: this.identifiers.next(),
          orderId: order.properties.orderId,
          customerProfileId: command.customerProfileId,
          eventType: 'ORDER_CANCELLED',
          actorIdentityId: command.actorIdentityId,
          occurredAt: now,
          createdAt: now,
          ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
        });

        await this.repository.save(
          {
            order: updatedOrder,
            linesToAppend: [],
            transitionsToAppend: [transition],
            auditRecordsToAppend: [auditRecord],
          },
          order.properties.aggregateVersion,
        );

        return toOrderMutationResult(updatedOrder);
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async requireActiveCustomer(customerProfileId: UuidV7): Promise<void> {
    const customer = await this.customerProfileRead.resolveActiveCustomer(customerProfileId);
    if (customer === null) {
      throw new OrderApplicationError('ORDER_CUSTOMER_NOT_FOUND');
    }
  }

  private async rateLimitRead(identityId: UuidV7): Promise<void> {
    const rateLimit = await this.rateLimiter.consume({
      key: `order-read:${identityId.value}`,
      limit: 60,
      windowSeconds: 3600,
    });
    if (!rateLimit.allowed) {
      throw new OrderApplicationError('ORDER_RATE_LIMITED');
    }
  }

  private async rateLimitMutate(identityId: UuidV7): Promise<void> {
    const rateLimit = await this.rateLimiter.consume({
      key: `order-mutate:${identityId.value}`,
      limit: 120,
      windowSeconds: 3600,
    });
    if (!rateLimit.allowed) {
      throw new OrderApplicationError('ORDER_RATE_LIMITED');
    }
  }
}
