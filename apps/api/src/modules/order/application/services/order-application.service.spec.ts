import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { Order } from '../../domain/entities/order';
import { OrderLine } from '../../domain/entities/order-line';
import { OrderApplicationError } from '../errors/order-application.error';
import { OrderApplicationService } from './order-application.service';
import type { OrderRepository } from '../../domain/ports/order-repository.port';
import { OrderLifecycle } from '../../domain/lifecycle/order-lifecycle';
import type { ClockPort } from '../../../identity-authentication/application/ports/application-runtime.port';
import type { UuidV7GenerationPort } from '../../../identity-authentication/application/ports/application-runtime.port';
import type { ApiIdempotencyService } from '../../../identity-authentication/application/services/api-idempotency.service';
import type { NonProductionRateLimiterPort } from '../../../identity-authentication/application/ports/non-production-rate-limiter.port';
import type { OrderProductCatalogReadAdapter } from '../../infrastructure/adapters/order-product-catalog-read.adapter';
import type { OrderInventoryConfirmationAdapter } from '../../infrastructure/adapters/order-inventory-confirmation.adapter';
import type { CustomerProfileReadPort } from '../../../customer/domain/ports/customer-profile-read.port';
import type {
  OrderSnapshotReadPort,
  CartSnapshotData,
} from '../../domain/ports/order-snapshot-read.port';
import { OrderId } from '../../domain/value-objects/order-id';
import { OrderLineId } from '../../domain/value-objects/order-line-id';
import { MoneyAmount } from '../../domain/value-objects/money-amount';
import { Quantity } from '../../domain/value-objects/quantity';

const UUID1 = new UuidV7('0192a1b2-c3d4-7000-8000-000000000001');
const UUID2 = new UuidV7('0192a1b2-c3d4-7000-8000-000000000002');
const UUID3 = new UuidV7('0192a1b2-c3d4-7000-8000-000000000003');
const UUID4 = new UuidV7('0192a1b2-c3d4-7000-8000-000000000004');
const UUID5 = new UuidV7('0192a1b2-c3d4-7000-8000-000000000005');
const UUID6 = new UuidV7('0192a1b2-c3d4-7000-8000-000000000006');
const NOW = new Date('2026-08-19T12:00:00.000Z');

function createMockRepository(
  overrides: Partial<{
    findById: () => Promise<Order | null>;
    findPendingByCustomerProfileId: () => Promise<Order | null>;
    findLines: () => Promise<OrderLine[]>;
    insert: () => Promise<void>;
    save: () => Promise<void>;
  }> = {},
): OrderRepository {
  return {
    findById: overrides.findById ?? (() => Promise.resolve(null)),
    findPendingByCustomerProfileId:
      overrides.findPendingByCustomerProfileId ?? (() => Promise.resolve(null)),
    findLines: overrides.findLines ?? (() => Promise.resolve([])),
    findTransitions: () => Promise.resolve([]),
    findAuditRecords: () => Promise.resolve([]),
    insert: overrides.insert ?? (() => Promise.resolve()),
    save: overrides.save ?? (() => Promise.resolve()),
  };
}

function createMockLifecycle(): OrderLifecycle {
  return new OrderLifecycle();
}

function createMockClock(): ClockPort {
  return { now: () => NOW };
}

const GENERATED_UUIDS = [
  '0192a1b2-c3d4-7000-8000-000000000100',
  '0192a1b2-c3d4-7000-8000-000000000101',
  '0192a1b2-c3d4-7000-8000-000000000102',
  '0192a1b2-c3d4-7000-8000-000000000103',
  '0192a1b2-c3d4-7000-8000-000000000104',
  '0192a1b2-c3d4-7000-8000-000000000105',
  '0192a1b2-c3d4-7000-8000-000000000106',
  '0192a1b2-c3d4-7000-8000-000000000107',
  '0192a1b2-c3d4-7000-8000-000000000108',
  '0192a1b2-c3d4-7000-8000-000000000109',
  '0192a1b2-c3d4-7000-8000-000000000110',
  '0192a1b2-c3d4-7000-8000-000000000111',
  '0192a1b2-c3d4-7000-8000-000000000112',
  '0192a1b2-c3d4-7000-8000-000000000113',
  '0192a1b2-c3d4-7000-8000-000000000114',
];

function createMockIdentifiers(): UuidV7GenerationPort {
  let counter = 0;
  return {
    next: () => {
      const idx = counter++ % GENERATED_UUIDS.length;
      const value = GENERATED_UUIDS[idx] ?? GENERATED_UUIDS[0] ?? '';
      return new UuidV7(value);
    },
  };
}

function createMockIdempotency(): ApiIdempotencyService {
  return {
    execute: <T>(options: { execute: () => Promise<T> }): Promise<T> => options.execute(),
  } as unknown as ApiIdempotencyService;
}

function createMockRateLimiter(): NonProductionRateLimiterPort {
  return {
    consume: () =>
      Promise.resolve({ allowed: true, limit: 120, remaining: 119, resetAt: new Date() }),
  };
}

function createMockProductCatalog(
  overrides: Partial<{
    getConsumableProductFacts: () => Promise<{ sellingPrice: number } | null>;
    getConsumableSkuFacts: () => Promise<{ skuCode: string } | null>;
  }> = {},
): OrderProductCatalogReadAdapter {
  return {
    getConsumableProductFacts:
      overrides.getConsumableProductFacts ?? (() => Promise.resolve({ sellingPrice: 1999 })),
    getConsumableSkuFacts:
      overrides.getConsumableSkuFacts ?? (() => Promise.resolve({ skuCode: 'SKU-001' })),
  } as unknown as OrderProductCatalogReadAdapter;
}

function createMockInventoryConfirmation(
  outcome: 'CONFIRMED' | 'DENIED' | 'FAILED' = 'CONFIRMED',
): OrderInventoryConfirmationAdapter {
  return {
    confirm: () => Promise.resolve({ outcome, skuId: UUID5 }),
    release: () => Promise.resolve(),
  } as unknown as OrderInventoryConfirmationAdapter;
}

function createMockCustomerProfileRead(active = true): CustomerProfileReadPort {
  return {
    resolveActiveCustomer: () =>
      Promise.resolve(active ? { customerProfileId: UUID2, identityId: UUID1 } : null),
  };
}

function createMockSnapshotRead(snapshot: CartSnapshotData | null = null): OrderSnapshotReadPort {
  return {
    readCartSnapshot: () => Promise.resolve(snapshot),
  };
}

function createService(
  overrides: Partial<{
    repository: OrderRepository;
    productCatalog: OrderProductCatalogReadAdapter;
    inventoryConfirmation: OrderInventoryConfirmationAdapter;
    customerProfileRead: CustomerProfileReadPort;
    snapshotRead: OrderSnapshotReadPort;
  }> = {},
): OrderApplicationService {
  return new OrderApplicationService(
    overrides.repository ?? createMockRepository(),
    createMockLifecycle(),
    createMockClock(),
    createMockIdentifiers(),
    createMockIdempotency(),
    createMockRateLimiter(),
    overrides.productCatalog ?? createMockProductCatalog(),
    overrides.inventoryConfirmation ?? createMockInventoryConfirmation(),
    overrides.customerProfileRead ?? createMockCustomerProfileRead(),
    overrides.snapshotRead ?? createMockSnapshotRead(),
  );
}

function createValidSnapshot(overrides: Partial<CartSnapshotData> = {}): CartSnapshotData {
  return {
    snapshotId: UUID3,
    cartId: UUID4,
    customerProfileId: UUID2,
    items: [
      {
        cartLineId: UUID5,
        skuId: UUID5,
        productId: UUID6,
        skuCode: 'SKU-001',
        quantity: 3,
        unitPriceAmount: 1999,
        unitPriceCurrency: 'USD',
        snapshotTaxIncluded: true,
        productUnavailable: false,
      },
    ],
    totalLines: 1,
    totalItems: 3,
    subtotalAmountCents: 5997,
    subtotalCurrency: 'USD',
    createdAt: NOW,
    ...overrides,
  };
}

describe('OrderApplicationService', () => {
  describe('createOrder', () => {
    it('creates an order from a CartSnapshot', async () => {
      const snapshot = createValidSnapshot();
      const service = createService({
        snapshotRead: createMockSnapshotRead(snapshot),
      });

      const result = await service.createOrder({
        customerProfileId: UUID2,
        actorIdentityId: UUID1,
        snapshotId: UUID3,
        idempotencyKey: 'idem-001',
      });

      expect(result.state).toBe('PENDING');
      expect(result.totalLines).toBe(1);
      expect(result.totalItems).toBe(3);
    });

    it('throws when snapshot not found', async () => {
      const service = createService({
        snapshotRead: createMockSnapshotRead(null),
      });

      await expect(
        service.createOrder({
          customerProfileId: UUID2,
          actorIdentityId: UUID1,
          snapshotId: UUID3,
          idempotencyKey: 'idem-002',
        }),
      ).rejects.toThrow(OrderApplicationError);
    });

    it('throws when customer is not active', async () => {
      const snapshot = createValidSnapshot();
      const service = createService({
        snapshotRead: createMockSnapshotRead(snapshot),
        customerProfileRead: createMockCustomerProfileRead(false),
      });

      await expect(
        service.createOrder({
          customerProfileId: UUID2,
          actorIdentityId: UUID1,
          snapshotId: UUID3,
          idempotencyKey: 'idem-003',
        }),
      ).rejects.toThrow(OrderApplicationError);
    });

    it('throws when product is unavailable', async () => {
      const snapshot = createValidSnapshot({
        items: [
          {
            cartLineId: UUID5,
            skuId: UUID5,
            productId: UUID6,
            skuCode: 'SKU-001',
            quantity: 3,
            unitPriceAmount: 1999,
            unitPriceCurrency: 'USD',
            snapshotTaxIncluded: true,
            productUnavailable: true,
          },
        ],
      });
      const service = createService({
        snapshotRead: createMockSnapshotRead(snapshot),
      });

      await expect(
        service.createOrder({
          customerProfileId: UUID2,
          actorIdentityId: UUID1,
          snapshotId: UUID3,
          idempotencyKey: 'idem-004',
        }),
      ).rejects.toThrow(OrderApplicationError);
    });

    it('throws when SKU is unavailable', async () => {
      const snapshot = createValidSnapshot();
      const service = createService({
        snapshotRead: createMockSnapshotRead(snapshot),
        productCatalog: createMockProductCatalog({
          getConsumableSkuFacts: () => Promise.resolve(null as { skuCode: string } | null),
        }),
      });

      await expect(
        service.createOrder({
          customerProfileId: UUID2,
          actorIdentityId: UUID1,
          snapshotId: UUID3,
          idempotencyKey: 'idem-005',
        }),
      ).rejects.toThrow(OrderApplicationError);
    });

    it('throws when inventory is insufficient', async () => {
      const snapshot = createValidSnapshot();
      const service = createService({
        snapshotRead: createMockSnapshotRead(snapshot),
        inventoryConfirmation: createMockInventoryConfirmation('DENIED'),
      });

      await expect(
        service.createOrder({
          customerProfileId: UUID2,
          actorIdentityId: UUID1,
          snapshotId: UUID3,
          idempotencyKey: 'idem-006',
        }),
      ).rejects.toThrow(OrderApplicationError);
    });

    it('throws when ownership does not match', async () => {
      const snapshot = createValidSnapshot({
        customerProfileId: UUID1, // different from command
      });
      const service = createService({
        snapshotRead: createMockSnapshotRead(snapshot),
      });

      await expect(
        service.createOrder({
          customerProfileId: UUID2,
          actorIdentityId: UUID1,
          snapshotId: UUID3,
          idempotencyKey: 'idem-007',
        }),
      ).rejects.toThrow(OrderApplicationError);
    });

    it('throws when pending order already exists', async () => {
      const snapshot = createValidSnapshot();
      const existingOrder = new Order({
        orderId: new OrderId(UUID1.value),
        customerProfileId: UUID2,
        snapshotId: UUID3,
        cartId: UUID4,
        state: 'PENDING',
        totalLines: 1,
        totalItems: 3,
        subtotalAmountCents: 5997,
        subtotalCurrency: 'USD',
        aggregateVersion: new AggregateVersion(1),
        createdAt: NOW,
        updatedAt: NOW,
      });
      const service = createService({
        snapshotRead: createMockSnapshotRead(snapshot),
        repository: createMockRepository({
          findPendingByCustomerProfileId: () => Promise.resolve(existingOrder),
        }),
      });

      await expect(
        service.createOrder({
          customerProfileId: UUID2,
          actorIdentityId: UUID1,
          snapshotId: UUID3,
          idempotencyKey: 'idem-008',
        }),
      ).rejects.toThrow(OrderApplicationError);
    });
  });

  describe('readOrder', () => {
    it('reads an order by ID', async () => {
      const order = new Order({
        orderId: new OrderId(UUID1.value),
        customerProfileId: UUID2,
        snapshotId: UUID3,
        cartId: UUID4,
        state: 'PENDING',
        totalLines: 1,
        totalItems: 3,
        subtotalAmountCents: 5997,
        subtotalCurrency: 'USD',
        aggregateVersion: new AggregateVersion(1),
        createdAt: NOW,
        updatedAt: NOW,
      });
      const line = new OrderLine({
        orderLineId: new OrderLineId(UUID5.value),
        orderId: UUID1,
        cartLineId: UUID6,
        skuId: UUID5,
        productId: UUID6,
        skuCode: 'SKU-001',
        quantity: new Quantity(3),
        unitPrice: new MoneyAmount(1999, 'USD'),
        snapshotTaxIncluded: true,
        revalidated: true,
        createdAt: NOW,
        updatedAt: NOW,
      });

      const service = createService({
        repository: createMockRepository({
          findById: () => Promise.resolve(order),
          findLines: () => Promise.resolve([line]),
        }),
      });

      const result = await service.readOrder({
        orderId: UUID1,
        callerIdentityId: UUID1,
      });

      expect(result.orderId).toBe(UUID1.value);
      expect(result.state).toBe('PENDING');
      expect(result.lines).toHaveLength(1);
    });

    it('throws when order not found', async () => {
      const service = createService();
      await expect(service.readOrder({ orderId: UUID1, callerIdentityId: UUID1 })).rejects.toThrow(
        OrderApplicationError,
      );
    });
  });

  describe('cancelOrder', () => {
    it('cancels a pending order', async () => {
      const order = new Order({
        orderId: new OrderId(UUID1.value),
        customerProfileId: UUID2,
        snapshotId: UUID3,
        cartId: UUID4,
        state: 'PENDING',
        totalLines: 1,
        totalItems: 3,
        subtotalAmountCents: 5997,
        subtotalCurrency: 'USD',
        aggregateVersion: new AggregateVersion(1),
        createdAt: NOW,
        updatedAt: NOW,
      });

      const service = createService({
        repository: createMockRepository({
          findById: () => Promise.resolve(order),
        }),
      });

      const result = await service.cancelOrder({
        customerProfileId: UUID2,
        orderId: UUID1,
        actorIdentityId: UUID1,
        reasonReference: 'customer_cancelled',
        expectedVersion: 1,
        idempotencyKey: 'idem-cancel-001',
      });

      expect(result.state).toBe('CANCELLED');
    });

    it('throws when order not found', async () => {
      const service = createService();
      await expect(
        service.cancelOrder({
          customerProfileId: UUID2,
          orderId: UUID1,
          actorIdentityId: UUID1,
          reasonReference: 'customer_cancelled',
          expectedVersion: 1,
          idempotencyKey: 'idem-cancel-002',
        }),
      ).rejects.toThrow(OrderApplicationError);
    });

    it('throws when ownership does not match', async () => {
      const order = new Order({
        orderId: new OrderId(UUID1.value),
        customerProfileId: UUID1, // different from command
        snapshotId: UUID3,
        cartId: UUID4,
        state: 'PENDING',
        totalLines: 1,
        totalItems: 3,
        subtotalAmountCents: 5997,
        subtotalCurrency: 'USD',
        aggregateVersion: new AggregateVersion(1),
        createdAt: NOW,
        updatedAt: NOW,
      });

      const service = createService({
        repository: createMockRepository({
          findById: () => Promise.resolve(order),
        }),
      });

      await expect(
        service.cancelOrder({
          customerProfileId: UUID2,
          orderId: UUID1,
          actorIdentityId: UUID1,
          reasonReference: 'customer_cancelled',
          expectedVersion: 1,
          idempotencyKey: 'idem-cancel-003',
        }),
      ).rejects.toThrow(OrderApplicationError);
    });
  });
});
