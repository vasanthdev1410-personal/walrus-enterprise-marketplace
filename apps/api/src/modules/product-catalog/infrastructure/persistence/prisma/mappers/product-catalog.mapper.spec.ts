import { AggregateVersion } from '../../../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { CorrelationIdentifier } from '../../../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import { UuidV7 } from '../../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { Product } from '../../../../domain/entities/product';
import { Price } from '../../../../domain/value-objects/price';
import {
  productAttributeDefinitionMapper,
  productAttributeValueMapper,
  productAuditRecordMapper,
  productCategoryMapper,
  productMapper,
  productMediaMapper,
  productSkuMapper,
  productStateTransitionMapper,
  productVariantMapper,
} from './product-catalog.mapper';

const ID = new UuidV7('01913110-789a-7123-8123-000000000701');
const PARENT_ID = new UuidV7('01913110-789a-7123-8123-000000000702');
const NOW = new Date('2026-08-14T00:00:00.000Z');
const DIGEST = 'a'.repeat(64);
const CORR = new UuidV7('01913110-789a-7123-8123-000000000703').value;

function productRow(overrides: Partial<Record<string, unknown>> = {}): never {
  return {
    productId: ID.value,
    sellerProfileId: ID.value,
    categoryId: ID.value,
    name: 'Walrus Espresso Machine',
    state: 'PUBLISHED',
    sellingPrice: '249.99',
    compareAtPrice: null,
    aggregateVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    submittedAt: null,
    approvedAt: null,
    publishedAt: null,
    closedAt: null,
    correlationId: null,
    ...overrides,
  } as never;
}

describe('product-catalog mappers (M04-M2, WEMP-M04-PLAN-001)', () => {
  it('roundtrips a Product with every optional field populated', () => {
    const row = productRow({
      compareAtPrice: '299.99',
      submittedAt: NOW,
      approvedAt: NOW,
      publishedAt: NOW,
      closedAt: NOW,
      correlationId: CORR,
    });
    const domain = productMapper.toDomain(row);
    expect(domain.properties.compareAtPrice?.value).toBe(299.99);
    expect(domain.properties.publishedAt).toEqual(NOW);
    expect(domain.properties.correlationId?.value).toBe(CORR);
    const persistence = productMapper.toPersistence(domain) as Record<string, unknown>;
    expect(persistence.sellingPrice).toBe(249.99);
    expect(persistence.compareAtPrice).toBe(299.99);
    expect(persistence.correlationId).toBe(CORR);
  });

  it('roundtrips a ProductVariant with compareAtPrice and publishedAt', () => {
    const row = {
      variantId: ID.value,
      productId: ID.value,
      name: 'Stainless Steel',
      state: 'PUBLISHED',
      sellingPrice: '299.99',
      compareAtPrice: '349.99',
      aggregateVersion: 1,
      createdAt: NOW,
      updatedAt: NOW,
      publishedAt: NOW,
      correlationId: CORR,
    } as never;
    const domain = productVariantMapper.toDomain(row);
    expect(domain.properties.compareAtPrice?.value).toBe(349.99);
    expect(domain.properties.publishedAt).toEqual(NOW);
    const persistence = productVariantMapper.toPersistence(domain) as Record<string, unknown>;
    expect(persistence.compareAtPrice).toBe(349.99);
    expect(persistence.publishedAt).toEqual(NOW);
    expect(persistence.correlationId).toBe(CORR);
  });

  it('roundtrips a ProductSku bound to a variant with a closedAt', () => {
    const row = {
      skuId: ID.value,
      sellerProfileId: ID.value,
      productId: ID.value,
      variantId: ID.value,
      skuCode: 'WLR-ESPRESSO-SS',
      state: 'CLOSED',
      aggregateVersion: 2,
      createdAt: NOW,
      updatedAt: NOW,
      closedAt: NOW,
    } as never;
    const domain = productSkuMapper.toDomain(row);
    expect(domain.properties.variantId?.value).toBe(ID.value);
    expect(domain.properties.closedAt).toEqual(NOW);
    const persistence = productSkuMapper.toPersistence(domain) as Record<string, unknown>;
    expect(persistence.variantId).toBe(ID.value);
    expect(persistence.closedAt).toEqual(NOW);
  });

  it('roundtrips a ProductCategory with a parent and retiredAt', () => {
    const row = {
      categoryId: ID.value,
      name: 'Espresso Machines',
      parentCategoryId: PARENT_ID.value,
      state: 'ACTIVE',
      aggregateVersion: 1,
      createdAt: NOW,
      updatedAt: NOW,
      retiredAt: null,
    } as never;
    const domain = productCategoryMapper.toDomain(row);
    expect(domain.properties.parentCategoryId?.value).toBe(PARENT_ID.value);
    const persistence = productCategoryMapper.toPersistence(domain) as Record<string, unknown>;
    expect(persistence.parentCategoryId).toBe(PARENT_ID.value);
  });

  it('roundtrips a ProductAttributeDefinition with bounds, unit and group', () => {
    const row = {
      attributeId: ID.value,
      name: 'Capacity (L)',
      valueType: 'NUMBER',
      unit: 'L',
      required: true,
      group: 'technical',
      allowedValues: [],
      minValue: '1',
      maxValue: '20',
      state: 'ACTIVE',
      aggregateVersion: 1,
      createdAt: NOW,
      updatedAt: NOW,
      retiredAt: null,
    } as never;
    const domain = productAttributeDefinitionMapper.toDomain(row);
    expect(domain.properties.minValue).toBe(1);
    expect(domain.properties.maxValue).toBe(20);
    expect(domain.properties.unit).toBe('L');
    const persistence = productAttributeDefinitionMapper.toPersistence(domain);
    expect(persistence.minValue).toBe(1);
    expect(persistence.maxValue).toBe(20);
  });

  it('roundtrips a ProductAttributeValue bound to a variant', () => {
    const row = {
      attributeValueId: ID.value,
      productId: ID.value,
      variantId: ID.value,
      attributeId: ID.value,
      valueType: 'NUMBER',
      value: '5',
      state: 'ACTIVE',
      aggregateVersion: 1,
      createdAt: NOW,
      updatedAt: NOW,
    } as never;
    const domain = productAttributeValueMapper.toDomain(row);
    expect(domain.properties.variantId?.value).toBe(ID.value);
    const persistence = productAttributeValueMapper.toPersistence(domain);
    expect(persistence.variantId).toBe(ID.value);
  });

  it('roundtrips a ProductMedia reference record', () => {
    const row = {
      mediaId: ID.value,
      productId: ID.value,
      mediaType: 'IMAGE',
      mediaReference: 'r2://product-media/1',
      mediaDigest: DIGEST,
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
      uploadedByIdentityId: ID.value,
      state: 'ACTIVE',
      aggregateVersion: 1,
      createdAt: NOW,
      updatedAt: NOW,
    } as never;
    const domain = productMediaMapper.toDomain(row);
    expect(domain.properties.mediaDigest).toBe(DIGEST);
    const persistence = productMediaMapper.toPersistence(domain);
    expect(persistence.mediaReference).toBe('r2://product-media/1');
  });

  it('roundtrips a ProductStateTransition with reason, correlation and causation', () => {
    const row = {
      productStateTransitionId: ID.value,
      productId: ID.value,
      fromState: 'UNDER_REVIEW',
      toState: 'APPROVED',
      stateVersion: 3,
      actorIdentityId: ID.value,
      actorKind: 'ADMIN_APPROVER',
      transitionedAt: NOW,
      createdAt: NOW,
      reasonReference: 'ok',
      correlationId: CORR,
      causationId: ID.value,
      sourceReference: 'req-1',
    } as never;
    const domain = productStateTransitionMapper.toDomain(row);
    expect(domain.properties.correlationId?.value).toBe(CORR);
    expect(domain.properties.causationId?.value).toBe(ID.value);
    expect(domain.properties.sourceReference).toBe('req-1');
    const persistence = productStateTransitionMapper.toPersistence(domain);
    expect(persistence.correlationId).toBe(CORR);
    expect(persistence.causationId).toBe(ID.value);
  });

  it('roundtrips a ProductAuditRecord with correlation and evidence digest', () => {
    const row = {
      auditEventId: ID.value,
      productId: ID.value,
      eventType: 'PRODUCT_MEDIA_RECORDED',
      actorIdentityId: ID.value,
      occurredAt: NOW,
      createdAt: NOW,
      correlationId: CORR,
      evidenceDigest: DIGEST,
    } as never;
    const domain = productAuditRecordMapper.toDomain(row);
    expect(domain.properties.evidenceDigest).toBe(DIGEST);
    const persistence = productAuditRecordMapper.toPersistence(domain);
    expect(persistence.correlationId).toBe(CORR);
    expect(persistence.evidenceDigest).toBe(DIGEST);
  });

  it('maps a Price value object with decimal precision (D-07)', () => {
    const entity = new Product({
      productId: ID,
      sellerProfileId: ID,
      categoryId: ID,
      name: 'Priced',
      state: 'DRAFT',
      sellingPrice: new Price(1234.56),
      compareAtPrice: new Price(1500),
      aggregateVersion: new AggregateVersion(1),
      createdAt: NOW,
      updatedAt: NOW,
      correlationId: new CorrelationIdentifier(CORR),
    });
    const persistence = productMapper.toPersistence(entity) as Record<string, unknown>;
    expect(persistence.sellingPrice).toBe(1234.56);
    expect(persistence.compareAtPrice).toBe(1500);
    expect(persistence.correlationId).toBe(CORR);
  });
});
