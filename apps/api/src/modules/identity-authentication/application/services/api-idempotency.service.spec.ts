import type { ApiIdempotencyPort } from '../ports/api-idempotency.port';
import type { EnvelopeEncryptionPort } from '../ports/envelope-encryption.port';
import { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';
import { ApiIdempotencyService } from './api-idempotency.service';

describe('ApiIdempotencyService', () => {
  const repository: jest.Mocked<ApiIdempotencyPort> = {
    acquire: jest.fn(), complete: jest.fn(), abandon: jest.fn(),
  };
  const encryption = {
    encrypt: jest.fn((value: Uint8Array) => ({ value: Buffer.from(value).toString('base64') })),
    decrypt: jest.fn((value: { value: string }) => Buffer.from(value.value, 'base64')),
  } as unknown as jest.Mocked<EnvelopeEncryptionPort>;
  const service = new ApiIdempotencyService(
    repository,
    encryption,
    { now: () => new Date('2026-08-05T00:00:00.000Z') },
    { next: () => new UuidV7('018f22e2-79b0-7cc3-8c5e-000000000901') },
  );

  beforeEach(() => jest.clearAllMocks());

  it('persists the protected committed result', async () => {
    repository.acquire.mockResolvedValue({ outcome: 'ACQUIRED' });
    const execute = jest.fn().mockResolvedValue({ accepted: true });
    await expect(service.execute({ scope: 'client', operationType: 'op', idempotencyKey: 'key', request: { a: 1 }, execute }))
      .resolves.toEqual({ accepted: true });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(repository.complete.mock.calls).toHaveLength(1);
  });

  it('replays a completed result without repeating the operation', async () => {
    repository.acquire.mockResolvedValue({
      outcome: 'COMPLETED',
      protectedResultReference: JSON.stringify({
        envelopeVersion: 'walrus-envelope-v1',
        value: Buffer.from('{"accepted":true}').toString('base64'),
      }),
    });
    const execute = jest.fn();
    await expect(service.execute({ scope: 'client', operationType: 'op', idempotencyKey: 'key', request: { a: 1 }, execute }))
      .resolves.toEqual({ accepted: true });
    expect(execute).not.toHaveBeenCalled();
  });

  it('keeps an acquired record in progress when result persistence fails after a committed operation', async () => {
    repository.acquire.mockResolvedValue({ outcome: 'ACQUIRED' });
    repository.complete.mockRejectedValue(new Error('database unavailable'));
    const execute = jest.fn().mockResolvedValue({ committed: true });
    await expect(service.execute({ scope: 'client', operationType: 'op', idempotencyKey: 'key', request: {}, execute }))
      .rejects.toThrow('database unavailable');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(repository.abandon.mock.calls).toHaveLength(0);
  });
});
