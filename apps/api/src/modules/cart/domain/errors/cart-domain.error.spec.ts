import type { CartDomainErrorCode } from './cart-domain.error';
import { CartDomainError } from './cart-domain.error';

describe('CartDomainError', () => {
  it('should set the code and name', () => {
    const error = new CartDomainError('CART_STATE_CONFLICT');
    expect(error.code).toBe('CART_STATE_CONFLICT');
    expect(error.name).toBe('CartDomainError');
    expect(error.message).toBe('CART_STATE_CONFLICT');
  });

  it('should be an instance of Error', () => {
    const error = new CartDomainError('CART_UPDATE_FORBIDDEN');
    expect(error).toBeInstanceOf(Error);
  });

  it('should have all expected error codes', () => {
    const codes: CartDomainErrorCode[] = [
      'CART_STATE_CONFLICT',
      'CART_TRANSITION_FORBIDDEN',
      'CART_ACTOR_REQUIRED',
      'CART_REASON_REQUIRED',
      'CART_PRECONDITION_FAILED',
      'CART_UPDATE_FORBIDDEN',
      'CART_READ_FORBIDDEN',
      'CART_OWNERSHIP_CONFLICT',
      'CART_LINE_CONFLICT',
      'CART_LINE_NOT_FOUND',
      'CART_LINE_QUANTITY_EXCEEDED',
      'CART_MAX_LINES_EXCEEDED',
      'CART_MAX_TOTAL_ITEMS_EXCEEDED',
      'CART_PRODUCT_UNAVAILABLE',
      'CART_SKU_UNAVAILABLE',
      'CART_PRICE_MISMATCH',
      'CART_INVENTORY_INSUFFICIENT',
      'CART_CHECKOUT_BLOCKED',
      'CART_RETENTION_CONFIG_MISSING',
      'CART_RETENTION_CONFIG_INVALID',
      'CART_STALE_VERSION',
    ];
    for (const code of codes) {
      const error = new CartDomainError(code);
      expect(error.code).toBe(code);
    }
  });
});
