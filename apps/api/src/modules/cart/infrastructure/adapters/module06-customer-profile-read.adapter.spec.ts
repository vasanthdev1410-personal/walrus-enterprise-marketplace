import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { CustomerProfileRepository } from '../../../customer/domain/ports/customer-repository.port';
import { Module06CustomerProfileReadAdapter } from './module06-customer-profile-read.adapter';

describe('Module06CustomerProfileReadAdapter', () => {
  const customerRepository = {
    findById: jest.fn(),
    findByIdentityId: jest.fn(),
  } as unknown as jest.Mocked<CustomerProfileRepository>;
  const adapter = new Module06CustomerProfileReadAdapter(customerRepository);
  const profileId = new UuidV7('0191310f-789a-7123-8123-000000000001');

  beforeEach(() => jest.clearAllMocks());

  it('returns null when profile not found', async () => {
    customerRepository.findById.mockResolvedValue(null);
    const result = await adapter.resolveActiveCustomer(profileId);
    expect(result).toBeNull();
  });

  it('returns null for non-ACTIVE profile', async () => {
    customerRepository.findById.mockResolvedValue({
      properties: {
        customerProfileId: profileId,
        identityId: new UuidV7('0191310f-789a-7123-8123-000000000002'),
        state: 'SUSPENDED',
      },
    } as never);
    const result = await adapter.resolveActiveCustomer(profileId);
    expect(result).toBeNull();
  });

  it('returns customer facts for ACTIVE profile', async () => {
    const identityId = new UuidV7('0191310f-789a-7123-8123-000000000002');
    customerRepository.findById.mockResolvedValue({
      properties: {
        customerProfileId: profileId,
        identityId,
        state: 'ACTIVE',
      },
    } as never);
    const result = await adapter.resolveActiveCustomer(profileId);
    expect(result).toEqual({ customerProfileId: profileId, identityId });
  });

  it('returns null on repository error (fail closed)', async () => {
    customerRepository.findById.mockRejectedValue(new Error('db failure'));
    const result = await adapter.resolveActiveCustomer(profileId);
    expect(result).toBeNull();
  });
});
