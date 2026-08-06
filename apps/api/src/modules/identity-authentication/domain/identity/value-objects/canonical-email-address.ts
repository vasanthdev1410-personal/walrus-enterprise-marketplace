const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class CanonicalEmailAddress {
  public readonly value: string;

  public constructor(value: string) {
    const canonical = value.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(canonical)) {
      throw new Error('Email address is invalid');
    }
    this.value = canonical;
    Object.freeze(this);
  }
}
