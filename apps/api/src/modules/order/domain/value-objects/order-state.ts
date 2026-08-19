/**
 * WEMP-M08-SPEC-001 (decision D-01). The order lifecycle vocabulary:
 * PENDING (created from CartSnapshot, awaiting payment), CONFIRMED
 * (payment initiated by M09), PAID (payment verified by M09), SHIPPED
 * (shipping dispatched by M10), DELIVERED (customer received, terminal),
 * CANCELLED (cancelled before delivery, terminal), CLOSED (fully completed,
 * terminal).
 */
export const ORDER_STATES = [
  'PENDING',
  'CONFIRMED',
  'PAID',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'CLOSED',
] as const;

export type OrderState = (typeof ORDER_STATES)[number];

/**
 * DELIVERED, CANCELLED, and CLOSED are terminal states. No transitions
 * are permitted out of a terminal state.
 */
/**
 * CANCELLED and CLOSED are terminal states — no transitions out.
 * DELIVERED is NOT terminal — it transitions to CLOSED.
 */
export const TERMINAL_ORDER_STATES: readonly OrderState[] = ['CANCELLED', 'CLOSED'];

export function isTerminalOrderState(state: OrderState): boolean {
  return TERMINAL_ORDER_STATES.includes(state);
}
