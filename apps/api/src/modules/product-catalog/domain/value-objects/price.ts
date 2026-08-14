/**
 * WEMP-M04-SPEC-001 §10/§22 (decisions D-07, D-16). Record-only pricing
 * definition data for the configured single platform currency. Bounds:
 * price > 0 and <= 1,000,000 with 2-decimal precision. Module 04 never
 * computes taxes, fees, commission, or settlement (D-05/A-07); this is a
 * stored catalog fact only.
 */
export const MAX_PRICE = 1_000_000;

export class Price {
  public readonly value: number;

  public constructor(value: number) {
    if (!Number.isFinite(value)) {
      throw new Error('Price must be a finite number');
    }
    if (value <= 0 || value > MAX_PRICE) {
      throw new Error(`Price must be greater than 0 and at most ${String(MAX_PRICE)}`);
    }
    const rounded = Math.round(value * 100) / 100;
    if (Math.abs(rounded - value) > 1e-9) {
      throw new Error('Price must have at most 2 decimal places');
    }
    this.value = rounded;
    Object.freeze(this);
  }

  public toString(): string {
    return this.value.toFixed(2);
  }
}
