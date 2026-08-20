/**
 * WEMP-M09-SPEC-001 (M09-M1, decision D-03). The payment lifecycle
 * vocabulary:
 *
 * PENDING        — Payment record created, awaiting customer action
 * PROCESSING     — Customer has initiated payment with provider
 * CAPTURED       — Provider confirmed payment captured (webhook)
 * FAILED         — Provider rejected payment or timeout
 * REFUND_PENDING — Refund initiated with provider
 * REFUNDED       — Provider confirmed refund
 * EXPIRED        — Payment window expired (configurable TTL)
 *
 * Terminal states: FAILED, EXPIRED, REFUNDED.
 * No transitions are permitted out of a terminal state.
 * CAPTURED is NOT terminal — it can transition to REFUND_PENDING (admin refund).
 */
export const PAYMENT_STATES = [
  'PENDING',
  'PROCESSING',
  'CAPTURED',
  'FAILED',
  'REFUND_PENDING',
  'REFUNDED',
  'EXPIRED',
] as const;

export type PaymentState = (typeof PAYMENT_STATES)[number];

/**
 * FAILED, EXPIRED, and REFUNDED are terminal states — no transitions
 * are permitted out of a terminal state. CAPTURED is NOT terminal: it
 * can transition to REFUND_PENDING (admin-initiated refund).
 */
export const TERMINAL_PAYMENT_STATES: readonly PaymentState[] = [
  'FAILED',
  'EXPIRED',
  'REFUNDED',
];

export function isTerminalPaymentState(state: PaymentState): boolean {
  return TERMINAL_PAYMENT_STATES.includes(state);
}
