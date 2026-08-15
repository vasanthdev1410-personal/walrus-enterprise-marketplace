/**
 * WEMP-M05-SPEC-001 §6/§9 (decisions D-04, D-06, D-08). Per-mutation
 * inventory delta: a positive integer ≤ 1,000,000 units (D-08 upper
 * bound, mirroring the approved Module 04 D-16 1e6 scale bound). Deltas
 * are applied directionally by the movement type (STOCK_IN adds,
 * STOCK_OUT subtracts, ADJUSTMENT/COUNT_CORRECTION correct); the delta
 * magnitude itself is always positive and never zero.
 */
export const MAX_MUTATION_UNITS = 1_000_000;

export class InventoryDelta {
  public readonly value: number;

  public constructor(value: number) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error('Inventory delta must be a positive safe integer');
    }
    if (value > MAX_MUTATION_UNITS) {
      throw new Error(`Inventory delta must be at most ${String(MAX_MUTATION_UNITS)} units`);
    }
    this.value = value;
    Object.freeze(this);
  }

  public toString(): string {
    return String(this.value);
  }
}
