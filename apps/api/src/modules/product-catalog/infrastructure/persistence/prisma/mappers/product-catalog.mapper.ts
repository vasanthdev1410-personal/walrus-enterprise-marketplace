import type {
  Prisma,
  Product as ProductRow,
  ProductAttributeDefinition as ProductAttributeDefinitionRow,
  ProductAttributeValue as ProductAttributeValueRow,
  ProductAuditRecord as ProductAuditRecordRow,
  ProductCategory as ProductCategoryRow,
  ProductMedia as ProductMediaRow,
  ProductSku as ProductSkuRow,
  ProductStateTransition as ProductStateTransitionRow,
  ProductVariant as ProductVariantRow,
} from '../../../../../../generated/prisma/client';
import type { ProductPriceHistoryRow } from '../../../../domain/ports/product-catalog-repository.port';
import { AggregateVersion } from '../../../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { CorrelationIdentifier } from '../../../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import { UuidV7 } from '../../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { compactProperties } from '../../../../../identity-authentication/infrastructure/persistence/prisma/mappers/compact-properties';
import { Product } from '../../../../domain/entities/product';
import { ProductAttributeDefinition } from '../../../../domain/entities/product-attribute-definition';
import { ProductAttributeValue } from '../../../../domain/entities/product-attribute-value';
import { ProductAuditRecord } from '../../../../domain/entities/product-audit-record';
import { ProductCategory } from '../../../../domain/entities/product-category';
import { ProductMedia } from '../../../../domain/entities/product-media';
import { ProductSku } from '../../../../domain/entities/product-sku';
import { ProductStateTransition } from '../../../../domain/entities/product-state-transition';
import { ProductVariant } from '../../../../domain/entities/product-variant';
import { Price } from '../../../../domain/value-objects/price';
import { SkuCode } from '../../../../domain/value-objects/sku-code';

/**
 * WEMP-M04-PLAN-001 M04-M2 persistence mappers. The shared platform primitives
 * (UuidV7, AggregateVersion, CorrelationIdentifier) and the generic
 * compactProperties helper are reused from the identity-authentication module;
 * Module 04 never reads Module 01/02/03 storage. Enum columns map directly
 * because the domain unions use the identical vocabulary. Decimal price
 * columns map to the Price value object (single-currency, record-only, D-07).
 */
export const productMapper = {
  toDomain(record: ProductRow): Product {
    return new Product(
      compactProperties({
        productId: new UuidV7(record.productId),
        sellerProfileId: new UuidV7(record.sellerProfileId),
        categoryId: new UuidV7(record.categoryId),
        name: record.name,
        state: record.state,
        sellingPrice: new Price(Number(record.sellingPrice)),
        compareAtPrice:
          record.compareAtPrice === null ? undefined : new Price(Number(record.compareAtPrice)),
        aggregateVersion: new AggregateVersion(record.aggregateVersion),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        submittedAt: record.submittedAt ?? undefined,
        approvedAt: record.approvedAt ?? undefined,
        publishedAt: record.publishedAt ?? undefined,
        closedAt: record.closedAt ?? undefined,
        correlationId:
          record.correlationId === null
            ? undefined
            : new CorrelationIdentifier(record.correlationId),
      }),
    );
  },
  toPersistence(entity: Product): Prisma.ProductUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      productId: value.productId.value,
      sellerProfileId: value.sellerProfileId.value,
      categoryId: value.categoryId.value,
      name: value.name,
      state: value.state,
      sellingPrice: value.sellingPrice.value,
      compareAtPrice: value.compareAtPrice?.value,
      aggregateVersion: value.aggregateVersion.value,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      submittedAt: value.submittedAt,
      approvedAt: value.approvedAt,
      publishedAt: value.publishedAt,
      closedAt: value.closedAt,
      correlationId: value.correlationId?.value,
    });
  },
};

export const productVariantMapper = {
  toDomain(record: ProductVariantRow): ProductVariant {
    return new ProductVariant(
      compactProperties({
        variantId: new UuidV7(record.variantId),
        productId: new UuidV7(record.productId),
        name: record.name,
        state: record.state,
        sellingPrice: new Price(Number(record.sellingPrice)),
        compareAtPrice:
          record.compareAtPrice === null ? undefined : new Price(Number(record.compareAtPrice)),
        aggregateVersion: new AggregateVersion(record.aggregateVersion),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        publishedAt: record.publishedAt ?? undefined,
        correlationId: record.correlationId ?? undefined,
      }),
    );
  },
  toPersistence(entity: ProductVariant): Prisma.ProductVariantUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      variantId: value.variantId.value,
      productId: value.productId.value,
      name: value.name,
      state: value.state,
      sellingPrice: value.sellingPrice.value,
      compareAtPrice: value.compareAtPrice?.value,
      aggregateVersion: value.aggregateVersion.value,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      publishedAt: value.publishedAt,
      correlationId: value.correlationId,
    });
  },
};

export const productSkuMapper = {
  toDomain(record: ProductSkuRow): ProductSku {
    return new ProductSku(
      compactProperties({
        skuId: new UuidV7(record.skuId),
        sellerProfileId: new UuidV7(record.sellerProfileId),
        productId: new UuidV7(record.productId),
        variantId: record.variantId === null ? undefined : new UuidV7(record.variantId),
        skuCode: new SkuCode(record.skuCode),
        state: record.state,
        aggregateVersion: new AggregateVersion(record.aggregateVersion),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        closedAt: record.closedAt ?? undefined,
      }),
    );
  },
  toPersistence(entity: ProductSku): Prisma.ProductSkuUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      skuId: value.skuId.value,
      sellerProfileId: value.sellerProfileId.value,
      productId: value.productId.value,
      variantId: value.variantId?.value,
      skuCode: value.skuCode.value,
      state: value.state,
      aggregateVersion: value.aggregateVersion.value,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      closedAt: value.closedAt,
    });
  },
};

export const productCategoryMapper = {
  toDomain(record: ProductCategoryRow): ProductCategory {
    return new ProductCategory(
      compactProperties({
        categoryId: new UuidV7(record.categoryId),
        name: record.name,
        parentCategoryId:
          record.parentCategoryId === null ? undefined : new UuidV7(record.parentCategoryId),
        state: record.state,
        aggregateVersion: new AggregateVersion(record.aggregateVersion),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        retiredAt: record.retiredAt ?? undefined,
      }),
    );
  },
  toPersistence(entity: ProductCategory): Prisma.ProductCategoryUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      categoryId: value.categoryId.value,
      name: value.name,
      parentCategoryId: value.parentCategoryId?.value,
      state: value.state,
      aggregateVersion: value.aggregateVersion.value,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      retiredAt: value.retiredAt,
    });
  },
};

export const productAttributeDefinitionMapper = {
  toDomain(record: ProductAttributeDefinitionRow): ProductAttributeDefinition {
    return new ProductAttributeDefinition(
      compactProperties({
        attributeId: new UuidV7(record.attributeId),
        name: record.name,
        valueType: record.valueType,
        unit: record.unit ?? undefined,
        required: record.required,
        group: record.group ?? undefined,
        allowedValues: record.allowedValues,
        minValue: record.minValue === null ? undefined : Number(record.minValue),
        maxValue: record.maxValue === null ? undefined : Number(record.maxValue),
        state: record.state as 'ACTIVE' | 'RETIRED',
        aggregateVersion: new AggregateVersion(record.aggregateVersion),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        retiredAt: record.retiredAt ?? undefined,
      }),
    );
  },
  toPersistence(
    entity: ProductAttributeDefinition,
  ): Prisma.ProductAttributeDefinitionUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      attributeId: value.attributeId.value,
      name: value.name,
      valueType: value.valueType,
      unit: value.unit,
      required: value.required,
      group: value.group,
      allowedValues: [...(value.allowedValues ?? [])],
      minValue: value.minValue,
      maxValue: value.maxValue,
      state: value.state,
      aggregateVersion: value.aggregateVersion.value,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      retiredAt: value.retiredAt,
    });
  },
};

export const productAttributeValueMapper = {
  toDomain(record: ProductAttributeValueRow): ProductAttributeValue {
    return new ProductAttributeValue(
      compactProperties({
        attributeValueId: new UuidV7(record.attributeValueId),
        productId: new UuidV7(record.productId),
        variantId: record.variantId === null ? undefined : new UuidV7(record.variantId),
        attributeId: new UuidV7(record.attributeId),
        valueType: record.valueType,
        value: record.value,
        state: record.state,
        aggregateVersion: new AggregateVersion(record.aggregateVersion),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      }),
    );
  },
  toPersistence(entity: ProductAttributeValue): Prisma.ProductAttributeValueUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      attributeValueId: value.attributeValueId.value,
      productId: value.productId.value,
      variantId: value.variantId?.value,
      attributeId: value.attributeId.value,
      valueType: value.valueType,
      value: value.value,
      state: value.state,
      aggregateVersion: value.aggregateVersion.value,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    });
  },
};

export const productMediaMapper = {
  toDomain(record: ProductMediaRow): ProductMedia {
    return new ProductMedia(
      compactProperties({
        mediaId: new UuidV7(record.mediaId),
        productId: new UuidV7(record.productId),
        mediaType: record.mediaType,
        mediaReference: record.mediaReference,
        mediaDigest: record.mediaDigest,
        mimeType: record.mimeType,
        sizeBytes: record.sizeBytes,
        uploadedByIdentityId: new UuidV7(record.uploadedByIdentityId),
        state: record.state,
        aggregateVersion: new AggregateVersion(record.aggregateVersion),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      }),
    );
  },
  toPersistence(entity: ProductMedia): Prisma.ProductMediaUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      mediaId: value.mediaId.value,
      productId: value.productId.value,
      mediaType: value.mediaType,
      mediaReference: value.mediaReference,
      mediaDigest: value.mediaDigest,
      mimeType: value.mimeType,
      sizeBytes: value.sizeBytes,
      uploadedByIdentityId: value.uploadedByIdentityId.value,
      state: value.state,
      aggregateVersion: value.aggregateVersion.value,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    });
  },
};

export const productStateTransitionMapper = {
  toDomain(record: ProductStateTransitionRow): ProductStateTransition {
    return new ProductStateTransition(
      compactProperties({
        productStateTransitionId: new UuidV7(record.productStateTransitionId),
        productId: new UuidV7(record.productId),
        fromState: record.fromState ?? undefined,
        toState: record.toState,
        stateVersion: record.stateVersion,
        actorIdentityId: new UuidV7(record.actorIdentityId),
        actorKind: record.actorKind,
        transitionedAt: record.transitionedAt,
        createdAt: record.createdAt,
        reasonReference: record.reasonReference ?? undefined,
        correlationId:
          record.correlationId === null
            ? undefined
            : new CorrelationIdentifier(record.correlationId),
        causationId: record.causationId === null ? undefined : new UuidV7(record.causationId),
        sourceReference: record.sourceReference ?? undefined,
      }),
    );
  },
  toPersistence(entity: ProductStateTransition): Prisma.ProductStateTransitionUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      productStateTransitionId: value.productStateTransitionId.value,
      productId: value.productId.value,
      fromState: value.fromState,
      toState: value.toState,
      stateVersion: value.stateVersion,
      actorIdentityId: value.actorIdentityId.value,
      actorKind: value.actorKind,
      transitionedAt: value.transitionedAt,
      createdAt: value.createdAt,
      reasonReference: value.reasonReference,
      correlationId: value.correlationId?.value,
      causationId: value.causationId?.value,
      sourceReference: value.sourceReference,
    });
  },
};

export const productAuditRecordMapper = {
  toDomain(record: ProductAuditRecordRow): ProductAuditRecord {
    return new ProductAuditRecord(
      compactProperties({
        auditEventId: new UuidV7(record.auditEventId),
        productId: new UuidV7(record.productId),
        eventType: record.eventType,
        actorIdentityId: new UuidV7(record.actorIdentityId),
        occurredAt: record.occurredAt,
        createdAt: record.createdAt,
        correlationId:
          record.correlationId === null
            ? undefined
            : new CorrelationIdentifier(record.correlationId),
        evidenceDigest: record.evidenceDigest ?? undefined,
      }),
    );
  },
  toPersistence(entity: ProductAuditRecord): Prisma.ProductAuditRecordUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      auditEventId: value.auditEventId.value,
      productId: value.productId.value,
      eventType: value.eventType,
      actorIdentityId: value.actorIdentityId.value,
      occurredAt: value.occurredAt,
      createdAt: value.createdAt,
      correlationId: value.correlationId?.value,
      evidenceDigest: value.evidenceDigest,
    });
  },
};

export const productPriceHistoryMapper = {
  toDomain(record: ProductPriceHistoryRow): ProductPriceHistoryRow {
    return record;
  },
  toPersistence(entity: ProductPriceHistoryRow): Prisma.ProductPriceHistoryUncheckedCreateInput {
    // The Prisma row is the canonical shape for this Module 04-owned table;
    // passing it through unchanged (prices are Prisma Decimal facts).
    return entity as Prisma.ProductPriceHistoryUncheckedCreateInput;
  },
};
