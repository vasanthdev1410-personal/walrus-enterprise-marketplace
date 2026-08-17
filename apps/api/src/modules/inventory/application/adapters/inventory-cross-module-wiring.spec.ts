import { Test } from '@nestjs/testing';
import type { AuthorizationApplicationService } from '../../../authorization/application/services/authorization-application.service';
import { AUTHORIZATION_APPLICATION_SERVICE } from '../../../authorization/authorization.tokens';
import type { SellerOwnershipResolverPort } from '../../../authorization/application/ports/seller-ownership-resolver.port';
import { SELLER_OWNERSHIP_RESOLVER } from '../../../authorization/authorization.tokens';
import type { ProductCatalogReadPort } from '../../../product-catalog/domain/ports/product-catalog-read.port';
import { PRODUCT_CATALOG_READ } from '../../../product-catalog/product-catalog.tokens';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import {
  INVENTORY_ADMIN_AUTHORIZATION,
  MODULE02_INVENTORY_AUTHORIZATION_CONTRACT,
  MODULE04_PRODUCT_CATALOG_READ,
} from '../../inventory.tokens';
import { Module02InventoryAdminAuthorizationAdapter } from './module02-inventory-admin-authorization.adapter';
import { Module02InventoryAuthorizationAdapter } from './module02-inventory-authorization.adapter';
import { Module04ProductCatalogReadAdapter } from './module04-product-catalog-read.adapter';

const IDENTITY = new UuidV7('01913110-789a-7123-8123-000000001101');
const SELLER = new UuidV7('01913110-789a-7123-8123-000000001102');
const SKU = new UuidV7('01913110-789a-7123-8123-000000001103');

/**
 * M05-M4 cross-module wiring (WEMP-M05-PLAN-001 M05-M4): the Module 05
 * application boundaries resolve through the real adapters backed by the
 * Module 02 ownership resolver / authorization engine and the Module 04
 * `ProductCatalogReadPort`. This spec compiles the production adapter
 * wiring with token-bound mocks for the cross-module engines (the real
 * Prisma-backed engines need a database and are covered by their own
 * module suites) and asserts the DI graph resolves the real adapter
 * classes and fails closed on every boundary.
 */
describe('M05-M4 cross-module wiring (InventoryModule boundaries)', () => {
  it('resolves the real adapters at the Module 02/04 boundary tokens', async () => {
    const moduleFixture = await Test.createTestingModule({
      providers: [
        { provide: SELLER_OWNERSHIP_RESOLVER, useValue: resolver() },
        { provide: AUTHORIZATION_APPLICATION_SERVICE, useValue: authorization() },
        { provide: PRODUCT_CATALOG_READ, useValue: catalog() },
        {
          provide: MODULE02_INVENTORY_AUTHORIZATION_CONTRACT,
          useClass: Module02InventoryAuthorizationAdapter,
        },
        { provide: MODULE04_PRODUCT_CATALOG_READ, useClass: Module04ProductCatalogReadAdapter },
        {
          provide: INVENTORY_ADMIN_AUTHORIZATION,
          useClass: Module02InventoryAdminAuthorizationAdapter,
        },
      ],
    }).compile();

    expect(moduleFixture.get(MODULE02_INVENTORY_AUTHORIZATION_CONTRACT)).toBeInstanceOf(
      Module02InventoryAuthorizationAdapter,
    );
    expect(moduleFixture.get(MODULE04_PRODUCT_CATALOG_READ)).toBeInstanceOf(
      Module04ProductCatalogReadAdapter,
    );
    expect(moduleFixture.get(INVENTORY_ADMIN_AUTHORIZATION)).toBeInstanceOf(
      Module02InventoryAdminAuthorizationAdapter,
    );
  });

  it('grants a seller operation only when the resolver confirms the OWNER association', async () => {
    const scope = {
      sellerProfileId: SELLER,
      organizationId: new UuidV7('01913110-789a-7123-8123-000000001104'),
      sellerState: 'ACTIVE' as const,
      associationRole: 'OWNER' as const,
      associationState: 'ACTIVE' as const,
    };
    const moduleFixture = await Test.createTestingModule({
      providers: [
        { provide: SELLER_OWNERSHIP_RESOLVER, useValue: resolver(scope) },
        { provide: AUTHORIZATION_APPLICATION_SERVICE, useValue: authorization() },
        { provide: PRODUCT_CATALOG_READ, useValue: catalog() },
        {
          provide: MODULE02_INVENTORY_AUTHORIZATION_CONTRACT,
          useClass: Module02InventoryAuthorizationAdapter,
        },
        { provide: MODULE04_PRODUCT_CATALOG_READ, useClass: Module04ProductCatalogReadAdapter },
        {
          provide: INVENTORY_ADMIN_AUTHORIZATION,
          useClass: Module02InventoryAdminAuthorizationAdapter,
        },
      ],
    }).compile();

    const ownership = moduleFixture.get<Module02InventoryAuthorizationAdapter>(
      MODULE02_INVENTORY_AUTHORIZATION_CONTRACT,
    );
    const facts = await ownership.resolveActiveAssociation(IDENTITY, SELLER);
    expect(facts?.associationRole).toBe('OWNER');
    expect(facts?.associationState).toBe('ACTIVE');
  });

  it('denies a seller operation when the resolver reports no association (fail closed)', async () => {
    const moduleFixture = await Test.createTestingModule({
      providers: [
        { provide: SELLER_OWNERSHIP_RESOLVER, useValue: resolver(null) },
        { provide: AUTHORIZATION_APPLICATION_SERVICE, useValue: authorization() },
        { provide: PRODUCT_CATALOG_READ, useValue: catalog() },
        {
          provide: MODULE02_INVENTORY_AUTHORIZATION_CONTRACT,
          useClass: Module02InventoryAuthorizationAdapter,
        },
        { provide: MODULE04_PRODUCT_CATALOG_READ, useClass: Module04ProductCatalogReadAdapter },
        {
          provide: INVENTORY_ADMIN_AUTHORIZATION,
          useClass: Module02InventoryAdminAuthorizationAdapter,
        },
      ],
    }).compile();

    const ownership = moduleFixture.get<Module02InventoryAuthorizationAdapter>(
      MODULE02_INVENTORY_AUTHORIZATION_CONTRACT,
    );
    await expect(ownership.resolveActiveAssociation(IDENTITY, SELLER)).resolves.toBeNull();
  });

  it('denies an admin action when the Module 02 engine denies (explicit grant only)', async () => {
    const moduleFixture = await Test.createTestingModule({
      providers: [
        { provide: SELLER_OWNERSHIP_RESOLVER, useValue: resolver() },
        { provide: AUTHORIZATION_APPLICATION_SERVICE, useValue: authorization({ granted: false }) },
        { provide: PRODUCT_CATALOG_READ, useValue: catalog() },
        {
          provide: MODULE02_INVENTORY_AUTHORIZATION_CONTRACT,
          useClass: Module02InventoryAuthorizationAdapter,
        },
        { provide: MODULE04_PRODUCT_CATALOG_READ, useClass: Module04ProductCatalogReadAdapter },
        {
          provide: INVENTORY_ADMIN_AUTHORIZATION,
          useClass: Module02InventoryAdminAuthorizationAdapter,
        },
      ],
    }).compile();

    const admin = moduleFixture.get<Module02InventoryAdminAuthorizationAdapter>(
      INVENTORY_ADMIN_AUTHORIZATION,
    );
    await expect(admin.isGranted(IDENTITY, 'inventory.adjust.admin')).resolves.toBe(false);
    await expect(admin.isGranted(IDENTITY, 'inventory.audit.view')).resolves.toBe(false);
  });

  it('resolves SKU facts through the Module 04 read port and fails closed on null', async () => {
    const facts = {
      skuId: SKU,
      sellerProfileId: SELLER,
      skuCode: 'WLR-ESPRESSO-001',
      state: 'ACTIVE' as const,
    };
    const moduleFixture = await Test.createTestingModule({
      providers: [
        { provide: SELLER_OWNERSHIP_RESOLVER, useValue: resolver() },
        { provide: AUTHORIZATION_APPLICATION_SERVICE, useValue: authorization() },
        { provide: PRODUCT_CATALOG_READ, useValue: catalog(facts) },
        {
          provide: MODULE02_INVENTORY_AUTHORIZATION_CONTRACT,
          useClass: Module02InventoryAuthorizationAdapter,
        },
        { provide: MODULE04_PRODUCT_CATALOG_READ, useClass: Module04ProductCatalogReadAdapter },
        {
          provide: INVENTORY_ADMIN_AUTHORIZATION,
          useClass: Module02InventoryAdminAuthorizationAdapter,
        },
      ],
    }).compile();

    const catalogRead = moduleFixture.get<Module04ProductCatalogReadAdapter>(
      MODULE04_PRODUCT_CATALOG_READ,
    );
    await expect(catalogRead.getConsumableSkuFact(SKU)).resolves.toEqual(facts);
    await expect(
      catalogRead.getConsumableSkuFact(new UuidV7('01913110-789a-7123-8123-000000001105')),
    ).resolves.toBeNull();
  });
});

function resolver(
  scope: Awaited<ReturnType<SellerOwnershipResolverPort['resolveSellerScope']>> = null,
): jest.Mocked<SellerOwnershipResolverPort> {
  return {
    resolveSellerScope: jest.fn().mockResolvedValue(scope),
  };
}

function authorization(
  decision: { granted: boolean } = { granted: true },
): jest.Mocked<AuthorizationApplicationService> {
  return {
    authorize: jest.fn().mockResolvedValue(decision),
  } as unknown as jest.Mocked<AuthorizationApplicationService>;
}

function catalog(
  facts: Awaited<ReturnType<ProductCatalogReadPort['getConsumableSkuFacts']>> = null,
): jest.Mocked<ProductCatalogReadPort> {
  // Module 04 fails closed: only the known SKU carries facts; every other
  // SKU (unknown / non-PUBLISHED) resolves to null.
  return {
    getConsumableSkuFacts: jest
      .fn()
      .mockImplementation((skuId: UuidV7) =>
        Promise.resolve(facts !== null && skuId.value === SKU.value ? facts : null),
      ),
  } as unknown as jest.Mocked<ProductCatalogReadPort>;
}
