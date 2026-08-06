import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import type {
  EnvelopeEncryptionContext,
  EnvelopeEncryptionPort,
  ProtectedEnvelope,
} from '../../application/ports/envelope-encryption.port';
import type { IdentityAuthenticationConfiguration } from '../configuration/identity-authentication.configuration';

const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const VERSION_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const CONTEXT_VALUE_PATTERN = /^[A-Za-z0-9._:-]+$/;

export interface EnvelopeEncryptionKey {
  readonly version: string;
  readonly key: Buffer;
}

export class NonProductionEnvelopeEncryptionAdapter implements EnvelopeEncryptionPort {
  private readonly keys: ReadonlyMap<string, Buffer>;

  public constructor(
    private readonly activeKek: EnvelopeEncryptionKey,
    decryptionOnlyKeks: readonly EnvelopeEncryptionKey[],
  ) {
    assertKey(activeKek);
    const keys = new Map<string, Buffer>([[activeKek.version, activeKek.key]]);
    for (const candidate of decryptionOnlyKeks) {
      assertKey(candidate);
      if (keys.has(candidate.version)) throw new Error('Envelope KEK versions must be unique');
      keys.set(candidate.version, candidate.key);
    }
    this.keys = keys;
  }

  public static async fromFileReferences(
    configuration: IdentityAuthenticationConfiguration,
    applicationEnvironment: string,
  ): Promise<NonProductionEnvelopeEncryptionAdapter> {
    if (applicationEnvironment === 'production') {
      throw new Error('The non-production Envelope Encryption adapter is prohibited in production');
    }
    const activeKek = await loadKey(
      configuration.envelopeEncryption.activeKekVersion,
      configuration.envelopeEncryption.activeKekReference,
    );
    const previousKeks = await Promise.all(
      Object.entries(configuration.envelopeEncryption.decryptionKekReferences).map(
        async ([version, reference]) => loadKey(version, reference),
      ),
    );
    return new NonProductionEnvelopeEncryptionAdapter(activeKek, previousKeks);
  }

  public encrypt(plaintext: Uint8Array, context: EnvelopeEncryptionContext): ProtectedEnvelope {
    if (plaintext.byteLength === 0) throw new Error('Envelope plaintext cannot be empty');
    const contextBytes = canonicalContext(context);
    const dek = randomBytes(KEY_BYTES);
    try {
      const dataNonce = randomBytes(NONCE_BYTES);
      const dataCipher = createCipheriv('aes-256-gcm', dek, dataNonce, {
        authTagLength: TAG_BYTES,
      });
      dataCipher.setAAD(contextBytes);
      const ciphertext = Buffer.concat([dataCipher.update(plaintext), dataCipher.final()]);
      const dataTag = dataCipher.getAuthTag();
      const wrappedDek = wrapDek(dek, this.activeKek, contextBytes);

      return {
        envelopeVersion: 'walrus-envelope-v1',
        algorithm: 'AES-256-GCM',
        kekVersion: this.activeKek.version,
        ciphertext: ciphertext.toString('base64url'),
        nonce: dataNonce.toString('base64url'),
        authenticationTag: dataTag.toString('base64url'),
        encryptedDek: wrappedDek.ciphertext.toString('base64url'),
        dekNonce: wrappedDek.nonce.toString('base64url'),
        dekAuthenticationTag: wrappedDek.tag.toString('base64url'),
      };
    } finally {
      dek.fill(0);
    }
  }

  public decrypt(envelope: ProtectedEnvelope, context: EnvelopeEncryptionContext): Uint8Array {
    assertEnvelope(envelope);
    const contextBytes = canonicalContext(context);
    const dek = this.unwrapDek(envelope, contextBytes);
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        dek,
        decodeExact(envelope.nonce, NONCE_BYTES, 'data nonce'),
        { authTagLength: TAG_BYTES },
      );
      decipher.setAAD(contextBytes);
      decipher.setAuthTag(decodeExact(envelope.authenticationTag, TAG_BYTES, 'authentication tag'));
      return Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, 'base64url')),
        decipher.final(),
      ]);
    } finally {
      dek.fill(0);
    }
  }

  public rewrapDek(
    envelope: ProtectedEnvelope,
    context: EnvelopeEncryptionContext,
  ): ProtectedEnvelope {
    assertEnvelope(envelope);
    if (envelope.kekVersion === this.activeKek.version) return envelope;
    const contextBytes = canonicalContext(context);
    const dek = this.unwrapDek(envelope, contextBytes);
    try {
      const wrappedDek = wrapDek(dek, this.activeKek, contextBytes);
      return {
        ...envelope,
        kekVersion: this.activeKek.version,
        encryptedDek: wrappedDek.ciphertext.toString('base64url'),
        dekNonce: wrappedDek.nonce.toString('base64url'),
        dekAuthenticationTag: wrappedDek.tag.toString('base64url'),
      };
    } finally {
      dek.fill(0);
    }
  }

  private unwrapDek(envelope: ProtectedEnvelope, contextBytes: Buffer): Buffer {
    const kek = this.keys.get(envelope.kekVersion);
    if (kek === undefined) throw new Error('Envelope KEK version is unavailable');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      kek,
      decodeExact(envelope.dekNonce, NONCE_BYTES, 'DEK nonce'),
      { authTagLength: TAG_BYTES },
    );
    decipher.setAAD(wrapContext(contextBytes, envelope.kekVersion));
    decipher.setAuthTag(
      decodeExact(envelope.dekAuthenticationTag, TAG_BYTES, 'DEK authentication tag'),
    );
    const dek = Buffer.concat([
      decipher.update(Buffer.from(envelope.encryptedDek, 'base64url')),
      decipher.final(),
    ]);
    if (dek.length !== KEY_BYTES) {
      dek.fill(0);
      throw new Error('Unwrapped DEK length is invalid');
    }
    return dek;
  }
}

function wrapDek(
  dek: Buffer,
  kek: EnvelopeEncryptionKey,
  contextBytes: Buffer,
): { readonly ciphertext: Buffer; readonly nonce: Buffer; readonly tag: Buffer } {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', kek.key, nonce, { authTagLength: TAG_BYTES });
  cipher.setAAD(wrapContext(contextBytes, kek.version));
  return {
    ciphertext: Buffer.concat([cipher.update(dek), cipher.final()]),
    nonce,
    tag: cipher.getAuthTag(),
  };
}

function canonicalContext(context: EnvelopeEncryptionContext): Buffer {
  if (
    !CONTEXT_VALUE_PATTERN.test(context.environment) ||
    !CONTEXT_VALUE_PATTERN.test(context.recordType) ||
    !CONTEXT_VALUE_PATTERN.test(context.recordId) ||
    !CONTEXT_VALUE_PATTERN.test(context.fieldName)
  ) {
    throw new Error('Envelope Encryption context is invalid');
  }
  return Buffer.from(
    `WALRUS-M01|ENVELOPE|v1|environment=${context.environment}|module=M01|recordType=${context.recordType}|recordId=${context.recordId}|fieldName=${context.fieldName}`,
    'utf8',
  );
}

function wrapContext(contextBytes: Buffer, kekVersion: string): Buffer {
  return Buffer.concat([
    contextBytes,
    Buffer.from(`|purpose=DEK_WRAP|kekVersion=${kekVersion}`, 'utf8'),
  ]);
}

function assertEnvelope(envelope: ProtectedEnvelope): void {
  const metadata: { readonly envelopeVersion?: unknown; readonly algorithm?: unknown } = envelope;
  if (
    metadata.envelopeVersion !== 'walrus-envelope-v1' ||
    metadata.algorithm !== 'AES-256-GCM' ||
    !VERSION_PATTERN.test(envelope.kekVersion)
  ) {
    throw new Error('Protected Envelope metadata is invalid');
  }
}

function decodeExact(value: string, bytes: number, field: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.includes('=')) {
    throw new Error(`Protected Envelope ${field} encoding is invalid`);
  }
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length !== bytes || decoded.toString('base64url') !== value) {
    throw new Error(`Protected Envelope ${field} length is invalid`);
  }
  return decoded;
}

function assertKey(candidate: EnvelopeEncryptionKey): void {
  if (!VERSION_PATTERN.test(candidate.version) || candidate.key.length !== KEY_BYTES) {
    throw new Error('Envelope KEK is invalid');
  }
}

async function loadKey(version: string, reference: string): Promise<EnvelopeEncryptionKey> {
  if (!reference.startsWith('file:')) throw new Error('Envelope KEK reference must use file:');
  let path = decodeURIComponent(reference.slice('file:'.length));
  if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1);
  if (!isAbsolute(path)) throw new Error('Envelope KEK file path must be absolute');
  const encodedKey = (await readFile(path, 'utf8')).trim();
  if (!/^[A-Za-z0-9_-]+$/.test(encodedKey) || encodedKey.includes('=')) {
    throw new Error('Envelope KEK must be unpadded base64url');
  }
  const key = Buffer.from(encodedKey, 'base64url');
  if (key.length !== KEY_BYTES || key.toString('base64url') !== encodedKey) {
    throw new Error('Envelope KEK must contain exactly 256 random bits');
  }
  return { version, key };
}
