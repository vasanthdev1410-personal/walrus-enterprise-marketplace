export type M4Environment = 'local' | 'development' | 'staging' | 'production';
export type AuthenticationAssurance = 'AAL0' | 'AAL1' | 'AAL2';
export type M4Boundary =
  | 'RECOVERY_APPROVAL'
  | 'IDENTITY_STATE_CHANGE'
  | 'CLASSIFICATION_TRANSITION'
  | 'PRIVILEGED_PROVISIONING'
  | 'CONTROLLED_BOOTSTRAP'
  | 'IDENTITY_READINESS';

export interface VerifiedWorkloadIdentityV1 {
  readonly version: 'walrus.workload.v1';
  readonly issuer: string;
  readonly audience: 'urn:walrus:module-02:authorization';
  readonly subject: string;
  readonly environment: M4Environment;
  readonly operationId: string;
  readonly contractVersion: 'wemp.m01-m02.authorization.v2';
  readonly requestDigest: string;
  readonly certificateThumbprint: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly jwtId: string;
  readonly keyId: string;
  readonly verificationReference: string;
}

export interface HumanActorContextV1 {
  readonly identityId: string;
  readonly sessionId: string;
  readonly sessionVersion: number;
  readonly assurance: AuthenticationAssurance;
  readonly authenticatedAt: string;
}

export interface TrustedBoundaryContextV2 {
  readonly contractVersion: 'wemp.m01-m02.authorization.v2';
  readonly environment: M4Environment;
  readonly correlationId: string;
  readonly operationId: string;
  readonly policyVersion: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly workload?: VerifiedWorkloadIdentityV1;
  readonly humanActor?: HumanActorContextV1;
}

export interface RecoveryRequesterPrincipalV1 {
  readonly kind: 'AUTHENTICATED_IDENTITY' | 'BOUND_RECOVERY_SESSION';
  readonly reference: string;
  readonly identityId?: string;
}

export interface ApprovalAuthorizationPortV2 {
  authorizeApprover(command: Readonly<Record<string, unknown>>): Promise<{
    readonly authorized: boolean;
    readonly authorizationReference?: string;
    readonly policyVersion: string;
  }>;
}

export interface IdentityStateChangeAuthorizationPortV2 {
  authorizeStateChange(command: Readonly<Record<string, unknown>>): Promise<{
    readonly authorized: boolean;
    readonly authorizationReference?: string;
  }>;
}

export interface ClassificationTransitionCoordinationPortV2 {
  validateContract(command: Readonly<Record<string, unknown>>): Promise<{
    readonly valid: boolean;
    readonly authorizationReference?: string;
  }>;
}

export interface PrivilegedProvisioningAuthorizationPortV2 {
  authorizeProvisioning(command: Readonly<Record<string, unknown>>): Promise<{
    readonly authorized: boolean;
    readonly authorizationReference?: string;
  }>;
}

export interface BootstrapAuthorizationPortV2 {
  authorizeBootstrap(command: Readonly<Record<string, unknown>>): Promise<{
    readonly available: boolean;
    readonly bootstrapReference?: string;
    readonly policyVersion: string;
  }>;
}
