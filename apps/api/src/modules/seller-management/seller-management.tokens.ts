/**
 * Module 03 DI tokens (WEMP-M03-PLAN-001 M03-M4 / M03-M5). Cross-module
 * contract ports are token-bound so Module 03 can swap adapters without
 * touching consumers. The SELLER_OWNERSHIP_RESOLVER token itself is defined
 * by Module 02 (authorization.tokens) — Module 03 provides the implementation.
 */
export const SELLER_PROFILE_REPOSITORY = Symbol('SELLER_PROFILE_REPOSITORY');
export const MODULE01_IDENTITY_CONTRACT = Symbol('MODULE01_IDENTITY_CONTRACT');
export const SELLER_ADMIN_AUTHORIZATION = Symbol('SELLER_ADMIN_AUTHORIZATION');
export const MODULE02_AUTHORIZATION_CONTRACT = Symbol('MODULE02_AUTHORIZATION_CONTRACT');
export const SELLER_AUTHORIZATION_APPLICATION_SERVICE = Symbol(
  'SELLER_AUTHORIZATION_APPLICATION_SERVICE',
);
// --- M03-M5 presentation-layer tokens (WEMP-M03-PLAN-001 M03-M5) ---
export const SELLER_ONBOARDING_APPLICATION_SERVICE = Symbol(
  'SELLER_ONBOARDING_APPLICATION_SERVICE',
);
export const SELLER_VERIFICATION_APPLICATION_SERVICE = Symbol(
  'SELLER_VERIFICATION_APPLICATION_SERVICE',
);
export const SELLER_READ_APPLICATION_SERVICE = Symbol('SELLER_READ_APPLICATION_SERVICE');
export const SELLER_WAREHOUSE_APPLICATION_SERVICE = Symbol(
  'SELLER_WAREHOUSE_APPLICATION_SERVICE',
);
export const SELLER_MEMBER_APPLICATION_SERVICE = Symbol('SELLER_MEMBER_APPLICATION_SERVICE');
/**
 * The evidence storage boundary implementation (WEMP-M03-SPEC-001 §12.5,
 * decision D-03). Non-production in this repository until the approved object
 * storage boundary is integrated.
 */
export const SELLER_EVIDENCE_STORAGE = Symbol('SELLER_EVIDENCE_STORAGE');
