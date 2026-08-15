/**
 * WEMP-M05-SPEC-001 §5/§22 (decisions D-03, D-14). Derived read-model
 * stock labels computed from configurable thresholds — never stored
 * business state (mirrors the Module 03 `complianceState` derived-summary
 * precedent §5). Label enforcement fails closed when the required
 * threshold configuration is missing or invalid: no label is derived
 * without a valid configured threshold (D-14). Threshold values are
 * platform-defined, admin-managed configuration; no value is hard-coded
 * here (Gate #4 — values pending authority input).
 */
export const INVENTORY_STOCK_LABELS = ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'] as const;

export type InventoryStockLabel = (typeof INVENTORY_STOCK_LABELS)[number];

/**
 * Fail-closed result of label derivation: either a derived label or
 * `undefined` when the required configuration is missing/invalid and no
 * label may be enforced (D-14).
 */
export type DerivedStockLabel = InventoryStockLabel | undefined;
