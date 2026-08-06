import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import type {
  IssuedProtectedValue,
  OtpDigestContext,
  OtpRecoveryCodeCryptographicPort,
  RecoveryCodeDigestContext,
} from '../../application/ports/otp-recovery-code-cryptographic.port';
import type { IdentityAuthenticationConfiguration } from '../configuration/identity-authentication.configuration';

const KEY_BYTES = 32;
const VERSION_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_CONTEXT_PATTERN = /^[A-Za-z0-9._-]+$/;
const OTP_PATTERN = /^\d{6}$/;
const RECOVERY_CODE_PATTERN = /^[A-Z2-7]{26}$/;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export interface NonProductionDigestKey {
  readonly version: string;
  readonly key: Buffer;
}

class VerificationKeyRing {
  private readonly keys: ReadonlyMap<string, Buffer>;

  public constructor(
    public readonly active: NonProductionDigestKey,
    previous: readonly NonProductionDigestKey[],
  ) {
    assertKey(active);
    const keys = new Map<string, Buffer>([[active.version, active.key]]);
    for (const candidate of previous) {
      assertKey(candidate);
      if (keys.has(candidate.version)) throw new Error('Digest key versions must be unique');
      keys.set(candidate.version, candidate.key);
    }
    this.keys = keys;
  }

  public get(version: string): Buffer | undefined {
    return this.keys.get(version);
  }

  public all(): readonly Buffer[] {
    return [...this.keys.values()];
  }
}

export class NonProductionOtpRecoveryCodeAdapter implements OtpRecoveryCodeCryptographicPort {
  private readonly otpKeys: VerificationKeyRing;
  private readonly recoveryCodeKeys: VerificationKeyRing;

  public constructor(
    otpActiveKey: NonProductionDigestKey,
    otpPreviousKeys: readonly NonProductionDigestKey[],
    recoveryCodeActiveKey: NonProductionDigestKey,
    recoveryCodePreviousKeys: readonly NonProductionDigestKey[],
    private readonly configuration: IdentityAuthenticationConfiguration,
  ) {
    this.otpKeys = new VerificationKeyRing(otpActiveKey, otpPreviousKeys);
    this.recoveryCodeKeys = new VerificationKeyRing(
      recoveryCodeActiveKey,
      recoveryCodePreviousKeys,
    );
    for (const otpKey of this.otpKeys.all()) {
      for (const recoveryKey of this.recoveryCodeKeys.all()) {
        if (timingSafeEqual(otpKey, recoveryKey)) {
          throw new Error('OTP and Recovery Code HMAC keys must be different');
        }
      }
    }
  }

  public static async fromFileReferences(
    configuration: IdentityAuthenticationConfiguration,
    applicationEnvironment: string,
  ): Promise<NonProductionOtpRecoveryCodeAdapter> {
    if (applicationEnvironment === 'production') {
      throw new Error(
        'The non-production OTP and Recovery Code adapter is prohibited in production',
      );
    }
    const [otpActive, otpPrevious, recoveryActive, recoveryPrevious] = await Promise.all([
      loadKey(configuration.otp.activeKeyVersion, configuration.otp.activeKeyReference),
      loadPreviousKeys(configuration.otp.verificationKeyReferences),
      loadKey(
        configuration.recoveryCode.activeKeyVersion,
        configuration.recoveryCode.activeKeyReference,
      ),
      loadPreviousKeys(configuration.recoveryCode.verificationKeyReferences),
    ]);
    return new NonProductionOtpRecoveryCodeAdapter(
      otpActive,
      otpPrevious,
      recoveryActive,
      recoveryPrevious,
      configuration,
    );
  }

  public issueOtp(context: OtpDigestContext): IssuedProtectedValue {
    assertOtpContext(context);
    const rawValue = randomInt(0, 1_000_000).toString().padStart(6, '0');
    return {
      rawValue,
      digest: this.computeOtpDigest(rawValue, context, this.otpKeys.active),
      keyVersion: this.otpKeys.active.version,
    };
  }

  public matchesOtp(rawOtp: string, context: OtpDigestContext, storedDigest: string): boolean {
    try {
      assertOtpContext(context);
      if (!OTP_PATTERN.test(rawOtp)) return false;
      const version = parseDigestVersion(storedDigest, 'otp');
      const key = this.otpKeys.get(version);
      if (key === undefined) return false;
      return constantTimeTextEqual(
        this.computeOtpDigest(rawOtp, context, { version, key }),
        storedDigest,
      );
    } catch {
      return false;
    }
  }

  public issueRecoveryCodeSet(context: RecoveryCodeDigestContext): readonly IssuedProtectedValue[] {
    assertRecoveryContext(context);
    const values = new Map<string, IssuedProtectedValue>();
    while (values.size < this.configuration.recoveryCode.count) {
      const rawValue = encodeBase32(
        randomBytes(this.configuration.recoveryCode.entropyBytesPerCode),
      );
      values.set(rawValue, {
        rawValue,
        digest: this.computeRecoveryCodeDigest(rawValue, context, this.recoveryCodeKeys.active),
        keyVersion: this.recoveryCodeKeys.active.version,
      });
    }
    return [...values.values()];
  }

  public matchesRecoveryCode(
    rawRecoveryCode: string,
    context: RecoveryCodeDigestContext,
    storedDigest: string,
  ): boolean {
    try {
      assertRecoveryContext(context);
      const normalizedCode = rawRecoveryCode.trim().toUpperCase();
      if (!RECOVERY_CODE_PATTERN.test(normalizedCode)) return false;
      const version = parseDigestVersion(storedDigest, 'recovery-code');
      const key = this.recoveryCodeKeys.get(version);
      if (key === undefined) return false;
      return constantTimeTextEqual(
        this.computeRecoveryCodeDigest(normalizedCode, context, { version, key }),
        storedDigest,
      );
    } catch {
      return false;
    }
  }

  private computeOtpDigest(
    rawOtp: string,
    context: OtpDigestContext,
    versionedKey: NonProductionDigestKey,
  ): string {
    const binding = `WALRUS-M01|OTP|v1|environment=${context.environment}|challengeId=${context.challengeId}|purpose=${context.purpose}|value=${rawOtp}`;
    return `hmac-sha256:otp:v1:${versionedKey.version}:${hmac(binding, versionedKey.key)}`;
  }

  private computeRecoveryCodeDigest(
    rawCode: string,
    context: RecoveryCodeDigestContext,
    versionedKey: NonProductionDigestKey,
  ): string {
    const binding = `WALRUS-M01|RECOVERY_CODE|v1|environment=${context.environment}|identityId=${context.identityId}|codeSetId=${context.recoveryCodeSetId}|value=${rawCode}`;
    return `hmac-sha256:recovery-code:v1:${versionedKey.version}:${hmac(binding, versionedKey.key)}`;
  }
}

function assertKey(candidate: NonProductionDigestKey): void {
  if (!VERSION_PATTERN.test(candidate.version) || candidate.key.length !== KEY_BYTES) {
    throw new Error('OTP or Recovery Code HMAC key is invalid');
  }
}

function assertOtpContext(context: OtpDigestContext): void {
  if (
    !SAFE_CONTEXT_PATTERN.test(context.environment) ||
    !UUID_V7_PATTERN.test(context.challengeId) ||
    !SAFE_CONTEXT_PATTERN.test(context.purpose)
  ) {
    throw new Error('OTP digest context is invalid');
  }
}

function assertRecoveryContext(context: RecoveryCodeDigestContext): void {
  if (
    !SAFE_CONTEXT_PATTERN.test(context.environment) ||
    !UUID_V7_PATTERN.test(context.identityId) ||
    !UUID_V7_PATTERN.test(context.recoveryCodeSetId)
  ) {
    throw new Error('Recovery Code digest context is invalid');
  }
}

function parseDigestVersion(digest: string, purpose: 'otp' | 'recovery-code'): string {
  const pattern = new RegExp(
    `^hmac-sha256:${purpose}:v1:([A-Za-z0-9._-]{1,64}):[A-Za-z0-9_-]{43}$`,
  );
  const match = pattern.exec(digest);
  if (match?.[1] === undefined) throw new Error('Protected digest format is invalid');
  return match[1];
}

function constantTimeTextEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function hmac(binding: string, key: Buffer): string {
  return createHmac('sha256', key).update(binding, 'utf8').digest('base64url');
}

function encodeBase32(input: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += base32Character((value >>> (bits - 5)) & 31);
      bits -= 5;
    }
  }
  if (bits > 0) output += base32Character((value << (5 - bits)) & 31);
  return output;
}

function base32Character(index: number): string {
  const character = BASE32_ALPHABET[index];
  if (character === undefined) throw new Error('Base32 encoding index is invalid');
  return character;
}

async function loadPreviousKeys(
  references: Readonly<Record<string, string>>,
): Promise<readonly NonProductionDigestKey[]> {
  return Promise.all(
    Object.entries(references).map(async ([version, reference]) => loadKey(version, reference)),
  );
}

async function loadKey(version: string, reference: string): Promise<NonProductionDigestKey> {
  if (!reference.startsWith('file:')) throw new Error('Digest key reference must use file:');
  let path = decodeURIComponent(reference.slice('file:'.length));
  if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1);
  if (!isAbsolute(path)) throw new Error('Digest key file path must be absolute');
  const encodedKey = (await readFile(path, 'utf8')).trim();
  if (!/^[A-Za-z0-9_-]+$/.test(encodedKey) || encodedKey.includes('=')) {
    throw new Error('Digest key must be unpadded base64url');
  }
  const key = Buffer.from(encodedKey, 'base64url');
  if (key.length !== KEY_BYTES || key.toString('base64url') !== encodedKey) {
    throw new Error('Digest key must contain exactly 256 random bits');
  }
  return { version, key };
}
