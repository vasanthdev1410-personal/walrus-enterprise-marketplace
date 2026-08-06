export class ProtectedValue {
  public readonly value: string;

  public constructor(value: string) {
    if (value.length === 0) {
      throw new Error('Protected value cannot be empty');
    }
    this.value = value;
    Object.freeze(this);
  }

  public toString(): string {
    return '[PROTECTED]';
  }

  public toJSON(): string {
    return '[PROTECTED]';
  }
}
