import { Controller, Get, Header, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { HealthResponse } from '@walrus/types';
import type { Response } from 'express';
import { HealthService } from './health.service';
import { MetricsService } from '../metrics/metrics.service';

@ApiTags('Platform health')
@Controller()
export class HealthController {
  public constructor(
    private readonly health: HealthService,
    private readonly metrics: MetricsService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Basic service status' })
  @ApiOkResponse({ description: 'API process is running' })
  public healthStatus(): HealthResponse {
    return this.health.liveness();
  }

  @Get('health/live')
  @ApiOperation({ summary: 'Liveness probe' })
  public liveness(): HealthResponse {
    return this.health.liveness();
  }

  @Get('health/ready')
  @ApiOperation({ summary: 'Dependency readiness probe' })
  public async readiness(@Res() response: Response): Promise<void> {
    const status = await this.health.readiness();
    response
      .status(status.status === 'UP' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
      .json(status);
  }

  @Get('metrics')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Internal Prometheus metrics' })
  public async prometheus(@Res() response: Response): Promise<void> {
    response.type(this.metrics.contentType).send(await this.metrics.metrics());
  }
}
