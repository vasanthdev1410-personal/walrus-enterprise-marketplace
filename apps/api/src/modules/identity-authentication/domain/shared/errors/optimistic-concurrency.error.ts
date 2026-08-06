export class OptimisticConcurrencyError extends Error {
  public constructor(aggregateName: string) {
    super(`${aggregateName} was changed by another transaction`);
    this.name = 'OptimisticConcurrencyError';
  }
}
