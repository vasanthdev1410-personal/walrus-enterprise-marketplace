import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('M04 product catalog migration (WEMP-M04-SPEC-001 §17)', () => {
  const sql = readFileSync(
    resolve(
      __dirname,
      '../../../../../../prisma/migrations/20260814090000_module_04_product_catalog/migration.sql',
    ),
    'utf8',
  );

  it('is additive and touches no Module 00/01/02/03 table', () => {
    for (const forbidden of [
      'CREATE TABLE "identities"',
      'CREATE TABLE "sessions"',
      'CREATE TABLE "identity_role_assignments"',
      'CREATE TABLE "authorization_decision_records"',
      'CREATE TABLE "seller_profiles"',
      'CREATE TABLE "seller_organizations"',
      'CREATE TABLE "seller_identity_associations"',
      'CREATE TABLE "api_idempotency_records"',
      'ALTER TABLE',
      'DROP TABLE',
    ]) {
      expect(sql).not.toContain(forbidden);
    }
  });

  it('creates all Module 04-owned tables', () => {
    for (const table of [
      'products',
      'product_variants',
      'product_skus',
      'product_categories',
      'product_attribute_definitions',
      'product_attribute_values',
      'product_media',
      'product_state_transitions',
      'product_audit_records',
      'product_price_history',
    ]) {
      expect(sql).toContain(`CREATE TABLE "${table}"`);
    }
  });

  it('declares the lifecycle, category, attribute and media enums', () => {
    for (const enumName of [
      'ProductState',
      'CategoryState',
      'AttributeValueType',
      'ProductMediaType',
      'ProductSkuState',
      'ProductAttributeValueState',
      'ProductMediaState',
    ]) {
      expect(sql).toContain(`CREATE TYPE "${enumName}" AS ENUM`);
    }
  });

  it('enforces SKU uniqueness per seller organization while ACTIVE (D-06)', () => {
    expect(sql).toContain('product_skus_seller_profile_id_sku_code_key');
    expect(sql).toContain('WHERE "state" = \'ACTIVE\'');
  });

  it('enforces append-only lifecycle episodes by unique state version per product', () => {
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "product_state_transitions_product_id_state_version_key"',
    );
    expect(sql).toContain('ON "product_state_transitions"("product_id", "state_version")');
  });

  it('guards every aggregate with version uniqueness (optimistic concurrency)', () => {
    for (const index of [
      'product_variants_variant_id_aggregate_version_key',
      'product_skus_sku_id_aggregate_version_key',
      'product_attribute_values_attribute_value_id_aggregate_versi_key',
    ]) {
      expect(sql).toContain(index);
    }
  });

  it('keeps cross-module references FK-free (storage isolation)', () => {
    expect(sql).not.toContain('REFERENCES');
  });
});
