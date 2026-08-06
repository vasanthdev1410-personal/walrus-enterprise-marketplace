import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Registry } from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();

  public constructor() {
    collectDefaultMetrics({ prefix: 'walrus_api_', register: this.registry });
  }

  public get contentType(): string {
    return this.registry.contentType;
  }

  public async metrics(): Promise<string> {
    return this.registry.metrics();
  }
}
