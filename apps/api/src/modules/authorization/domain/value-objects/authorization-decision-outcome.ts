/**
 * Part 6.1 §5 (Module 02 source material). Authorization decision outcomes.
 * Only Access Granted permits execution. The reserved outcomes are defined for
 * contract completeness but are never produced by the Phase-1 engine.
 */
export const AUTHORIZATION_DECISION_OUTCOMES = ['GRANTED', 'DENIED'] as const;

/** Reserved outcomes (Part 6.1 §5). Not produced in Phase 1. */
export const RESERVED_AUTHORIZATION_DECISION_OUTCOMES = [
  'ADDITIONAL_AUTHORIZATION_REQUIRED',
  'ADMINISTRATIVE_REVIEW_REQUIRED',
] as const;

export type AuthorizationDecisionOutcome = (typeof AUTHORIZATION_DECISION_OUTCOMES)[number];
