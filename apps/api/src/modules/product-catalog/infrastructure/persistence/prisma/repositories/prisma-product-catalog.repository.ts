import { Injectable } from '@nestjs/common';
import type { AggregateVersion } from '../../../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { PrismaService } from '../../../../../identity-authentication/infrastructure/persistence/prisma/prisma.service';
import {
  assertVersionUpdated,
  type TransactionClient,
} from '../../../../../identity-authentication/infrastructure/persistence/prisma/repositories/repository-support';
import type { Product } from '../../../../domain/entities/product';
import type { ProductState } from '../../../../domain/value-objects/product-state';
import type { ProductAttributeDefinition } from '../../../../domain/entities/product-attribute-definition';
import type { ProductAttributeValue } from '../../../../domain/entities/product-attribute-value';
import type { ProductAuditRecord } from '../../../../domain/entities/product-audit-record';
import type { ProductCategory } from '../../../../domain/entities/product-category';
import type { ProductMedia } from '../../../../domain/entities/product-media';
import type { ProductSku } from '../../../../domain/entities/product-sku';
import type { ProductStateTransition } from '../../../../domain/entities/product-state-transition';
import type { ProductVariant } from '../../../../domain/entities/product-variant';
import type {
  ProductAggregateChangeSet,
  ProductCatalogRepository,
  ProductPriceHistoryRow,
} from '../../../../domain/ports/product-catalog-repository.port';
import {
  productAttributeDefinitionMapper,
  productAttributeValueMapper,
  productAuditRecordMapper,
  productCategoryMapper,
  productMediaMapper,
  productMapper,
  productPriceHistoryMapper,
  productSkuMapper,
  productStateTransitionMapper,
  productVariantMapper,
} from '../mappers/product-catalog.mapper';

/**
 * WEMP-M04-PLAN-001 M04-M2. Prisma implementation of the Module 04 product
 * catalog repository (WEMP-M04-SPEC-001 §17). All mutations are atomic
 * change sets guarded by the product aggregate version: save() only applies
 * when the caller's expected version is current, otherwise an
 * OptimisticConcurrencyError is raised and the whole change set rolls back
 * without mutating any state. Cross-module references (sellerProfileId) are
 * logical UUIDv7 values — this repository never reads Module 01/02/03
 * storage, and no cross-module foreign keys exist.
 */
@Injectable()
export class PrismaProductCatalogRepository implements ProductCatalogRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findById(productId: UuidV7): Promise<Product | null> {
    const record = await this.prisma.product.findUnique({
      where: { productId: productId.value },
    });
    return record === null ? null : productMapper.toDomain(record);
  }

  public async findVariants(productId: UuidV7): Promise<readonly ProductVariant[]> {
    const records = await this.prisma.productVariant.findMany({
      where: { productId: productId.value },
      orderBy: { createdAt: 'asc' },
    });
    return records.map((record) => productVariantMapper.toDomain(record));
  }

  public async findSkus(productId: UuidV7): Promise<readonly ProductSku[]> {
    const records = await this.prisma.productSku.findMany({
      where: { productId: productId.value },
      orderBy: { createdAt: 'asc' },
    });
    return records.map((record) => productSkuMapper.toDomain(record));
  }

  public async findMedia(productId: UuidV7): Promise<readonly ProductMedia[]> {
    const records = await this.prisma.productMedia.findMany({
      where: { productId: productId.value },
      orderBy: { createdAt: 'asc' },
    });
    return records.map((record) => productMediaMapper.toDomain(record));
  }

  public async findAttributeValues(productId: UuidV7): Promise<readonly ProductAttributeValue[]> {
    const records = await this.prisma.productAttributeValue.findMany({
      where: { productId: productId.value },
      orderBy: { createdAt: 'asc' },
    });
    return records.map((record) => productAttributeValueMapper.toDomain(record));
  }

  public async findTransitions(productId: UuidV7): Promise<readonly ProductStateTransition[]> {
    const records = await this.prisma.productStateTransition.findMany({
      where: { productId: productId.value },
      orderBy: { stateVersion: 'asc' },
    });
    return records.map((record) => productStateTransitionMapper.toDomain(record));
  }

  public async findAuditRecords(productId: UuidV7): Promise<readonly ProductAuditRecord[]> {
    const records = await this.prisma.productAuditRecord.findMany({
      where: { productId: productId.value },
      orderBy: { occurredAt: 'asc' },
    });
    return records.map((record) => productAuditRecordMapper.toDomain(record));
  }

  public async findPriceHistory(productId: UuidV7): Promise<readonly ProductPriceHistoryRow[]> {
    const records = await this.prisma.productPriceHistory.findMany({
      where: { productId: productId.value },
      orderBy: { recordedAt: 'asc' },
    });
    // Prisma rows carry Decimal price facts; the port row type treats the
    // price payload as opaque — conversion happens at the domain boundary.
    return records;
  }

  public async findBySeller(sellerProfileId: UuidV7): Promise<readonly Product[]> {
    const records = await this.prisma.product.findMany({
      where: { sellerProfileId: sellerProfileId.value },
      orderBy: { createdAt: 'asc' },
    });
    return records.map((record) => productMapper.toDomain(record));
  }

  public async findAll(state?: ProductState): Promise<readonly Product[]> {
    const records = await this.prisma.product.findMany({
      where: state === undefined ? {} : { state },
      orderBy: { createdAt: 'asc' },
    });
    return records.map((record) => productMapper.toDomain(record));
  }

  public async findCategory(categoryId: UuidV7): Promise<ProductCategory | null> {
    const record = await this.prisma.productCategory.findUnique({
      where: { categoryId: categoryId.value },
    });
    return record === null ? null : productCategoryMapper.toDomain(record);
  }

  public async findActiveCategories(): Promise<readonly ProductCategory[]> {
    const records = await this.prisma.productCategory.findMany({
      where: { state: 'ACTIVE' },
      orderBy: { name: 'asc' },
    });
    return records.map((record) => productCategoryMapper.toDomain(record));
  }

  public async findAttributeDefinition(
    attributeId: UuidV7,
  ): Promise<ProductAttributeDefinition | null> {
    const record = await this.prisma.productAttributeDefinition.findUnique({
      where: { attributeId: attributeId.value },
    });
    return record === null ? null : productAttributeDefinitionMapper.toDomain(record);
  }

  public async findActiveAttributeDefinitions(): Promise<readonly ProductAttributeDefinition[]> {
    const records = await this.prisma.productAttributeDefinition.findMany({
      where: { state: 'ACTIVE' },
      orderBy: { name: 'asc' },
    });
    return records.map((record) => productAttributeDefinitionMapper.toDomain(record));
  }

  public async insert(changeSet: ProductAggregateChangeSet): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.product.create({
        data: productMapper.toPersistence(changeSet.product),
      });
      await this.persistOwnedRecords(transaction, changeSet, false);
    });
  }

  public async save(
    changeSet: ProductAggregateChangeSet,
    expectedVersion: AggregateVersion,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      // Version guard: only the caller holding the current aggregate version
      // may commit. A stale or concurrent change set fails the guard, the
      // transaction rolls back, and no child record is appended.
      const updated = await transaction.product.updateMany({
        where: {
          productId: changeSet.product.properties.productId.value,
          aggregateVersion: expectedVersion.value,
        },
        data: productMapper.toPersistence(changeSet.product),
      });
      assertVersionUpdated(updated.count, 'Product');
      await this.persistOwnedRecords(transaction, changeSet, true);
    });
  }

  private async persistOwnedRecords(
    transaction: TransactionClient,
    changeSet: ProductAggregateChangeSet,
    upsert: boolean,
  ): Promise<void> {
    for (const entity of changeSet.variantsToAppend) {
      const data = productVariantMapper.toPersistence(entity);
      if (upsert)
        await transaction.productVariant.upsert({
          where: { variantId: entity.properties.variantId.value },
          create: data,
          update: data,
        });
      else await transaction.productVariant.create({ data });
    }
    for (const entity of changeSet.skusToAppend) {
      const data = productSkuMapper.toPersistence(entity);
      if (upsert)
        await transaction.productSku.upsert({
          where: { skuId: entity.properties.skuId.value },
          create: data,
          update: data,
        });
      else await transaction.productSku.create({ data });
    }
    for (const entity of changeSet.mediaToAppend) {
      const data = productMediaMapper.toPersistence(entity);
      if (upsert)
        await transaction.productMedia.upsert({
          where: { mediaId: entity.properties.mediaId.value },
          create: data,
          update: data,
        });
      else await transaction.productMedia.create({ data });
    }
    for (const entity of changeSet.attributeValuesToAppend) {
      const data = productAttributeValueMapper.toPersistence(entity);
      if (upsert)
        await transaction.productAttributeValue.upsert({
          where: { attributeValueId: entity.properties.attributeValueId.value },
          create: data,
          update: data,
        });
      else await transaction.productAttributeValue.create({ data });
    }
    // WEMP-M04-SPEC-001 §5: append-only lifecycle episodes — never updated,
    // never deleted.
    for (const entity of changeSet.transitionsToAppend) {
      await transaction.productStateTransition.create({
        data: productStateTransitionMapper.toPersistence(entity),
      });
    }
    // WEMP-M04-SPEC-001 §24: append-only business audit records committed
    // atomically with the mutation they describe.
    for (const entity of changeSet.auditRecordsToAppend) {
      await transaction.productAuditRecord.create({
        data: productAuditRecordMapper.toPersistence(entity),
      });
    }
    // WEMP-M04-SPEC-001 §10 (decision D-07): append-only price history.
    for (const entity of changeSet.priceHistoryToAppend) {
      await transaction.productPriceHistory.create({
        data: productPriceHistoryMapper.toPersistence(entity),
      });
    }
  }
}
