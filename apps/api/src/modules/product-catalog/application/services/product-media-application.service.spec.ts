import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type {
  ClockPort,
  UuidV7GenerationPort,
} from '../../../identity-authentication/application/ports/application-runtime.port';
import { Product } from '../../domain/entities/product';
import { ProductCategory } from '../../domain/entities/product-category';
import { ProductMedia } from '../../domain/entities/product-media';
import { ProductCatalogPolicy } from '../../domain/policy/product-catalog.policy';
import type { ProductCatalogRepository } from '../../domain/ports/product-catalog-repository.port';
import type { Module02SellerAuthorizationContractPort } from '../../domain/ports/module-02-03-contract.port';
import { Price } from '../../domain/value-objects/price';
import type { ProductMediaStoragePort } from '../ports/product-media-storage.port';
import type { SellerAssociationFacts } from '../../domain/ports/module-02-03-contract.port';
import {
  ProductCategoryReadService,
  ProductMediaApplicationService,
} from './product-media-application.service';

/* Jest verifies injected mock methods by reference. */
/* eslint-disable @typescript-eslint/unbound-method */

const PRODUCT_ID = new UuidV7('01913110-789a-7123-8123-000000000601');
const SELLER_ID = new UuidV7('01913110-789a-7123-8123-000000000602');
const CATEGORY_ID = new UuidV7('01913110-789a-7123-8123-000000000603');
const OWNER = new UuidV7('01913110-789a-7123-8123-000000000604');
const NOW = new Date('2026-08-14T00:00:00.000Z');

const DIGEST = 'a'.repeat(64);
const MEDIA_REFERENCE = 'r2://product-media/01913110-789a-7123-8123-000000000605';

let idSeed = 0;
const identifiers: UuidV7GenerationPort = {
  next: () => new UuidV7(`01913110-789a-7123-8123-${String(++idSeed).padStart(12, '0')}`),
};
const clock: ClockPort = { now: () => NOW };

function ownerFacts(): SellerAssociationFacts {
  return {
    identityId: OWNER,
    sellerProfileId: SELLER_ID,
    associationRole: 'OWNER',
    associationState: 'ACTIVE',
  };
}

function repositoryMock(
  overrides: Partial<ProductCatalogRepository> = {},
): jest.Mocked<ProductCatalogRepository> {
  const base: Partial<ProductCatalogRepository> = {
    save: jest.fn().mockResolvedValue(undefined),
    findMedia: jest.fn().mockResolvedValue([]),
    findActiveCategories: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
  return base as unknown as jest.Mocked<ProductCatalogRepository>;
}

function storageMock(verified = true): jest.Mocked<ProductMediaStoragePort> {
  return {
    verifyMediaIntegrity: jest.fn().mockResolvedValue(verified),
    deleteMedia: jest.fn().mockResolvedValue(undefined),
  };
}

function draftProduct(): Product {
  return new Product({
    productId: PRODUCT_ID,
    sellerProfileId: SELLER_ID,
    categoryId: CATEGORY_ID,
    name: 'Walrus Espresso Machine',
    state: 'DRAFT',
    sellingPrice: new Price(249.99),
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function existingMedia(seed: number): ProductMedia {
  return new ProductMedia({
    mediaId: new UuidV7(`01913110-789a-7123-8123-${String(seed).padStart(12, '0')}`),
    productId: PRODUCT_ID,
    mediaType: 'IMAGE',
    mediaReference: `${MEDIA_REFERENCE}-${String(seed)}`,
    mediaDigest: DIGEST,
    mimeType: 'image/jpeg',
    sizeBytes: 1024,
    uploadedByIdentityId: OWNER,
    state: 'ACTIVE',
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function service(
  repository: ProductCatalogRepository,
  storage: ProductMediaStoragePort = storageMock(),
  module02: Partial<Module02SellerAuthorizationContractPort> = {
    resolveActiveAssociation: jest.fn().mockResolvedValue(ownerFacts()),
  },
): ProductMediaApplicationService {
  return new ProductMediaApplicationService(
    repository,
    module02 as unknown as Module02SellerAuthorizationContractPort,
    new ProductCatalogPolicy(),
    storage,
    clock,
    identifiers,
  );
}

describe('ProductMediaApplicationService (M04-M3, WEMP-M04-PLAN-001)', () => {
  describe('recordMediaReference', () => {
    it('records a media reference + digest after integrity verification (D-09)', async () => {
      const repository = repositoryMock({ findById: jest.fn().mockResolvedValue(draftProduct()) });
      const mediaService = service(repository, storageMock(true));

      const result = await mediaService.recordMediaReference({
        productId: PRODUCT_ID,
        actorIdentityId: OWNER,
        expectedVersion: 1,
        mediaReference: MEDIA_REFERENCE,
        mediaDigest: DIGEST,
        mimeType: 'image/jpeg',
        sizeBytes: 2048,
      });

      expect(result.productId).toBe(PRODUCT_ID.value);
      const changeSet = repository.save.mock.calls[0]?.[0];
      expect(changeSet?.mediaToAppend).toHaveLength(1);
      expect(changeSet?.mediaToAppend[0]?.properties.mediaReference).toBe(MEDIA_REFERENCE);
      expect(changeSet?.mediaToAppend[0]?.properties.mediaDigest).toBe(DIGEST);
      expect(changeSet?.auditRecordsToAppend[0]?.properties.evidenceDigest).toBe(DIGEST);
    });

    it('fails closed when integrity verification fails (no reference recorded)', async () => {
      const repository = repositoryMock({ findById: jest.fn().mockResolvedValue(draftProduct()) });
      const mediaService = service(repository, storageMock(false));

      await expect(
        mediaService.recordMediaReference({
          productId: PRODUCT_ID,
          actorIdentityId: OWNER,
          expectedVersion: 1,
          mediaReference: MEDIA_REFERENCE,
          mediaDigest: DIGEST,
          mimeType: 'image/jpeg',
          sizeBytes: 2048,
        }),
      ).rejects.toThrow('PRODUCT_MEDIA_INTEGRITY_FAILED');
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('denies non-OWNER uploads (management is owner-only, D-01)', async () => {
      const repository = repositoryMock({ findById: jest.fn().mockResolvedValue(draftProduct()) });
      const memberModule02 = {
        resolveActiveAssociation: jest.fn().mockResolvedValue({
          identityId: new UuidV7('01913110-789a-7123-8123-000000000606'),
          sellerProfileId: SELLER_ID,
          associationRole: 'MEMBER',
          associationState: 'ACTIVE',
        }),
      };
      const mediaService = service(repository, storageMock(true), memberModule02);

      await expect(
        mediaService.recordMediaReference({
          productId: PRODUCT_ID,
          actorIdentityId: new UuidV7('01913110-789a-7123-8123-000000000606'),
          expectedVersion: 1,
          mediaReference: MEDIA_REFERENCE,
          mediaDigest: DIGEST,
          mimeType: 'image/jpeg',
          sizeBytes: 2048,
        }),
      ).rejects.toThrow('PRODUCT_OWNERSHIP_DENIED');
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('rejects a disallowed MIME type (allowlist, D-16)', async () => {
      const repository = repositoryMock({ findById: jest.fn().mockResolvedValue(draftProduct()) });
      const mediaService = service(repository);

      await expect(
        mediaService.recordMediaReference({
          productId: PRODUCT_ID,
          actorIdentityId: OWNER,
          expectedVersion: 1,
          mediaReference: MEDIA_REFERENCE,
          mediaDigest: DIGEST,
          mimeType: 'application/x-msdownload',
          sizeBytes: 1024,
        }),
      ).rejects.toThrow('PRODUCT_INVALID_MEDIA');
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('denies a file over 10 MB (D-16 — entity invariant fails closed first)', async () => {
      const repository = repositoryMock({ findById: jest.fn().mockResolvedValue(draftProduct()) });
      const mediaService = service(repository);

      await expect(
        mediaService.recordMediaReference({
          productId: PRODUCT_ID,
          actorIdentityId: OWNER,
          expectedVersion: 1,
          mediaReference: MEDIA_REFERENCE,
          mediaDigest: DIGEST,
          mimeType: 'image/jpeg',
          sizeBytes: 10 * 1024 * 1024 + 1,
        }),
      ).rejects.toThrow('Media size must be at most 10 MB per file');
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('rejects an 11th image per product (max 10, D-16)', async () => {
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(draftProduct()),
        findMedia: jest
          .fn()
          .mockResolvedValue(Array.from({ length: 10 }, (_, index) => existingMedia(700 + index))),
      });
      const mediaService = service(repository);

      await expect(
        mediaService.recordMediaReference({
          productId: PRODUCT_ID,
          actorIdentityId: OWNER,
          expectedVersion: 1,
          mediaReference: MEDIA_REFERENCE,
          mediaDigest: DIGEST,
          mimeType: 'image/jpeg',
          sizeBytes: 1024,
        }),
      ).rejects.toThrow('PRODUCT_INVALID_MEDIA');
      expect(repository.save).not.toHaveBeenCalled();
    });
  });

  describe('ProductCategoryReadService', () => {
    it('returns ACTIVE platform categories as summaries (D-03)', async () => {
      const repository = repositoryMock({
        findActiveCategories: jest.fn().mockResolvedValue([
          new ProductCategory({
            categoryId: CATEGORY_ID,
            name: 'Home Appliances',
            state: 'ACTIVE',
            aggregateVersion: new AggregateVersion(1),
            createdAt: NOW,
            updatedAt: NOW,
          }),
        ]),
      });
      const readService = new ProductCategoryReadService(repository);

      const categories = await readService.findActiveCategories();

      expect(categories).toHaveLength(1);
      expect(categories[0]).toEqual({
        categoryId: CATEGORY_ID.value,
        name: 'Home Appliances',
        parentCategoryId: undefined,
        state: 'ACTIVE',
      });
    });
  });
});
