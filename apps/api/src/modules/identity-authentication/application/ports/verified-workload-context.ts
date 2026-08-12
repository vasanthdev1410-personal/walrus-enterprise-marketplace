export interface VerifiedWorkloadContextV2 {
  readonly subject: string;
  readonly environment: 'local' | 'development' | 'staging' | 'production';
  readonly operationId: string;
  readonly verificationReference: string;
  readonly requestDigest: string;
  readonly expiresAt: Date;
}
