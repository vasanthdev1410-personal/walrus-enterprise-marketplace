const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class UuidV7 {
  public readonly value: string;

  public constructor(value: string) {
    if (!UUID_V7_PATTERN.test(value)) {
      throw new Error('Value must be a UUID version 7');
    }
    this.value = value.toLowerCase();
    Object.freeze(this);
  }

  public toString(): string {
    return this.value;
  }
}
