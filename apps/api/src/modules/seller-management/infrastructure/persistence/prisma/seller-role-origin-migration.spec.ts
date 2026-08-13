import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('M03-M4 seller role origin migration (WEMP-M03-SPEC-001 §4 / D-11)', () => {
  const sql = readFileSync(
    resolve(
      __dirname,
      '../../../../../../prisma/migrations/20260813100000_module_03_seller_role_origin/migration.sql',
    ),
    'utf8',
  );

  it('is additive and touches no table or column', () => {
    for (const forbidden of [
      'CREATE TABLE',
      'ALTER TABLE',
      'DROP TABLE',
      'CREATE INDEX',
      'DROP TYPE',
    ]) {
      expect(sql).not.toContain(forbidden);
    }
  });

  it('adds only the SELLER_LIFECYCLE value to the RoleAssignmentOriginType enum', () => {
    expect(sql).toContain('ALTER TYPE "RoleAssignmentOriginType" ADD VALUE \'SELLER_LIFECYCLE\';');
    expect(sql).not.toContain('HUMAN_ADMINISTRATION');
    expect(sql).not.toContain('PRIVILEGED_PROVISIONING');
    expect(sql).not.toContain('CONTROLLED_BOOTSTRAP');
  });
});
