import { OrderDomainError, type OrderDomainErrorCode } from './order-domain.error';

describe('OrderDomainError', () => {
  it('creates an error with the correct name', () => {
    const error = new OrderDomainError('ORDER_STATE_CONFLICT');
    expect(error.name).toBe('OrderDomainError');
    expect(error.code).toBe('ORDER_STATE_CONFLICT');
  });

  it('is an instance of Error', () => {
    const error = new OrderDomainError('ORDER_NOT_FOUND');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(OrderDomainError);
  });

  it('has a message matching the code', () => {
    const error = new OrderDomainError('ORDER_TRANSITION_FORBIDDEN');
    expect(error.message).toBe('ORDER_TRANSITION_FORBIDDEN');
  });

  it('all error codes are valid', () => {
    const codes: OrderDomainErrorCode[] = [
      'ORDER_STATE_CONFLICT',
      'ORDER_TRANSITION_FORBIDDEN',
      'ORDER_ACTOR_REQUIRED',
      'ORDER_REASON_REQUIRED',
      'ORDER_PRECONDITION_FAILED',
      'ORDER_UPDATE_FORBIDDEN',
      'ORDER_READ_FORBIDDEN',
      'ORDER_OWNERSHIP_CONFLICT',
      'ORDER_LINE_CONFLICT',
      'ORDER_LINE_NOT_FOUND',
      'ORDER_LINE_QUANTITY_EXCEEDED',
      'ORDER_MAX_LINES_EXCEEDED',
      'ORDER_MAX_TOTAL_ITEMS_EXCEEDED',
      'ORDER_PRODUCT_UNAVAILABLE',
      'ORDER_SKU_UNAVAILABLE',
      'ORDER_PRICE_MISMATCH',
      'ORDER_INVENTORY_INSUFFICIENT',
      'ORDER_CHECKOUT_BLOCKED',
      'ORDER_RETENTION_CONFIG_MISSING',
      'ORDER_RETENTION_CONFIG_INVALID',
      'ORDER_STALE_VERSION',
      'ORDER_NOT_FOUND',
      'ORDER_SNAPSHOT_NOT_FOUND',
      'ORDER_CUSTOMER_NOT_FOUND',
    ];
    for (const code of codes) {
      const error = new OrderDomainError(code);
      expect(error.code).toBe(code);
    }
  });
});
