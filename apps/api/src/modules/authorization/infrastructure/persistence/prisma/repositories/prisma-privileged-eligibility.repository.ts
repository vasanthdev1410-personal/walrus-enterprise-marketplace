import { Injectable } from '@nestjs/common';
import type { PrivilegedEligibilityPort } from '../../../../application/ports/privileged-eligibility.port';
import type { UuidV7 } from '../../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { RoleName } from '../../../../domain/value-objects/role-name';
import { PrismaService } from '../../../../../identity-authentication/infrastructure/persistence/prisma/prisma.service';
import { ConfigurationService } from '../../../../../../platform/configuration/configuration.service';

@Injectable()
export class PrismaPrivilegedEligibilityRepository implements PrivilegedEligibilityPort {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigurationService,
  ) {}

  public async isEligible(identityId: UuidV7, roleName: RoleName): Promise<boolean> {
    if (roleName !== 'ADMIN' && roleName !== 'SUPER_ADMIN') return true;
    const environment =
      this.config.values.APP_ENV === 'test' ? 'local' : this.config.values.APP_ENV;
    const record = await this.prisma.privilegedAccessEligibilityRecord.findFirst({
      where: { environment, identityId: identityId.value, roleName },
      orderBy: { evaluatedAt: 'desc' },
    });
    return record?.eligibilityState === 'ELIGIBLE' && record.invalidatedAt === null;
  }
}
