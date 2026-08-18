/**
 * WEMP-M07-SPEC-001 (decision D-04). A cart line quantity: at least 1, at
 * most the configured maximum (default 100). Zero quantity is not stored;
 * a zero-quantity operation removes the line entirely.
 */
export const DEFAULT_MIN_QUANTITY = 1;
export const DEFAULT_MAX_QUANTITY = 100;
export const DEFAULT_MAX_LINES = 50;
export const DEFAULT_MAX_TOTAL_ITEMS = 100;

export class Quantity {
  public readonly value: number;

  public constructor(value: number) {
    if (!Number.isSafeInteger(value) || value < DEFAULT_MIN_QUANTITY) {
      throw new Error('Cart line quantity must be a positive safe integer >= 1');
    }
    if (value > DEFAULT_MAX_QUANTITY) {
      throw new Error('Cart line quantity must not exceed ' + String(DEFAULT_MAX_QUANTITY));
    }
    this.value = value;
    Object.freeze(this);
  }
}
