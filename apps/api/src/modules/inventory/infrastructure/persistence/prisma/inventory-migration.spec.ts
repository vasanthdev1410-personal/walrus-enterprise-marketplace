import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('M05 inventory migration (WEMP-M05-SPEC-001 §14)', () => {
  const sql = readFileSync(
    resolve(
      __dirname,
      '../../../../../../prisma/migrations/20260815090000_module_05_inventory/migration.sql',
    ),
    'utf8',
  );

  it('is additive and touches no Module 00/01/02/03/04 table', () => {
    for (const forbidden of [
      'CREATE TABLE "identities"',
      'CREATE TABLE "sessions"',
      'CREATE TABLE "identity_role_assignments"',
      'CREATE TABLE "authorization_decision_records"',
      'CREATE TABLE "seller_profiles"',
      'CREATE TABLE "seller_organizations"',
      'CREATE TABLE "products"',
      'CREATE TABLE "product_skus"',
      'CREATE TABLE "api_idempotency_records"',
      'ALTER TABLE',
      'DROP TABLE',
    ]) {
      expect(sql).not.toContain(forbidden);
    }
  });

  it('creates all four Module 05-owned tables', () => {
    for (const table of [
      'inventory_stock_pools',
      'inventory_movement_records',
      'inventory_audit_records',
      'inventory_config_records',
    ]) {
      expect(sql).toContain(`CREATE TABLE "${table}"`);
    }
  });

  it('declares the movement type and config state enums', () => {
    for (const enumName of ['InventoryMovementType', 'InventoryConfigState']) {
      expect(sql).toContain(`CREATE TYPE "${enumName}" AS ENUM`);
    }
  });

  it('enforces one stock pool per SKU per seller scope (D-01)', () => {
    expect(sql).toContain('inventory_stock_pools_sku_id_seller_profile_id_key');
  });

  it('guards the pool aggregate with version uniqueness (optimistic concurrency, D-07)', () => {
    expect(sql).toContain('inventory_stock_pools_stock_pool_id_aggregate_version_key');
  });

  it('keeps cross-module references FK-free (storage isolation, A-06)', () => {
    expect(sql).not.toContain('REFERENCES');
  });
});
