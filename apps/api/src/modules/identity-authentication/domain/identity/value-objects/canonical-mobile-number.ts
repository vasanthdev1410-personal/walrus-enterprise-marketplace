const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export class CanonicalMobileNumber {
  public readonly value: string;

  public constructor(value: string) {
    const canonical = value.trim();
    if (!E164_PATTERN.test(canonical)) {
      throw new Error('Mobile number must use normalized international format');
    }
    this.value = canonical;
    Object.freeze(this);
  }
}
