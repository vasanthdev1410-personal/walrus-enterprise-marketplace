export type TrustedDeviceErrorCode = 'RESOURCE_NOT_AVAILABLE' | 'RESOURCE_STATE_CONFLICT';

export class TrustedDeviceError extends Error {
  public constructor(public readonly code: TrustedDeviceErrorCode) {
    super(code);
    this.name = 'TrustedDeviceError';
  }
}
