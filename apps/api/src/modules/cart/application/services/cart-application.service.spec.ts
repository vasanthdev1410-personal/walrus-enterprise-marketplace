import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { Cart } from '../../domain/entities/cart';
import { CartLine } from '../../domain/entities/cart-line';
import { CartLifecycle } from '../../domain/lifecycle/cart-lifecycle';
import { Quantity } from '../../domain/value-objects/quantity';
import { MoneyAmount } from '../../domain/value-objects/money-amount';
import type {
  CartReservationPort,
  CartReservationResult,
} from '../../domain/ports/cart-reservation.port';
import type { CartRepository } from '../../domain/ports/cart-repository.port';
import type { CartProductCatalogReadAdapter } from '../../infrastructure/adapters/cart-product-catalog-read.adapter';
import type { CustomerProfileReadPort } from '../../../customer/domain/ports/customer-profile-read.port';
import { CartApplicationService } from './cart-application.service';
import { CartApplicationError } from '../errors/cart-application.error';

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const CUSTOMER_ID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000001');
const ACTOR_ID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000002');
const SKU_ID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000003');
const PRODUCT_ID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000004');
const CART_ID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000005');
const LINE_ID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000010');

function makeCart(
  overrides: Partial<{
    state: string;
    version: number;
    totalLines: number;
    totalItems: number;
  }> = {},
): Cart {
  return new Cart({
    cartId: CART_ID,
    customerProfileId: CUSTOMER_ID,
    state: (overrides.state ?? 'ACTIVE') as 'ACTIVE' | 'CHECKED_OUT',
    totalLines: overrides.totalLines ?? 0,
    totalItems: overrides.totalItems ?? 0,
    aggregateVersion: new AggregateVersion(overrides.version ?? 1),
    createdAt: new Date('2026-08-18T00:00:00Z'),
    updatedAt: new Date('2026-08-18T00:00:00Z'),
  });
}

function makeLine(overrides: Partial<{ quantity: number; skuId: UuidV7 }> = {}): CartLine {
  return new CartLine({
    cartLineId: LINE_ID,
    cartId: CART_ID,
    skuId: overrides.skuId ?? SKU_ID,
    productId: PRODUCT_ID,
    skuCode: 'SKU-001',
    quantity: new Quantity(overrides.quantity ?? 2),
    unitPrice: new MoneyAmount(1500, 'USD'),
    snapshotTaxIncluded: true,
    productUnavailable: false,
    aggregateVersion: new AggregateVersion(1),
    createdAt: new Date('2026-08-18T00:00:00Z'),
    updatedAt: new Date('2026-08-18T00:00:00Z'),
  });
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

const FIXED_NOW = new Date('2026-08-19T12:00:00Z');

let nextIdCounter = 0;

function createMockIdentifiers(): { next: () => UuidV7 } {
  return {
    next: () => {
      nextIdCounter++;
      return new UuidV7(`0192a1b2-c3d4-7000-8000-${String(nextIdCounter).padStart(12, '0')}`);
    },
  };
}

function createMockIdempotency(): {
  execute: <T>(execution: { execute: () => Promise<T> }) => Promise<T>;
} {
  return {
    execute: async <T>(execution: { execute: () => Promise<T> }) => execution.execute(),
  };
}

function createMockRateLimiter(allowed = true): {
  consume: (params: {
    key: string;
    limit: number;
    windowSeconds: number;
  }) => Promise<{ allowed: boolean; limit: number; remaining: number; resetAt: Date }>;
} {
  return {
    consume: () =>
      Promise.resolve({
        allowed,
        limit: 120,
        remaining: 119,
        resetAt: new Date('2026-08-19T13:00:00Z'),
      }),
  };
}

function createMockReservationPort(
  reserveOutcome: 'RESERVED' | 'DENIED' | 'FAILED' = 'RESERVED',
): CartReservationPort {
  function makeResult(
    outcome: 'RESERVED' | 'DENIED' | 'FAILED',
    skuId: UuidV7,
    quantity: number,
  ): CartReservationResult {
    if (outcome === 'RESERVED') {
      return { outcome: 'RESERVED', skuId, quantity, availableQuantity: 10 };
    }
    return { outcome, skuId, reason: `${outcome}: insufficient` };
  }

  return {
    reserve: (req) => Promise.resolve(makeResult(reserveOutcome, req.skuId, req.quantity)),
    release: (req) => Promise.resolve(makeResult('RESERVED', req.skuId, req.quantity)),
  };
}

function createMockProductCatalog(
  skuAvailable = true,
  productAvailable = true,
): CartProductCatalogReadAdapter {
  const sellerId = new UuidV7('0192a1b2-c3d4-7000-8000-000000000020');
  return {
    getConsumableSkuFacts: () =>
      Promise.resolve(
        skuAvailable
          ? {
              skuId: SKU_ID,
              sellerProfileId: sellerId,
              skuCode: 'SKU-001',
              state: 'ACTIVE' as const,
            }
          : null,
      ),
    getConsumableProductFacts: () =>
      Promise.resolve(
        productAvailable
          ? {
              productId: PRODUCT_ID,
              sellerProfileId: sellerId,
              skuId: SKU_ID,
              skuCode: 'SKU-001',
              sellingPrice: 1500,
            }
          : null,
      ),
  } as unknown as CartProductCatalogReadAdapter;
}

function createMockCustomerProfileRead(exists = true): CustomerProfileReadPort {
  return {
    resolveActiveCustomer: () =>
      Promise.resolve(exists ? { customerProfileId: CUSTOMER_ID, identityId: ACTOR_ID } : null),
  };
}

function createMockRepository(
  overrides: Partial<{
    findActiveByCustomerProfileId: () => Promise<Cart | null>;
    findById: () => Promise<Cart | null>;
    findLines: () => Promise<CartLine[]>;
    insert: () => Promise<void>;
    save: () => Promise<void>;
  }> = {},
): CartRepository {
  return {
    findActiveByCustomerProfileId:
      overrides.findActiveByCustomerProfileId ?? (() => Promise.resolve(null)),
    findById: overrides.findById ?? (() => Promise.resolve(null)),
    findLines: overrides.findLines ?? (() => Promise.resolve([])),
    findTransitions: () => Promise.resolve([]),
    findAuditRecords: () => Promise.resolve([]),
    insert: overrides.insert ?? (() => Promise.resolve()),
    save: overrides.save ?? (() => Promise.resolve()),
  } as CartRepository;
}

function createService(
  overrides: Partial<{
    repository: CartRepository;
    reservationPort: CartReservationPort;
    productCatalog: CartProductCatalogReadAdapter;
    customerProfileRead: CustomerProfileReadPort;
  }> = {},
): CartApplicationService {
  nextIdCounter = 0;
  return new CartApplicationService(
    overrides.repository ?? createMockRepository(),
    new CartLifecycle(),
    { now: () => FIXED_NOW },
    createMockIdentifiers(),
    createMockIdempotency() as never,
    createMockRateLimiter(),
    overrides.reservationPort ?? createMockReservationPort(),
    overrides.productCatalog ?? createMockProductCatalog(),
    overrides.customerProfileRead ?? createMockCustomerProfileRead(),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CartApplicationService', () => {
  describe('getActiveCart', () => {
    it('returns the active cart with lines', async () => {
      const line = makeLine();
      const cart = makeCart({ totalLines: 1, totalItems: 2 });
      const service = createService({
        repository: createMockRepository({
          findActiveByCustomerProfileId: () => Promise.resolve(cart),
          findLines: () => Promise.resolve([line]),
        }),
      });
      const result = await service.getActiveCart(CUSTOMER_ID, ACTOR_ID);
      expect(result.cartId).toBe(CART_ID.value);
      expect(result.state).toBe('ACTIVE');
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0]?.quantity).toBe(2);
    });

    it('throws CART_NOT_FOUND when no cart exists', async () => {
      const service = createService();
      await expect(service.getActiveCart(CUSTOMER_ID, ACTOR_ID)).rejects.toThrow(
        CartApplicationError,
      );
      await expect(service.getActiveCart(CUSTOMER_ID, ACTOR_ID)).rejects.toMatchObject({
        code: 'CART_NOT_FOUND',
      });
    });

    it('throws CART_CUSTOMER_NOT_FOUND when customer profile is inactive', async () => {
      const service = createService({
        customerProfileRead: createMockCustomerProfileRead(false),
      });
      await expect(service.getActiveCart(CUSTOMER_ID, ACTOR_ID)).rejects.toMatchObject({
        code: 'CART_CUSTOMER_NOT_FOUND',
      });
    });

    it('throws CART_READ_FORBIDDEN for non-ACTIVE cart', async () => {
      const cart = makeCart({ state: 'CHECKED_OUT' });
      const service = createService({
        repository: createMockRepository({
          findActiveByCustomerProfileId: () => Promise.resolve(cart),
        }),
      });
      await expect(service.getActiveCart(CUSTOMER_ID, ACTOR_ID)).rejects.toMatchObject({
        code: 'CART_READ_FORBIDDEN',
      });
    });
  });

  describe('addItem', () => {
    it('creates a new cart and adds the first item', async () => {
      let insertCalled = false;
      const service = createService({
        repository: createMockRepository({
          insert: () => {
            insertCalled = true;
            return Promise.resolve();
          },
        }),
      });
      const result = await service.addItem({
        customerProfileId: CUSTOMER_ID,
        actorIdentityId: ACTOR_ID,
        skuId: SKU_ID,
        productId: PRODUCT_ID,
        skuCode: 'SKU-001',
        quantity: 2,
        expectedVersion: 1,
        idempotencyKey: 'idem-1',
      });
      expect(insertCalled).toBe(true);
      expect(result.state).toBe('ACTIVE');
      expect(result.totalLines).toBe(1);
      expect(result.totalItems).toBe(2);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0]?.quantity).toBe(2);
    });

    it('aggregates quantity when SKU already exists in cart', async () => {
      const existingLine = makeLine({ quantity: 3 });
      const cart = makeCart({ totalLines: 1, totalItems: 3 });
      let saveCalled = false;
      const service = createService({
        repository: createMockRepository({
          findActiveByCustomerProfileId: () => Promise.resolve(cart),
          findLines: () => Promise.resolve([existingLine]),
          save: () => {
            saveCalled = true;
            return Promise.resolve();
          },
        }),
      });
      const result = await service.addItem({
        customerProfileId: CUSTOMER_ID,
        actorIdentityId: ACTOR_ID,
        skuId: SKU_ID,
        productId: PRODUCT_ID,
        skuCode: 'SKU-001',
        quantity: 2,
        expectedVersion: 1,
        idempotencyKey: 'idem-2',
      });
      expect(saveCalled).toBe(true);
      expect(result.totalItems).toBe(5);
    });

    it('throws CART_SKU_UNAVAILABLE when SKU is not published', async () => {
      const service = createService({
        productCatalog: createMockProductCatalog(false, true),
      });
      await expect(
        service.addItem({
          customerProfileId: CUSTOMER_ID,
          actorIdentityId: ACTOR_ID,
          skuId: SKU_ID,
          productId: PRODUCT_ID,
          skuCode: 'SKU-001',
          quantity: 1,
          expectedVersion: 1,
          idempotencyKey: 'idem-3',
        }),
      ).rejects.toMatchObject({ code: 'CART_SKU_UNAVAILABLE' });
    });

    it('throws CART_PRODUCT_UNAVAILABLE when product is not published', async () => {
      const service = createService({
        productCatalog: createMockProductCatalog(true, false),
      });
      await expect(
        service.addItem({
          customerProfileId: CUSTOMER_ID,
          actorIdentityId: ACTOR_ID,
          skuId: SKU_ID,
          productId: PRODUCT_ID,
          skuCode: 'SKU-001',
          quantity: 1,
          expectedVersion: 1,
          idempotencyKey: 'idem-4',
        }),
      ).rejects.toMatchObject({ code: 'CART_PRODUCT_UNAVAILABLE' });
    });

    it('throws CART_INVENTORY_INSUFFICIENT when reservation denied', async () => {
      const service = createService({
        reservationPort: createMockReservationPort('DENIED'),
      });
      await expect(
        service.addItem({
          customerProfileId: CUSTOMER_ID,
          actorIdentityId: ACTOR_ID,
          skuId: SKU_ID,
          productId: PRODUCT_ID,
          skuCode: 'SKU-001',
          quantity: 1,
          expectedVersion: 1,
          idempotencyKey: 'idem-5',
        }),
      ).rejects.toMatchObject({ code: 'CART_INVENTORY_INSUFFICIENT' });
    });

    it('throws CART_VALIDATION_FAILED for invalid quantity', async () => {
      const service = createService();
      await expect(
        service.addItem({
          customerProfileId: CUSTOMER_ID,
          actorIdentityId: ACTOR_ID,
          skuId: SKU_ID,
          productId: PRODUCT_ID,
          skuCode: 'SKU-001',
          quantity: 0,
          expectedVersion: 1,
          idempotencyKey: 'idem-6',
        }),
      ).rejects.toMatchObject({ code: 'CART_VALIDATION_FAILED' });
    });

    it('throws CART_MAX_LINES_EXCEEDED when adding 51st line', async () => {
      const lines = Array.from({ length: 50 }, (_, i) =>
        makeLine({
          quantity: 1,
          skuId: new UuidV7(`0192a1b2-c3d4-7000-8000-${String(i + 100).padStart(12, '0')}`),
        }),
      );
      const cart = makeCart({ totalLines: 50, totalItems: 50 });
      const service = createService({
        repository: createMockRepository({
          findActiveByCustomerProfileId: () => Promise.resolve(cart),
          findLines: () => Promise.resolve(lines),
        }),
      });
      await expect(
        service.addItem({
          customerProfileId: CUSTOMER_ID,
          actorIdentityId: ACTOR_ID,
          skuId: new UuidV7('0192a1b2-c3d4-7000-8000-000000000200'),
          productId: PRODUCT_ID,
          skuCode: 'SKU-NEW',
          quantity: 1,
          expectedVersion: 1,
          idempotencyKey: 'idem-7',
        }),
      ).rejects.toMatchObject({ code: 'CART_MAX_LINES_EXCEEDED' });
    });

    it('throws CART_STALE_VERSION when expected version mismatches on existing cart', async () => {
      const cart = makeCart({ version: 2 });
      const service = createService({
        repository: createMockRepository({
          findActiveByCustomerProfileId: () => Promise.resolve(cart),
          findLines: () => Promise.resolve([]),
        }),
      });
      await expect(
        service.addItem({
          customerProfileId: CUSTOMER_ID,
          actorIdentityId: ACTOR_ID,
          skuId: SKU_ID,
          productId: PRODUCT_ID,
          skuCode: 'SKU-001',
          quantity: 1,
          expectedVersion: 1,
          idempotencyKey: 'idem-8',
        }),
      ).rejects.toMatchObject({ code: 'CART_STALE_VERSION' });
    });
  });

  describe('updateItemQuantity', () => {
    it('updates quantity and adjusts delta reservation', async () => {
      const line = makeLine({ quantity: 3 });
      const cart = makeCart({ totalLines: 1, totalItems: 3 });
      let saveCalled = false;
      const service = createService({
        repository: createMockRepository({
          findActiveByCustomerProfileId: () => Promise.resolve(cart),
          findLines: () => Promise.resolve([line]),
          save: () => {
            saveCalled = true;
            return Promise.resolve();
          },
        }),
      });
      const result = await service.updateItemQuantity({
        customerProfileId: CUSTOMER_ID,
        cartLineId: LINE_ID,
        actorIdentityId: ACTOR_ID,
        quantity: 5,
        expectedVersion: 1,
      });
      expect(saveCalled).toBe(true);
      expect(result.totalItems).toBe(5);
    });

    it('returns early when quantity is unchanged', async () => {
      const line = makeLine({ quantity: 3 });
      const cart = makeCart({ totalLines: 1, totalItems: 3 });
      let saveCalled = false;
      const service = createService({
        repository: createMockRepository({
          findActiveByCustomerProfileId: () => Promise.resolve(cart),
          findLines: () => Promise.resolve([line]),
          save: () => {
            saveCalled = true;
            return Promise.resolve();
          },
        }),
      });
      const result = await service.updateItemQuantity({
        customerProfileId: CUSTOMER_ID,
        cartLineId: LINE_ID,
        actorIdentityId: ACTOR_ID,
        quantity: 3,
        expectedVersion: 1,
      });
      expect(saveCalled).toBe(false);
      expect(result.version).toBe(1);
    });

    it('throws CART_LINE_NOT_FOUND when line does not exist', async () => {
      const cart = makeCart();
      const service = createService({
        repository: createMockRepository({
          findActiveByCustomerProfileId: () => Promise.resolve(cart),
          findLines: () => Promise.resolve([]),
        }),
      });
      await expect(
        service.updateItemQuantity({
          customerProfileId: CUSTOMER_ID,
          cartLineId: new UuidV7('0192a1b2-c3d4-7000-8000-000000000999'),
          actorIdentityId: ACTOR_ID,
          quantity: 5,
          expectedVersion: 1,
        }),
      ).rejects.toMatchObject({ code: 'CART_LINE_NOT_FOUND' });
    });
  });

  describe('removeItem', () => {
    it('removes the line and releases reservation', async () => {
      const line = makeLine({ quantity: 3 });
      const cart = makeCart({ totalLines: 1, totalItems: 3 });
      let saveCalled = false;
      const service = createService({
        repository: createMockRepository({
          findActiveByCustomerProfileId: () => Promise.resolve(cart),
          findLines: () => Promise.resolve([line]),
          save: () => {
            saveCalled = true;
            return Promise.resolve();
          },
        }),
      });
      const result = await service.removeItem({
        customerProfileId: CUSTOMER_ID,
        cartLineId: LINE_ID,
        actorIdentityId: ACTOR_ID,
        expectedVersion: 1,
      });
      expect(saveCalled).toBe(true);
      expect(result.totalLines).toBe(0);
      expect(result.totalItems).toBe(0);
    });

    it('throws CART_LINE_NOT_FOUND when line does not exist', async () => {
      const cart = makeCart();
      const service = createService({
        repository: createMockRepository({
          findActiveByCustomerProfileId: () => Promise.resolve(cart),
          findLines: () => Promise.resolve([]),
        }),
      });
      await expect(
        service.removeItem({
          customerProfileId: CUSTOMER_ID,
          cartLineId: new UuidV7('0192a1b2-c3d4-7000-8000-000000000999'),
          actorIdentityId: ACTOR_ID,
          expectedVersion: 1,
        }),
      ).rejects.toMatchObject({ code: 'CART_LINE_NOT_FOUND' });
    });
  });

  describe('clearCart', () => {
    it('clears all lines and releases all reservations', async () => {
      const lines = [makeLine({ quantity: 2 }), makeLine({ quantity: 3 })];
      const cart = makeCart({ totalLines: 2, totalItems: 5 });
      let saveCalled = false;
      const service = createService({
        repository: createMockRepository({
          findActiveByCustomerProfileId: () => Promise.resolve(cart),
          findLines: () => Promise.resolve(lines),
          save: () => {
            saveCalled = true;
            return Promise.resolve();
          },
        }),
      });
      const result = await service.clearCart({
        customerProfileId: CUSTOMER_ID,
        actorIdentityId: ACTOR_ID,
        expectedVersion: 1,
        idempotencyKey: 'idem-clear',
      });
      expect(saveCalled).toBe(true);
      expect(result.totalLines).toBe(0);
      expect(result.totalItems).toBe(0);
    });

    it('returns early when cart is already empty', async () => {
      const cart = makeCart();
      let saveCalled = false;
      const service = createService({
        repository: createMockRepository({
          findActiveByCustomerProfileId: () => Promise.resolve(cart),
          findLines: () => Promise.resolve([]),
          save: () => {
            saveCalled = true;
            return Promise.resolve();
          },
        }),
      });
      const result = await service.clearCart({
        customerProfileId: CUSTOMER_ID,
        actorIdentityId: ACTOR_ID,
        expectedVersion: 1,
        idempotencyKey: 'idem-clear-empty',
      });
      expect(saveCalled).toBe(false);
      expect(result.totalLines).toBe(0);
    });
  });

  describe('checkoutHandoff', () => {
    it('creates snapshot and transitions to CHECKED_OUT', async () => {
      const line = makeLine({ quantity: 2 });
      const cart = makeCart({ totalLines: 1, totalItems: 2 });
      let saveCalled = false;
      const service = createService({
        repository: createMockRepository({
          findActiveByCustomerProfileId: () => Promise.resolve(cart),
          findLines: () => Promise.resolve([line]),
          save: () => {
            saveCalled = true;
            return Promise.resolve();
          },
        }),
      });
      const result = await service.checkoutHandoff({
        customerProfileId: CUSTOMER_ID,
        actorIdentityId: ACTOR_ID,
        expectedVersion: 1,
        idempotencyKey: 'idem-checkout',
      });
      expect(saveCalled).toBe(true);
      expect(result.snapshotId).toBeDefined();
      expect(result.totalLines).toBe(1);
      expect(result.totalItems).toBe(2);
      expect(result.subtotalAmountCents).toBe(3000);
    });

    it('throws CART_CHECKOUT_BLOCKED when cart is empty', async () => {
      const cart = makeCart();
      const service = createService({
        repository: createMockRepository({
          findActiveByCustomerProfileId: () => Promise.resolve(cart),
        }),
      });
      await expect(
        service.checkoutHandoff({
          customerProfileId: CUSTOMER_ID,
          actorIdentityId: ACTOR_ID,
          expectedVersion: 1,
          idempotencyKey: 'idem-checkout-empty',
        }),
      ).rejects.toMatchObject({ code: 'CART_CHECKOUT_BLOCKED' });
    });
  });

  describe('expireCart', () => {
    it('transitions an active cart to AUTO_EXPIRED', async () => {
      const line = makeLine({ quantity: 1 });
      const cart = makeCart({ totalLines: 1, totalItems: 1 });
      let saveCalled = false;
      const service = createService({
        repository: createMockRepository({
          findById: () => Promise.resolve(cart),
          findLines: () => Promise.resolve([line]),
          save: () => {
            saveCalled = true;
            return Promise.resolve();
          },
        }),
      });
      const result = await service.expireCart({
        cartId: CART_ID,
        actorIdentityId: ACTOR_ID,
        reasonReference: 'ttl_expired',
      });
      expect(saveCalled).toBe(true);
      expect(result.state).toBe('AUTO_EXPIRED');
    });

    it('throws CART_NOT_FOUND when cart does not exist', async () => {
      const service = createService();
      await expect(
        service.expireCart({
          cartId: new UuidV7('0192a1b2-c3d4-7000-8000-000000000999'),
          actorIdentityId: ACTOR_ID,
          reasonReference: 'ttl_expired',
        }),
      ).rejects.toMatchObject({ code: 'CART_NOT_FOUND' });
    });

    it('throws CART_STATE_CONFLICT for non-ACTIVE cart', async () => {
      const cart = makeCart({ state: 'CHECKED_OUT' });
      const service = createService({
        repository: createMockRepository({
          findById: () => Promise.resolve(cart),
        }),
      });
      await expect(
        service.expireCart({
          cartId: CART_ID,
          actorIdentityId: ACTOR_ID,
          reasonReference: 'ttl_expired',
        }),
      ).rejects.toMatchObject({ code: 'CART_STATE_CONFLICT' });
    });
  });
});
