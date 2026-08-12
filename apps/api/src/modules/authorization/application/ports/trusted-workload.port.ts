import type {
  M4Boundary,
  M4Environment,
  VerifiedWorkloadIdentityV1,
} from '../contracts/trusted-boundary-v2';

export interface TrustedWorkloadKeyResolverPort {
  resolveVerificationKey(issuer: string, keyId: string): Promise<CryptoKey>;
  isKeyRevoked(issuer: string, keyId: string): Promise<boolean>;
}

export interface TrustedWorkloadReplayPort {
  consume(input: {
    readonly environment: M4Environment;
    readonly jwtId: string;
    readonly workloadSubject: string;
    readonly boundary: M4Boundary;
    readonly assertionDigest: string;
    readonly requestDigest: string;
    readonly certificateThumbprint: string;
    readonly operationId: string;
    readonly expiresAt: Date;
    readonly auditReference: string;
  }): Promise<void>;
}

export interface TrustedPeerCertificatePort {
  validate(input: {
    readonly certificateDer: Uint8Array;
    readonly environment: M4Environment;
    readonly now: Date;
  }): Promise<{ readonly thumbprint: string; readonly uriSan: string }>;
}

export interface VerifyTrustedWorkloadCommand {
  readonly compactAssertion: string;
  readonly peerCertificateDer: Uint8Array;
  readonly canonicalRequestBody: unknown;
  readonly boundary: M4Boundary;
  readonly expectedEnvironment: M4Environment;
  readonly allowedSubjects: readonly string[];
  readonly now: Date;
}

export interface TrustedWorkloadVerifierPort {
  verify(command: VerifyTrustedWorkloadCommand): Promise<VerifiedWorkloadIdentityV1>;
}
