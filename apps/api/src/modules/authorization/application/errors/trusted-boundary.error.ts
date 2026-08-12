export class TrustedBoundaryError extends Error {
  public constructor(public readonly reasonCode: string) {
    super('TRUSTED_BOUNDARY_DENIED');
    this.name = 'TrustedBoundaryError';
  }
}
