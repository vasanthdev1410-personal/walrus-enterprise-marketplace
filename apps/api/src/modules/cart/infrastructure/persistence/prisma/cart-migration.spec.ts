import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('M07 cart migration (WEMP-M07-SPEC-001 §13)', () => {
  const sql = readFileSync(
    resolve(
      __dirname,
      '../../../../../../prisma/migrations/20260818090000_module_07_cart/migration.sql',
    ),
    'utf8',
  );

  it('is additive and touches no Module 00/01/02/03/04/05/06 table', () => {
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
      'CREATE TABLE "customer_profiles"',
      'CREATE TABLE "customer_addresses"',
      'CREATE TABLE "api_idempotency_records"',
      'ALTER TABLE',
      'DROP TABLE',
      'DROP COLUMN',
      'RENAME COLUMN',
    ]) {
      expect(sql).not.toContain(forbidden);
    }
  });

  it('creates the CartState enum', () => {
    expect(sql).toContain('CREATE TYPE "CartState" AS ENUM');
    expect(sql).toContain("'ACTIVE'");
    expect(sql).toContain("'CHECKED_OUT'");
    expect(sql).toContain("'ARCHIVED'");
    expect(sql).toContain("'AUTO_EXPIRED'");
  });

  it('creates the carts table with optimistic concurrency index', () => {
    expect(sql).toContain('CREATE TABLE "carts"');
    expect(sql).toContain('"cart_id" UUID NOT NULL');
    expect(sql).toContain('"customer_profile_id" UUID NOT NULL');
    expect(sql).toContain('"aggregate_version" INTEGER NOT NULL');
    expect(sql).toContain('"expires_at" TIMESTAMPTZ(6)');
  });

  it('creates the cart_lines table with SKU-level uniqueness', () => {
    expect(sql).toContain('CREATE TABLE "cart_lines"');
    expect(sql).toContain('"sku_id" UUID NOT NULL');
    expect(sql).toContain('"unit_price_amount" INTEGER NOT NULL');
    expect(sql).toContain('"unit_price_currency" TEXT NOT NULL');
    expect(sql).toContain('"quantity" INTEGER NOT NULL');
    expect(sql).toContain('"product_unavailable" BOOLEAN NOT NULL');
  });

  it('creates the cart_state_transitions table (append-only)', () => {
    expect(sql).toContain('CREATE TABLE "cart_state_transitions"');
    expect(sql).toContain('"from_state" "CartState" NOT NULL');
    expect(sql).toContain('"to_state" "CartState" NOT NULL');
    expect(sql).toContain('"state_version" INTEGER NOT NULL');
    expect(sql).toContain('"actor_identity_id" UUID NOT NULL');
    expect(sql).toContain('"reason_reference" TEXT NOT NULL');
  });

  it('creates the cart_audit_records table (append-only)', () => {
    expect(sql).toContain('CREATE TABLE "cart_audit_records"');
    expect(sql).toContain('"event_type" TEXT NOT NULL');
    expect(sql).toContain('"actor_identity_id" UUID NOT NULL');
  });

  it('creates unique index for one cart per customer (D-02)', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX "carts_customer_profile_id_key"');
  });

  it('creates unique index for optimistic concurrency (D-16)', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX "carts_cart_id_aggregate_version_key"');
  });

  it('creates unique index for SKU-level line identity (D-03)', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX "cart_lines_cart_id_sku_id_key"');
  });

  it('creates unique index for append-only transition versioning', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX "cart_state_transitions_cart_id_state_version_key"');
  });

  it('creates indexes for audit queries', () => {
    expect(sql).toContain('CREATE INDEX "cart_audit_records_cart_id_occurred_at_idx"');
    expect(sql).toContain('CREATE INDEX "cart_audit_records_customer_profile_id_occurred_at_idx"');
  });

  it('contains no cross-module foreign keys', () => {
    expect(sql).not.toContain('REFERENCES');
    expect(sql).not.toContain('FOREIGN KEY');
  });
});
