import { createHash } from 'node:crypto';

/**
 * WEMP-M03-SPEC-001 §3 / decision D-02. The business registration lookup
 * digest is derived SERVER-SIDE from the client-supplied registration number:
 * the raw value is normalized (trimmed, upper-cased) and SHA-256 hashed. The
 * digest is the only persisted lookup key (unique per ACTIVE seller); the raw
 * registration number is stored as a ProtectedValue. The client never supplies
 * the digest itself and never controls duplicate prevention.
 */
export function sellerRegistrationLookupDigest(registrationNumber: string): string {
  return createHash('sha256')
    .update(registrationNumber.trim().toUpperCase(), 'utf8')
    .digest('hex');
}
