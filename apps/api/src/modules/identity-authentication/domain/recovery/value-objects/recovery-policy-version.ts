export class RecoveryPolicyVersion {
  public readonly value: string;

  public constructor(value: string) {
    if (value.trim().length === 0) {
      throw new Error('Recovery policy version cannot be empty');
    }
    this.value = value;
    Object.freeze(this);
  }
}
