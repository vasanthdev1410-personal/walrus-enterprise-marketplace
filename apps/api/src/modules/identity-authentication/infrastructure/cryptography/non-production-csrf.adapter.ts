import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import type { CsrfProtectionPort, CsrfTokenPair } from '../../presentation/ports/csrf-protection.port';
import type { IdentityAuthenticationConfiguration } from '../configuration/identity-authentication.configuration';

interface CsrfKey { readonly version: string; readonly key: Buffer }
const KEY_BYTES = 32;
const VERSION_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export class NonProductionCsrfAdapter implements CsrfProtectionPort {
  private readonly keys: ReadonlyMap<string, Buffer>;

  public constructor(private readonly active: CsrfKey, previous: readonly CsrfKey[]) {
    assertKey(active);
    const keys = new Map([[active.version, active.key]]);
    for (const key of previous) {
      assertKey(key);
      if (keys.has(key.version)) throw new Error('CSRF key versions must be unique');
      keys.set(key.version, key.key);
    }
    this.keys = keys;
  }

  public static async fromFileReferences(
    configuration: IdentityAuthenticationConfiguration,
    environment: string,
  ): Promise<NonProductionCsrfAdapter> {
    if (environment === 'production') throw new Error('Non-production CSRF adapter prohibited');
    const active = await loadKey(configuration.csrf.activeKeyVersion, configuration.csrf.activeKeyReference);
    const previous = await Promise.all(Object.entries(configuration.csrf.verificationKeyReferences)
      .map(async ([version, reference]) => loadKey(version, reference)));
    return new NonProductionCsrfAdapter(active, previous);
  }

  public issue(): string {
    const nonce = randomBytes(32).toString('base64url');
    return `v1.${this.active.version}.${nonce}.${this.mac(this.active.key, this.active.version, nonce)}`;
  }

  public verify(pair: CsrfTokenPair): boolean {
    if (pair.cookieToken !== pair.headerToken) return false;
    const parts = pair.cookieToken.split('.');
    if (parts.length !== 4 || parts[0] !== 'v1') return false;
    const [, version, nonce, suppliedMac] = parts;
    if (version === undefined || nonce === undefined || suppliedMac === undefined) return false;
    const key = this.keys.get(version);
    if (key === undefined) return false;
    const expected = Buffer.from(this.mac(key, version, nonce), 'utf8');
    const supplied = Buffer.from(suppliedMac, 'utf8');
    return expected.length === supplied.length && timingSafeEqual(expected, supplied);
  }

  private mac(key: Buffer, version: string, nonce: string): string {
    return createHmac('sha256', key)
      .update(`WALRUS-M01|CSRF|v1|key=${version}|nonce=${nonce}`, 'utf8')
      .digest('base64url');
  }
}

function assertKey(value: CsrfKey): void {
  if (!VERSION_PATTERN.test(value.version) || value.key.length !== KEY_BYTES) throw new Error('Invalid CSRF key');
}

async function loadKey(version: string, reference: string): Promise<CsrfKey> {
  if (!reference.startsWith('file:')) throw new Error('Only file: CSRF references are permitted');
  const path = reference.slice(5);
  if (!isAbsolute(path)) throw new Error('CSRF key reference must be absolute');
  const encoded = (await readFile(path, 'utf8')).trim();
  if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.includes('=')) {
    throw new Error('CSRF key must be unpadded base64url');
  }
  const key = Buffer.from(encoded, 'base64url');
  if (key.toString('base64url') !== encoded) throw new Error('CSRF key encoding is not canonical');
  return { version, key };
}
