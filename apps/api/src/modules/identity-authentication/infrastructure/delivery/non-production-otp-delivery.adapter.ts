import type {
  OtpDeliveryMessage,
  OtpDeliveryPort,
} from '../../application/ports/otp-delivery.port';

type Sink = (line: string) => void;

function writeStdout(line: string): void {
  process.stdout.write(`${line}\n`);
}

/**
 * Development-only OTP delivery. Approved production delivery (AWS SES / AWS
 * End User Messaging SMS) is a provider integration that belongs to the
 * infrastructure milestone; this adapter surfaces the OTP to the developer so
 * the registration verification flow is exercisable end-to-end locally.
 *
 * The adapter is prohibited in production (mirroring the other non-production
 * Module 01 adapters) and the raw OTP is never returned in an API response.
 */
export class NonProductionOtpDeliveryAdapter implements OtpDeliveryPort {
  public constructor(
    private readonly applicationEnvironment: string,
    private readonly sink: Sink = writeStdout,
  ) {
    if (applicationEnvironment === 'production') {
      throw new Error('The non-production OTP delivery adapter is prohibited in production');
    }
  }

  public deliver(message: OtpDeliveryMessage): Promise<void> {
    this.sink(
      `[NON-PRODUCTION OTP DELIVERY] purpose=${message.purpose} channel=${message.channel} ` +
        `destination=${message.destination} otp=${message.rawOtp} ` +
        `expiresAt=${message.expiresAt.toISOString()}`,
    );
    return Promise.resolve();
  }
}
