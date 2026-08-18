/**
 * WEMP-M06-SPEC-001 §5 (decision D-02). The customer lifecycle vocabulary:
 * ACTIVE, SUSPENDED, CLOSED. CLOSED is the single terminal state; any
 * transition out of it is forbidden (fail closed).
 */
export const CUSTOMER_STATES = ['ACTIVE', 'SUSPENDED', 'CLOSED'] as const;

export type CustomerState = (typeof CUSTOMER_STATES)[number];

export const TERMINAL_CUSTOMER_STATES: readonly CustomerState[] = ['CLOSED'];

export function isTerminalCustomerState(state: CustomerState): boolean {
  return TERMINAL_CUSTOMER_STATES.includes(state);
}
