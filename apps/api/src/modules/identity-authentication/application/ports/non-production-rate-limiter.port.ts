export interface RateLimitCheckResult {
  readonly allowed: boolean;
  readonly limit: number;
  readonly remaining: number;
  readonly resetAt: Date;
}

export interface NonProductionRateLimiterPort {
  consume(params: {
    readonly key: string;
    readonly limit: number;
    readonly windowSeconds: number;
  }): Promise<RateLimitCheckResult>;
}
