import { AggregateVersion } from '../../../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { OptimisticConcurrencyError } from '../../../../../identity-authentication/domain/shared/errors/optimistic-concurrency.error';
import { UuidV7 } from '../../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { PrismaService } from '../../../../../identity-authentication/infrastructure/persistence/prisma/prisma.service';
import { Cart } from '../../../../domain/entities/cart';
import { CartAuditRecord } from '../../../../domain/entities/cart-audit-record';
import { CartLine } from '../../../../domain/entities/cart-line';
import { CartStateTransition } from '../../../../domain/entities/cart-state-transition';
import type { CartAggregateChangeSet } from '../../../../domain/ports/cart-repository.port';
import { CartId } from '../../../../domain/value-objects/cart-id';
import { CartLineId } from '../../../../domain/value-objects/cart-line-id';
import { MoneyAmount } from '../../../../domain/value-objects/money-amount';
import { Quantity } from '../../../../domain/value-objects/quantity';
import { PrismaCartRepository } from './prisma-cart-repository';

const CART_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000001');
const PROFILE_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000002');
const SKU_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000003');
const PRODUCT_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000004');
const ACTOR_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000005');
const LINE_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000006');
const TRANSITION_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000007');
const AUDIT_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000008');
const NOW = new Date('2026-08-18T00:00:00.000Z');

function makeCart(
  state: 'ACTIVE' | 'CHECKED_OUT' | 'ARCHIVED' | 'AUTO_EXPIRED' = 'ACTIVE',
  version = 1,
): Cart {
  return new Cart({
    cartId: new CartId(CART_UUID.value),
    customerProfileId: new CartId(PROFILE_UUID.value),
    state,
    totalLines: 0,
    totalItems: 0,
    aggregateVersion: new AggregateVersion(version),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function makeLine(version = 1): CartLine {
  return new CartLine({
    cartLineId: new CartLineId(LINE_UUID.value),
    cartId: new CartId(CART_UUID.value),
    skuId: SKU_UUID,
    productId: PRODUCT_UUID,
    skuCode: 'SKU-001',
    quantity: new Quantity(2),
    unitPrice: new MoneyAmount(1999, 'USD'),
    snapshotTaxIncluded: true,
    productUnavailable: false,
    aggregateVersion: new AggregateVersion(version),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function makeTransition(): CartStateTransition {
  return new CartStateTransition({
    transitionId: TRANSITION_UUID,
    cartId: CART_UUID,
    fromState: 'ACTIVE',
    toState: 'CHECKED_OUT',
    stateVersion: 2,
    actorIdentityId: ACTOR_UUID,
    actorKind: 'CUSTOMER',
    reasonReference: 'checkout',
    transitionedAt: NOW,
    createdAt: NOW,
  });
}

function makeAuditRecord(): CartAuditRecord {
  return new CartAuditRecord({
    auditEventId: AUDIT_UUID,
    cartId: CART_UUID,
    customerProfileId: PROFILE_UUID,
    eventType: 'CART_CHECKED_OUT',
    actorIdentityId: ACTOR_UUID,
    occurredAt: NOW,
    createdAt: NOW,
  });
}

function changeSet(overrides: Partial<CartAggregateChangeSet> = {}): CartAggregateChangeSet {
  return {
    cart: makeCart('CHECKED_OUT', 2),
    linesToAppend: [],
    linesToUpdate: [],
    linesToRemove: [],
    transitionsToAppend: [makeTransition()],
    auditRecordsToAppend: [makeAuditRecord()],
    ...overrides,
  };
}

function prismaWithTx(models: Record<string, unknown>): PrismaService {
  const tx = { ...models };
  return {
    $transaction: jest.fn((callback: (tx: unknown) => Promise<unknown>) => callback(tx)),
    ...models,
  } as unknown as PrismaService;
}

describe('PrismaCartRepository (M07-M2 persistence, D-03/D-16/D-11)', () => {
  describe('reads', () => {
    it('finds a cart by customerProfileId', async () => {
      const findUnique = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
        cartId: CART_UUID.value,
        customerProfileId: PROFILE_UUID.value,
        state: 'ACTIVE',
        totalLines: 0,
        totalItems: 0,
        aggregateVersion: 1,
        createdAt: NOW,
        updatedAt: NOW,
        expiresAt: null,
        correlationId: null,
      });
      const prisma = { cart: { findUnique } } as unknown as PrismaService;
      const result = await new PrismaCartRepository(prisma).findActiveByCustomerProfileId(
        PROFILE_UUID,
      );
      expect(findUnique).toHaveBeenCalledWith({ where: { customerProfileId: PROFILE_UUID.value } });
      expect(result?.properties.state).toBe('ACTIVE');
    });

    it('finds a cart by id', async () => {
      const findUnique = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
        cartId: CART_UUID.value,
        customerProfileId: PROFILE_UUID.value,
        state: 'ACTIVE',
        totalLines: 0,
        totalItems: 0,
        aggregateVersion: 1,
        createdAt: NOW,
        updatedAt: NOW,
        expiresAt: null,
        correlationId: null,
      });
      const prisma = { cart: { findUnique } } as unknown as PrismaService;
      const result = await new PrismaCartRepository(prisma).findById(CART_UUID);
      expect(result?.properties.cartId.value).toBe(CART_UUID.value);
    });

    it('returns null when cart not found', async () => {
      const prisma = {
        cart: { findUnique: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(null) },
      } as unknown as PrismaService;
      const result = await new PrismaCartRepository(prisma).findById(CART_UUID);
      expect(result).toBeNull();
    });

    it('finds cart lines', async () => {
      const findMany = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue([
        {
          cartLineId: LINE_UUID.value,
          cartId: CART_UUID.value,
          skuId: SKU_UUID.value,
          productId: PRODUCT_UUID.value,
          skuCode: 'SKU-001',
          quantity: 2,
          unitPriceAmount: 1999,
          unitPriceCurrency: 'USD',
          snapshotTaxIncluded: true,
          productUnavailable: false,
          aggregateVersion: 1,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ]);
      const prisma = { cartLine: { findMany } } as unknown as PrismaService;
      const lines = await new PrismaCartRepository(prisma).findLines(CART_UUID);
      expect(lines).toHaveLength(1);
      expect(lines[0]?.properties.skuCode).toBe('SKU-001');
    });

    it('finds transitions', async () => {
      const findMany = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue([
        {
          transitionId: TRANSITION_UUID.value,
          cartId: CART_UUID.value,
          fromState: 'ACTIVE',
          toState: 'CHECKED_OUT',
          stateVersion: 2,
          actorIdentityId: ACTOR_UUID.value,
          actorKind: 'CUSTOMER',
          reasonReference: 'checkout',
          correlationId: null,
          causationId: null,
          sourceReference: null,
          transitionedAt: NOW,
          createdAt: NOW,
        },
      ]);
      const prisma = { cartStateTransition: { findMany } } as unknown as PrismaService;
      const transitions = await new PrismaCartRepository(prisma).findTransitions(CART_UUID);
      expect(transitions).toHaveLength(1);
      expect(transitions[0]?.properties.toState).toBe('CHECKED_OUT');
    });

    it('finds audit records', async () => {
      const findMany = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue([
        {
          auditEventId: AUDIT_UUID.value,
          cartId: CART_UUID.value,
          customerProfileId: PROFILE_UUID.value,
          eventType: 'CART_CREATED',
          actorIdentityId: ACTOR_UUID.value,
          correlationId: null,
          evidenceDigest: null,
          occurredAt: NOW,
          createdAt: NOW,
        },
      ]);
      const prisma = { cartAuditRecord: { findMany } } as unknown as PrismaService;
      const records = await new PrismaCartRepository(prisma).findAuditRecords(CART_UUID);
      expect(records).toHaveLength(1);
      expect(records[0]?.properties.eventType).toBe('CART_CREATED');
    });
  });

  describe('insert', () => {
    it('creates a new cart with transitions and audit records in a transaction', async () => {
      const create = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({});
      const prisma = prismaWithTx({
        cart: { create },
        cartLine: { create },
        cartStateTransition: { create },
        cartAuditRecord: { create },
      });

      const repo = new PrismaCartRepository(prisma);
      await repo.insert(changeSet());

      expect((prisma as unknown as { $transaction: jest.Mock }).$transaction).toHaveBeenCalledTimes(
        1,
      );
      expect(create).toHaveBeenCalledTimes(3); // cart + transition + audit
    });
  });

  describe('save with optimistic concurrency', () => {
    it('saves when version matches', async () => {
      const updateMany = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({ count: 1 });
      const create = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({});
      const prisma = prismaWithTx({
        cart: { updateMany },
        cartLine: { create },
        cartStateTransition: { create },
        cartAuditRecord: { create },
      });

      const repo = new PrismaCartRepository(prisma);
      await repo.save(changeSet(), new AggregateVersion(1));

      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            cartId: CART_UUID.value,
            aggregateVersion: 1,
          },
        }),
      );
    });

    it('throws OptimisticConcurrencyError when version is stale', async () => {
      const updateMany = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({ count: 0 });
      const prisma = prismaWithTx({
        cart: { updateMany },
        cartLine: { create: jest.fn() },
        cartStateTransition: { create: jest.fn() },
        cartAuditRecord: { create: jest.fn() },
      });

      const repo = new PrismaCartRepository(prisma);
      await expect(repo.save(changeSet(), new AggregateVersion(99))).rejects.toThrow(
        OptimisticConcurrencyError,
      );
    });

    it('updates lines in the change set', async () => {
      const updateMany = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({ count: 1 });
      const create = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({});
      const prisma = prismaWithTx({
        cart: { updateMany },
        cartLine: { create, updateMany, deleteMany: jest.fn().mockResolvedValue({}) },
        cartStateTransition: { create },
        cartAuditRecord: { create },
      });

      const repo = new PrismaCartRepository(prisma);
      const cs = changeSet({ linesToUpdate: [makeLine(2)] });
      await repo.save(cs, new AggregateVersion(1));

      expect(updateMany).toHaveBeenCalledTimes(2); // cart + line
    });

    it('removes lines in the change set', async () => {
      const updateMany = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({ count: 1 });
      const deleteMany = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({});
      const create = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({});
      const prisma = prismaWithTx({
        cart: { updateMany },
        cartLine: { create, updateMany, deleteMany },
        cartStateTransition: { create },
        cartAuditRecord: { create },
      });

      const repo = new PrismaCartRepository(prisma);
      const cs = changeSet({ linesToRemove: [LINE_UUID] });
      await repo.save(cs, new AggregateVersion(1));

      expect(deleteMany).toHaveBeenCalledWith({
        where: { cartLineId: LINE_UUID.value },
      });
    });
  });
});
