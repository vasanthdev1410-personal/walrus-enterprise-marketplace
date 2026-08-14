import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { FailClosedModule05InventoryContractAdapter } from './fail-closed-module05-inventory.adapter';

const SKU = new UuidV7('01913110-789a-7123-8123-000000000804');

describe('FailClosedModule05InventoryContractAdapter (M04-M4, WEMP-M04-SPEC-001 §11)', () => {
  it('returns UNAVAILABLE for every SKU (no availability facts fabricated, D-08)', async () => {
    const adapter = new FailClosedModule05InventoryContractAdapter();

    await expect(adapter.getAvailability(SKU)).resolves.toEqual({ outcome: 'UNAVAILABLE' });
  });

  it('never fabricates quantity facts until Module 05 wiring exists', async () => {
    const adapter = new FailClosedModule05InventoryContractAdapter();

    const result = await adapter.getAvailability(SKU);

    expect(result.outcome).toBe('UNAVAILABLE');
  });
});
