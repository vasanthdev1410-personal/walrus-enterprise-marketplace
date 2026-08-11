import type { IdentityRepository } from '../../domain/identity/repositories/identity-repository';
import { RecoveryRequest } from '../../domain/recovery/entities/recovery-request';
import type { RecoveryRequestRepository } from '../../domain/recovery/repositories/recovery-request-repository';
import { PermittedRecoveryOperation } from '../../domain/recovery/value-objects/permitted-recovery-operation';
import { RecoveryPolicyVersion } from '../../domain/recovery/value-objects/recovery-policy-version';
import { AggregateVersion } from '../../domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';
import { MfaError } from '../errors/mfa.error';
import type { ClockPort, UuidV7GenerationPort } from '../ports/application-runtime.port';

export interface MfaReplacementPolicy {
  /** The authoritative recovery policy version recorded on the created request. */
  readonly recoveryPolicyVersion: string;
  /** Lifetime of the created recovery request in seconds (recovery policy). */
  readonly requestLifetimeSeconds: number;
}

export interface RequestMfaReplacementCommand {
  readonly identityId: UuidV7;
  readonly expectedIdentityVersion: number;
  /** Validated at the HTTP boundary (MfaReplacementRequestDto); the service re-checks. */
  readonly replacementFactorType: string;
}

export interface MfaReplacementRequestedResult {
  /** The created recovery-request id (the Bound Recovery Session locator). */
  readonly requestId: string;
  readonly state: 'REQUESTED';
  readonly nextAction: 'SUBMIT_EVIDENCE';
  readonly version: number;
}

/**
 * M01-MFA-004. Starts a recovery-based MFA factor replacement for an
 * authenticated AAL2 session. This milestone only creates the purpose-bound
 * recovery request bound to MFA_FACTOR_REPLACEMENT after validating that the
 * identity is eligible, owns an enrolled factor of the requested type, and has
 * no replacement already in flight; the actual factor removal is executed only
 * by M01-REC-006 when that recovery request is completed (spec: recovery-based
 * replacement is executed only by M01-REC-006 when bound to
 * MFA_FACTOR_REPLACEMENT). No MFA secrets are read, stored or exposed.
 */
export class MfaReplacementApplicationService {
  public constructor(
    private readonly identities: IdentityRepository,
    private readonly recoveryRequests: RecoveryRequestRepository,
    private readonly clock: ClockPort,
    private readonly identifiers: UuidV7GenerationPort,
    private readonly policy: MfaReplacementPolicy,
  ) {}

  public async requestReplacement(
    command: RequestMfaReplacementCommand,
  ): Promise<MfaReplacementRequestedResult> {
    if (command.replacementFactorType !== 'TOTP_AUTHENTICATOR') {
      throw new MfaError('MFA_ENROLLMENT_NOT_PERMITTED');
    }
    const snapshot = await this.identities.findAuthenticationById(command.identityId);
    if (
      snapshot?.identity.properties.identityState !== 'ACTIVE' ||
      snapshot.identity.properties.verificationState !== 'VERIFIED'
    ) {
      throw new MfaError('MFA_ENROLLMENT_NOT_PERMITTED');
    }
    // The identity version precondition (If-Match) guards the aggregate write.
    if (snapshot.identity.properties.aggregateVersion.value !== command.expectedIdentityVersion) {
      throw new MfaError('RESOURCE_STATE_CONFLICT');
    }
    // An enrolled factor of the requested type must exist before a replacement
    // can be requested; a factor already revoked or still in first enrollment
    // cannot be replaced through the recovery process.
    const replaceableFactor = snapshot.mfaFactors.some(
      (factor) =>
        factor.properties.factorType === command.replacementFactorType &&
        (factor.properties.factorState === 'ACTIVE' ||
          factor.properties.factorState === 'REPLACEMENT_REQUIRED'),
    );
    if (!replaceableFactor) {
      throw new MfaError('MFA_ENROLLMENT_NOT_PERMITTED');
    }
    // One in-flight replacement per identity: a duplicate request fails closed
    // instead of stacking recovery sessions on the same operation. The
    // pre-check is best-effort under concurrency (two simultaneous requests
    // with different idempotency keys could both observe no active request);
    // both callers are AAL2-authenticated owners and REC-006's single-winner
    // execution guard keeps the eventual factor revocation safe, and the
    // (identityId, operationClass, idempotencyKey) unique constraint prevents
    // same-key replays. An atomic partial unique index would require an
    // approved schema change.
    const now = this.clock.now();
    const existing = await this.recoveryRequests.findActiveByOperationClass(
      command.identityId,
      'MFA_FACTOR_REPLACEMENT',
      now,
    );
    if (existing !== null) {
      throw new MfaError('RESOURCE_STATE_CONFLICT');
    }

    const recoveryRequestId = this.identifiers.next();
    const recoveryRequest = new RecoveryRequest({
      recoveryRequestId,
      identityId: command.identityId,
      operationClass: 'MFA_FACTOR_REPLACEMENT',
      recoveryState: 'REQUESTED',
      recoveryAssurance: 'RA0',
      recoveryPolicyVersion: new RecoveryPolicyVersion(this.policy.recoveryPolicyVersion),
      permittedOperation: new PermittedRecoveryOperation('MFA_FACTOR_REPLACEMENT'),
      stateVersion: 1,
      expiresAt: new Date(now.getTime() + this.policy.requestLifetimeSeconds * 1000),
      aggregateVersion: new AggregateVersion(1),
      createdAt: now,
      updatedAt: now,
    });
    await this.recoveryRequests.insert({
      recoveryRequest,
      evidence: [],
      notifications: [],
      approvalsToAppend: [],
      attemptsToAppend: [],
      transitionsToAppend: [],
    });
    return {
      requestId: recoveryRequestId.value,
      state: 'REQUESTED',
      nextAction: 'SUBMIT_EVIDENCE',
      version: 1,
    };
  }
}
