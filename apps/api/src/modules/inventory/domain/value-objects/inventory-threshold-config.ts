/**
 * WEMP-M05-SPEC-001 §22 (decision D-14). Platform-defined, admin-managed
 * low/out-of-stock threshold configuration. Values are configuration —
 * never hard-coded — and remain pending authority input before label
 * enforcement (Gate #4: PENDING, NOT RECORDED; no value is invented or
 * assumed here). The config fails closed on missing or invalid values.
 *
 * Validation rule (D-14 fail-closed semantics): both thresholds are
 * non-negative safe integers and the out-of-stock threshold must not
 * exceed the low-stock threshold, so the derived label bands
 * (OUT_OF_STOCK ≤ out-of-stock threshold < LOW_STOCK ≤ low-stock
 * threshold < IN_STOCK) are consistent. Any violation makes the
 * configuration invalid and label enforcement fails closed.
 */
export interface InventoryThresholdConfigProperties {
  readonly lowStockThreshold: number;
  readonly outOfStockThreshold: number;
}

export class InventoryThresholdConfig {
  public readonly properties: Readonly<InventoryThresholdConfigProperties>;

  public constructor(properties: InventoryThresholdConfigProperties) {
    const { lowStockThreshold, outOfStockThreshold } = properties;
    if (!Number.isSafeInteger(lowStockThreshold) || lowStockThreshold < 0) {
      throw new Error('Low-stock threshold must be a non-negative safe integer');
    }
    if (!Number.isSafeInteger(outOfStockThreshold) || outOfStockThreshold < 0) {
      throw new Error('Out-of-stock threshold must be a non-negative safe integer');
    }
    if (outOfStockThreshold > lowStockThreshold) {
      throw new Error('Out-of-stock threshold must not exceed the low-stock threshold');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
