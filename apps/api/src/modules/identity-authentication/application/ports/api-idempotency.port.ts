export interface ApiIdempotencyRequest {
  readonly recordId: string;
  readonly scope: string;
  readonly operationType: string;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly createdAt: Date;
}

export type ApiIdempotencyAcquisition =
  | { readonly outcome: 'ACQUIRED' }
  | { readonly outcome: 'IN_PROGRESS' }
  | { readonly outcome: 'FINGERPRINT_MISMATCH' }
  | { readonly outcome: 'COMPLETED'; readonly protectedResultReference: string };

export interface ApiIdempotencyPort {
  acquire(request: ApiIdempotencyRequest): Promise<ApiIdempotencyAcquisition>;
  complete(recordId: string, protectedResultReference: string, completedAt: Date): Promise<void>;
  abandon(recordId: string): Promise<void>;
}
