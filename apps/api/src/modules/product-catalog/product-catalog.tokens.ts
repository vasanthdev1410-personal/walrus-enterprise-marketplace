/**
 * Module 04 DI tokens (WEMP-M04-PLAN-001 M04-M4). Cross-module contract
 * ports are token-bound so Module 04 can swap adapters without touching
 * consumers. Module 02 tokens (AUTHORIZATION_APPLICATION_SERVICE,
 * SELLER_OWNERSHIP_RESOLVER) are defined by Module 02 — Module 04 injects
 * them; Module 04 provides the implementations of its own ports.
 */
export const PRODUCT_CATALOG_REPOSITORY = Symbol('PRODUCT_CATALOG_REPOSITORY');
/**
 * WEMP-M04-CONTRACT-001 Part B (decision D-12) / WEMP-M05-SPEC-001 §11.1
 * (decision D-10, M05-M4 SKU-fact wiring). The Module 04
 * `ProductCatalogReadPort` consumed by trading modules (05/07/08) through
 * the approved cross-module contract — Module 04 owns the implementation
 * and the PUBLISHED visibility gate; consumers never read Module 04
 * storage (A-06).
 */
export const PRODUCT_CATALOG_READ = Symbol('PRODUCT_CATALOG_READ');
/** WEMP-M04-CONTRACT-001 Part A (decisions D-01, D-11). */
export const MODULE02_SELLER_AUTHORIZATION_CONTRACT = Symbol(
  'MODULE02_SELLER_AUTHORIZATION_CONTRACT',
);
/** WEMP-M04-AUTHZ-001 §2.2 (decision D-11). */
export const PRODUCT_ADMIN_AUTHORIZATION = Symbol('PRODUCT_ADMIN_AUTHORIZATION');
/** WEMP-M04-SPEC-001 §12/§23 (decisions D-09, D-17). */
export const PRODUCT_MEDIA_STORAGE = Symbol('PRODUCT_MEDIA_STORAGE');
/** WEMP-M04-SPEC-001 §11 / WEMP-M04-CONTRACT-001 Part C (decision D-08). */
export const MODULE05_INVENTORY_CONTRACT = Symbol('MODULE05_INVENTORY_CONTRACT');
export const PRODUCT_APPLICATION_SERVICE = Symbol('PRODUCT_APPLICATION_SERVICE');
export const PRODUCT_MODERATION_APPLICATION_SERVICE = Symbol(
  'PRODUCT_MODERATION_APPLICATION_SERVICE',
);
export const PRODUCT_VARIANT_SKU_APPLICATION_SERVICE = Symbol(
  'PRODUCT_VARIANT_SKU_APPLICATION_SERVICE',
);
export const PRODUCT_MEDIA_APPLICATION_SERVICE = Symbol('PRODUCT_MEDIA_APPLICATION_SERVICE');
export const PRODUCT_CATEGORY_READ_SERVICE = Symbol('PRODUCT_CATEGORY_READ_SERVICE');
/** WEMP-M04-SPEC-001 §18 (M04-M5). Seller + admin product read service. */
export const PRODUCT_READ_APPLICATION_SERVICE = Symbol('PRODUCT_READ_APPLICATION_SERVICE');
