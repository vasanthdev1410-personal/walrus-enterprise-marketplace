import { canonicalizeIdentifier } from '../../domain/identity/value-objects/canonicalize-identifier';
import type { IdentifierType } from '../../domain/identity/value-objects/identifier-type';
import type { IdentityRepository } from '../../domain/identity/repositories/identity-repository';
import { RecoveryAttempt } from '../../domain/recovery/entities/recovery-attempt';
import { RecoveryEvidenceRecord } from '../../domain/recovery/entities/recovery-evidence-record';
import { RecoveryRequest } from '../../domain/recovery/entities/recovery-request';
import { RecoveryStateTransition } from '../../domain/recovery/entities/recovery-state-transition';
import type { RecoveryRequestRepository } from '../../domain/recovery/repositories/recovery-request-repository';
import {
  type RecoveryEvidenceBoundary,
  type RecoveryEvidenceType,
} from '../../domain/recovery/value-objects/recovery-evidence';
import type { RecoveryOperationClass } from '../../domain/recovery/value-objects/recovery-operation-class';
import { PermittedRecoveryOperation } from '../../domain/recovery/value-objects/permitted-recovery-operation';
import { RecoveryPolicyVersion } from '../../domain/recovery/value-objects/recovery-policy-version';
import type { RecoveryAssuranceLevel } from '../../domain/recovery/value-objects/recovery-assurance-level';
import type { RecoveryState } from '../../domain/recovery/value-objects/recovery-state';
import { AggregateVersion } from '../../domain/shared/value-objects/aggregate-version';
import { CorrelationIdentifier } from '../../domain/shared/value-objects/correlation-identifier';
import { ProtectedValue } from '../../domain/shared/value-objects/protected-value';
import type { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';
import { OptimisticConcurrencyError } from '../../domain/shared/errors/optimistic-concurrency.error';
import { RecoveryError } from '../errors/recovery.error';
import type { ClockPort, UuidV7GenerationPort } from '../ports/application-runtime.port';
import type { IdentifierLookupCryptographicPort } from '../ports/identifier-lookup-cryptographic.port';
import type { OtpRecoveryCodeCryptographicPort } from '../ports/otp-recovery-code-cryptographic.port';

export interface RecoveryRequestApplicationOptions {
  readonly environment: string;
  readonly recoveryPolicyVersion: string;
  readonly requestLifetimeSeconds: number;
  readonly maximumEvidenceAttempts: number;
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
 * M01-REC-002. Submits one piece of recovery evidence bound to the recovery
 * request. The recovery-request locator is the caller's Bound Recovery Session
 * credential; the version precondition (If-Match) guards the aggregate write.
 */
export interface SubmitEvidenceCommand {
  readonly recoveryRequestId: UuidV7;
  readonly expectedRecoveryVersion: number;
  readonly evidenceType: RecoveryEvidenceType;
  readonly evidenceValue?: string;
  readonly protectedEvidenceReference?: string;
  readonly recoveryPolicyVersion: string;
}

export interface RecoveryEvidenceSubmissionResult {
  readonly recoveryRequestId: string;
  readonly safeState: RecoveryState;
  readonly recoveryAssurance: RecoveryAssuranceLevel;
  readonly nextAction: RecoveryNextAction;
  readonly version: number;
}

/** Non-sensitive failure reasons recorded on rejected evidence/attempt rows. */
export type RejectedEvidenceReason =
  | 'UNSUPPORTED_EVIDENCE_TYPE'
  | 'MISSING_EVIDENCE_VALUE'
  | 'INVALID_RECOVERY_CODE';

/** Approved evidence type → compromise boundary mapping (spec Section 22). */
const EVIDENCE_BOUNDARY: Readonly<Record<RecoveryEvidenceType, RecoveryEvidenceBoundary>> = {
  VERIFIED_EMAIL_CHANNEL: 'EMAIL_CHANNEL',
  VERIFIED_MOBILE_CHANNEL: 'MOBILE_CHANNEL',
  RECOVERY_CODE: 'RECOVERY_CODE_SET',
  AUTHENTICATED_SESSION: 'AUTHENTICATED_SESSION',
  MFA_FACTOR: 'MFA_FACTOR',
  CONTROLLED_BOOTSTRAP_EVIDENCE: 'CONTROLLED_BOOTSTRAP',
};

interface RecoveryPolicyRequirement {
  readonly requiredIndependentEvidence: number;
  readonly targetAssurance: RecoveryAssuranceLevel;
}

/**
 * Deterministic policy row (spec Section 22). The evidence requirement is
 * derived from the operation class and the identity's effective
 * authentication-security classification; clients can never select a weaker
 * row. Approval requirements are evaluated by the approval milestone.
 */
function policyRequirement(
  operationClass: RecoveryOperationClass,
  classification: RecoverySecurityClassification,
): RecoveryPolicyRequirement {
  const privileged =
    classification === 'PRIVILEGED_ADMIN_AUTHENTICATION' ||
    classification === 'SUPER_ADMIN_AUTHENTICATION';
  if (privileged) {
    return { requiredIndependentEvidence: 2, targetAssurance: 'RA2' };
  }
  switch (operationClass) {
    case 'PASSWORD_RESET':
    case 'IDENTITY_UNLOCK':
      return { requiredIndependentEvidence: 1, targetAssurance: 'RA1' };
    default:
      return { requiredIndependentEvidence: 2, targetAssurance: 'RA2' };
  }
}

type RecoverySecurityClassification =
  | 'STANDARD_AUTHENTICATION'
  | 'PRIVILEGED_ADMIN_AUTHENTICATION'
  | 'SUPER_ADMIN_AUTHENTICATION';

/**
 * The identity's effective authentication-security classification: the most
 * recent EFFECTIVE assignment, defaulting to STANDARD_AUTHENTICATION.
 */
function effectiveClassification(
  assignments: readonly {
    readonly properties: {
      readonly classification: RecoverySecurityClassification;
      readonly assignmentState: 'EFFECTIVE' | 'ENDED';
      readonly effectiveAt: Date;
    };
  }[],
): RecoverySecurityClassification {
  const current = assignments
    .filter((assignment) => assignment.properties.assignmentState === 'EFFECTIVE')
    .sort(
      (left, right) =>
        right.properties.effectiveAt.getTime() - left.properties.effectiveAt.getTime(),
    )[0];
  return current?.properties.classification ?? 'STANDARD_AUTHENTICATION';
}

function transition(
  properties: RecoveryRequest['properties'],
  recoveryStateTransitionId: UuidV7,
  fromState: RecoveryState,
  toState: RecoveryState,
  stateVersion: number,
  now: Date,
): RecoveryStateTransition {
  return new RecoveryStateTransition({
    recoveryStateTransitionId,
    recoveryRequestId: properties.recoveryRequestId,
    fromState,
    toState,
    stateVersion,
    transitionedAt: now,
    createdAt: now,
    reasonCode: `RECOVERY_${toState}`,
  });
}

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
 * (spec Section 23). The evidence milestone (M01-REC-002) reports the
 * conservative approval step after EVIDENCE_VERIFIED; whether the policy row
 * actually requires human approval is evaluated by the approval milestone
 * (M01-REC-004), which answers RECOVERY_APPROVAL_NOT_REQUIRED when it does
 * not. Terminal states report NONE.
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
    private readonly otpCrypto: OtpRecoveryCodeCryptographicPort,
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
   * M01-REC-002. Submits recovery evidence bound to the recovery request.
   *
   * The recovery-request locator in the path is the caller's Bound Recovery
   * Session credential; possession plus the version precondition (If-Match)
   * authorizes the mutation. This milestone validates RECOVERY_CODE evidence
   * end-to-end: the raw code is matched against the identity's ACTIVE recovery
   * code set, the matching single-use code is consumed atomically with the
   * evidence record, and the deterministic policy row decides whether the
   * request has reached EVIDENCE_VERIFIED and its recovery assurance. Other
   * approved evidence types fail closed with RECOVERY_EVIDENCE_REJECTED until
   * their validation infrastructure is approved; raw evidence is never stored,
   * logged or embedded in idempotency records.
   */
  public async submitEvidence(
    command: SubmitEvidenceCommand,
  ): Promise<RecoveryEvidenceSubmissionResult> {
    const request = await this.recoveryRequests.findById(command.recoveryRequestId);
    const now = this.clock.now();
    // Unknown and invalid locators are answered uniformly: the caller cannot
    // distinguish a request that never existed from one in a terminal state,
    // so recovery state is never enumerable through this endpoint.
    if (request === null) throw new RecoveryError('RECOVERY_STATE_CONFLICT');
    const properties = request.properties;
    if (properties.aggregateVersion.value !== command.expectedRecoveryVersion) {
      throw new RecoveryError('RECOVERY_STATE_CONFLICT');
    }
    if (properties.expiresAt <= now) throw new RecoveryError('RECOVERY_STATE_CONFLICT');
    if (
      properties.recoveryState !== 'REQUESTED' &&
      properties.recoveryState !== 'EVIDENCE_PENDING'
    ) {
      throw new RecoveryError('RECOVERY_STATE_CONFLICT');
    }
    // The client can never select a weaker policy row (spec Part 5.5): the
    // submitted policy version must equal the authoritative approved version.
    if (command.recoveryPolicyVersion !== this.options.recoveryPolicyVersion) {
      throw new RecoveryError('RECOVERY_STATE_CONFLICT');
    }

    // Defense-in-depth: the identity bound to the request must still be an
    // eligible, VERIFIED, non-deleted identity for evidence to be validated
    // against its recovery material.
    const snapshot = await this.identityRepository.findAuthenticationById(properties.identityId);
    if (
      snapshot?.identity.properties.identityState !== 'ACTIVE' ||
      snapshot.identity.properties.verificationState !== 'VERIFIED'
    ) {
      throw new RecoveryError('RECOVERY_STATE_CONFLICT');
    }

    // This milestone validates RECOVERY_CODE evidence; the other approved
    // evidence types fail closed because their validation infrastructure is
    // not yet part of the approved recovery surface. The response is uniform
    // (RECOVERY_EVIDENCE_REJECTED) and no evidence material is persisted.
    if (command.evidenceType !== 'RECOVERY_CODE') {
      return this.rejectEvidence(command, request, now, 'UNSUPPORTED_EVIDENCE_TYPE');
    }
    if (command.evidenceValue === undefined || command.evidenceValue.trim().length === 0) {
      return this.rejectEvidence(command, request, now, 'MISSING_EVIDENCE_VALUE');
    }
    const rawEvidenceValue = command.evidenceValue;

    const sets = await this.identityRepository.findRecoveryCodeSets(properties.identityId);
    const activeSet = sets?.recoveryCodeSets.find((set) => set.properties.setState === 'ACTIVE');
    const activeCodes =
      sets === null || activeSet === undefined
        ? []
        : sets.recoveryCodes.filter(
            (code) =>
              code.properties.codeState === 'ACTIVE' &&
              code.properties.recoveryCodeSetId.value === activeSet.properties.recoveryCodeSetId.value,
          );
    const matched =
      activeSet === undefined
        ? undefined
        : activeCodes.find((candidate) =>
            this.otpCrypto.matchesRecoveryCode(
              rawEvidenceValue,
              {
                environment: this.options.environment,
                identityId: properties.identityId.value,
                recoveryCodeSetId: activeSet.properties.recoveryCodeSetId.value,
              },
              candidate.properties.codeDigest.value,
            ),
          );
    if (matched === undefined) {
      return this.rejectEvidence(command, request, now, 'INVALID_RECOVERY_CODE');
    }

    // Deterministic policy-matrix evaluation (spec Section 22): evidence
    // sources counted as independent must not share a compromise boundary.
    // Every recovery code of a set shares the RECOVERY_CODE_SET boundary, so
    // recovery-code evidence contributes exactly one independent source.
    const existingEvidence = await this.recoveryRequests.findEvidence(command.recoveryRequestId);
    const verifiedBoundaries = new Set<RecoveryEvidenceBoundary>(
      existingEvidence
        .filter((evidence) => evidence.properties.evidenceState === 'VERIFIED')
        .map((evidence) => evidence.properties.evidenceBoundary),
    );
    verifiedBoundaries.add('RECOVERY_CODE_SET');
    const classification = effectiveClassification(snapshot.classificationAssignments);
    const requirement = policyRequirement(properties.operationClass, classification);
    const satisfied = verifiedBoundaries.size >= requirement.requiredIndependentEvidence;

    const evidence = new RecoveryEvidenceRecord({
      recoveryEvidenceId: this.identifiers.next(),
      recoveryRequestId: command.recoveryRequestId,
      evidenceType: 'RECOVERY_CODE',
      // Only the non-reversible code digest is retained; the raw code is never
      // stored.
      protectedEvidenceReference: matched.properties.codeDigest,
      evidenceState: 'VERIFIED',
      evidenceBoundary: 'RECOVERY_CODE_SET',
      expiresAt: properties.expiresAt,
      createdAt: now,
      verifiedAt: now,
    });
    const attempt = new RecoveryAttempt({
      recoveryAttemptId: this.identifiers.next(),
      recoveryRequestId: command.recoveryRequestId,
      attemptType: 'EVIDENCE_SUBMISSION',
      outcome: 'SUCCEEDED',
      attemptedAt: now,
      createdAt: now,
    });

    // Canonical machine (spec Section 23): REQUESTED → EVIDENCE_PENDING →
    // EVIDENCE_VERIFIED. When the policy row is satisfied by this submission
    // both transitions are recorded so the audit trail is complete.
    const transitions: RecoveryStateTransition[] = [];
    let nextState: RecoveryState = properties.recoveryState;
    let stateVersion = properties.stateVersion;
    if (satisfied) {
      if (properties.recoveryState === 'REQUESTED') {
        transitions.push(
          transition(
            properties,
            this.identifiers.next(),
            'REQUESTED',
            'EVIDENCE_PENDING',
            ++stateVersion,
            now,
          ),
        );
      }
      transitions.push(
        transition(
          properties,
          this.identifiers.next(),
          'EVIDENCE_PENDING',
          'EVIDENCE_VERIFIED',
          ++stateVersion,
          now,
        ),
      );
      nextState = 'EVIDENCE_VERIFIED';
    } else if (properties.recoveryState === 'REQUESTED') {
      transitions.push(
        transition(
          properties,
          this.identifiers.next(),
          'REQUESTED',
          'EVIDENCE_PENDING',
          ++stateVersion,
          now,
        ),
      );
      nextState = 'EVIDENCE_PENDING';
    }

    const updated = new RecoveryRequest({
      ...properties,
      recoveryState: nextState,
      recoveryAssurance: satisfied ? requirement.targetAssurance : 'RA0',
      stateVersion,
      aggregateVersion: new AggregateVersion(properties.aggregateVersion.value + 1),
      updatedAt: now,
    });
    try {
      await this.recoveryRequests.submitRecoveryCodeEvidence({
        recoveryRequestId: command.recoveryRequestId,
        expectedRecoveryVersion: properties.aggregateVersion,
        updatedRecoveryRequest: updated,
        evidence,
        attempt,
        transitionsToAppend: transitions,
        consumedRecoveryCodeId: matched.properties.recoveryCodeId,
      });
    } catch (error) {
      // The atomic command throws on a stale version or an already-consumed
      // code and rolls the entire change set back, so no state is mutated.
      if (error instanceof OptimisticConcurrencyError) {
        throw new RecoveryError('RECOVERY_STATE_CONFLICT');
      }
      throw error;
    }

    return this.evidenceResult(command.recoveryRequestId, updated);
  }

  /**
   * Records a rejected evidence submission (audit trail), enforces the
   * evidence-attempt limit by failing the request securely when exhausted, and
   * throws RECOVERY_EVIDENCE_REJECTED. The rejected evidence carries a
   * non-sensitive synthetic reference: the raw submitted value is never stored.
   */
  private async rejectEvidence(
    command: SubmitEvidenceCommand,
    request: RecoveryRequest,
    now: Date,
    reason: RejectedEvidenceReason,
  ): Promise<never> {
    const properties = request.properties;
    const existingEvidence = await this.recoveryRequests.findEvidence(command.recoveryRequestId);
    const rejectedCount = existingEvidence.filter(
      (evidence) => evidence.properties.evidenceState === 'REJECTED',
    ).length;
    const terminal = rejectedCount + 1 >= this.options.maximumEvidenceAttempts;

    const evidence = new RecoveryEvidenceRecord({
      recoveryEvidenceId: this.identifiers.next(),
      recoveryRequestId: command.recoveryRequestId,
      evidenceType: command.evidenceType,
      // Synthetic, non-sensitive reference: evidence material is never stored.
      protectedEvidenceReference: new ProtectedValue(`rejected:${this.identifiers.next().value}`),
      evidenceState: 'REJECTED',
      evidenceBoundary: EVIDENCE_BOUNDARY[command.evidenceType],
      expiresAt: properties.expiresAt,
      createdAt: now,
      failureReason: reason,
    });
    const attempt = new RecoveryAttempt({
      recoveryAttemptId: this.identifiers.next(),
      recoveryRequestId: command.recoveryRequestId,
      attemptType: 'EVIDENCE_SUBMISSION',
      outcome: terminal ? 'FAILED_SECURELY' : 'REJECTED',
      attemptedAt: now,
      createdAt: now,
      failureReason: reason,
    });
    const transitions: RecoveryStateTransition[] = [];
    let nextState: RecoveryState = properties.recoveryState;
    let stateVersion = properties.stateVersion;
    const terminalReason: string | undefined = terminal
      ? 'EVIDENCE_ATTEMPTS_EXCEEDED'
      : properties.terminalReason;
    if (terminal) {
      transitions.push(
        transition(
          properties,
          this.identifiers.next(),
          properties.recoveryState,
          'FAILED_SECURELY',
          ++stateVersion,
          now,
        ),
      );
      nextState = 'FAILED_SECURELY';
    }
    const updated = new RecoveryRequest({
      ...properties,
      recoveryState: nextState,
      stateVersion,
      aggregateVersion: new AggregateVersion(properties.aggregateVersion.value + 1),
      updatedAt: now,
      ...(terminalReason === undefined ? {} : { terminalReason }),
    });
    try {
      await this.recoveryRequests.save(
        {
          recoveryRequest: updated,
          evidence: [evidence],
          notifications: [],
          approvalsToAppend: [],
          attemptsToAppend: [attempt],
          transitionsToAppend: transitions,
        },
        properties.aggregateVersion,
      );
    } catch (error) {
      if (error instanceof OptimisticConcurrencyError) {
        throw new RecoveryError('RECOVERY_STATE_CONFLICT');
      }
      throw error;
    }
    throw new RecoveryError('RECOVERY_EVIDENCE_REJECTED');
  }

  private evidenceResult(
    recoveryRequestId: UuidV7,
    updated: RecoveryRequest,
  ): RecoveryEvidenceSubmissionResult {
    const properties = updated.properties;
    return {
      recoveryRequestId: recoveryRequestId.value,
      safeState: properties.recoveryState,
      recoveryAssurance: properties.recoveryAssurance,
      nextAction: NEXT_ACTION[properties.recoveryState],
      version: properties.aggregateVersion.value,
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
