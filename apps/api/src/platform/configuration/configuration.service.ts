import { Injectable } from '@nestjs/common';
import type { Environment } from '@walrus/config';

@Injectable()
export class ConfigurationService {
  public constructor(private readonly environment: Environment) {}

  public get values(): Readonly<Environment> {
    return this.environment;
  }
}
