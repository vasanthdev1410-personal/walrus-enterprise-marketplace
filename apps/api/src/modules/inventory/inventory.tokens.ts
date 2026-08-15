/**
 * Module 05 DI tokens (WEMP-M05-PLAN-001 M05-M3). Cross-module contract
 * ports are token-bound so Module 05 can swap adapters without touching
 * consumers. The real Module 02 ownership-resolver and Module 04 SKU-fact
 * wiring is M05-M4 work; until then the production wiring is the
 * fail-closed adapter (deny). Module 02/04 tokens are defined by their own
 * modules — Module 05 provides the implementations of its own ports.
 */
/** WEMP-M05-SPEC-001 §14 (M05-M2). */
export const INVENTORY_STOCK_POOL_REPOSITORY = Symbol('INVENTORY_STOCK_POOL_REPOSITORY');
export const INVENTORY_EVIDENCE_READ_REPOSITORY = Symbol('INVENTORY_EVIDENCE_READ_REPOSITORY');
/** WEMP-M05-AUTHZ-001 (D-05/A-09) — fail-closed until M05-M4 wires the real resolver. */
export const MODULE02_INVENTORY_AUTHORIZATION_CONTRACT = Symbol(
  'MODULE02_INVENTORY_AUTHORIZATION_CONTRACT',
);
/** WEMP-M05-SPEC-001 §11 (D-10) — fail-closed until M05-M4 wires the real Module 04 read port. */
export const MODULE04_PRODUCT_CATALOG_READ = Symbol('MODULE04_PRODUCT_CATALOG_READ');
/** WEMP-M05-AUTHZ-001 (D-05) — fail-closed until M05-M4 wires the Module 02 permission adapter. */
export const INVENTORY_ADMIN_AUTHORIZATION = Symbol('INVENTORY_ADMIN_AUTHORIZATION');
/** WEMP-M05-SPEC-001 §22 (D-14; values RECORDED 2026-08-15). */
export const INVENTORY_THRESHOLD_CONFIGURATION = Symbol('INVENTORY_THRESHOLD_CONFIGURATION');
/** WEMP-M05-SPEC-001 §21 (D-12; durations RECORDED 2026-08-15). */
export const INVENTORY_RETENTION_CONFIGURATION = Symbol('INVENTORY_RETENTION_CONFIGURATION');
/** WEMP-M05-SPEC-001 §7/§11.1 (D-06). */
export const INVENTORY_RESERVATION_PORT = Symbol('INVENTORY_RESERVATION_PORT');
export const INVENTORY_APPLICATION_SERVICE = Symbol('INVENTORY_APPLICATION_SERVICE');
export const INVENTORY_READ_APPLICATION_SERVICE = Symbol('INVENTORY_READ_APPLICATION_SERVICE');
