import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { NonProductionSellerEvidenceStorageAdapter } from './non-production-seller-evidence-storage.adapter';

const SELLER = new UuidV7('0191310f-789a-7123-8123-000000000001');

describe('NonProductionSellerEvidenceStorageAdapter (M03-M5, D-03 evidence boundary)', () => {
  const adapter = new NonProductionSellerEvidenceStorageAdapter();

  it('accepts a well-formed reference and SHA-256 hex digest', async () => {
    await expect(
      adapter.verifyEvidenceIntegrity('object-store://bucket/evidence/0001', 'a'.repeat(64)),
    ).resolves.toBe(true);
  });

  it('rejects an empty reference (fail closed)', async () => {
    await expect(
      adapter.verifyEvidenceIntegrity('   ', 'a'.repeat(64)),
    ).resolves.toBe(false);
  });

  it('rejects an over-length reference (fail closed)', async () => {
    await expect(
      adapter.verifyEvidenceIntegrity('x'.repeat(1025), 'a'.repeat(64)),
    ).resolves.toBe(false);
  });

  it('rejects a non-SHA-256 digest (fail closed)', async () => {
    await expect(
      adapter.verifyEvidenceIntegrity('object-store://bucket/evidence/0001', 'not-a-digest'),
    ).resolves.toBe(false);
  });

  it('deleteEvidence is a no-op that resolves for the non-production boundary', async () => {
    await expect(
      adapter.deleteEvidence('object-store://bucket/evidence/0001', SELLER),
    ).resolves.toBeUndefined();
  });
});
