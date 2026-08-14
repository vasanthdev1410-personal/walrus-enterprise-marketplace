import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { Product } from '../../domain/entities/product';
import { ProductAuditRecord } from '../../domain/entities/product-audit-record';
import { ProductMedia } from '../../domain/entities/product-media';
import { ProductStateTransition } from '../../domain/entities/product-state-transition';
import { ProductVariant } from '../../domain/entities/product-variant';
import type { ProductCatalogRepository } from '../../domain/ports/product-catalog-repository.port';
import type { Module02SellerAuthorizationContractPort } from '../../domain/ports/module-02-03-contract.port';
import { Price } from '../../domain/value-objects/price';
/* Jest verifies injected mock methods by reference. */
/* eslint-disable @typescript-eslint/unbound-method */
import { ProductApplicationError } from '../errors/product-application.error';
import type { ProductAdminAuthorizationPort } from '../ports/product-admin-authorization.port';
import { ProductReadApplicationService } from './product-read-application.service';

const PRODUCT_ID = new UuidV7('01913110-789a-7123-8123-000000000401');
const SELLER_ID = new UuidV7('01913110-789a-7123-8123-000000000402');
const OTHER_SELLER_ID = new UuidV7('01913110-789a-7123-8123-000000000403');
const CATEGORY_ID = new UuidV7('01913110-789a-7123-8123-000000000404');
const OWNER = new UuidV7('01913110-789a-7123-8123-000000000405');
const ADMIN = new UuidV7('01913110-789a-7123-8123-000000000406');
const VARIANT_ID = new UuidV7('01913110-789a-7123-8123-000000000407');
const MEDIA_ID = new UuidV7('01913110-789a-7123-8123-000000000409');
const TRANSITION_ID = new UuidV7('01913110-789a-7123-8123-000000000410');
const AUDIT_ID = new UuidV7('01913110-789a-7123-8123-000000000411');
const NOW = new Date('2026-08-14T00:00:00.000Z');

function activeOwner(): {
  identityId: UuidV7;
  sellerProfileId: UuidV7;
  associationRole: 'OWNER';
  associationState: 'ACTIVE';
} {
  return {
    identityId: OWNER,
    sellerProfileId: SELLER_ID,
    associationRole: 'OWNER' as const,
    associationState: 'ACTIVE' as const,
  };
}

function product(seller = SELLER_ID, state = 'DRAFT' as const): Product {
  return new Product({
    productId: PRODUCT_ID,
    sellerProfileId: seller,
    categoryId: CATEGORY_ID,
    name: 'Walrus Espresso Machine',
    state,
    sellingPrice: new Price(249.99),
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function repositoryMock(
  overrides: Partial<ProductCatalogRepository> = {},
): jest.Mocked<ProductCatalogRepository> {
  const base: Partial<ProductCatalogRepository> = {
    findBySeller: jest.fn().mockResolvedValue([]),
    findAll: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    findVariants: jest.fn().mockResolvedValue([]),
    findSkus: jest.fn().mockResolvedValue([]),
    findMedia: jest.fn().mockResolvedValue([]),
    findTransitions: jest.fn().mockResolvedValue([]),
    findAuditRecords: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
  return base as unknown as jest.Mocked<ProductCatalogRepository>;
}

function module02Mock(
  overrides: Partial<Module02SellerAuthorizationContractPort> = {},
): jest.Mocked<Module02SellerAuthorizationContractPort> {
  return {
    resolveActiveAssociation: jest.fn().mockResolvedValue(activeOwner()),
    isSellerEligibleToList: jest.fn().mockResolvedValue({ identityId: OWNER, eligible: true }),
    ...overrides,
  } as unknown as jest.Mocked<Module02SellerAuthorizationContractPort>;
}

function adminAuthMock(granted = true): jest.Mocked<ProductAdminAuthorizationPort> {
  return {
    isGranted: jest.fn().mockResolvedValue(granted),
  };
}

function service(
  repository: ProductCatalogRepository,
  module02: Module02SellerAuthorizationContractPort,
  adminAuthorization: ProductAdminAuthorizationPort,
): ProductReadApplicationService {
  return new ProductReadApplicationService(repository, module02, adminAuthorization);
}

describe('ProductReadApplicationService (M04-M5, WEMP-M04-SPEC-001 §18)', () => {
  describe('seller self-service reads', () => {
    it('lists only the caller-owned seller products (non-enumerating)', async () => {
      const repository = repositoryMock({ findBySeller: jest.fn().mockResolvedValue([product()]) });
      const module02 = module02Mock();
      const read = service(repository, module02, adminAuthMock());

      const entries = await read.listOwnProducts(SELLER_ID, OWNER);

      expect(entries).toHaveLength(1);
      expect(entries[0]?.productId).toBe(PRODUCT_ID.value);
      expect(repository.findBySeller).toHaveBeenCalledWith(SELLER_ID);
    });

    it('denies listing when the caller has no ACTIVE association (fail closed)', async () => {
      const repository = repositoryMock();
      const module02 = module02Mock({
        resolveActiveAssociation: jest.fn().mockResolvedValue(null),
      });
      const read = service(repository, module02, adminAuthMock());

      await expect(read.listOwnProducts(SELLER_ID, OWNER)).rejects.toBeInstanceOf(
        ProductApplicationError,
      );
      expect(repository.findBySeller).not.toHaveBeenCalled();
    });

    it('reads own product detail with variants, SKUs and media', async () => {
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(product()),
        findVariants: jest.fn().mockResolvedValue([
          new ProductVariant({
            variantId: VARIANT_ID,
            productId: PRODUCT_ID,
            name: 'Stainless Steel',
            state: 'DRAFT',
            sellingPrice: new Price(259.99),
            aggregateVersion: new AggregateVersion(1),
            createdAt: NOW,
            updatedAt: NOW,
          }),
        ]),
        findSkus: jest.fn().mockResolvedValue([]),
        findMedia: jest.fn().mockResolvedValue([]),
      });
      const read = service(repository, module02Mock(), adminAuthMock());

      const detail = await read.getOwnProductDetail(PRODUCT_ID, SELLER_ID, OWNER);

      expect(detail.productId).toBe(PRODUCT_ID.value);
      expect(detail.variants[0]?.name).toBe('Stainless Steel');
    });

    it('hides another seller product as not found (cross-seller isolation)', async () => {
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(product(OTHER_SELLER_ID)),
      });
      const read = service(repository, module02Mock(), adminAuthMock());

      await expect(read.getOwnProductDetail(PRODUCT_ID, SELLER_ID, OWNER)).rejects.toThrow(
        'PRODUCT_NOT_FOUND',
      );
    });

    it('hides another seller media as not found (cross-seller isolation)', async () => {
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(product(OTHER_SELLER_ID)),
      });
      const read = service(repository, module02Mock(), adminAuthMock());

      await expect(read.listOwnMediaMetadata(PRODUCT_ID, SELLER_ID, OWNER)).rejects.toThrow(
        'PRODUCT_NOT_FOUND',
      );
      expect(repository.findMedia).not.toHaveBeenCalled();
    });

    it('returns only media metadata for the own product', async () => {
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(product()),
        findMedia: jest.fn().mockResolvedValue([
          new ProductMedia({
            mediaId: MEDIA_ID,
            productId: PRODUCT_ID,
            mediaType: 'IMAGE',
            mediaReference: 'https://media.example.test/objects/x.webp',
            mediaDigest: 'a'.repeat(64),
            mimeType: 'image/webp',
            sizeBytes: 1024,
            uploadedByIdentityId: OWNER,
            state: 'ACTIVE',
            aggregateVersion: new AggregateVersion(1),
            createdAt: NOW,
            updatedAt: NOW,
          }),
        ]),
      });
      const read = service(repository, module02Mock(), adminAuthMock());

      const media = await read.listOwnMediaMetadata(PRODUCT_ID, SELLER_ID, OWNER);

      expect(media).toHaveLength(1);
      expect(media[0]?.mediaDigest).toBe('a'.repeat(64));
    });
  });

  describe('admin reads', () => {
    it('lists all products for product.audit.view with optional state filter', async () => {
      const repository = repositoryMock({ findAll: jest.fn().mockResolvedValue([product()]) });
      const read = service(repository, module02Mock(), adminAuthMock());

      const all = await read.listAllProducts(ADMIN);
      await read.listAllProducts(ADMIN, 'SUBMITTED');

      expect(all).toHaveLength(1);
      expect(repository.findAll).toHaveBeenNthCalledWith(1, undefined);
      expect(repository.findAll).toHaveBeenNthCalledWith(2, 'SUBMITTED');
    });

    it('denies admin listing without the product.audit.view grant (fail closed)', async () => {
      const repository = repositoryMock();
      const read = service(repository, module02Mock(), adminAuthMock(false));

      await expect(read.listAllProducts(ADMIN)).rejects.toThrow(
        'PRODUCT_ADMIN_AUTHORIZATION_DENIED',
      );
      expect(repository.findAll).not.toHaveBeenCalled();
    });

    it('fails closed when the admin product does not exist', async () => {
      const repository = repositoryMock({ findById: jest.fn().mockResolvedValue(null) });
      const read = service(repository, module02Mock(), adminAuthMock());

      await expect(read.getAdminProductDetail(ADMIN, PRODUCT_ID)).rejects.toThrow(
        'PRODUCT_NOT_FOUND',
      );
    });

    it('fails closed when admin media inspection targets an unknown product', async () => {
      const repository = repositoryMock({ findById: jest.fn().mockResolvedValue(null) });
      const read = service(repository, module02Mock(), adminAuthMock());

      await expect(read.listAdminMediaMetadata(ADMIN, PRODUCT_ID)).rejects.toThrow(
        'PRODUCT_NOT_FOUND',
      );
    });

    it('returns product detail with append-only transitions and audit', async () => {
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(product()),
        findTransitions: jest.fn().mockResolvedValue([
          new ProductStateTransition({
            productStateTransitionId: TRANSITION_ID,
            productId: PRODUCT_ID,
            toState: 'DRAFT',
            stateVersion: 1,
            actorIdentityId: OWNER,
            actorKind: 'SELLER_OWNER',
            transitionedAt: NOW,
            createdAt: NOW,
          }),
        ]),
        findAuditRecords: jest.fn().mockResolvedValue([
          new ProductAuditRecord({
            auditEventId: AUDIT_ID,
            productId: PRODUCT_ID,
            eventType: 'PRODUCT_CREATED',
            actorIdentityId: OWNER,
            occurredAt: NOW,
            createdAt: NOW,
          }),
        ]),
      });
      const read = service(repository, module02Mock(), adminAuthMock());

      const detail = await read.getAdminProductDetail(ADMIN, PRODUCT_ID);

      expect(detail.transitions[0]?.toState).toBe('DRAFT');
      expect(detail.audit[0]?.eventType).toBe('PRODUCT_CREATED');
    });

    it('denies media inspection without the product.media.read grant', async () => {
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(product()),
      });
      const read = service(repository, module02Mock(), adminAuthMock(false));

      await expect(read.listAdminMediaMetadata(ADMIN, PRODUCT_ID)).rejects.toThrow(
        'PRODUCT_ADMIN_AUTHORIZATION_DENIED',
      );
    });
  });
});
