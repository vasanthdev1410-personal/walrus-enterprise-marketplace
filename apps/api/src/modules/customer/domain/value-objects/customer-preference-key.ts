/**
 * WEMP-M06-SPEC-001 §9 (decision D-06). Allow-listed basic account
 * preference keys. Unknown keys are rejected (deny by default). No
 * notification-domain preference keys exist — notifications belong to Module
 * 11 and are explicitly out of scope (A-13).
 */
export const CUSTOMER_PREFERENCE_KEYS = ['language', 'currency', 'locale'] as const;

export type CustomerPreferenceKey = (typeof CUSTOMER_PREFERENCE_KEYS)[number];

export function isCustomerPreferenceKey(value: string): value is CustomerPreferenceKey {
  return (CUSTOMER_PREFERENCE_KEYS as readonly string[]).includes(value);
}
