import { SetMetadata, type CustomDecorator } from '@nestjs/common';

export const RATE_LIMIT_METADATA = 'walrus:rate_limit';

export interface RateLimitOptions {
  readonly limit: number;
  readonly windowSeconds: number;
}

export const RateLimit = (options: RateLimitOptions): CustomDecorator =>
  SetMetadata(RATE_LIMIT_METADATA, options);
