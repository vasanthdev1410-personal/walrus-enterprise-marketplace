export type ClassificationTransitionErrorCode =
  'CONTRACT_INVALID' | 'RESOURCE_NOT_AVAILABLE' | 'RESOURCE_STATE_CONFLICT';

export class ClassificationTransitionError extends Error {
  public constructor(public readonly code: ClassificationTransitionErrorCode) {
    super(code);
    this.name = 'ClassificationTransitionError';
  }
}
