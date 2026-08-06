export class SessionVersion {
  public readonly value: number;

  public constructor(value: number) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error('Session version must be a positive safe integer');
    }
    this.value = value;
    Object.freeze(this);
  }
}
