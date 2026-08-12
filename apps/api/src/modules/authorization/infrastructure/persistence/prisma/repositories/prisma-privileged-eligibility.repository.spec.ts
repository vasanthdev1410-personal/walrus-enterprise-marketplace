/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment */
import { UuidV7 } from '../../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { PrismaService } from '../../../../../identity-authentication/infrastructure/persistence/prisma/prisma.service';
import type { ConfigurationService } from '../../../../../../platform/configuration/configuration.service';
import { PrismaPrivilegedEligibilityRepository } from './prisma-privileged-eligibility.repository';

const identity = new UuidV7('0191310f-789a-7123-8123-000000000001');

function repository(
  record: unknown,
  environment = 'test',
): {
  readonly value: PrismaPrivilegedEligibilityRepository;
  readonly prisma: PrismaService;
} {
  const prisma = {
    privilegedAccessEligibilityRecord: { findFirst: jest.fn().mockResolvedValue(record) },
  } as unknown as PrismaService;
  const config = { values: { APP_ENV: environment } } as unknown as ConfigurationService;
  return { value: new PrismaPrivilegedEligibilityRepository(prisma, config), prisma };
}

describe('PrismaPrivilegedEligibilityRepository', () => {
  it('does not impose privileged readiness on ordinary roles', async () => {
    const { value, prisma } = repository(null);
    await expect(value.isEligible(identity, 'CUSTOMER')).resolves.toBe(true);
    expect(prisma.privilegedAccessEligibilityRecord.findFirst).not.toHaveBeenCalled();
  });

  it('requires the latest Admin eligibility to be active and not invalidated', async () => {
    await expect(
      repository({ eligibilityState: 'ELIGIBLE', invalidatedAt: null }).value.isEligible(
        identity,
        'ADMIN',
      ),
    ).resolves.toBe(true);
    await expect(
      repository({ eligibilityState: 'NOT_ELIGIBLE', invalidatedAt: null }).value.isEligible(
        identity,
        'ADMIN',
      ),
    ).resolves.toBe(false);
    await expect(
      repository({ eligibilityState: 'ELIGIBLE', invalidatedAt: new Date() }).value.isEligible(
        identity,
        'ADMIN',
      ),
    ).resolves.toBe(false);
    await expect(repository(null).value.isEligible(identity, 'ADMIN')).resolves.toBe(false);
  });

  it('uses the configured non-test environment for Super Admin lookup', async () => {
    const { value, prisma } = repository(
      { eligibilityState: 'ELIGIBLE', invalidatedAt: null },
      'production',
    );
    await expect(value.isEligible(identity, 'SUPER_ADMIN')).resolves.toBe(true);
    expect(prisma.privilegedAccessEligibilityRecord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ environment: 'production' }) }),
    );
  });
});
