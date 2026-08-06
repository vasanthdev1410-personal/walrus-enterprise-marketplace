import { randomBytes } from 'node:crypto';
import { argon2id, hash, needsRehash, verify } from 'argon2';
import type { PasswordHashingPort } from '../../application/ports/password-hashing.port';
import type { IdentityAuthenticationConfiguration } from '../configuration/identity-authentication.configuration';

const ARGON2_VERSION_13 = 0x13;

export class Argon2idPasswordHashingAdapter implements PasswordHashingPort {
  public constructor(private readonly configuration: IdentityAuthenticationConfiguration) {}

  public async hash(plaintextPassword: string): Promise<string> {
    if (plaintextPassword.length === 0) {
      throw new Error('Password cannot be empty');
    }
    const profile = this.configuration.passwordHashing;
    return hash(plaintextPassword, {
      type: argon2id,
      version: ARGON2_VERSION_13,
      memoryCost: profile.memoryKibibytes,
      timeCost: profile.iterations,
      parallelism: profile.parallelism,
      salt: randomBytes(profile.saltBytes),
      hashLength: profile.outputBytes,
    });
  }

  public async verify(plaintextPassword: string, encodedHash: string): Promise<boolean> {
    if (plaintextPassword.length === 0 || !encodedHash.startsWith('$argon2id$')) {
      return false;
    }
    try {
      return await verify(encodedHash, plaintextPassword);
    } catch {
      return false;
    }
  }

  public async verifyForAuthentication(
    plaintextPassword: string,
    encodedHash: string | undefined,
  ): Promise<boolean> {
    if (encodedHash === undefined) {
      await this.hash(plaintextPassword);
      return false;
    }
    return this.verify(plaintextPassword, encodedHash);
  }

  public needsRehash(encodedHash: string): boolean {
    if (!encodedHash.startsWith('$argon2id$')) return true;
    const profile = this.configuration.passwordHashing;
    try {
      return needsRehash(encodedHash, {
        version: ARGON2_VERSION_13,
        memoryCost: profile.memoryKibibytes,
        timeCost: profile.iterations,
        parallelism: profile.parallelism,
      });
    } catch {
      return true;
    }
  }
}
