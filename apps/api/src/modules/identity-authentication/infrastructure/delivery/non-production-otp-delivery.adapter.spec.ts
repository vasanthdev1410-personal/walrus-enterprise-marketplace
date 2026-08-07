import { NonProductionOtpDeliveryAdapter } from './non-production-otp-delivery.adapter';

describe('NonProductionOtpDeliveryAdapter', () => {
  it('surfaces the OTP through the configured sink for local development', async () => {
    const lines: string[] = [];
    const adapter = new NonProductionOtpDeliveryAdapter('local', (line) => lines.push(line));

    await adapter.deliver({
      destination: 'user@example.com',
      channel: 'EMAIL',
      purpose: 'REGISTRATION_VERIFICATION',
      rawOtp: '123456',
      expiresAt: new Date('2026-08-07T12:05:00.000Z'),
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('purpose=REGISTRATION_VERIFICATION');
    expect(lines[0]).toContain('destination=user@example.com');
    expect(lines[0]).toContain('otp=123456');
  });

  it('is prohibited in production', () => {
    expect(() => new NonProductionOtpDeliveryAdapter('production')).toThrow(
      /prohibited in production/,
    );
  });
});
