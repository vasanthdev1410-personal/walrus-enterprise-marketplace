import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigurationService } from '../../../../../platform/configuration/configuration.service';
import { PrismaClient } from '../../../../../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  public constructor(configuration: ConfigurationService) {
    super({
      adapter: new PrismaPg({ connectionString: configuration.values.DATABASE_URL }),
    });
  }

  public async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
