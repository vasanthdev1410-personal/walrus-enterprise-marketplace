import type { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';
import type { AuthenticationMethod } from '../../domain/session/value-objects/authentication-method';

export interface MfaAuthenticationChallenge {
  readonly challengeId: UuidV7;
  readonly version: number;
}

export interface VerifiedMfaAuthentication {
  readonly identityId: UuidV7;
  readonly authenticationMethod: AuthenticationMethod;
}

export interface MfaAuthenticationPort {
  issueChallenge(identityId: UuidV7, factorId: UuidV7): Promise<MfaAuthenticationChallenge>;
  verifyChallenge(challengeId: UuidV7, evidence: string): Promise<VerifiedMfaAuthentication>;
}
