import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('M02 append-only assignment episode migration', () => {
  const sql = readFileSync(
    resolve(
      __dirname,
      '../../../../../../prisma/migrations/20260812090000_module_02_append_only_assignment_episodes/migration.sql',
    ),
    'utf8',
  );

  it('blocks legacy duplicate ACTIVE rows before changing constraints', () => {
    expect(sql).toContain('WHERE "assignment_state" = \'ACTIVE\'');
    expect(sql).toContain('HAVING COUNT(*) > 1');
    expect(sql).toContain('RAISE EXCEPTION');
  });

  it('replaces lifetime uniqueness with an ACTIVE-only unique index', () => {
    expect(sql).toContain('DROP INDEX "identity_role_assignments_identity_id_role_name_key"');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "identity_role_assignments_one_active_identity_role_key"',
    );
    expect(sql).toContain('WHERE "assignment_state" = \'ACTIVE\'');
  });

  it('preserves actor or control-plane provenance by database constraint', () => {
    expect(sql).toContain('identity_role_assignment_actor_origin_check');
    expect(sql).toContain('assigned_by_workload_identity');
    expect(sql).toContain('authority_evidence_reference');
  });
});
