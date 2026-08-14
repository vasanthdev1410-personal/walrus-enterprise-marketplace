import { isActiveCategoryState, CATEGORY_STATES } from './category-state';
import { PRODUCT_MEDIA_TYPES } from './media-type';
import { ATTRIBUTE_VALUE_TYPES } from './attribute-value-type';
import { SkuCode } from './sku-code';
import {
  isProductConsumable,
  isTerminalProductState,
  PRODUCT_STATES,
  TERMINAL_PRODUCT_STATES,
} from './product-state';

describe('product-catalog value objects (M04-M3, WEMP-M04-SPEC-001)', () => {
  it('exposes the approved category state vocabulary', () => {
    expect(CATEGORY_STATES).toEqual(['ACTIVE', 'RETIRED']);
    expect(isActiveCategoryState('ACTIVE')).toBe(true);
    expect(isActiveCategoryState('RETIRED')).toBe(false);
  });

  it('exposes the approved media and attribute value types (D-09/D-04)', () => {
    expect(PRODUCT_MEDIA_TYPES).toEqual(['IMAGE']);
    expect(ATTRIBUTE_VALUE_TYPES).toEqual(['STRING', 'NUMBER', 'BOOLEAN', 'DATE']);
  });

  it('exposes the approved 9-state product vocabulary with terminal/publishable predicates (D-02)', () => {
    expect([...PRODUCT_STATES].sort()).toEqual(
      [
        'DRAFT',
        'SUBMITTED',
        'UNDER_REVIEW',
        'APPROVED',
        'PUBLISHED',
        'CORRECTIONS_REQUESTED',
        'UNPUBLISHED',
        'REJECTED',
        'CLOSED',
      ].sort(),
    );
    expect(TERMINAL_PRODUCT_STATES).toEqual(['REJECTED', 'CLOSED']);
    expect(isTerminalProductState('REJECTED')).toBe(true);
    expect(isTerminalProductState('CLOSED')).toBe(true);
    expect(isTerminalProductState('DRAFT')).toBe(false);
    expect(isProductConsumable('PUBLISHED')).toBe(true);
    expect(isProductConsumable('APPROVED')).toBe(false);
  });

  it('accepts valid SKU codes and rejects invalid formats (D-16)', () => {
    expect(new SkuCode('WLR-ESPRESSO-001').value).toBe('WLR-ESPRESSO-001');
    expect(() => new SkuCode('lowercase')).toThrow();
    expect(() => new SkuCode('')).toThrow();
    expect(() => new SkuCode('A'.repeat(65))).toThrow();
  });
});
