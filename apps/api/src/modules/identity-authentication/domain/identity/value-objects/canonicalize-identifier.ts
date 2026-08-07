import { CanonicalEmailAddress } from './canonical-email-address';
import { CanonicalMobileNumber } from './canonical-mobile-number';
import type { IdentifierType } from './identifier-type';

/**
 * Canonicalizes an identifier value according to its type. Email addresses are
 * trimmed, lower-cased and structurally validated; mobile numbers must use
 * normalized international (E.164) format. Throws when the value is invalid.
 *
 * Shared by registration, authentication and verification flows so that lookup
 * digests and protected destination references are always derived from the
 * same canonical representation.
 */
export function canonicalizeIdentifier(type: IdentifierType, value: string): string {
  return type === 'EMAIL'
    ? new CanonicalEmailAddress(value).value
    : new CanonicalMobileNumber(value).value;
}
