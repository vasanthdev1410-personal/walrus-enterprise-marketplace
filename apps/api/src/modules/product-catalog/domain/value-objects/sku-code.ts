/**
 * WEMP-M04-SPEC-001 §9/§22 (decisions D-06, D-16). Seller-supplied SKU code
 * with the approved validated format: 1–64 characters, uppercase
 * alphanumeric plus `-` and `_`. SKUs are unique per seller organization and
 * immutable once the product/variant is PUBLISHED (enforced at the aggregate
 * and lifecycle boundaries, fail closed).
 */
const SKU_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{0,63}$/;

export class SkuCode {
  public readonly value: string;

  public constructor(value: string) {
    if (!SKU_CODE_PATTERN.test(value)) {
      throw new Error('SKU code must be 1-64 characters of uppercase alphanumeric plus - and _');
    }
    this.value = value;
    Object.freeze(this);
  }

  public toString(): string {
    return this.value;
  }
}
