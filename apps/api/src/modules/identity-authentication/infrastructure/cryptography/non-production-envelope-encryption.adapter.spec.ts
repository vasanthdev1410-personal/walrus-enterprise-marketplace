import { randomBytes } from 'node:crypto';
import type { ProtectedEnvelope } from '../../application/ports/envelope-encryption.port';
import { NonProductionEnvelopeEncryptionAdapter } from './non-production-envelope-encryption.adapter';

const context = {
  environment: 'test',
  recordType: 'IdentityIdentifier',
  recordId: '018f2c52-43d1-7d28-a94e-20dc2b5dc123',
  fieldName: 'normalizedValue',
} as const;

describe('NonProductionEnvelopeEncryptionAdapter', () => {
  it('encrypts with a unique DEK and decrypts only with the bound context', () => {
    const adapter = createAdapter('kek-v1');
    const plaintext = Buffer.from('person@example.com');

    const first = adapter.encrypt(plaintext, context);
    const second = adapter.encrypt(plaintext, context);

    expect(first).toMatchObject({
      envelopeVersion: 'walrus-envelope-v1',
      algorithm: 'AES-256-GCM',
      kekVersion: 'kek-v1',
    });
    expect(first.ciphertext).not.toBe(plaintext.toString('base64url'));
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(first.encryptedDek).not.toBe(second.encryptedDek);
    expect(Buffer.from(adapter.decrypt(first, context)).toString()).toBe(plaintext.toString());
    expect(() =>
      adapter.decrypt(first, { ...context, recordId: '018f2c52-43d1-7d28-a94e-20dc2b5dc999' }),
    ).toThrow();
  });

  it('rejects ciphertext and authentication metadata tampering', () => {
    const adapter = createAdapter('kek-v1');
    const envelope = adapter.encrypt(Buffer.from('protected'), context);
    const tampered: ProtectedEnvelope = {
      ...envelope,
      ciphertext: replaceFirstCharacter(envelope.ciphertext),
    };

    expect(() => adapter.decrypt(tampered, context)).toThrow();
    expect(() =>
      adapter.decrypt(
        { ...envelope, dekAuthenticationTag: replaceFirstCharacter(envelope.dekAuthenticationTag) },
        context,
      ),
    ).toThrow();
  });

  it('rewraps only the DEK under the active KEK and preserves encrypted data', () => {
    const previousKey = randomBytes(32);
    const originalAdapter = new NonProductionEnvelopeEncryptionAdapter(
      { version: 'kek-v1', key: previousKey },
      [],
    );
    const original = originalAdapter.encrypt(Buffer.from('rotate-me'), context);
    const rotatedAdapter = new NonProductionEnvelopeEncryptionAdapter(
      { version: 'kek-v2', key: randomBytes(32) },
      [{ version: 'kek-v1', key: previousKey }],
    );

    const rewrapped = rotatedAdapter.rewrapDek(original, context);

    expect(rewrapped.kekVersion).toBe('kek-v2');
    expect(rewrapped.ciphertext).toBe(original.ciphertext);
    expect(rewrapped.nonce).toBe(original.nonce);
    expect(rewrapped.authenticationTag).toBe(original.authenticationTag);
    expect(rewrapped.encryptedDek).not.toBe(original.encryptedDek);
    expect(Buffer.from(rotatedAdapter.decrypt(rewrapped, context)).toString()).toBe('rotate-me');
  });

  it('fails when the envelope KEK version is unavailable', () => {
    const envelope = createAdapter('kek-v1').encrypt(Buffer.from('protected'), context);
    expect(() => createAdapter('kek-v2').decrypt(envelope, context)).toThrow(
      'Envelope KEK version is unavailable',
    );
  });

  it('rejects use of the local file-reference adapter in production before key loading', async () => {
    await expect(
      NonProductionEnvelopeEncryptionAdapter.fromFileReferences(
        {
          envelopeEncryption: {
            activeKekVersion: 'kek-v1',
            activeKekReference: 'file:C:/missing.key',
            decryptionKekReferences: {},
          },
        } as never,
        'production',
      ),
    ).rejects.toThrow('prohibited in production');
  });
});

function createAdapter(version: string): NonProductionEnvelopeEncryptionAdapter {
  return new NonProductionEnvelopeEncryptionAdapter({ version, key: randomBytes(32) }, []);
}

function replaceFirstCharacter(value: string): string {
  return `${value.startsWith('A') ? 'B' : 'A'}${value.slice(1)}`;
}
