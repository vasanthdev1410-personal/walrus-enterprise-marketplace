import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { InventoryReservationPort } from '../../../inventory/domain/ports/inventory-reservation.port';
import { OrderInventoryConfirmationAdapter } from './order-inventory-confirmation.adapter';

describe('OrderInventoryConfirmationAdapter', () => {
  const reserve = jest.fn();
  const release = jest.fn();
  const inventory = { reserve, release } as unknown as InventoryReservationPort;
  const adapter = new OrderInventoryConfirmationAdapter(inventory);
  const skuId = new UuidV7('0191310f-789a-7123-8123-000000000001');

  beforeEach(() => jest.clearAllMocks());

  describe('confirm', () => {
    it('returns CONFIRMED for RESERVED outcome', async () => {
      reserve.mockResolvedValue({ outcome: 'RESERVED', skuId, quantity: 2, availableQuantity: 8 });
      const result = await adapter.confirm({ skuId, quantity: 2 });
      expect(result.outcome).toBe('CONFIRMED');
    });

    it('sends correlationId when provided', async () => {
      reserve.mockResolvedValue({ outcome: 'RESERVED', skuId, quantity: 1, availableQuantity: 9 });
      await adapter.confirm({ skuId, quantity: 1, correlationId: 'corr-1' });
      expect(reserve).toHaveBeenCalledWith({ skuId, quantity: 1, correlationId: 'corr-1' });
    });

    it('returns DENIED outcome', async () => {
      reserve.mockResolvedValue({ outcome: 'DENIED', skuId, reason: 'insufficient' });
      const result = await adapter.confirm({ skuId, quantity: 5 });
      expect(result.outcome).toBe('DENIED');
    });

    it('returns FAILED outcome', async () => {
      reserve.mockResolvedValue({ outcome: 'FAILED', skuId, reason: 'error' });
      const result = await adapter.confirm({ skuId, quantity: 1 });
      expect(result.outcome).toBe('FAILED');
    });
  });

  describe('release', () => {
    it('delegates to inventory release', async () => {
      release.mockResolvedValue(undefined);
      await adapter.release({ skuId, quantity: 2 });
      expect(release).toHaveBeenCalledWith({ skuId, quantity: 2 });
    });

    it('sends correlationId when provided', async () => {
      release.mockResolvedValue(undefined);
      await adapter.release({ skuId, quantity: 1, correlationId: 'corr-2' });
      expect(release).toHaveBeenCalledWith({ skuId, quantity: 1, correlationId: 'corr-2' });
    });
  });
});
