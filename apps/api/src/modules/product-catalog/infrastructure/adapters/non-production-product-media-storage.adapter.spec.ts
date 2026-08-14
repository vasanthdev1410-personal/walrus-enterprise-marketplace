import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { NonProductionProductMediaStorageAdapter } from './non-production-product-media-storage.adapter';

const PRODUCT = new UuidV7('01913110-789a-7123-8123-000000000805');
const VALID_DIGEST = 'a'.repeat(64);
const VALID_REFERENCE =
  'https://media.example.test/objects/01913110-789a-7123-8123-000000000805/image-1.webp';

describe('NonProductionProductMediaStorageAdapter (M04-M4, decisions D-09/D-17)', () => {
  it('verifies a well-formed reference with a SHA-256 hex digest', async () => {
    const adapter = new NonProductionProductMediaStorageAdapter();

    await expect(adapter.verifyMediaIntegrity(VALID_REFERENCE, VALID_DIGEST)).resolves.toBe(true);
  });

  it('rejects a non-SHA-256 digest (fail closed)', async () => {
    const adapter = new NonProductionProductMediaStorageAdapter();

    await expect(adapter.verifyMediaIntegrity(VALID_REFERENCE, 'not-a-digest')).resolves.toBe(
      false,
    );
  });

  it('rejects an empty reference (fail closed)', async () => {
    const adapter = new NonProductionProductMediaStorageAdapter();

    await expect(adapter.verifyMediaIntegrity('   ', VALID_DIGEST)).resolves.toBe(false);
  });

  it('rejects an over-length reference (fail closed)', async () => {
    const adapter = new NonProductionProductMediaStorageAdapter();

    await expect(
      adapter.verifyMediaIntegrity(`https://media.example.test/${'x'.repeat(1100)}`, VALID_DIGEST),
    ).resolves.toBe(false);
  });

  it('deletion is a no-op in the non-production adapter (no object store, D-17)', async () => {
    const adapter = new NonProductionProductMediaStorageAdapter();

    await expect(adapter.deleteMedia(VALID_REFERENCE, PRODUCT)).resolves.toBeUndefined();
  });
});
