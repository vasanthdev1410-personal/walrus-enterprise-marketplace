import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { Product } from '../entities/product';
import { ProductAttributeDefinition } from '../entities/product-attribute-definition';
import { ProductAttributeValue } from '../entities/product-attribute-value';
import { ProductCategory } from '../entities/product-category';
import { ProductMedia } from '../entities/product-media';
import { ProductSku } from '../entities/product-sku';
import { ProductCatalogPolicy } from './product-catalog.policy';
import { Price } from '../value-objects/price';
import { SkuCode } from '../value-objects/sku-code';

const PRODUCT = new UuidV7('0191310f-789a-7123-8123-000000000101');
const SELLER = new UuidV7('0191310f-789a-7123-8123-000000000102');
const CATEGORY = new UuidV7('0191310f-789a-7123-8123-000000000103');
const OTHER_SELLER = new UuidV7('0191310f-789a-7123-8123-000000000109');
const IDENTITY = new UuidV7('0191310f-789a-7123-8123-000000000104');
const NOW = new Date('2026-08-14T00:00:00.000Z');

function uu(seed: string): UuidV7 {
  return new UuidV7(`0191310f-789a-7123-8123-${seed.padStart(12, '0')}`);
}

function product(): Product {
  return new Product({
    productId: PRODUCT,
    sellerProfileId: SELLER,
    categoryId: CATEGORY,
    name: 'Walrus Espresso Machine',
    state: 'DRAFT',
    sellingPrice: new Price(249.99),
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function sku(code: string, seller = SELLER, skuId = uu('20')): ProductSku {
  return new ProductSku({
    skuId,
    sellerProfileId: seller,
    productId: PRODUCT,
    skuCode: new SkuCode(code),
    state: 'ACTIVE',
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function category(state: 'ACTIVE' | 'RETIRED'): ProductCategory {
  return new ProductCategory({
    categoryId: CATEGORY,
    name: 'Home Appliances',
    state,
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
    ...(state === 'RETIRED' ? { retiredAt: NOW } : {}),
  });
}

function definition(
  valueType: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'DATE',
  overrides: Partial<ProductAttributeDefinition['properties']> = {},
): ProductAttributeDefinition {
  return new ProductAttributeDefinition({
    attributeId: uu('30'),
    name: 'Color',
    valueType,
    required: false,
    state: 'ACTIVE',
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}

function attributeValue(
  value: string,
  valueType: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'DATE',
  attributeId = uu('30'),
): ProductAttributeValue {
  return new ProductAttributeValue({
    attributeValueId: uu('40'),
    productId: PRODUCT,
    attributeId,
    valueType,
    value,
    state: 'ACTIVE',
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function media(mimeType: string, sizeBytes: number): ProductMedia {
  return new ProductMedia({
    mediaId: uu('50'),
    productId: PRODUCT,
    mediaType: 'IMAGE',
    mediaReference: 'obj:catalog/ref/1',
    mediaDigest: 'a'.repeat(64),
    mimeType,
    sizeBytes,
    uploadedByIdentityId: IDENTITY,
    state: 'ACTIVE',
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

describe('ProductCatalogPolicy (M04-M1, WEMP-M04-SPEC-001 §16/§22)', () => {
  const policy = new ProductCatalogPolicy();

  describe('isSubmissionComplete (D-02/D-03/D-06/D-16)', () => {
    it('accepts a complete product: name, ACTIVE category, SKU, price', () => {
      expect(policy.isSubmissionComplete(product(), category('ACTIVE'), [sku('WLR-001')])).toBe(
        true,
      );
    });

    it('fails closed on a null product', () => {
      expect(policy.isSubmissionComplete(null, category('ACTIVE'), [sku('WLR-001')])).toBe(false);
    });

    it('fails closed when the category is missing or RETIRED', () => {
      expect(policy.isSubmissionComplete(product(), null, [sku('WLR-001')])).toBe(false);
      expect(policy.isSubmissionComplete(product(), category('RETIRED'), [sku('WLR-001')])).toBe(
        false,
      );
    });

    it('fails closed when there is no ACTIVE SKU', () => {
      expect(policy.isSubmissionComplete(product(), category('ACTIVE'), [])).toBe(false);
      const closed = sku('WLR-001');
      const closedSku = new ProductSku({
        ...closed.properties,
        skuId: closed.properties.skuId,
        state: 'CLOSED',
        closedAt: NOW,
      });
      expect(policy.isSubmissionComplete(product(), category('ACTIVE'), [closedSku])).toBe(false);
    });

    it('rejects a zero/negative selling price via the Price invariant', () => {
      expect(() => new Price(0)).toThrow('Price must be greater than 0');
      expect(() => new Price(-5)).toThrow('Price must be greater than 0');
    });
  });

  describe('assertUniqueSkuWithinSeller (D-06 per-seller uniqueness)', () => {
    it('accepts unique SKU codes', () => {
      expect(() => {
        policy.assertUniqueSkuWithinSeller([sku('WLR-001'), sku('WLR-002')], SELLER.value);
      }).not.toThrow();
    });

    it('rejects duplicate SKU codes within the same seller', () => {
      expect(() => {
        policy.assertUniqueSkuWithinSeller(
          [sku('WLR-001'), sku('WLR-001', SELLER, uu('21'))],
          SELLER.value,
        );
      }).toThrow('PRODUCT_SKU_CONFLICT');
    });

    it('fails closed on a SKU belonging to another seller', () => {
      expect(() => {
        policy.assertUniqueSkuWithinSeller([sku('WLR-001', OTHER_SELLER)], SELLER.value);
      }).toThrow('PRODUCT_SKU_CONFLICT');
    });

    it('excludes the product own SKUs when updating', () => {
      expect(() => {
        policy.assertUniqueSkuWithinSeller(
          [sku('WLR-001'), sku('WLR-001', SELLER, uu('21'))],
          SELLER.value,
          [uu('20').value],
        );
      }).not.toThrow();
    });

    it('ignores CLOSED SKUs in the duplicate check', () => {
      const closed = new ProductSku({
        ...sku('WLR-001').properties,
        state: 'CLOSED',
        closedAt: NOW,
      });
      expect(() => {
        policy.assertUniqueSkuWithinSeller(
          [closed, sku('WLR-001', SELLER, uu('21'))],
          SELLER.value,
        );
      }).not.toThrow();
    });
  });

  describe('assertSkuMutable (D-06 SKU immutability once PUBLISHED)', () => {
    it('permits SKU mutation before PUBLISHED', () => {
      expect(() => {
        policy.assertSkuMutable(product());
      }).not.toThrow();
    });

    it('denies SKU mutation on a PUBLISHED product', () => {
      const published = new Product({ ...product().properties, state: 'PUBLISHED' });
      expect(() => {
        policy.assertSkuMutable(published);
      }).toThrow('PRODUCT_SKU_IMMUTABLE');
    });
  });

  describe('assertValidAttributeValue (D-04 typed validation)', () => {
    it('accepts a valid STRING value within allowed values', () => {
      const def = definition('STRING', { allowedValues: ['Red', 'Black'] });
      expect(() => {
        policy.assertValidAttributeValue(def, attributeValue('Red', 'STRING'));
      }).not.toThrow();
    });

    it('rejects a STRING value outside allowed values', () => {
      const def = definition('STRING', { allowedValues: ['Red', 'Black'] });
      expect(() => {
        policy.assertValidAttributeValue(def, attributeValue('Green', 'STRING'));
      }).toThrow('PRODUCT_INVALID_ATTRIBUTE_VALUE');
    });

    it('accepts a NUMBER value within bounds', () => {
      const def = definition('NUMBER', { minValue: 0, maxValue: 5000 });
      expect(() => {
        policy.assertValidAttributeValue(def, attributeValue('2500', 'NUMBER'));
      }).not.toThrow();
    });

    it('rejects a NUMBER value outside bounds', () => {
      const def = definition('NUMBER', { minValue: 0, maxValue: 5000 });
      expect(() => {
        policy.assertValidAttributeValue(def, attributeValue('7500', 'NUMBER'));
      }).toThrow('PRODUCT_INVALID_ATTRIBUTE_VALUE');
    });

    it('rejects a non-numeric NUMBER value', () => {
      const def = definition('NUMBER');
      expect(() => {
        policy.assertValidAttributeValue(def, attributeValue('abc', 'NUMBER'));
      }).toThrow('PRODUCT_INVALID_ATTRIBUTE_VALUE');
    });

    it('rejects a BOOLEAN value that is not true/false', () => {
      const def = definition('BOOLEAN');
      expect(() => {
        policy.assertValidAttributeValue(def, attributeValue('yes', 'BOOLEAN'));
      }).toThrow('PRODUCT_INVALID_ATTRIBUTE_VALUE');
      expect(() => {
        policy.assertValidAttributeValue(def, attributeValue('true', 'BOOLEAN'));
      }).not.toThrow();
    });

    it('rejects an unparseable DATE value', () => {
      const def = definition('DATE');
      expect(() => {
        policy.assertValidAttributeValue(def, attributeValue('not-a-date', 'DATE'));
      }).toThrow('PRODUCT_INVALID_ATTRIBUTE_VALUE');
      expect(() => {
        policy.assertValidAttributeValue(def, attributeValue('2026-08-14', 'DATE'));
      }).not.toThrow();
    });

    it('fails closed when the definition is missing or RETIRED', () => {
      expect(() => {
        policy.assertValidAttributeValue(null, attributeValue('Red', 'STRING'));
      }).toThrow('PRODUCT_INVALID_ATTRIBUTE_VALUE');
      const retired = definition('STRING', { state: 'RETIRED', retiredAt: NOW });
      expect(() => {
        policy.assertValidAttributeValue(retired, attributeValue('Red', 'STRING'));
      }).toThrow('PRODUCT_INVALID_ATTRIBUTE_VALUE');
    });

    it('rejects a value whose type does not match the definition', () => {
      const def = definition('STRING');
      expect(() => {
        policy.assertValidAttributeValue(def, attributeValue('5', 'NUMBER'));
      }).toThrow('PRODUCT_INVALID_ATTRIBUTE_VALUE');
    });
  });

  describe('assertValidMedia (D-09/D-16 allowlist, size and count limits)', () => {
    it('accepts allowlisted image types within limits', () => {
      expect(() => {
        policy.assertValidMedia(media('image/jpeg', 1024), 0);
      }).not.toThrow();
      expect(() => {
        policy.assertValidMedia(media('image/png', 1024), 3);
      }).not.toThrow();
      expect(() => {
        policy.assertValidMedia(media('image/webp', 1024), 9);
      }).not.toThrow();
    });

    it('rejects non-allowlisted MIME types', () => {
      expect(() => {
        policy.assertValidMedia(media('application/pdf', 1024), 0);
      }).toThrow('PRODUCT_INVALID_MEDIA');
    });

    it('accepts a file exactly at the 10 MB boundary', () => {
      expect(() => {
        policy.assertValidMedia(media('image/jpeg', 10 * 1024 * 1024), 0);
      }).not.toThrow();
    });

    it('rejects more than 10 images per product', () => {
      expect(() => {
        policy.assertValidMedia(media('image/jpeg', 1024), 10);
      }).toThrow('PRODUCT_INVALID_MEDIA');
    });
  });

  describe('isRequiredAttribute (D-04)', () => {
    it('returns the definition required flag', () => {
      expect(policy.isRequiredAttribute(definition('STRING', { required: true }))).toBe(true);
      expect(policy.isRequiredAttribute(definition('STRING', { required: false }))).toBe(false);
    });
  });
});
