export interface PasswordHashingPort {
  hash(plaintextPassword: string): Promise<string>;
  verify(plaintextPassword: string, encodedHash: string): Promise<boolean>;
  verifyForAuthentication(
    plaintextPassword: string,
    encodedHash: string | undefined,
  ): Promise<boolean>;
  needsRehash(encodedHash: string): boolean;
}
