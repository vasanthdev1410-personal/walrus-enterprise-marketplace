/**
 * WEMP-M05-SPEC-001 §4/§9 (decisions D-02, D-08). Integer inventory
 * quantity. Quantities are non-negative safe integers; the derived
 * `available` quantity is never stored and never negative (D-02 hard
 * no-negative rule). The per-mutation upper bound (≤ 1,000,000 units,
 * D-08) is enforced by InventoryDelta at the mutation boundary, not by
 * the stored quantity itself.
 */
export class InventoryQuantity {
  public readonly value: number;

  public constructor(value: number) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error('Inventory quantity must be a non-negative safe integer');
    }
    this.value = value;
    Object.freeze(this);
  }

  public toString(): string {
    return String(this.value);
  }
}
