import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import type {
  IssuedRefreshToken,
  RefreshTokenCryptographicPort,
} from '../../application/ports/refresh-token-cryptographic.port';
import type { IdentityAuthenticationConfiguration } from '../configuration/identity-authentication.configuration';

const RAW_TOKEN_PREFIX = 'wr1';
const DIGEST_PREFIX = 'hmac-sha256';
const KEY_BYTES = 32;
const VERSION_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

interface VersionedKey {
  readonly version: string;
  readonly key: Buffer;
}

export class NonProductionRefreshTokenAdapter implements RefreshTokenCryptographicPort {
  private readonly verificationKeys: ReadonlyMap<string, Buffer>;

  public constructor(
    private readonly activeKey: VersionedKey,
    previousKeys: readonly VersionedKey[],
  ) {
    this.assertKey(activeKey);
    const keys = new Map<string, Buffer>([[activeKey.version, activeKey.key]]);
    for (const previousKey of previousKeys) {
      this.assertKey(previousKey);
      if (keys.has(previousKey.version)) {
        throw new Error('Refresh Token HMAC key versions must be unique');
      }
      keys.set(previousKey.version, previousKey.key);
    }
    this.verificationKeys = keys;
  }

  public static async fromFileReferences(
    configuration: IdentityAuthenticationConfiguration,
    applicationEnvironment: string,
  ): Promise<NonProductionRefreshTokenAdapter> {
    if (applicationEnvironment === 'production') {
      throw new Error('The non-production Refresh Token adapter is prohibited in production');
    }

    const activeKey = await this.loadVersionedKey(
      configuration.refreshToken.activeKeyVersion,
      configuration.refreshToken.activeKeyReference,
    );
    const previousKeys = await Promise.all(
      Object.entries(configuration.refreshToken.verificationKeyReferences).map(
        async ([version, reference]) => this.loadVersionedKey(version, reference),
      ),
    );
    return new NonProductionRefreshTokenAdapter(activeKey, previousKeys);
  }

  public issue(): IssuedRefreshToken {
    const secret = randomBytes(KEY_BYTES).toString('base64url');
    const rawToken = `${RAW_TOKEN_PREFIX}.${this.activeKey.version}.${secret}`;
    return {
      rawToken,
      digest: this.digestWithKey(rawToken, this.activeKey),
      keyVersion: this.activeKey.version,
    };
  }

  public computeDigest(rawToken: string): string {
    const { version } = this.parseRawToken(rawToken);
    const key = this.verificationKeys.get(version);
    if (key === undefined) {
      throw new Error('Refresh Token key version is not available');
    }
    return this.digestWithKey(rawToken, { version, key });
  }

  public matches(rawToken: string, storedDigest: string): boolean {
    try {
      const computedDigest = Buffer.from(this.computeDigest(rawToken), 'utf8');
      const storedDigestBytes = Buffer.from(storedDigest, 'utf8');
      return (
        computedDigest.length === storedDigestBytes.length &&
        timingSafeEqual(computedDigest, storedDigestBytes)
      );
    } catch {
      return false;
    }
  }

  private static async loadVersionedKey(version: string, reference: string): Promise<VersionedKey> {
    if (!reference.startsWith('file:')) {
      throw new Error('Refresh Token HMAC key reference must use the file: scheme');
    }
    let path = decodeURIComponent(reference.slice('file:'.length));
    if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1);
    if (!isAbsolute(path)) {
      throw new Error('Refresh Token HMAC key file path must be absolute');
    }
    const encodedKey = (await readFile(path, 'utf8')).trim();
    if (!BASE64URL_PATTERN.test(encodedKey) || encodedKey.includes('=')) {
      throw new Error('Refresh Token HMAC key must be unpadded base64url');
    }
    const key = Buffer.from(encodedKey, 'base64url');
    if (key.length !== KEY_BYTES || key.toString('base64url') !== encodedKey) {
      throw new Error('Refresh Token HMAC key must contain exactly 256 random bits');
    }
    return { version, key };
  }

  private digestWithKey(rawToken: string, versionedKey: VersionedKey): string {
    const digest = createHmac('sha256', versionedKey.key)
      .update(rawToken, 'utf8')
      .digest('base64url');
    return `${DIGEST_PREFIX}:${versionedKey.version}:${digest}`;
  }

  private parseRawToken(rawToken: string): { readonly version: string } {
    const parts = rawToken.split('.');
    const version = parts[1];
    const secret = parts[2];
    if (
      parts.length !== 3 ||
      parts[0] !== RAW_TOKEN_PREFIX ||
      version === undefined ||
      secret === undefined ||
      !VERSION_PATTERN.test(version) ||
      !BASE64URL_PATTERN.test(secret) ||
      Buffer.from(secret, 'base64url').length !== KEY_BYTES
    ) {
      throw new Error('Refresh Token format is invalid');
    }
    return { version };
  }

  private assertKey(versionedKey: VersionedKey): void {
    if (!VERSION_PATTERN.test(versionedKey.version) || versionedKey.key.length !== KEY_BYTES) {
      throw new Error('Refresh Token HMAC key is invalid');
    }
  }
}
