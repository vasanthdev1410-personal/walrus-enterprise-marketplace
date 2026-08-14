import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { Product } from './product';
import { ProductAttributeDefinition } from './product-attribute-definition';
import { ProductAttributeValue } from './product-attribute-value';
import { ProductAuditRecord } from './product-audit-record';
import { ProductCategory } from './product-category';
import { ProductMedia } from './product-media';
import { ProductSku } from './product-sku';
import { ProductStateTransition } from './product-state-transition';
import { ProductVariant } from './product-variant';
import { Price } from '../value-objects/price';
import { SkuCode } from '../value-objects/sku-code';

const PRODUCT = new UuidV7('0191310f-789a-7123-8123-000000000101');
const SELLER = new UuidV7('0191310f-789a-7123-8123-000000000102');
const CATEGORY = new UuidV7('0191310f-789a-7123-8123-000000000103');
const IDENTITY = new UuidV7('0191310f-789a-7123-8123-000000000104');
const NOW = new Date('2026-08-14T00:00:00.000Z');

function uu(seed: string): UuidV7 {
  return new UuidV7(`0191310f-789a-7123-8123-${seed.padStart(12, '0')}`);
}

describe('Product domain entity invariants (M04-M1)', () => {
  describe('Product', () => {
    const base = {
      productId: PRODUCT,
      sellerProfileId: SELLER,
      categoryId: CATEGORY,
      name: 'Walrus Espresso Machine',
      state: 'DRAFT' as const,
      sellingPrice: new Price(249.99),
      aggregateVersion: new AggregateVersion(1),
      createdAt: NOW,
      updatedAt: NOW,
    };

    it('accepts a valid draft product', () => {
      expect(new Product(base).properties.state).toBe('DRAFT');
    });

    it('rejects an empty product name', () => {
      expect(
        () =>
          new Product({
            ...base,
            name: '   ',
          }),
      ).toThrow('Product name is required');
    });

    it('rejects a product name over 256 characters', () => {
      expect(
        () =>
          new Product({
            ...base,
            name: 'x'.repeat(257),
          }),
      ).toThrow('Product name must be at most 256 characters');
    });

    it('rejects a compare-at price below the selling price', () => {
      expect(
        () =>
          new Product({
            ...base,
            compareAtPrice: new Price(100),
          }),
      ).toThrow('Product compare-at price must not be below the selling price');
    });

    it('accepts a compare-at price at or above the selling price', () => {
      expect(
        () =>
          new Product({
            ...base,
            compareAtPrice: new Price(249.99),
          }),
      ).not.toThrow();
    });

    it('rejects timestamps before creation', () => {
      expect(
        () =>
          new Product({
            ...base,
            submittedAt: new Date('2026-08-13T00:00:00.000Z'),
          }),
      ).toThrow('Product submittedAt cannot precede createdAt');
    });
  });

  describe('ProductVariant', () => {
    const base = {
      productId: PRODUCT,
      name: 'Stainless Steel',
      state: 'DRAFT' as const,
      sellingPrice: new Price(279.99),
      aggregateVersion: new AggregateVersion(1),
      createdAt: NOW,
      updatedAt: NOW,
    };

    it('accepts a valid variant', () => {
      expect(new ProductVariant({ ...base, variantId: uu('1') }).properties.name).toBe(
        'Stainless Steel',
      );
    });

    it('rejects a variant name over 256 characters', () => {
      expect(
        () =>
          new ProductVariant({
            ...base,
            variantId: uu('1'),
            name: 'x'.repeat(257),
          }),
      ).toThrow('Variant name must be at most 256 characters');
    });

    it('rejects a compare-at price below the selling price', () => {
      expect(
        () =>
          new ProductVariant({
            ...base,
            variantId: uu('1'),
            compareAtPrice: new Price(100),
          }),
      ).toThrow('Variant compare-at price must not be below the selling price');
    });
  });

  describe('ProductSku', () => {
    const base = {
      sellerProfileId: SELLER,
      productId: PRODUCT,
      skuCode: new SkuCode('WLR-ESPRESSO-001'),
      state: 'ACTIVE' as const,
      aggregateVersion: new AggregateVersion(1),
      createdAt: NOW,
      updatedAt: NOW,
    };

    it('accepts a valid ACTIVE SKU', () => {
      expect(new ProductSku({ ...base, skuId: uu('1') }).properties.state).toBe('ACTIVE');
    });

    it('requires closedAt when closing a SKU', () => {
      expect(
        () =>
          new ProductSku({
            ...base,
            skuId: uu('1'),
            state: 'CLOSED',
          }),
      ).toThrow('Closed SKU requires closedAt');
    });

    it('rejects closedAt on an ACTIVE SKU', () => {
      expect(
        () =>
          new ProductSku({
            ...base,
            skuId: uu('1'),
            closedAt: NOW,
          }),
      ).toThrow('closedAt requires the CLOSED SKU state');
    });
  });

  describe('ProductCategory', () => {
    const base = {
      name: 'Home Appliances',
      state: 'ACTIVE' as const,
      aggregateVersion: new AggregateVersion(1),
      createdAt: NOW,
      updatedAt: NOW,
    };

    it('accepts a valid category', () => {
      expect(new ProductCategory({ ...base, categoryId: CATEGORY }).properties.name).toBe(
        'Home Appliances',
      );
    });

    it('rejects a category as its own parent', () => {
      expect(
        () =>
          new ProductCategory({
            ...base,
            categoryId: CATEGORY,
            parentCategoryId: CATEGORY,
          }),
      ).toThrow('Category cannot be its own parent');
    });

    it('requires retiredAt when retiring a category', () => {
      expect(
        () =>
          new ProductCategory({
            ...base,
            categoryId: CATEGORY,
            state: 'RETIRED',
          }),
      ).toThrow('Retired category requires retiredAt');
    });
  });

  describe('ProductAttributeDefinition', () => {
    const base = {
      name: 'Color',
      valueType: 'STRING' as const,
      required: false,
      state: 'ACTIVE' as const,
      aggregateVersion: new AggregateVersion(1),
      createdAt: NOW,
      updatedAt: NOW,
    };

    it('accepts a valid definition', () => {
      expect(
        new ProductAttributeDefinition({ ...base, attributeId: uu('1') }).properties.valueType,
      ).toBe('STRING');
    });

    it('rejects minValue above maxValue', () => {
      expect(
        () =>
          new ProductAttributeDefinition({
            ...base,
            attributeId: uu('1'),
            valueType: 'NUMBER',
            minValue: 10,
            maxValue: 5,
          }),
      ).toThrow('Attribute definition minValue must not exceed maxValue');
    });

    it('rejects an empty allowed value', () => {
      expect(
        () =>
          new ProductAttributeDefinition({
            ...base,
            attributeId: uu('1'),
            allowedValues: ['Red', '  '],
          }),
      ).toThrow('Attribute definition allowed values must not be empty');
    });

    it('requires retiredAt when retiring a definition', () => {
      expect(
        () =>
          new ProductAttributeDefinition({
            ...base,
            attributeId: uu('1'),
            state: 'RETIRED',
          }),
      ).toThrow('Retired attribute definition requires retiredAt');
    });
  });

  describe('ProductAttributeValue', () => {
    it('rejects an empty value', () => {
      expect(
        () =>
          new ProductAttributeValue({
            attributeValueId: uu('1'),
            productId: PRODUCT,
            attributeId: uu('2'),
            valueType: 'STRING',
            value: '   ',
            state: 'ACTIVE',
            aggregateVersion: new AggregateVersion(1),
            createdAt: NOW,
            updatedAt: NOW,
          }),
      ).toThrow('Attribute value is required');
    });

    it('rejects a value over 512 characters', () => {
      expect(
        () =>
          new ProductAttributeValue({
            attributeValueId: uu('1'),
            productId: PRODUCT,
            attributeId: uu('2'),
            valueType: 'STRING',
            value: 'x'.repeat(513),
            state: 'ACTIVE',
            aggregateVersion: new AggregateVersion(1),
            createdAt: NOW,
            updatedAt: NOW,
          }),
      ).toThrow('Attribute value must be at most 512 characters');
    });
  });

  describe('ProductMedia (references + digests only, D-09)', () => {
    const base = {
      productId: PRODUCT,
      mediaType: 'IMAGE' as const,
      mediaReference: 'obj:catalog/0191310f-789a-7123-8123-000000000101/img/1',
      mediaDigest: 'a'.repeat(64),
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
      uploadedByIdentityId: IDENTITY,
      state: 'ACTIVE' as const,
      aggregateVersion: new AggregateVersion(1),
      createdAt: NOW,
      updatedAt: NOW,
    };

    it('accepts a valid media record', () => {
      expect(new ProductMedia({ ...base, mediaId: uu('1') }).properties.mediaReference).toContain(
        'obj:',
      );
    });

    it('rejects a non-SHA-256 digest', () => {
      expect(
        () =>
          new ProductMedia({
            ...base,
            mediaId: uu('1'),
            mediaDigest: 'not-a-digest',
          }),
      ).toThrow('Media digest must be a SHA-256 hex digest');
    });

    it('rejects files over 10 MB', () => {
      expect(
        () =>
          new ProductMedia({
            ...base,
            mediaId: uu('1'),
            sizeBytes: 10 * 1024 * 1024 + 1,
          }),
      ).toThrow('Media size must be at most 10 MB per file');
    });

    it('rejects a missing reference', () => {
      expect(
        () =>
          new ProductMedia({
            ...base,
            mediaId: uu('1'),
            mediaReference: '   ',
          }),
      ).toThrow('Media reference is required');
    });
  });

  describe('ProductStateTransition', () => {
    const base = {
      productId: PRODUCT,
      actorIdentityId: IDENTITY,
      actorKind: 'SELLER_OWNER',
      transitionedAt: NOW,
      createdAt: NOW,
    };

    it('requires the initial transition to establish DRAFT without fromState', () => {
      expect(
        () =>
          new ProductStateTransition({
            ...base,
            productStateTransitionId: uu('1'),
            toState: 'DRAFT',
            stateVersion: 1,
          }),
      ).not.toThrow();
      expect(
        () =>
          new ProductStateTransition({
            ...base,
            productStateTransitionId: uu('1'),
            fromState: 'DRAFT',
            toState: 'SUBMITTED',
            stateVersion: 1,
          }),
      ).toThrow('Initial Product transition must establish DRAFT without fromState');
    });

    it('requires fromState on non-initial transitions', () => {
      expect(
        () =>
          new ProductStateTransition({
            ...base,
            productStateTransitionId: uu('1'),
            toState: 'SUBMITTED',
            stateVersion: 2,
          }),
      ).toThrow('Non-initial Product transition requires fromState');
    });

    it('rejects same-state transitions and non-positive versions', () => {
      expect(
        () =>
          new ProductStateTransition({
            ...base,
            productStateTransitionId: uu('1'),
            fromState: 'DRAFT',
            toState: 'DRAFT',
            stateVersion: 2,
          }),
      ).toThrow('Product state transition must change state');
      expect(
        () =>
          new ProductStateTransition({
            ...base,
            productStateTransitionId: uu('1'),
            fromState: 'DRAFT',
            toState: 'SUBMITTED',
            stateVersion: 0,
          }),
      ).toThrow('Product state version must be a positive safe integer');
    });
  });

  describe('ProductAuditRecord', () => {
    const base = {
      productId: PRODUCT,
      actorIdentityId: IDENTITY,
      occurredAt: NOW,
      createdAt: NOW,
    };

    it('accepts a valid audit record', () => {
      expect(
        new ProductAuditRecord({
          ...base,
          auditEventId: uu('1'),
          eventType: 'PRODUCT_SUBMITTED',
        }).properties.eventType,
      ).toBe('PRODUCT_SUBMITTED');
    });

    it('rejects a non-SHA-256 evidence digest', () => {
      expect(
        () =>
          new ProductAuditRecord({
            ...base,
            auditEventId: uu('1'),
            eventType: 'PRODUCT_MEDIA_RECORDED',
            evidenceDigest: 'short',
          }),
      ).toThrow('Audit evidence digest must be a SHA-256 hex digest');
    });

    it('rejects an empty event type', () => {
      expect(
        () =>
          new ProductAuditRecord({
            ...base,
            auditEventId: uu('1'),
            eventType: '   ',
          }),
      ).toThrow('Audit event type is required');
    });
  });

  describe('SkuCode (D-16 validated format)', () => {
    it('accepts valid codes', () => {
      for (const code of ['WLR-001', 'A', 'AB_CD', 'X123-456_789']) {
        expect(new SkuCode(code).value).toBe(code);
      }
    });

    it('rejects lowercase, invalid characters, and over-long codes', () => {
      expect(() => new SkuCode('wlr-001')).toThrow();
      expect(() => new SkuCode('WLR 001')).toThrow();
      expect(() => new SkuCode('WLR.001')).toThrow();
      expect(() => new SkuCode('X'.repeat(65))).toThrow();
      expect(() => new SkuCode('')).toThrow();
    });
  });

  describe('Price (D-07/D-16 bounds)', () => {
    it('accepts in-bounds prices with up to 2 decimal places', () => {
      expect(new Price(1).value).toBe(1);
      expect(new Price(249.99).value).toBe(249.99);
      expect(new Price(1_000_000).value).toBe(1_000_000);
    });

    it('rejects zero, negative, over-max, and >2-decimal prices', () => {
      expect(() => new Price(0)).toThrow('Price must be greater than 0');
      expect(() => new Price(-5)).toThrow('Price must be greater than 0');
      expect(() => new Price(1_000_000.01)).toThrow('Price must be greater than 0');
      expect(() => new Price(10.999)).toThrow('Price must have at most 2 decimal places');
    });
  });
});
