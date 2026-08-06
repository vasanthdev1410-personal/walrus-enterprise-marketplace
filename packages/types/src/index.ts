export interface ApiSuccessResponse<T> {
  readonly success: true;
  readonly message: string;
  readonly data: T;
  readonly correlationId: string;
  readonly requestId: string;
  readonly timestamp: string;
}

export interface ApiErrorDetail {
  readonly field?: string;
  readonly message: string;
}

export interface ApiErrorResponse {
  readonly success: false;
  readonly message: string;
  readonly errorCode: string;
  readonly errors: readonly ApiErrorDetail[];
  readonly correlationId: string;
  readonly requestId: string;
  readonly timestamp: string;
}

export type ServiceStatus = 'UP' | 'DEGRADED' | 'DOWN';

export interface HealthResponse {
  readonly status: ServiceStatus;
  readonly service: string;
  readonly version: string;
  readonly timestamp: string;
}
