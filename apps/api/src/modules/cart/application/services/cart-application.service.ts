import type {
  ClockPort,
  UuidV7GenerationPort,
} from '../../../identity-authentication/application/ports/application-runtime.port';
import type { NonProductionRateLimiterPort } from '../../../identity-authentication/application/ports/non-production-rate-limiter.port';
import type { ApiIdempotencyService } from '../../../identity-authentication/application/services/api-idempotency.service';
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { Cart } from '../../domain/entities/cart';
import { CartAuditRecord } from '../../domain/entities/cart-audit-record';
import { CartLine } from '../../domain/entities/cart-line';
import type { CartLifecycle } from '../../domain/lifecycle/cart-lifecycle';
import type { CartReservationPort } from '../../domain/ports/cart-reservation.port';
import type { CartRepository } from '../../domain/ports/cart-repository.port';
import type { CartLineId } from '../../domain/value-objects/cart-line-id';
import { MoneyAmount } from '../../domain/value-objects/money-amount';
import { Quantity } from '../../domain/value-objects/quantity';

import { CartItemSnapshot } from '../../domain/value-objects/cart-item-snapshot';
import { CartSnapshot } from '../../domain/value-objects/cart-snapshot';
import type { CustomerProfileReadPort } from '../../../customer/domain/ports/customer-profile-read.port';
import type { CartProductCatalogReadAdapter } from '../../infrastructure/adapters/cart-product-catalog-read.adapter';
import { CartApplicationError } from '../errors/cart-application.error';
import type {
  AddCartItemCommand,
  CartMutationResult,
  CartResult,
  CheckoutHandoffCommand,
  CheckoutHandoffResult,
  ClearCartCommand,
  ExpireCartCommand,
  RemoveCartItemCommand,
  UpdateCartItemQuantityCommand,
} from '../dtos/cart-application.dtos';
import {
  toCartMutationResult,
  toCartResult,
  toCheckoutHandoffResult,
} from '../dtos/cart-application.dtos';

/**
 * WEMP-M07-PLAN-001 M07-M3 (WEMP-M07-SPEC-001 §4/§6, decisions D-01/D-02/
 * D-03/D-04/D-05/D-06/D-07/D-08/D-11/D-12/D-13/D-16/D-17/D-18). Cart
 * application service — the primary use-case orchestrator for Module 07.
 *
 * Operations:
 * - `getActiveCart`: self-service cart read (ACTIVE only, D-07)
 * - `addItem`: add SKU to cart, create cart if needed, reserve inventory (D-06)
 * - `updateItemQuantity`: update line quantity, adjust delta reservation (D-06)
 * - `removeItem`: remove line, release reservation (D-06)
 * - `clearCart`: clear all lines, release all reservations (D-06)
 * - `checkoutHandoff`: create immutable snapshot for M08, transition to
 *   CHECKED_OUT, release all reservations (D-08)
 * - `expireCart`: transition to AUTO_EXPIRED, release reservations (D-07)
 *
 * Every mutation is ACTIVE-only (D-07), version-guarded (D-16), audited
 * (D-11 lifecycle events only), rate-limited (D-10), and idempotent where
 * required (D-17: addItem and clearCart). Ownership is verified through the
 * customer profile read port — fail-closed when the customer is unknown or
 * inactive (A-10).
 *
 * Fail closed: any unknown, unavailable, insufficient, or unauthorized
 * state resolves to a typed CartApplicationError; presentation layers
 * map these to generic responses.
 */
export class CartApplicationService {
  public constructor(
    private readonly repository: CartRepository,
    private readonly lifecycle: CartLifecycle,
    private readonly clock: ClockPort,
    private readonly identifiers: UuidV7GenerationPort,
    private readonly idempotency: ApiIdempotencyService,
    private readonly rateLimiter: NonProductionRateLimiterPort,
    private readonly reservationPort: CartReservationPort,
    private readonly productCatalog: CartProductCatalogReadAdapter,
    private readonly customerProfileRead: CustomerProfileReadPort,
  ) {}

  // ---------------------------------------------------------------------------
  // READ
  // ---------------------------------------------------------------------------

  /**
   * WEMP-M07-SPEC-001 §5. Self-service cart read by authenticated customer.
   * Returns the ACTIVE cart with all its lines. Only ACTIVE carts are
   * self-readable (D-07); CHECKED_OUT, ARCHIVED, AUTO_EXPIRED deny reads.
   */
  public async getActiveCart(
    customerProfileId: UuidV7,
    callerIdentityId: UuidV7,
  ): Promise<CartResult> {
    await this.rateLimitRead(callerIdentityId);
    await this.requireActiveCustomer(customerProfileId);
    const cart = await this.repository.findActiveByCustomerProfileId(customerProfileId);
    if (cart === null) {
      throw new CartApplicationError('CART_NOT_FOUND');
    }
    this.lifecycle.assertCanSelfRead(cart.properties.state);
    const lines = await this.repository.findLines(cart.properties.cartId);
    return toCartResult(cart, lines);
  }

  // ---------------------------------------------------------------------------
  // CREATE + ADD
  // ---------------------------------------------------------------------------

  /**
   * WEMP-M07-SPEC-001 (decisions D-02/D-03/D-05/D-06/D-17). Creates a new
   * cart for the customer (if none exists) and adds the SKU. Idempotent
   * (D-17: addItem with Idempotency-Key). Reserves inventory through the
   * CartReservationPort (D-06). If the SKU already exists in the cart,
   * quantity is aggregated (D-03).
   */
  public async addItem(command: AddCartItemCommand): Promise<CartResult> {
    await this.rateLimitMutate(command.actorIdentityId);
    await this.requireActiveCustomer(command.customerProfileId);

    let cart = await this.repository.findActiveByCustomerProfileId(command.customerProfileId);

    // Enforce ACTIVE-only mutation (D-07) and version guard (D-16).
    if (cart !== null) {
      this.assertMutable(cart, command.expectedVersion);
    }

    // Resolve SKU facts from Module 04 (D-05/D-12/D-13): PUBLISHED gate.
    const skuFacts = await this.productCatalog.getConsumableSkuFacts(command.skuId);
    if (skuFacts === null) {
      throw new CartApplicationError('CART_SKU_UNAVAILABLE');
    }

    // Resolve product facts to verify PUBLISHED gate (D-12).
    const productFacts = await this.productCatalog.getConsumableProductFacts(command.productId);
    if (productFacts === null) {
      throw new CartApplicationError('CART_PRODUCT_UNAVAILABLE');
    }

    // Validate quantity constraints (D-04).
    this.assertValidQuantity(command.quantity);

    return this.idempotency.execute<CartResult>({
      scope: `cart:${command.customerProfileId.value}`,
      operationType: 'cart.item.add',
      idempotencyKey: command.idempotencyKey,
      request: command,
      execute: async () => {
        const now = this.clock.now();

        // Create cart if it does not exist (D-02: one active cart per customer).
        if (cart === null) {
          const newCart = this.createCartForCustomer(command.customerProfileId, now);
          const line = this.createCartLine(
            newCart.properties.cartId,
            command.skuId,
            command.productId,
            skuFacts.skuCode,
            command.quantity,
            productFacts.sellingPrice,
            now,
          );
          // Reserve full quantity (D-06).
          await this.reserveInventory(command.skuId, command.quantity, command.correlationId);
          const cartWithTotals = new Cart({
            ...newCart.properties,
            totalLines: 1,
            totalItems: command.quantity,
          });
          await this.repository.insert({
            cart: cartWithTotals,
            linesToAppend: [line],
            linesToUpdate: [],
            linesToRemove: [],
            transitionsToAppend: [],
            auditRecordsToAppend: [
              this.createAuditRecord(
                newCart.properties.cartId,
                command.customerProfileId,
                'CART_CREATED',
                command.actorIdentityId,
                now,
                command.correlationId,
              ),
              this.createAuditRecord(
                newCart.properties.cartId,
                command.customerProfileId,
                'CART_ITEM_ADDED',
                command.actorIdentityId,
                now,
                command.correlationId,
              ),
            ],
          });
          return toCartResult(cartWithTotals, [line]);
        }

        // Cart exists — find existing line for this SKU (D-03: SKU-level uniqueness).
        const lines = await this.repository.findLines(cart.properties.cartId);
        const existingLine = lines.find((l) => l.properties.skuId.value === command.skuId.value);

        if (existingLine !== undefined) {
          // SKU already in cart — aggregate quantity (D-03).
          const newQty = existingLine.properties.quantity.value + command.quantity;
          this.assertValidQuantity(newQty);

          // Adjust delta reservation (D-06).
          const delta = command.quantity;
          if (delta > 0) {
            await this.reserveInventory(command.skuId, delta, command.correlationId);
          }

          const updatedLine = new CartLine({
            ...existingLine.properties,
            quantity: new Quantity(newQty),
            aggregateVersion: new AggregateVersion(
              existingLine.properties.aggregateVersion.value + 1,
            ),
            updatedAt: now,
          });

          const updatedCart = this.advanceCart(cart, now, {
            totalItems: cart.properties.totalItems + delta,
          });

          await this.repository.save(
            {
              cart: updatedCart,
              linesToAppend: [],
              linesToUpdate: [updatedLine],
              linesToRemove: [],
              transitionsToAppend: [],
              auditRecordsToAppend: [
                this.createAuditRecord(
                  cart.properties.cartId,
                  command.customerProfileId,
                  'CART_ITEM_ADDED',
                  command.actorIdentityId,
                  now,
                  command.correlationId,
                ),
              ],
            },
            cart.properties.aggregateVersion,
          );

          const allLines = lines.map((l) =>
            l.properties.cartLineId.value === existingLine.properties.cartLineId.value
              ? updatedLine
              : l,
          );
          return toCartResult(updatedCart, allLines);
        }

        // New line — validate max lines (D-18).
        if (lines.length >= 50) {
          throw new CartApplicationError('CART_MAX_LINES_EXCEEDED');
        }
        const newTotalItems = cart.properties.totalItems + command.quantity;
        if (newTotalItems > 100) {
          throw new CartApplicationError('CART_MAX_TOTAL_ITEMS_EXCEEDED');
        }

        const newLine = this.createCartLine(
          cart.properties.cartId,
          command.skuId,
          command.productId,
          skuFacts.skuCode,
          command.quantity,
          productFacts.sellingPrice,
          now,
        );

        // Reserve quantity (D-06).
        await this.reserveInventory(command.skuId, command.quantity, command.correlationId);

        const updatedCart = this.advanceCart(cart, now, {
          totalLines: lines.length + 1,
          totalItems: newTotalItems,
        });

        await this.repository.save(
          {
            cart: updatedCart,
            linesToAppend: [newLine],
            linesToUpdate: [],
            linesToRemove: [],
            transitionsToAppend: [],
            auditRecordsToAppend: [
              this.createAuditRecord(
                cart.properties.cartId,
                command.customerProfileId,
                'CART_ITEM_ADDED',
                command.actorIdentityId,
                now,
                command.correlationId,
              ),
            ],
          },
          cart.properties.aggregateVersion,
        );

        return toCartResult(updatedCart, [...lines, newLine]);
      },
    });
  }

  // ---------------------------------------------------------------------------
  // UPDATE QUANTITY
  // ---------------------------------------------------------------------------

  /**
   * WEMP-M07-SPEC-001 (decisions D-04/D-06/D-16/D-17). Updates the quantity
   * of an existing cart line. Naturally idempotent (D-17). Adjusts delta
   * reservation (D-06). Version-guarded (D-16).
   */
  public async updateItemQuantity(
    command: UpdateCartItemQuantityCommand,
  ): Promise<CartMutationResult> {
    await this.rateLimitMutate(command.actorIdentityId);
    await this.requireActiveCustomer(command.customerProfileId);
    const cart = await this.requireActiveCart(command.customerProfileId);
    this.assertMutable(cart, command.expectedVersion);
    this.assertValidQuantity(command.quantity);

    const lines = await this.repository.findLines(cart.properties.cartId);
    const existingLine = lines.find(
      (l) => l.properties.cartLineId.value === command.cartLineId.value,
    );
    if (existingLine === undefined) {
      throw new CartApplicationError('CART_LINE_NOT_FOUND');
    }

    const now = this.clock.now();
    const oldQty = existingLine.properties.quantity.value;
    const newQty = command.quantity;
    const delta = newQty - oldQty;

    if (delta === 0) {
      return toCartMutationResult(cart);
    }

    // Adjust delta reservation (D-06).
    if (delta > 0) {
      await this.reserveInventory(existingLine.properties.skuId, delta, command.correlationId);
    } else {
      await this.releaseInventory(
        existingLine.properties.skuId,
        Math.abs(delta),
        command.correlationId,
      );
    }

    const updatedLine = new CartLine({
      ...existingLine.properties,
      quantity: new Quantity(newQty),
      aggregateVersion: new AggregateVersion(existingLine.properties.aggregateVersion.value + 1),
      updatedAt: now,
    });

    const updatedCart = this.advanceCart(cart, now, {
      totalItems: cart.properties.totalItems + delta,
    });

    await this.repository.save(
      {
        cart: updatedCart,
        linesToAppend: [],
        linesToUpdate: [updatedLine],
        linesToRemove: [],
        transitionsToAppend: [],
        auditRecordsToAppend: [],
      },
      cart.properties.aggregateVersion,
    );

    return toCartMutationResult(updatedCart);
  }

  // ---------------------------------------------------------------------------
  // REMOVE ITEM
  // ---------------------------------------------------------------------------

  /**
   * WEMP-M07-SPEC-001 (decisions D-04/D-06/D-16/D-17). Removes a line from
   * the cart. Naturally idempotent (D-17). Releases reservation (D-06).
   * Version-guarded (D-16).
   */
  public async removeItem(command: RemoveCartItemCommand): Promise<CartMutationResult> {
    await this.rateLimitMutate(command.actorIdentityId);
    await this.requireActiveCustomer(command.customerProfileId);
    const cart = await this.requireActiveCart(command.customerProfileId);
    this.assertMutable(cart, command.expectedVersion);

    const lines = await this.repository.findLines(cart.properties.cartId);
    const existingLine = lines.find(
      (l) => l.properties.cartLineId.value === command.cartLineId.value,
    );
    if (existingLine === undefined) {
      throw new CartApplicationError('CART_LINE_NOT_FOUND');
    }

    const now = this.clock.now();

    // Release reservation for this line (D-06).
    await this.releaseInventory(
      existingLine.properties.skuId,
      existingLine.properties.quantity.value,
      command.correlationId,
    );

    const updatedCart = this.advanceCart(cart, now, {
      totalLines: lines.length - 1,
      totalItems: cart.properties.totalItems - existingLine.properties.quantity.value,
    });

    await this.repository.save(
      {
        cart: updatedCart,
        linesToAppend: [],
        linesToUpdate: [],
        linesToRemove: [existingLine.properties.cartLineId],
        transitionsToAppend: [],
        auditRecordsToAppend: [
          this.createAuditRecord(
            cart.properties.cartId,
            command.customerProfileId,
            'CART_ITEM_REMOVED',
            command.actorIdentityId,
            now,
            command.correlationId,
          ),
        ],
      },
      cart.properties.aggregateVersion,
    );

    return toCartMutationResult(updatedCart);
  }

  // ---------------------------------------------------------------------------
  // CLEAR CART
  // ---------------------------------------------------------------------------

  /**
   * WEMP-M07-SPEC-001 (decisions D-06/D-16/D-17). Clears all lines from
   * the cart. Idempotent (D-17: clearCart with Idempotency-Key). Releases
   * all reservations (D-06). Version-guarded (D-16).
   */
  public async clearCart(command: ClearCartCommand): Promise<CartMutationResult> {
    await this.rateLimitMutate(command.actorIdentityId);
    await this.requireActiveCustomer(command.customerProfileId);
    const cart = await this.requireActiveCart(command.customerProfileId);
    this.assertMutable(cart, command.expectedVersion);

    return this.idempotency.execute<CartMutationResult>({
      scope: `cart:${command.customerProfileId.value}`,
      operationType: 'cart.clear',
      idempotencyKey: command.idempotencyKey,
      request: command,
      execute: async () => {
        const now = this.clock.now();
        const lines = await this.repository.findLines(cart.properties.cartId);

        if (lines.length === 0) {
          return toCartMutationResult(cart);
        }

        // Release all reservations (D-06).
        for (const line of lines) {
          await this.releaseInventory(
            line.properties.skuId,
            line.properties.quantity.value,
            command.correlationId,
          );
        }

        const updatedCart = this.advanceCart(cart, now, {
          totalLines: 0,
          totalItems: 0,
        });

        await this.repository.save(
          {
            cart: updatedCart,
            linesToAppend: [],
            linesToUpdate: [],
            linesToRemove: lines.map((l) => l.properties.cartLineId),
            transitionsToAppend: [],
            auditRecordsToAppend: [
              this.createAuditRecord(
                cart.properties.cartId,
                command.customerProfileId,
                'CART_CLEARED',
                command.actorIdentityId,
                now,
                command.correlationId,
              ),
            ],
          },
          cart.properties.aggregateVersion,
        );

        return toCartMutationResult(updatedCart);
      },
    });
  }

  // ---------------------------------------------------------------------------
  // CHECKOUT HANDOFF
  // ---------------------------------------------------------------------------

  /**
   * WEMP-M07-SPEC-001 (decisions D-08/D-16). Creates an immutable
   * CartSnapshot (full cart contents, price snapshots, totals, line metadata)
   * and transitions the cart to CHECKED_OUT. The snapshot is the contract
   * artifact passed to Module 08 Orders. M08 consumes the snapshot, not the
   * live cart (D-08). Version-guarded (D-16). Idempotent (D-17).
   */
  public async checkoutHandoff(command: CheckoutHandoffCommand): Promise<CheckoutHandoffResult> {
    await this.rateLimitMutate(command.actorIdentityId);
    await this.requireActiveCustomer(command.customerProfileId);
    const cart = await this.requireActiveCart(command.customerProfileId);
    this.assertMutable(cart, command.expectedVersion);

    if (cart.properties.totalLines === 0) {
      throw new CartApplicationError('CART_CHECKOUT_BLOCKED');
    }

    return this.idempotency.execute<CheckoutHandoffResult>({
      scope: `cart:${command.customerProfileId.value}`,
      operationType: 'cart.checkout',
      idempotencyKey: command.idempotencyKey,
      request: command,
      execute: async () => {
        const now = this.clock.now();
        const lines = await this.repository.findLines(cart.properties.cartId);

        // Create immutable snapshot for Module 08 (D-08).
        const snapshot = this.createCheckoutSnapshot(cart, lines, now, command.correlationId);

        // Release all reservations (D-06).
        for (const line of lines) {
          await this.releaseInventory(
            line.properties.skuId,
            line.properties.quantity.value,
            command.correlationId,
          );
        }

        // Transition to CHECKED_OUT (D-07).
        const transition = this.lifecycle.transition({
          cart,
          toState: 'CHECKED_OUT',
          actor: {
            identityId: command.actorIdentityId,
            kind: 'CUSTOMER',
          },
          now,
          transitionId: this.identifiers.next(),
          reasonReference: 'checkout_handoff',
          ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
        });

        const updatedCart = this.lifecycle.updatedCart(cart, 'CHECKED_OUT', now);

        await this.repository.save(
          {
            cart: updatedCart,
            linesToAppend: [],
            linesToUpdate: [],
            linesToRemove: [],
            transitionsToAppend: [transition],
            auditRecordsToAppend: [
              this.createAuditRecord(
                cart.properties.cartId,
                command.customerProfileId,
                'CART_CHECKED_OUT',
                command.actorIdentityId,
                now,
                command.correlationId,
              ),
            ],
          },
          cart.properties.aggregateVersion,
        );

        return toCheckoutHandoffResult(updatedCart, snapshot);
      },
    });
  }

  // ---------------------------------------------------------------------------
  // EXPIRE CART (system actor)
  // ---------------------------------------------------------------------------

  /**
   * WEMP-M07-SPEC-001 (decision D-07). Transitions an ACTIVE cart to
   * AUTO_EXPIRED (30-day TTL). Releases all reservations (D-06). Called
   * by the system actor — not customer-facing. Not rate-limited.
   */
  public async expireCart(command: ExpireCartCommand): Promise<CartMutationResult> {
    const cart = await this.repository.findById(command.cartId);
    if (cart === null) {
      throw new CartApplicationError('CART_NOT_FOUND');
    }
    if (cart.properties.state !== 'ACTIVE') {
      throw new CartApplicationError('CART_STATE_CONFLICT');
    }

    const now = this.clock.now();
    const lines = await this.repository.findLines(cart.properties.cartId);

    // Release all reservations (D-06).
    for (const line of lines) {
      await this.releaseInventory(
        line.properties.skuId,
        line.properties.quantity.value,
        command.correlationId,
      );
    }

    // Transition to AUTO_EXPIRED (D-07).
    const transition = this.lifecycle.transition({
      cart,
      toState: 'AUTO_EXPIRED',
      actor: {
        identityId: command.actorIdentityId,
        kind: 'SYSTEM',
      },
      now,
      transitionId: this.identifiers.next(),
      reasonReference: command.reasonReference,
      ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
    });

    const updatedCart = this.lifecycle.updatedCart(cart, 'AUTO_EXPIRED', now);

    await this.repository.save(
      {
        cart: updatedCart,
        linesToAppend: [],
        linesToUpdate: [],
        linesToRemove: [],
        transitionsToAppend: [transition],
        auditRecordsToAppend: [
          this.createAuditRecord(
            cart.properties.cartId,
            cart.properties.customerProfileId,
            'CART_EXPIRED',
            command.actorIdentityId,
            now,
            command.correlationId,
          ),
        ],
      },
      cart.properties.aggregateVersion,
    );

    return toCartMutationResult(updatedCart);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async requireActiveCustomer(customerProfileId: UuidV7): Promise<void> {
    const customer = await this.customerProfileRead.resolveActiveCustomer(customerProfileId);
    if (customer === null) {
      throw new CartApplicationError('CART_CUSTOMER_NOT_FOUND');
    }
  }

  private async requireActiveCart(customerProfileId: UuidV7): Promise<Cart> {
    const cart = await this.repository.findActiveByCustomerProfileId(customerProfileId);
    if (cart === null) {
      throw new CartApplicationError('CART_NOT_FOUND');
    }
    return cart;
  }

  private assertMutable(cart: Cart, expectedVersion: number): void {
    if (cart.properties.aggregateVersion.value !== expectedVersion) {
      throw new CartApplicationError('CART_STALE_VERSION');
    }
    this.lifecycle.assertCanMutate(cart.properties.state);
  }

  private assertValidQuantity(quantity: number): void {
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) {
      throw new CartApplicationError('CART_VALIDATION_FAILED');
    }
  }

  private createCartForCustomer(customerProfileId: UuidV7, now: Date): Cart {
    return new Cart({
      cartId: this.identifiers.next(),
      customerProfileId,
      state: 'ACTIVE',
      totalLines: 0,
      totalItems: 0,
      aggregateVersion: new AggregateVersion(1),
      createdAt: now,
      updatedAt: now,
    });
  }

  private advanceCart(
    cart: Cart,
    now: Date,
    overrides: Partial<{
      totalLines: number;
      totalItems: number;
      expiresAt: Date;
    }>,
  ): Cart {
    return new Cart({
      ...cart.properties,
      totalLines: overrides.totalLines ?? cart.properties.totalLines,
      totalItems: overrides.totalItems ?? cart.properties.totalItems,
      ...(overrides.expiresAt !== undefined ? { expiresAt: overrides.expiresAt } : {}),
      aggregateVersion: new AggregateVersion(cart.properties.aggregateVersion.value + 1),
      updatedAt: now,
    });
  }

  private createCartLine(
    cartId: UuidV7,
    skuId: UuidV7,
    productId: UuidV7,
    skuCode: string,
    quantity: number,
    sellingPrice: number,
    now: Date,
  ): CartLine {
    return new CartLine({
      cartLineId: this.identifiers.next(),
      cartId,
      skuId,
      productId,
      skuCode,
      quantity: new Quantity(quantity),
      unitPrice: new MoneyAmount(sellingPrice, 'USD'),
      snapshotTaxIncluded: true,
      productUnavailable: false,
      aggregateVersion: new AggregateVersion(1),
      createdAt: now,
      updatedAt: now,
    });
  }

  private createCheckoutSnapshot(
    cart: Cart,
    lines: readonly CartLine[],
    now: Date,
    correlationId?: CorrelationIdentifier,
  ): CartSnapshot {
    const itemSnapshots = lines.map(
      (line) =>
        new CartItemSnapshot({
          cartLineId: line.properties.cartLineId,
          skuId: line.properties.skuId,
          productId: line.properties.productId,
          skuCode: line.properties.skuCode,
          quantity: line.properties.quantity.value,
          unitPrice: line.properties.unitPrice,
          snapshotTaxIncluded: line.properties.snapshotTaxIncluded,
          productUnavailable: line.properties.productUnavailable,
        }),
    );

    const subtotalCents = itemSnapshots.reduce(
      (sum, item) => sum + item.properties.unitPrice.cents * item.properties.quantity,
      0,
    );

    return new CartSnapshot({
      snapshotId: this.identifiers.next(),
      cartId: cart.properties.cartId,
      customerProfileId: cart.properties.customerProfileId,
      items: itemSnapshots,
      totalLines: lines.length,
      totalItems: lines.reduce((sum, l) => sum + l.properties.quantity.value, 0),
      subtotalAmount: new MoneyAmount(subtotalCents, 'USD'),
      createdAt: now,
      ...(correlationId !== undefined ? { correlationId } : {}),
    });
  }

  private createAuditRecord(
    cartId: UuidV7,
    customerProfileId: UuidV7,
    eventType: string,
    actorIdentityId: UuidV7,
    now: Date,
    correlationId?: CorrelationIdentifier,
  ): CartAuditRecord {
    return new CartAuditRecord({
      auditEventId: this.identifiers.next(),
      cartId,
      customerProfileId,
      eventType,
      actorIdentityId,
      occurredAt: now,
      createdAt: now,
      ...(correlationId !== undefined ? { correlationId } : {}),
    });
  }

  private async reserveInventory(
    skuId: UuidV7,
    quantity: number,
    correlationId?: CorrelationIdentifier,
  ): Promise<void> {
    const result = await this.reservationPort.reserve({
      skuId,
      quantity,
      ...(correlationId !== undefined ? { correlationId: correlationId.value } : {}),
    });
    if (result.outcome === 'DENIED') {
      throw new CartApplicationError('CART_INVENTORY_INSUFFICIENT');
    }
    if (result.outcome === 'FAILED') {
      throw new CartApplicationError('CART_INVENTORY_INSUFFICIENT');
    }
  }

  private async releaseInventory(
    skuId: UuidV7,
    quantity: number,
    correlationId?: CorrelationIdentifier,
  ): Promise<void> {
    await this.reservationPort.release({
      skuId,
      quantity,
      ...(correlationId !== undefined ? { correlationId: correlationId.value } : {}),
    });
  }

  private async rateLimitRead(identityId: UuidV7): Promise<void> {
    const rateLimit = await this.rateLimiter.consume({
      key: `cart-read:${identityId.value}`,
      limit: 60,
      windowSeconds: 3600,
    });
    if (!rateLimit.allowed) {
      throw new CartApplicationError('CART_RATE_LIMITED');
    }
  }

  private async rateLimitMutate(identityId: UuidV7): Promise<void> {
    const rateLimit = await this.rateLimiter.consume({
      key: `cart-mutate:${identityId.value}`,
      limit: 120,
      windowSeconds: 3600,
    });
    if (!rateLimit.allowed) {
      throw new CartApplicationError('CART_RATE_LIMITED');
    }
  }
}
