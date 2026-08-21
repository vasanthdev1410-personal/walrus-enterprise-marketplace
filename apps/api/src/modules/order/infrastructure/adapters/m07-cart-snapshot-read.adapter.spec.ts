import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { M07CartSnapshotReadAdapter } from './m07-cart-snapshot-read.adapter';
import type { CartSnapshotData } from '../../domain/ports/order-snapshot-read.port';

describe('M07CartSnapshotReadAdapter', () => {
  const adapter = new M07CartSnapshotReadAdapter();
  const snapshotId = new UuidV7('0191310f-789a-7123-8123-000000000001');

  it('returns null for unknown snapshot', async () => {
    const result = await adapter.readCartSnapshot(snapshotId);
    expect(result).toBeNull();
  });

  it('returns snapshot after registration', async () => {
    const snapshot = { snapshotId } as unknown as CartSnapshotData;
    adapter.registerSnapshot(snapshot);
    const result = await adapter.readCartSnapshot(snapshotId);
    expect(result).toBe(snapshot);
  });
});
