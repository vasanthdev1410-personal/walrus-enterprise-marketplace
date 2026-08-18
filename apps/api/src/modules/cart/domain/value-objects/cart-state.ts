/**
 * WEMP-M07-SPEC-001 (decision D-07). The cart lifecycle vocabulary:
 * ACTIVE (cart in use), CHECKED_OUT (handed to M08), ARCHIVED
 * (post-checkout retention), AUTO_EXPIRED (abandoned, 30-day TTL).
 */
export const CART_STATES = ['ACTIVE', 'CHECKED_OUT', 'ARCHIVED', 'AUTO_EXPIRED'] as const;

export type CartState = (typeof CART_STATES)[number];

/**
 * ARCHIVED is the single terminal state. CHECKED_OUT and AUTO_EXPIRED are
 * intermediate states with exactly one valid outgoing transition (→ ARCHIVED).
 */
export const TERMINAL_CART_STATES: readonly CartState[] = ['ARCHIVED'];

export function isTerminalCartState(state: CartState): boolean {
  return TERMINAL_CART_STATES.includes(state);
}
