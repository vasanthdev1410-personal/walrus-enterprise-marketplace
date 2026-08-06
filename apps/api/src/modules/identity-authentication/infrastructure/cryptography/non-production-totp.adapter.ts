import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type {
  EnvelopeEncryptionPort,
  EnvelopeEncryptionContext,
  ProtectedEnvelope,
} from '../../application/ports/envelope-encryption.port';
import type {
  TotpCryptographicPort,
  TotpEnrollmentSecret,
  TotpVerificationResult,
} from '../../application/ports/totp-cryptographic.port';
import type { IdentityAuthenticationConfiguration } from '../configuration/identity-authentication.configuration';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export class NonProductionTotpAdapter implements TotpCryptographicPort {
  public constructor(
    private readonly envelopeEncryption: EnvelopeEncryptionPort,
    private readonly configuration: IdentityAuthenticationConfiguration,
    applicationEnvironment: string,
  ) {
    if (applicationEnvironment === 'production') {
      throw new Error('The non-production TOTP adapter is prohibited in production');
    }
  }

  public createEnrollmentSecret(context: EnvelopeEncryptionContext): TotpEnrollmentSecret {
    const secret = randomBytes(this.configuration.totp.secretBytes);
    try {
      return Object.freeze({
        base32Secret: encodeBase32(secret),
        protectedEnvelope: this.envelopeEncryption.encrypt(secret, context),
      });
    } finally {
      secret.fill(0);
    }
  }

  public verify(
    evidence: string,
    protectedEnvelope: ProtectedEnvelope,
    context: EnvelopeEncryptionContext,
    now: Date,
  ): TotpVerificationResult {
    if (!/^\d{6}$/.test(evidence) || Number.isNaN(now.getTime())) return { valid: false };
    const secret = Buffer.from(this.envelopeEncryption.decrypt(protectedEnvelope, context));
    try {
      if (secret.length !== this.configuration.totp.secretBytes) {
        throw new Error('TOTP secret entropy is invalid');
      }
      const currentStep = BigInt(
        Math.floor(now.getTime() / 1000 / this.configuration.totp.timeStepSeconds),
      );
      let matchedTimeStep: bigint | undefined;
      for (
        let drift = -this.configuration.totp.allowedClockDriftSteps;
        drift <= this.configuration.totp.allowedClockDriftSteps;
        drift += 1
      ) {
        const candidateStep = currentStep + BigInt(drift);
        if (candidateStep < 0n) continue;
        const candidate = generateTotp(
          secret,
          candidateStep,
          this.configuration.totp.decimalLength,
        );
        if (timingSafeEqual(Buffer.from(evidence, 'ascii'), Buffer.from(candidate, 'ascii'))) {
          matchedTimeStep = candidateStep;
        }
      }
      return matchedTimeStep === undefined ? { valid: false } : { valid: true, matchedTimeStep };
    } finally {
      secret.fill(0);
    }
  }
}

function generateTotp(secret: Buffer, timeStep: bigint, digits: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(timeStep);
  const digest = createHmac('sha256', secret).update(counter).digest();
  const finalByte = digest.at(-1);
  if (finalByte === undefined) throw new Error('TOTP digest is empty');
  const offset = finalByte & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fff_ffff;
  return (binary % 10 ** digits).toString().padStart(digits, '0');
}

function encodeBase32(value: Uint8Array): string {
  let accumulator = 0;
  let bits = 0;
  let output = '';
  for (const byte of value) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += BASE32_ALPHABET.charAt((accumulator >>> bits) & 31);
    }
    accumulator &= (1 << bits) - 1;
  }
  if (bits > 0) output += BASE32_ALPHABET.charAt((accumulator << (5 - bits)) & 31);
  return output;
}
