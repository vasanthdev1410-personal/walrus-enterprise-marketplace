import type { RecoveryOperationClass } from './recovery-operation-class';

export class PermittedRecoveryOperation {
  public readonly value: RecoveryOperationClass;

  public constructor(value: RecoveryOperationClass) {
    this.value = value;
    Object.freeze(this);
  }
}
