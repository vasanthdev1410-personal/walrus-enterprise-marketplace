import type { VerificationPurpose } from '../../domain/verification/value-objects/verification-purpose';

export interface OtpDeliveryMessage {
  readonly destination: string;
  readonly channel: 'EMAIL' | 'SMS';
  readonly purpose: VerificationPurpose;
  readonly rawOtp: string;
  readonly expiresAt: Date;
}

/**
 * Coordinates OTP delivery to the verified destination. The raw OTP value must
 * never be returned by any API response or stored outside the challenge record.
 */
export interface OtpDeliveryPort {
  deliver(message: OtpDeliveryMessage): Promise<void>;
}
