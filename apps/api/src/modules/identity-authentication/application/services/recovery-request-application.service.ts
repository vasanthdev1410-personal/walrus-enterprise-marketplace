import { canonicalizeIdentifier } from '../../domain/identity/value-objects/canonicalize-identifier';
import type { IdentifierType } from '../../domain/identity/value-objects/identifier-type';
import type { IdentityRepository } from '../../domain/identity/repositories/identity-repository';
import { RecoveryRequest } from '../../domain/recovery/entities/recovery-request';
import type { RecoveryRequestRepository } from '../../domain/recovery/repositories/recovery-request-repository';
import { PermittedRecoveryOperation } from '../../domain/recovery/value-objects/permitted-recovery-operation';
import type { RecoveryOperationClass } from '../../domain/recovery/value-objects/recovery-operation-class';
import { RecoveryPolicyVersion } from '../../domain/recovery/value-objects/recovery-policy-version';
import type { RecoveryState } from '../../domain/recovery/value-objects/recovery-state';
import { AggregateVersion } from '../../domain/shared/value-objects/aggregate-version';
import { CorrelationIdentifier } from '../../domain/shared/value-objects/correlation-identifier';
import { ProtectedValue } from '../../domain/shared/value-objects/protected-value';
import type { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';
import { RecoveryError } from '../errors/recovery.error';
import type { ClockPort, UuidV7GenerationPort } from '../ports/application-runtime.port';
import type { IdentifierLookupCryptographicPort } from '../ports/identifier-lookup-cryptographic.port';

export interface RecoveryRequestApplicationOptions {
  readonly environment: string;
  readonly recoveryPolicyVersion: string;
  readonly requestLifetimeSeconds: number;
}

export type RecoveryLocatorType = 'EMAIL' | 'MOBILE';

/**
 * M01-REC-001. Initiates an identity recovery request for a forgotten or
 * unavailable authentication path. The endpoint is PUBLIC_ENUMERATION_SAFE:
 * the response always reports acceptance with a recovery-request locator,
 * next action and correlation id, regardless of whether the locator resolves,
 * and no account existence is ever revealed. When the locator resolves to an
 * eligible identity, a REQUESTED/RA0 Recovery Request bound to that identity
 * is persisted atomically; otherwise a valid-shaped concealed locator is
 * returned while nothing is persisted.
 */
export interface StartRecoveryCommand {
  readonly operationClass: RecoveryOperationClass;
  readonly recoveryLocatorType: RecoveryLocatorType;
  readonly recoveryLocator: string;
  readonly idempotencyKey: string;
  readonly correlationId?: string;
}

export interface RecoveryRequestStartedResult {
  /** Always true: acceptance never distinguishes an existing identity. */
  readonly accepted: true;
  /** The recovery-request locator (real or concealed). */
  readonly recoveryRequestLocator: string;
  /** The next approved step in the canonical recovery workflow. */
  readonly nextAction: 'SUBMIT_EVIDENCE';
}

export type RecoveryNextAction =
  | 'SUBMIT_EVIDENCE'
  | 'REQUEST_APPROVAL'
  | 'AWAIT_APPROVAL'
  | 'EXECUTE'
  | 'NONE';

/**
 * M01-REC-003 result. Only the safe status vocabulary is exposed: the
 * canonical safe state, the deterministic next action, the expiry where it
 * remains relevant, and the resource version. Approval internals, evidence
 * details and identity material are never returned.
 */
export interface RecoveryStatusResult {
  readonly recoveryRequestId: string;
  readonly safeState: RecoveryState;
  readonly nextAction: RecoveryNextAction;
  readonly expiresAt?: string;
  readonly version: number;
}

/** Terminal canonical states never report a further action or expiry. */
const TERMINAL_RECOVERY_STATES: readonly RecoveryState[] = [
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
  'FAILED_SECURELY',
];

/**
 * Deterministic next action derived from the canonical recovery state machine
 * (spec Section 23). Policy-dependent skips (e.g. approval not required) are
 * evaluated by the evidence milestone; until then the conservative approval
 * step is reported.
 */
const NEXT_ACTION: Readonly<Record<RecoveryState, RecoveryNextAction>> = {
  REQUESTED: 'SUBMIT_EVIDENCE',
  EVIDENCE_PENDING: 'SUBMIT_EVIDENCE',
  EVIDENCE_VERIFIED: 'REQUEST_APPROVAL',
  APPROVAL_PENDING: 'AWAIT_APPROVAL',
  APPROVED: 'EXECUTE',
  EXECUTING: 'EXECUTE',
  COMPLETED: 'NONE',
  REJECTED: 'NONE',
  CANCELLED: 'NONE',
  EXPIRED: 'NONE',
  FAILED_SECURELY: 'NONE',
};

export class RecoveryRequestApplicationService {
  public constructor(
    private readonly identityRepository: IdentityRepository,
    private readonly recoveryRequests: RecoveryRequestRepository,
    private readonly identifierLookup: IdentifierLookupCryptographicPort,
    private readonly clock: ClockPort,
    private readonly identifiers: UuidV7GenerationPort,
    private readonly options: RecoveryRequestApplicationOptions,
  ) {}

  /**
   * M01-REC-001. Enumeration-safe recovery initiation.
   *
   * Resolution never discloses account existence: a missing or ineligible
   * identity, or an unresolvable locator, all return a valid-shaped concealed
   * locator while nothing is persisted. An eligible identity receives a
   * purpose-scoped Recovery Request in the canonical REQUESTED state at RA0;
   * the deterministic policy matrix (evidence, approval and assurance
   * requirements) is evaluated in the subsequent evidence milestone.
   */
  public async startRecovery(command: StartRecoveryCommand): Promise<RecoveryRequestStartedResult> {
    const identifierType: IdentifierType = command.recoveryLocatorType;
    let canonicalValue: string;
    try {
      canonicalValue = canonicalizeIdentifier(identifierType, command.recoveryLocator);
    } catch {
      return this.concealed();
    }
    const lookups = this.identifierLookup.createLookupsForResolution({
      environment: this.options.environment,
      identifierType,
      canonicalValue,
    });
    const snapshot = await this.identityRepository.findByIdentifierLookups(
      identifierType,
      lookups.map((value) => new ProtectedValue(value)),
    );
    if (snapshot === null) return this.concealed();

    const identity = snapshot.identity.properties;
    // A deleted identity cannot be recovered and an unverified identity has no
    // acceptable recovery locator; every other state remains eligible so
    // approved operations such as IDENTITY_UNLOCK can proceed. Eligibility and
    // policy evaluation are completed by the evidence milestone.
    const eligible =
      identity.verificationState === 'VERIFIED' && identity.identityState !== 'DELETED';
    if (!eligible) return this.concealed();

    // The recovery locator must resolve to a VERIFIED identifier of the claimed
    // type (mirrors M01-CRED-002). An identity verified on another channel is
    // not addressable through an unverified locator and must not receive a
    // persisted request, so the outcome stays indistinguishable from a no-op.
    const verifiedLocatorIdentifier = snapshot.identifiers.find(
      (candidate) =>
        candidate.properties.identifierType === identifierType &&
        candidate.properties.verificationState === 'VERIFIED',
    );
    if (verifiedLocatorIdentifier === undefined) return this.concealed();

    const now = this.clock.now();
    const recoveryRequestId = this.identifiers.next();
    const correlationId =
      command.correlationId === undefined
        ? undefined
        : new CorrelationIdentifier(command.correlationId);
    const recoveryRequest = new RecoveryRequest({
      recoveryRequestId,
      identityId: identity.identityId,
      operationClass: command.operationClass,
      recoveryState: 'REQUESTED',
      recoveryAssurance: 'RA0',
      recoveryPolicyVersion: new RecoveryPolicyVersion(this.options.recoveryPolicyVersion),
      permittedOperation: new PermittedRecoveryOperation(command.operationClass),
      stateVersion: 1,
      expiresAt: new Date(now.getTime() + this.options.requestLifetimeSeconds * 1000),
      aggregateVersion: new AggregateVersion(1),
      createdAt: now,
      updatedAt: now,
      idempotencyKey: command.idempotencyKey,
      ...(correlationId === undefined ? {} : { correlationId }),
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
      accepted: true,
      recoveryRequestLocator: recoveryRequestId.value,
      nextAction: 'SUBMIT_EVIDENCE',
    };
  }

  private concealed(): RecoveryRequestStartedResult {
    return {
      accepted: true,
      // A synthetic locator keeps the response shape identical so a caller
      // cannot distinguish an existing account from a no-op.
      recoveryRequestLocator: this.identifiers.next().value,
      nextAction: 'SUBMIT_EVIDENCE',
    };
  }

  /**
   * M01-REC-003. Read-only recovery status.
   *
   * The safe recovery locator in the path is the caller's credential; an
   * unknown locator is answered with RESOURCE_NOT_AVAILABLE and never reveals
   * whether a request exists. The GET derives an expired effective state at
   * read time without mutating the stored request, and returns only the safe
   * status vocabulary.
   */
  public async getStatus(recoveryRequestId: UuidV7): Promise<RecoveryStatusResult> {
    const request = await this.recoveryRequests.findById(recoveryRequestId);
    if (request === null) throw new RecoveryError('RESOURCE_NOT_AVAILABLE');

    const properties = request.properties;
    const stored = properties.recoveryState;
    const expired = this.clock.now() > properties.expiresAt;
    const safeState: RecoveryState =
      !TERMINAL_RECOVERY_STATES.includes(stored) && expired ? 'EXPIRED' : stored;
    const nextAction = NEXT_ACTION[safeState];
    const result: RecoveryStatusResult = {
      recoveryRequestId: recoveryRequestId.value,
      safeState,
      nextAction,
      version: properties.aggregateVersion.value,
      ...(TERMINAL_RECOVERY_STATES.includes(safeState)
        ? {}
        : { expiresAt: properties.expiresAt.toISOString() }),
    };
    return result;
  }
}
