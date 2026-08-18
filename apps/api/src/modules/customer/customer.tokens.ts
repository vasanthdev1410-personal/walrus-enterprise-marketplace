/**
 * Module 06 DI tokens (WEMP-M06-PLAN-001 M06-M4). Cross-module contract
 * ports are token-bound so Module 06 can swap adapters without touching
 * consumers. The CUSTOMER_OWNERSHIP_RESOLVER token itself is defined by
 * Module 02 (authorization.tokens) — Module 06 provides the implementation.
 */
export const CUSTOMER_PROFILE_REPOSITORY = Symbol('CUSTOMER_PROFILE_REPOSITORY');
export const CUSTOMER_ADMIN_AUTHORIZATION = Symbol('CUSTOMER_ADMIN_AUTHORIZATION');
// --- M06-M3 application service tokens (wired at M06-M4; consumed by the
// M06-M5 presentation layer) ---
export const CUSTOMER_PROFILE_APPLICATION_SERVICE = Symbol('CUSTOMER_PROFILE_APPLICATION_SERVICE');
export const CUSTOMER_LIFECYCLE_APPLICATION_SERVICE = Symbol(
  'CUSTOMER_LIFECYCLE_APPLICATION_SERVICE',
);
export const CUSTOMER_ADDRESS_APPLICATION_SERVICE = Symbol('CUSTOMER_ADDRESS_APPLICATION_SERVICE');
export const CUSTOMER_BUSINESS_PROFILE_APPLICATION_SERVICE = Symbol(
  'CUSTOMER_BUSINESS_PROFILE_APPLICATION_SERVICE',
);
export const CUSTOMER_PREFERENCE_APPLICATION_SERVICE = Symbol(
  'CUSTOMER_PREFERENCE_APPLICATION_SERVICE',
);
export const CUSTOMER_RETENTION_APPLICATION_SERVICE = Symbol(
  'CUSTOMER_RETENTION_APPLICATION_SERVICE',
);
// --- M06-M5 admin read token (consumed by the admin presentation surface) ---
export const CUSTOMER_ADMIN_READ_APPLICATION_SERVICE = Symbol(
  'CUSTOMER_ADMIN_READ_APPLICATION_SERVICE',
);
