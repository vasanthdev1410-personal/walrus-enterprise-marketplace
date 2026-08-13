import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('M03 seller management migration (WEMP-M03-SPEC-001 §3/§9)', () => {
  const sql = readFileSync(
    resolve(
      __dirname,
      '../../../../../../prisma/migrations/20260812120000_module_03_seller_management/migration.sql',
    ),
    'utf8',
  );

  it('is additive and touches no Module 01 or Module 02 table', () => {
    for (const forbidden of [
      'CREATE TABLE "identities"',
      'CREATE TABLE "sessions"',
      'CREATE TABLE "identity_role_assignments"',
      'CREATE TABLE "authorization_decision_records"',
      'CREATE TABLE "recovery_requests"',
      'ALTER TABLE',
      'DROP TABLE',
    ]) {
      expect(sql).not.toContain(forbidden);
    }
  });

  it('creates all nine Module 03-owned tables', () => {
    for (const table of [
      'seller_profiles',
      'seller_organizations',
      'seller_identity_associations',
      'seller_business_verifications',
      'seller_verification_evidence',
      'seller_warehouses',
      'seller_agreements',
      'seller_state_transitions',
      'seller_business_audit_records',
    ]) {
      expect(sql).toContain(`CREATE TABLE "${table}"`);
    }
  });

  it('enforces at most one ACTIVE seller per organization by partial unique index', () => {
    expect(sql).toContain('seller_profiles_one_active_per_organization_key');
    expect(sql).toContain('WHERE "state" = \'ACTIVE\'');
  });

  it('enforces at most one ACTIVE OWNER association per seller profile', () => {
    expect(sql).toContain('seller_identity_associations_one_active_owner_key');
    expect(sql).toContain('WHERE "state" = \'ACTIVE\' AND "association_role" = \'OWNER\'');
  });

  it('keeps registration lookup unique and cross-module references FK-free', () => {
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "seller_organizations_registration_lookup_digest_key"',
    );
    // identity_id and seller_profile_id are logical references: no REFERENCES clauses.
    expect(sql).not.toContain('REFERENCES');
  });

  it('enforces unique verification generations per type', () => {
    expect(sql).toContain(
      'seller_business_verifications_seller_profile_id_verificat_key',
    );
  });

  it('enforces append-only lifecycle episodes by unique state version per profile', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX "seller_state_transitions_seller_profile_id_state_version_key"');
    expect(sql).toContain('ON "seller_state_transitions"("seller_profile_id", "state_version")');
  });
});

describe('M03 evidence legal hold migration (WEMP-M03-SPEC-001 / decision D-03)', () => {
  const legalHoldSql = readFileSync(
    resolve(
      __dirname,
      '../../../../../../prisma/migrations/20260812130000_module_03_evidence_legal_hold/migration.sql',
    ),
    'utf8',
  );

  it('is additive and touches no Module 01 or Module 02 table', () => {
    for (const forbidden of [
      'CREATE TABLE "identities"',
      'CREATE TABLE "sessions"',
      'CREATE TABLE "identity_role_assignments"',
      'ALTER TABLE',
      'DROP TABLE',
    ]) {
      expect(legalHoldSql).not.toContain(forbidden);
    }
  });

  it('creates the legal hold table with a logical seller reference (no FK)', () => {
    expect(legalHoldSql).toContain('CREATE TABLE "seller_evidence_legal_holds"');
    expect(legalHoldSql).not.toContain('REFERENCES');
  });

  it('indexes active holds per seller for the retention processor', () => {
    expect(legalHoldSql).toContain(
      'CREATE INDEX "seller_evidence_legal_holds_seller_profile_id_active_idx"',
    );
  });
});
