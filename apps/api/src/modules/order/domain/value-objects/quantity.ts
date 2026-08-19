/**
 * WEMP-M08-SPEC-001 (decision D-13). An order line quantity: at least 1, at
 * most the configured maximum (default 100). Zero quantity is not stored.
 */
export const DEFAULT_MIN_QUANTITY = 1;
export const DEFAULT_MAX_QUANTITY = 100;
export const DEFAULT_MAX_LINES = 50;
export const DEFAULT_MAX_TOTAL_ITEMS = 100;

export class Quantity {
  public readonly value: number;

  public constructor(value: number) {
    if (!Number.isSafeInteger(value) || value < DEFAULT_MIN_QUANTITY) {
      throw new Error('Order line quantity must be a positive safe integer >= 1');
    }
    if (value > DEFAULT_MAX_QUANTITY) {
      throw new Error('Order line quantity must not exceed ' + String(DEFAULT_MAX_QUANTITY));
    }
    this.value = value;
    Object.freeze(this);
  }
}
