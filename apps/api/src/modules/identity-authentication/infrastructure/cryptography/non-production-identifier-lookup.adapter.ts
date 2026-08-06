import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import type {
  IdentifierLookupContext,
  IdentifierLookupCryptographicPort,
} from '../../application/ports/identifier-lookup-cryptographic.port';
import type { IdentityAuthenticationConfiguration } from '../configuration/identity-authentication.configuration';

const KEY_BYTES = 32;
const VERSION_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const ENVIRONMENT_PATTERN = /^[A-Za-z0-9._-]+$/;

export interface IdentifierLookupKey {
  readonly version: string;
  readonly key: Buffer;
}

export class NonProductionIdentifierLookupAdapter implements IdentifierLookupCryptographicPort {
  private readonly keys: ReadonlyMap<string, Buffer>;

  public constructor(
    private readonly activeKey: IdentifierLookupKey,
    previousKeys: readonly IdentifierLookupKey[],
  ) {
    assertKey(activeKey);
    const keys = new Map<string, Buffer>([[activeKey.version, activeKey.key]]);
    for (const previousKey of previousKeys) {
      assertKey(previousKey);
      if (keys.has(previousKey.version)) {
        throw new Error('Identifier Lookup key versions must be unique');
      }
      keys.set(previousKey.version, previousKey.key);
    }
    this.keys = keys;
  }

  public static async fromFileReferences(
    configuration: IdentityAuthenticationConfiguration,
    applicationEnvironment: string,
  ): Promise<NonProductionIdentifierLookupAdapter> {
    if (applicationEnvironment === 'production') {
      throw new Error('The non-production Identifier Lookup adapter is prohibited in production');
    }
    const activeKey = await loadKey(
      configuration.identifierLookup.activeKeyVersion,
      configuration.identifierLookup.activeKeyReference,
    );
    const previousKeys = await Promise.all(
      Object.entries(configuration.identifierLookup.verificationKeyReferences).map(
        async ([version, reference]) => loadKey(version, reference),
      ),
    );
    return new NonProductionIdentifierLookupAdapter(activeKey, previousKeys);
  }

  public createActiveLookup(context: IdentifierLookupContext): string {
    return this.createLookup(context, this.activeKey);
  }

  public createLookupsForResolution(context: IdentifierLookupContext): readonly string[] {
    return [...this.keys].map(([version, key]) => this.createLookup(context, { version, key }));
  }

  public usesSameKeyMaterial(candidate: Buffer): boolean {
    if (candidate.length !== KEY_BYTES) return false;
    return [...this.keys.values()].some((key) => timingSafeEqual(key, candidate));
  }

  private createLookup(
    context: IdentifierLookupContext,
    versionedKey: IdentifierLookupKey,
  ): string {
    assertContext(context);
    const binding = `WALRUS-M01|IDENTIFIER_LOOKUP|v1|environment=${context.environment}|identifierType=${context.identifierType}|value=${context.canonicalValue}`;
    const digest = createHmac('sha256', versionedKey.key)
      .update(binding, 'utf8')
      .digest('base64url');
    return `hmac-sha256:identifier-lookup:v1:${versionedKey.version}:${digest}`;
  }
}

function assertContext(context: IdentifierLookupContext): void {
  if (
    !ENVIRONMENT_PATTERN.test(context.environment) ||
    context.canonicalValue.length === 0 ||
    /[|=\r\n]/.test(context.canonicalValue)
  ) {
    throw new Error('Identifier Lookup context is invalid');
  }
}

function assertKey(candidate: IdentifierLookupKey): void {
  if (!VERSION_PATTERN.test(candidate.version) || candidate.key.length !== KEY_BYTES) {
    throw new Error('Identifier Lookup HMAC key is invalid');
  }
}

async function loadKey(version: string, reference: string): Promise<IdentifierLookupKey> {
  if (!reference.startsWith('file:')) {
    throw new Error('Identifier Lookup key reference must use file:');
  }
  let path = decodeURIComponent(reference.slice('file:'.length));
  if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1);
  if (!isAbsolute(path)) throw new Error('Identifier Lookup key file path must be absolute');
  const encodedKey = (await readFile(path, 'utf8')).trim();
  if (!/^[A-Za-z0-9_-]+$/.test(encodedKey) || encodedKey.includes('=')) {
    throw new Error('Identifier Lookup key must be unpadded base64url');
  }
  const key = Buffer.from(encodedKey, 'base64url');
  if (key.length !== KEY_BYTES || key.toString('base64url') !== encodedKey) {
    throw new Error('Identifier Lookup key must contain exactly 256 random bits');
  }
  return { version, key };
}
