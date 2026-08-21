import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { CartInventoryReservationAdapter } from './cart-inventory-reservation.adapter';
import type { InventoryReservationPort } from '../../../inventory/domain/ports/inventory-reservation.port';

describe('CartInventoryReservationAdapter', () => {
  const reserve = jest.fn();
  const release = jest.fn();
  const inventory = { reserve, release } as unknown as InventoryReservationPort;
  const adapter = new CartInventoryReservationAdapter(inventory);

  const skuId = new UuidV7('0191310f-789a-7123-8123-000000000001');

  beforeEach(() => jest.clearAllMocks());

  it('reserves and returns RESERVED outcome', async () => {
    reserve.mockResolvedValue({ outcome: 'RESERVED', skuId, quantity: 2, availableQuantity: 8 });
    const result = await adapter.reserve({ skuId, quantity: 2 });
    expect(result.outcome).toBe('RESERVED');
    expect(reserve).toHaveBeenCalledWith({ skuId, quantity: 2 });
  });

  it('reserves with correlationId', async () => {
    reserve.mockResolvedValue({ outcome: 'RESERVED', skuId, quantity: 1, availableQuantity: 9 });
    await adapter.reserve({ skuId, quantity: 1, correlationId: 'corr-1' });
    expect(reserve).toHaveBeenCalledWith({ skuId, quantity: 1, correlationId: 'corr-1' });
  });

  it('returns DENIED outcome', async () => {
    reserve.mockResolvedValue({ outcome: 'DENIED', skuId, reason: 'insufficient' });
    const result = await adapter.reserve({ skuId, quantity: 5 });
    expect(result.outcome).toBe('DENIED');
  });

  it('returns FAILED outcome', async () => {
    reserve.mockResolvedValue({ outcome: 'FAILED', skuId, reason: 'error' });
    const result = await adapter.reserve({ skuId, quantity: 1 });
    expect(result.outcome).toBe('FAILED');
  });

  it('releases and returns RESERVED outcome', async () => {
    release.mockResolvedValue({ outcome: 'RESERVED', skuId, quantity: 1, availableQuantity: 9 });
    const result = await adapter.release({ skuId, quantity: 1 });
    expect(result.outcome).toBe('RESERVED');
  });

  it('releases and returns DENIED outcome', async () => {
    release.mockResolvedValue({ outcome: 'DENIED', skuId, reason: 'not reserved' });
    const result = await adapter.release({ skuId, quantity: 1 });
    expect(result.outcome).toBe('DENIED');
  });

  it('releases and returns FAILED outcome', async () => {
    release.mockResolvedValue({ outcome: 'FAILED', skuId, reason: 'timeout' });
    const result = await adapter.release({ skuId, quantity: 1 });
    expect(result.outcome).toBe('FAILED');
  });
});
