import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const schema = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');
const migration = readFileSync(
  join(
    process.cwd(),
    'prisma',
    'migrations',
    '20260805000100_module_01_limited_phase_1',
    'migration.sql',
  ),
  'utf8',
);
const protectedAuthenticationMigration = readFileSync(
  join(
    process.cwd(),
    'prisma',
    'migrations',
    '20260805000200_module_01_protected_authentication_persistence',
    'migration.sql',
  ),
  'utf8',
);

describe('Module 01 Limited Phase 1 persistence model', () => {
  it('contains the 24 Limited Phase 1 records plus the approved Phase 2 API idempotency, non-prod rate limit, and basic audit records', () => {
    const models = [...schema.matchAll(/^model\s+(\w+)\s+\{/gm)].map((match) => match[1]);

    expect(models).toHaveLength(27);
    expect(models).toEqual(
      expect.arrayContaining([
        'Identity',
        'IdentityStateTransition',
        'Session',
        'RefreshTokenFamily',
        'RefreshTokenRecord',
        'VerificationChallenge',
        'RecoveryRequest',
        'RecoveryApprovalRecord',
        'ApiIdempotencyRecord',
        'NonProductionRateLimitRecord',
        'BasicAuditEventRecord',
      ]),
    );
  });

  it('keeps every explicitly excluded persistence category absent', () => {
    const excludedModels = [
      'TransactionalOutbox',
      'ConsumerInbox',
      'AuthenticationAuditRecord',
      'RecoveryAuditRecord',
      'PrivacyRequest',
      'ConsentRecord',
      'CustomerProfile',
      'SellerProfile',
      'Role',
      'Permission',
    ];

    for (const model of excludedModels) {
      expect(schema).not.toMatch(new RegExp(`^model\\s+${model}\\s+\\{`, 'm'));
    }
  });

  it('uses restrictive deletion for every declared relation', () => {
    const relationDeclarations = schema
      .split('\n')
      .filter((line) => line.includes('@relation(fields:'));

    expect(relationDeclarations.length).toBeGreaterThan(0);
    expect(relationDeclarations.every((line) => line.includes('onDelete: Restrict'))).toBe(true);
  });

  it('creates all approved tables in a forward-only migration', () => {
    const createdTables = [...migration.matchAll(/^CREATE TABLE\s+"([^"]+)"/gm)];

    expect(createdTables).toHaveLength(24);
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN|TYPE)/i);
  });

  it('enforces approved concurrency and state constraints in PostgreSQL', () => {
    expect(migration).toContain('identities_aggregate_version_positive');
    expect(migration).toContain('identity_transition_initial_state_valid');
    expect(migration).toContain('session_versions_positive');
    expect(migration).toContain('refresh_token_state_timestamps_valid');
    expect(migration).toContain('recovery_request_versions_positive');
    expect(migration).toContain('recovery_approver_independent');
  });

  it('enforces approved single-current-record rules', () => {
    expect(migration).toContain('credentials_one_active_per_identity_type');
    expect(migration).toContain('classification_one_effective_per_identity');
    expect(migration).toContain('recovery_code_sets_one_active_per_identity');
  });

  it('stores identifiers only as authenticated ciphertext plus deterministic lookup metadata', () => {
    expect(schema).toContain('protectedNormalizedValue String');
    expect(schema).toContain('lookupDigest');
    expect(schema).toContain('lookupKeyVersion');
    expect(schema).not.toMatch(/^\s*normalizedValue\s+/m);
    expect(protectedAuthenticationMigration).toContain('DROP COLUMN "normalized_value"');
    expect(protectedAuthenticationMigration).toContain(
      'identity_identifiers_identifier_type_lookup_digest_key',
    );
    expect(protectedAuthenticationMigration).toContain(
      'requires an approved application-controlled backfill',
    );
  });
});
