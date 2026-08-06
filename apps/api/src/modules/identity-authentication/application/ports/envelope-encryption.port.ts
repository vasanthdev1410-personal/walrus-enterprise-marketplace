export interface EnvelopeEncryptionContext {
  readonly environment: string;
  readonly recordType: string;
  readonly recordId: string;
  readonly fieldName: string;
}

export interface ProtectedEnvelope {
  readonly envelopeVersion: 'walrus-envelope-v1';
  readonly algorithm: 'AES-256-GCM';
  readonly kekVersion: string;
  readonly ciphertext: string;
  readonly nonce: string;
  readonly authenticationTag: string;
  readonly encryptedDek: string;
  readonly dekNonce: string;
  readonly dekAuthenticationTag: string;
}

export interface EnvelopeEncryptionPort {
  encrypt(plaintext: Uint8Array, context: EnvelopeEncryptionContext): ProtectedEnvelope;
  decrypt(envelope: ProtectedEnvelope, context: EnvelopeEncryptionContext): Uint8Array;
  rewrapDek(envelope: ProtectedEnvelope, context: EnvelopeEncryptionContext): ProtectedEnvelope;
}
