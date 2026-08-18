import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('M06 customer migration (WEMP-M06-SPEC-001 §13)', () => {
  const sql = readFileSync(
    resolve(
      __dirname,
      '../../../../../../prisma/migrations/20260817090000_module_06_customer/migration.sql',
    ),
    'utf8',
  );

  it('is additive and touches no Module 00/01/02/03/04/05 table', () => {
    for (const forbidden of [
      'CREATE TABLE "identities"',
      'CREATE TABLE "sessions"',
      'CREATE TABLE "identity_role_assignments"',
      'CREATE TABLE "authorization_decision_records"',
      'CREATE TABLE "seller_profiles"',
      'CREATE TABLE "seller_organizations"',
      'CREATE TABLE "products"',
      'CREATE TABLE "product_skus"',
      'CREATE TABLE "inventory_stock_pools"',
      'CREATE TABLE "api_idempotency_records"',
      'ALTER TABLE',
      'DROP TABLE',
      'DROP COLUMN',
      'RENAME COLUMN',
    ]) {
      expect(sql).not.toContain(forbidden);
    }
  });

  it('creates all six Module 06-owned tables', () => {
    for (const table of [
      'customer_profiles',
      'customer_state_transitions',
      'customer_addresses',
      'customer_business_profiles',
      'customer_preferences',
      'customer_audit_records',
    ]) {
      expect(sql).toContain(`CREATE TABLE "${table}"`);
    }
  });

  it('declares the four Module 06 enums', () => {
    for (const enumName of [
      'CustomerState',
      'CustomerAddressRole',
      'CustomerAddressState',
      'CustomerPreferenceKey',
    ]) {
      expect(sql).toContain(`CREATE TYPE "${enumName}" AS ENUM`);
    }
  });

  it('enforces one profile per identity (D-01)', () => {
    expect(sql).toContain('customer_profiles_identity_id_key');
  });

  it('guards the profile aggregate with version uniqueness (D-11)', () => {
    expect(sql).toContain('customer_profiles_customer_profile_id_aggregate_version_key');
  });

  it('enforces at most one default shipping and one default billing per profile (D-04)', () => {
    expect(sql).toContain('customer_addresses_one_default_shipping_key');
    expect(sql).toContain('customer_addresses_one_default_billing_key');
  });

  it('enforces business profile 0..1 cardinality and preference uniqueness (D-05/D-06)', () => {
    expect(sql).toContain('customer_business_profiles_customer_profile_id_key');
    expect(sql).toContain('customer_preferences_customer_profile_id_preference_key_key');
  });

  it('keeps cross-module references FK-free (storage isolation, A-06)', () => {
    expect(sql).not.toContain('REFERENCES');
  });
});
