import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import type { HealthResponse, ServiceStatus } from '@walrus/types';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { ConfigurationService } from '../configuration/configuration.service';

export interface DependencyStatus {
  readonly postgres: ServiceStatus;
  readonly redis: ServiceStatus;
}

@Injectable()
export class HealthService implements OnApplicationShutdown {
  private readonly pool: Pool;
  private readonly redis: Redis;

  public constructor(private readonly configuration: ConfigurationService) {
    const env = configuration.values;
    this.pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 1000,
    });
    this.redis = new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
      db: env.REDIS_DB,
      lazyConnect: true,
      connectTimeout: 1000,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
    });
  }

  public liveness(): HealthResponse {
    return this.response('UP');
  }

  public async readiness(): Promise<HealthResponse & { readonly dependencies: DependencyStatus }> {
    const [postgres, redis] = await Promise.all([this.postgresStatus(), this.redisStatus()]);
    const dependencies = { postgres, redis };
    return { ...this.response(postgres === 'UP' && redis === 'UP' ? 'UP' : 'DOWN'), dependencies };
  }

  public async onApplicationShutdown(): Promise<void> {
    this.redis.disconnect(false);
    await this.pool.end();
  }

  private response(status: ServiceStatus): HealthResponse {
    return {
      status,
      service: 'api',
      version: this.configuration.values.APP_VERSION,
      timestamp: new Date().toISOString(),
    };
  }

  private async postgresStatus(): Promise<ServiceStatus> {
    try {
      await this.pool.query('SELECT 1');
      return 'UP';
    } catch {
      return 'DOWN';
    }
  }

  private async redisStatus(): Promise<ServiceStatus> {
    try {
      if (this.redis.status === 'wait') await this.redis.connect();
      await this.redis.ping();
      return 'UP';
    } catch {
      return 'DOWN';
    }
  }
}
