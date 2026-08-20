import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { PaymentAttemptId } from '../value-objects/payment-attempt-id';

/**
 * WEMP-M09-SPEC-001 (M09-M1, decisions D-02/D-07). An append-only
 * record of a single payment attempt. Each attempt captures one
 * interaction with the payment provider: initiated, succeeded, failed,
 * or timed out. Attempts are never mutated — the caller persists new
 * attempts atomically with the version-guarded payment update.
 *
 * The providerResponseDigest stores a hashed version of the provider
 * response — never the raw response (security: no PII/credentials
 * leakage).
 */
export type PaymentAttemptOutcome = 'INITIATED' | 'SUCCESS' | 'FAILED' | 'TIMEOUT';

export interface PaymentAttemptProperties {
  readonly paymentAttemptId: PaymentAttemptId;
  readonly paymentId: UuidV7;
  /** Provider-side payment reference for this attempt. */
  readonly providerPaymentId: string | null;
  readonly outcome: PaymentAttemptOutcome;
  /** Hashed provider response — never raw (security). */
  readonly providerResponseDigest: string | null;
  readonly attemptedAt: Date;
  readonly createdAt: Date;
}

export class PaymentAttempt {
  public readonly properties: Readonly<PaymentAttemptProperties>;

  public constructor(properties: PaymentAttemptProperties) {
    if (properties.attemptedAt.getTime() === 0) {
      throw new Error('Payment attempt attemptedAt is required');
    }
    if (properties.attemptedAt.getTime() < properties.createdAt.getTime()) {
      throw new Error('Payment attempt attemptedAt cannot precede createdAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
