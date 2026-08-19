/**
 * WEMP-M08-SPEC-001 (decision D-03). A monetary amount stored in minor
 * currency units (cents). Non-negative; the authoritative price source is
 * Module 04's sellingPrice. Revalidated at checkout time (D-03).
 * Client-supplied authoritative prices are prohibited (server-side only).
 */
export class MoneyAmount {
  public readonly cents: number;
  public readonly currencyCode: string;

  public constructor(cents: number, currencyCode: string) {
    if (!Number.isSafeInteger(cents) || cents < 0) {
      throw new Error('Money amount cents must be a non-negative safe integer');
    }
    if (!/^[A-Z]{3}$/.test(currencyCode)) {
      throw new Error('Money amount currency code must be an ISO 4217 alpha-3 code');
    }
    this.cents = cents;
    this.currencyCode = currencyCode;
    Object.freeze(this);
  }
}
