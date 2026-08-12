import { readFileSync } from 'node:fs';
import { createPublicKey } from 'node:crypto';
import type { TrustedWorkloadKeyResolverPort } from '../../application/ports/trusted-workload.port';
import { TrustedBoundaryError } from '../../application/errors/trusted-boundary.error';

type KeyFile = Readonly<Record<string, Readonly<Record<string, string>>>>;

export class FileWorkloadKeyResolverAdapter implements TrustedWorkloadKeyResolverPort {
  private readonly keys: KeyFile;
  private readonly revoked: ReadonlySet<string>;

  public constructor(path: string | undefined, revokedKeyIds: readonly string[]) {
    this.revoked = new Set(revokedKeyIds);
    if (!path) {
      this.keys = {};
      return;
    }
    try {
      this.keys = JSON.parse(readFileSync(path, 'utf8')) as KeyFile;
    } catch {
      throw new Error('WI-1 verification key configuration could not be loaded');
    }
  }

  public resolveVerificationKey(issuer: string, keyId: string): Promise<CryptoKey> {
    const pem = this.keys[issuer]?.[keyId];
    if (!pem) return Promise.reject(new TrustedBoundaryError('WI_KEY_UNKNOWN'));
    return Promise.resolve(createPublicKey(pem) as unknown as CryptoKey);
  }

  public isKeyRevoked(_issuer: string, keyId: string): Promise<boolean> {
    return Promise.resolve(this.revoked.has(keyId));
  }
}
