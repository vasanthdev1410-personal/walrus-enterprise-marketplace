import { canonicalizeIdentifier } from '../../domain/identity/value-objects/canonicalize-identifier';
import type { IdentifierType } from '../../domain/identity/value-objects/identifier-type';
import type { IdentityRepository } from '../../domain/identity/repositories/identity-repository';
import { Identity } from '../../domain/identity/entities/identity';
import { MfaEnrollment } from '../../domain/identity/entities/mfa-enrollment';
import { MfaFactor } from '../../domain/identity/entities/mfa-factor';
import { RecoveryCodeRecord } from '../../domain/identity/entities/recovery-code-record';
import { RecoveryCodeSet } from '../../domain/identity/entities/recovery-code-set';
import { TrustedDevice } from '../../domain/identity/entities/trusted-device';
import { RecoveryApprovalRecord } from '../../domain/recovery/entities/recovery-approval-record';
import { RecoveryAttempt } from '../../domain/recovery/entities/recovery-attempt';
import { RecoveryEvidenceRecord } from '../../domain/recovery/entities/recovery-evidence-record';
import { RecoveryNotificationRecord } from '../../domain/recovery/entities/recovery-notification-record';
import { RecoveryRequest } from '../../domain/recovery/entities/recovery-request';
import { RecoveryStateTransition } from '../../domain/recovery/entities/recovery-state-transition';
import type { RecoveryRequestRepository } from '../../domain/recovery/repositories/recovery-request-repository';
import type { SessionRepository } from '../../domain/session/repositories/session-repository';
import type { VerificationChallengeRepository } from '../../domain/verification/repositories/verification-challenge-repository';
import type { RecoveryApprovalDecision } from '../../domain/recovery/value-objects/recovery-approval-decision';
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
import type { ApprovalAuthorizationPort } from '../ports/approval-authorization.port';
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
  'SUBMIT_EVIDENCE' | 'REQUEST_APPROVAL' | 'AWAIT_APPROVAL' | 'EXECUTE' | 'NONE';

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

/**
 * M01-REC-004. Requests human approval for a recovery request when the
 * deterministic policy row requires it. The recovery-request locator is the
 * caller's Bound Recovery Session credential; the version precondition
 * (If-Match) guards the aggregate write.
 */
export interface RequestApprovalCommand {
  readonly recoveryRequestId: UuidV7;
  readonly expectedRecoveryVersion: number;
  readonly recoveryPolicyVersion: string;
}

export interface RecoveryApprovalResult {
  readonly safeState: RecoveryState;
  readonly approvalRequired: boolean;
  readonly version: number;
}

/**
 * M01-REC-005. Records one approver decision on an APPROVAL_PENDING recovery
 * request. The approver identity is the authenticated ordinary AAL2 session
 * subject; the version precondition (If-Match) guards the aggregate write.
 */
export interface RecordApprovalDecisionCommand {
  readonly recoveryRequestId: UuidV7;
  readonly approverIdentityId: UuidV7;
  readonly expectedRecoveryVersion: number;
  readonly decision: RecoveryApprovalDecision;
  readonly recoveryOperationClass: RecoveryOperationClass;
  readonly approvalReasonCode: string;
  /** Approver-declared UTC ISO-8601 expiry, validated and bounded by policy. */
  readonly approvalExpiresAt: string;
}

export interface RecoveryApprovalDecisionResult {
  readonly recoveryRequestId: string;
  readonly recordedDecision: RecoveryApprovalDecision;
  readonly version: number;
}

/**
 * M01-REC-006. Completes an approved recovery. The recovery-request locator
 * is the caller's Bound Recovery Session credential; the version precondition
 * (If-Match) guards the aggregate write. Only an APPROVED request, or an
 * EVIDENCE_VERIFIED request whose deterministic policy row requires no human
 * approval, may execute.
 */
export interface ExecuteRecoveryCommand {
  readonly recoveryRequestId: UuidV7;
  readonly expectedRecoveryVersion: number;
  /** Must equal the operation the recovery session is bound to. */
  readonly permittedOperation: RecoveryOperationClass;
  readonly recoveryPolicyVersion: string;
}

export interface RecoveryExecutionResult {
  readonly recoveryRequestId: string;
  readonly safeState: 'COMPLETED';
  readonly reauthenticationRequired: true;
  readonly version: number;
}

/**
 * M01-REC-007. Cancels an in-progress recovery request. The recovery-request
 * locator is the caller's Bound Recovery Session credential; the version
 * precondition (If-Match) guards the aggregate write. Cancellation is only
 * permitted from the approved non-terminal states (REQUESTED, EVIDENCE_PENDING,
 * EVIDENCE_VERIFIED, APPROVAL_PENDING, APPROVED); terminal, expired and
 * executing states fail closed.
 */
export interface CancelRecoveryCommand {
  readonly recoveryRequestId: UuidV7;
  readonly expectedRecoveryVersion: number;
}

export interface RecoveryCancellationResult {
  readonly recoveryRequestId: string;
  readonly safeState: 'CANCELLED';
  readonly version: number;
}

/** Non-sensitive failure reasons recorded on rejected evidence/attempt rows. */
export type RejectedEvidenceReason =
  'UNSUPPORTED_EVIDENCE_TYPE' | 'MISSING_EVIDENCE_VALUE' | 'INVALID_RECOVERY_CODE';

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
  'STANDARD_AUTHENTICATION' | 'PRIVILEGED_ADMIN_AUTHENTICATION' | 'SUPER_ADMIN_AUTHENTICATION';

/**
 * Deterministic approval requirement (spec Section 22): SUPER_ADMIN recovery
 * mandates dual control by two distinct Module 02-authorized approvers, and
 * PRIVILEGED_ADMIN recovery requires dual control unless the approved strong
 * self-service evidence set is fully satisfied — a condition that cannot be
 * established by the evidence infrastructure approved so far, so privileged
 * recovery fails closed to required approval. STANDARD recovery rows require
 * no human approval unless risk policy escalates, and no escalation
 * infrastructure exists in Module 01, so approval is not required.
 */
function approvalRequirement(classification: RecoverySecurityClassification): boolean {
  return (
    classification === 'PRIVILEGED_ADMIN_AUTHENTICATION' ||
    classification === 'SUPER_ADMIN_AUTHENTICATION'
  );
}

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

/**
 * Deterministic required-approver count (spec Section 24 dual control). Both
 * classifications that can reach APPROVAL_PENDING — PRIVILEGED_ADMIN, which
 * fails closed to dual control because the approved strong self-service
 * evidence set cannot be established, and SUPER_ADMIN, where dual control is
 * mandatory — require two distinct Module 02-authorized approvers. One
 * approver can never satisfy both approvals.
 */
const REQUIRED_APPROVAL_RECORDS = 2;

function transition(
  properties: RecoveryRequest['properties'],
  recoveryStateTransitionId: UuidV7,
  fromState: RecoveryState,
  toState: RecoveryState,
  stateVersion: number,
  now: Date,
  reasonCodeOverride?: string,
): RecoveryStateTransition {
  return new RecoveryStateTransition({
    recoveryStateTransitionId,
    recoveryRequestId: properties.recoveryRequestId,
    fromState,
    toState,
    stateVersion,
    transitionedAt: now,
    createdAt: now,
    // M01-REC-005 approval transitions carry the approver's reason code so the
    // reason is preserved in the immutable transition audit trail; every other
    // transition keeps the deterministic machine-derived reason.
    reasonCode: reasonCodeOverride ?? `RECOVERY_${toState}`,
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
 * The policy-approved non-terminal states a recovery request may be cancelled
 * from (spec Section 23 / M01-REC-007): every in-progress state before
 * execution. EXECUTING is execution-owned and never observable in practice
 * (M01-REC-006 completes atomically in one write), so it is not cancellable;
 * terminal states and expiry fail closed.
 */
const CANCELLABLE_RECOVERY_STATES: readonly RecoveryState[] = [
  'REQUESTED',
  'EVIDENCE_PENDING',
  'EVIDENCE_VERIFIED',
  'APPROVAL_PENDING',
  'APPROVED',
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
    private readonly sessionRepository: SessionRepository,
    private readonly verificationChallenges: VerificationChallengeRepository,
    private readonly identifierLookup: IdentifierLookupCryptographicPort,
    private readonly otpCrypto: OtpRecoveryCodeCryptographicPort,
    private readonly approvalAuthorization: ApprovalAuthorizationPort,
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
              code.properties.recoveryCodeSetId.value ===
                activeSet.properties.recoveryCodeSetId.value,
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
   * M01-REC-004. Requests human approval when the deterministic policy row
   * requires it.
   *
   * The recovery-request locator in the path is the caller's Bound Recovery
   * Session credential; the version precondition (If-Match) guards the
   * aggregate write. Only a request whose evidence prerequisite is fully
   * satisfied (EVIDENCE_VERIFIED) may request approval; a second request for
   * an already pending or approved request is answered uniformly with
   * RECOVERY_STATE_CONFLICT, so duplicate approval requests are impossible.
   * When the policy row requires no human approval the endpoint answers
   * RECOVERY_APPROVAL_NOT_REQUIRED without mutating any state; the canonical
   * machine skips APPROVAL_PENDING and the recovery is completed directly by
   * the execution milestone.
   */
  public async requestApproval(command: RequestApprovalCommand): Promise<RecoveryApprovalResult> {
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
    // Evidence must already be satisfied and approval must not already have
    // been requested: REQUESTED/EVIDENCE_PENDING have not met the evidence
    // prerequisite, and APPROVAL_PENDING/APPROVED (or any later state) mean an
    // approval request already exists, so both fail closed.
    if (properties.recoveryState !== 'EVIDENCE_VERIFIED') {
      throw new RecoveryError('RECOVERY_STATE_CONFLICT');
    }
    // The client can never select a weaker policy row (spec Part 5.5): the
    // submitted policy version must equal the authoritative approved version.
    if (command.recoveryPolicyVersion !== this.options.recoveryPolicyVersion) {
      throw new RecoveryError('RECOVERY_STATE_CONFLICT');
    }

    // Defense-in-depth: the identity bound to the request must still be an
    // eligible, VERIFIED, non-deleted identity.
    const snapshot = await this.identityRepository.findAuthenticationById(properties.identityId);
    if (
      snapshot?.identity.properties.identityState !== 'ACTIVE' ||
      snapshot.identity.properties.verificationState !== 'VERIFIED'
    ) {
      throw new RecoveryError('RECOVERY_STATE_CONFLICT');
    }

    const classification = effectiveClassification(snapshot.classificationAssignments);
    if (!approvalRequirement(classification)) {
      // The deterministic policy row requires no human approval; the canonical
      // machine skips APPROVAL_PENDING (execution completes the recovery
      // directly). Nothing is mutated and the caller is answered uniformly, so
      // the response can never reveal the identity classification itself.
      throw new RecoveryError('RECOVERY_APPROVAL_NOT_REQUIRED');
    }

    // Canonical machine (spec Section 23): EVIDENCE_VERIFIED →
    // APPROVAL_PENDING when the policy row requires human approval. No
    // RecoveryApprovalRecord is written here: those records are created by
    // the approval-decision milestone (M01-REC-005) for each Module
    // 02-authorized approver.
    const stateVersion = properties.stateVersion + 1;
    const transitionRecord = transition(
      properties,
      this.identifiers.next(),
      'EVIDENCE_VERIFIED',
      'APPROVAL_PENDING',
      stateVersion,
      now,
    );
    const updated = new RecoveryRequest({
      ...properties,
      recoveryState: 'APPROVAL_PENDING',
      stateVersion,
      aggregateVersion: new AggregateVersion(properties.aggregateVersion.value + 1),
      updatedAt: now,
    });
    try {
      await this.recoveryRequests.save(
        {
          recoveryRequest: updated,
          evidence: [],
          notifications: [],
          approvalsToAppend: [],
          attemptsToAppend: [],
          transitionsToAppend: [transitionRecord],
        },
        properties.aggregateVersion,
      );
    } catch (error) {
      // The version guard throws on a stale version and rolls the change set
      // back, so no approval state is ever committed for a stale caller.
      if (error instanceof OptimisticConcurrencyError) {
        throw new RecoveryError('RECOVERY_STATE_CONFLICT');
      }
      throw error;
    }
    return {
      safeState: updated.properties.recoveryState,
      approvalRequired: true,
      version: updated.properties.aggregateVersion.value,
    };
  }

  /**
   * M01-REC-005. Records one approver decision on an APPROVAL_PENDING
   * recovery request.
   *
   * The endpoint is MODULE_02_AUTHORIZED: the approver's ordinary AAL2
   * session is enforced by the guard, and a current Module 02 authorization
   * decision is obtained through the approved boundary at decision time
   * (AUTHORIZATION_DENIED otherwise). The requester can never self-approve,
   * one approver satisfies at most one decision (a duplicate pre-check plus
   * the unique approver persistence constraint), decisions are bound to the
   * request, identity, operation class, reason, decision and an expiry that
   * can never exceed the recovery request's own expiry. When the required two
   * distinct APPROVED records are reached the request moves APPROVAL_PENDING
   * → APPROVED; a REJECTED decision fails the recovery securely into the
   * terminal REJECTED state. Approval never authenticates the recovered
   * identity.
   */
  public async recordApprovalDecision(
    command: RecordApprovalDecisionCommand,
  ): Promise<RecoveryApprovalDecisionResult> {
    const request = await this.recoveryRequests.findById(command.recoveryRequestId);
    const now = this.clock.now();
    // Unknown and invalid locators are answered uniformly: the caller cannot
    // distinguish a request that never existed from one in a terminal state.
    if (request === null) throw new RecoveryError('RECOVERY_APPROVAL_INVALID');
    const properties = request.properties;
    if (properties.aggregateVersion.value !== command.expectedRecoveryVersion) {
      throw new RecoveryError('RECOVERY_APPROVAL_INVALID');
    }
    if (properties.expiresAt <= now) throw new RecoveryError('RECOVERY_APPROVAL_INVALID');
    // Only an APPROVAL_PENDING request can accept a decision: premature,
    // already-approved, rejected, cancelled, expired or failed requests all
    // fail closed, and an already-approved request can never receive further
    // decisions.
    if (properties.recoveryState !== 'APPROVAL_PENDING') {
      throw new RecoveryError('RECOVERY_APPROVAL_INVALID');
    }
    // Decisions are bound to the operation class of the recovery request; the
    // client can never widen or reselect it (spec Section 24).
    if (command.recoveryOperationClass !== properties.operationClass) {
      throw new RecoveryError('RECOVERY_APPROVAL_INVALID');
    }
    // The approver-declared expiry is bounded: it must be a valid future
    // timestamp and can never outlive the recovery request itself, so an
    // approval cannot be kept valid beyond the recovery window.
    const approvalExpiresAt = new Date(command.approvalExpiresAt);
    if (
      Number.isNaN(approvalExpiresAt.getTime()) ||
      approvalExpiresAt <= now ||
      approvalExpiresAt > properties.expiresAt
    ) {
      throw new RecoveryError('RECOVERY_APPROVAL_INVALID');
    }
    // The requester shall never approve their own recovery (spec Section 24).
    if (command.approverIdentityId.value === properties.identityId.value) {
      throw new RecoveryError('RECOVERY_APPROVAL_INVALID');
    }

    // Defense-in-depth: the identity bound to the request must still be an
    // eligible, VERIFIED, non-deleted identity (mirrors M01-REC-002/004).
    const snapshot = await this.identityRepository.findAuthenticationById(properties.identityId);
    if (
      snapshot?.identity.properties.identityState !== 'ACTIVE' ||
      snapshot.identity.properties.verificationState !== 'VERIFIED'
    ) {
      throw new RecoveryError('RECOVERY_APPROVAL_INVALID');
    }

    // A current Module 02 authorization decision is obtained at decision time
    // through the approved boundary; the approver's session alone is never
    // sufficient to approve a recovery.
    const authorization = await this.approvalAuthorization.authorizeApprover({
      approverIdentityId: command.approverIdentityId,
      recoveryRequestId: command.recoveryRequestId,
      recoveredIdentityId: properties.identityId,
      operationClass: properties.operationClass,
    });
    if (!authorization.authorized) {
      throw new RecoveryError('AUTHORIZATION_DENIED');
    }

    // One approver satisfies at most one decision per recovery request. The
    // unique (request, approver) persistence constraint is the atomic
    // backstop for a concurrent duplicate; the pre-check keeps the response
    // deterministic.
    const existingApprovals = await this.recoveryRequests.findApprovalRecords(
      command.recoveryRequestId,
    );
    if (
      existingApprovals.some(
        (record) => record.properties.approverIdentityId.value === command.approverIdentityId.value,
      )
    ) {
      throw new RecoveryError('RECOVERY_APPROVAL_INVALID');
    }

    const approvalRecord = new RecoveryApprovalRecord({
      recoveryApprovalId: this.identifiers.next(),
      recoveryRequestId: command.recoveryRequestId,
      recoveredIdentityId: properties.identityId,
      operation: properties.permittedOperation,
      approverIdentityId: command.approverIdentityId,
      // Only a non-sensitive reference to the current Module 02 decision is
      // retained; no authorization material is ever stored.
      approverAuthenticationEvidenceReference: new ProtectedValue(
        authorization.authorizationReference ?? 'module-02:authorization',
      ),
      decision: command.decision,
      decidedAt: now,
      expiresAt: approvalExpiresAt,
      createdAt: now,
    });

    // Canonical machine (spec Section 23): APPROVAL_PENDING → APPROVED once
    // dual control is satisfied; a rejection fails the recovery securely into
    // the terminal REJECTED state and no further decisions are accepted.
    const transitions: RecoveryStateTransition[] = [];
    let nextState: RecoveryState = properties.recoveryState;
    let stateVersion = properties.stateVersion;
    let approvedAt: Date | undefined = properties.approvedAt;
    let terminalReason: string | undefined = properties.terminalReason;
    if (command.decision === 'REJECTED') {
      transitions.push(
        transition(
          properties,
          this.identifiers.next(),
          'APPROVAL_PENDING',
          'REJECTED',
          ++stateVersion,
          now,
          command.approvalReasonCode,
        ),
      );
      nextState = 'REJECTED';
      terminalReason = 'APPROVAL_REJECTED';
    } else {
      const approvedCount =
        existingApprovals.filter((record) => record.properties.decision === 'APPROVED').length + 1;
      if (approvedCount >= REQUIRED_APPROVAL_RECORDS) {
        transitions.push(
          transition(
            properties,
            this.identifiers.next(),
            'APPROVAL_PENDING',
            'APPROVED',
            ++stateVersion,
            now,
            command.approvalReasonCode,
          ),
        );
        nextState = 'APPROVED';
        approvedAt = now;
      }
    }

    const updated = new RecoveryRequest({
      ...properties,
      recoveryState: nextState,
      stateVersion,
      aggregateVersion: new AggregateVersion(properties.aggregateVersion.value + 1),
      updatedAt: now,
      ...(approvedAt === undefined ? {} : { approvedAt }),
      ...(terminalReason === undefined ? {} : { terminalReason }),
    });
    try {
      await this.recoveryRequests.recordApprovalDecision({
        recoveryRequestId: command.recoveryRequestId,
        expectedRecoveryVersion: properties.aggregateVersion,
        updatedRecoveryRequest: updated,
        approvalRecord,
        transitionsToAppend: transitions,
      });
    } catch (error) {
      // A stale version or a concurrent duplicate decision rolls the change
      // set back; the caller is answered uniformly without revealing why.
      if (error instanceof OptimisticConcurrencyError) {
        throw new RecoveryError('RECOVERY_APPROVAL_INVALID');
      }
      throw error;
    }
    return {
      recoveryRequestId: command.recoveryRequestId.value,
      recordedDecision: command.decision,
      version: updated.properties.aggregateVersion.value,
    };
  }

  /**
   * M01-REC-006. Completes an approved recovery.
   *
   * Both approved execution paths are supported: an APPROVED request (dual
   * control satisfied) and an EVIDENCE_VERIFIED request whose deterministic
   * policy row requires no human approval (the canonical machine skips
   * APPROVAL_PENDING). An EVIDENCE_VERIFIED request that does require approval
   * is answered RECOVERY_APPROVAL_REQUIRED; every other state fails closed
   * with RECOVERY_STATE_CONFLICT so a request can be executed at most once.
   *
   * Completion effects are committed in a fail-closed order: the identity's
   * trusted devices are revoked and its unused recovery codes and code sets
   * are invalidated atomically BEFORE the request is marked COMPLETED, so a
   * completed recovery can never leave usable recovery material behind. The
   * request transition itself is a single-winner atomic write (version +
   * executable-state guard); outstanding recovery challenges are then expired
   * and every applicable Session and Refresh Token Family is revoked so fresh
   * ordinary authentication is required. Recovery completion never establishes
   * an ordinary authenticated session and never grants Module 02 access.
   */
  public async executeRecovery(command: ExecuteRecoveryCommand): Promise<RecoveryExecutionResult> {
    const request = await this.recoveryRequests.findById(command.recoveryRequestId);
    const now = this.clock.now();
    // Unknown and invalid locators are answered uniformly so recovery state is
    // never enumerable through this endpoint.
    if (request === null) throw new RecoveryError('RECOVERY_STATE_CONFLICT');
    const properties = request.properties;
    if (properties.aggregateVersion.value !== command.expectedRecoveryVersion) {
      throw new RecoveryError('RECOVERY_STATE_CONFLICT');
    }
    if (properties.expiresAt <= now) throw new RecoveryError('RECOVERY_STATE_CONFLICT');
    // The recovery session is bound to exactly one permitted operation; the
    // client can never widen or reselect it (spec Section 23 Recovery Session).
    if (command.permittedOperation !== properties.permittedOperation.value) {
      throw new RecoveryError('RECOVERY_STATE_CONFLICT');
    }
    // The client can never select a weaker policy row (spec Part 5.5).
    if (command.recoveryPolicyVersion !== this.options.recoveryPolicyVersion) {
      throw new RecoveryError('RECOVERY_STATE_CONFLICT');
    }
    // Only APPROVED (dual control) or EVIDENCE_VERIFIED-without-required-
    // approval may execute; premature, pending, terminal and already-executed
    // states all fail closed.
    if (
      properties.recoveryState !== 'APPROVED' &&
      properties.recoveryState !== 'EVIDENCE_VERIFIED'
    ) {
      throw new RecoveryError('RECOVERY_STATE_CONFLICT');
    }

    // Defense-in-depth: the identity bound to the request must still be an
    // eligible, VERIFIED, non-deleted identity (mirrors M01-REC-002/004/005).
    const snapshot = await this.identityRepository.findAuthenticationById(properties.identityId);
    if (
      snapshot?.identity.properties.identityState !== 'ACTIVE' ||
      snapshot.identity.properties.verificationState !== 'VERIFIED'
    ) {
      throw new RecoveryError('RECOVERY_STATE_CONFLICT');
    }

    // When the request reached EVIDENCE_VERIFIED without passing through
    // APPROVAL_PENDING, the deterministic policy row must in fact require no
    // human approval; otherwise the required approvals are incomplete and the
    // canonical machine forbids execution (spec Section 23).
    if (properties.recoveryState === 'EVIDENCE_VERIFIED') {
      const classification = effectiveClassification(snapshot.classificationAssignments);
      if (approvalRequirement(classification)) {
        throw new RecoveryError('RECOVERY_APPROVAL_REQUIRED');
      }
    }

    // Mandatory completion effects (spec Recovery-Triggered Invalidation),
    // committed BEFORE the request is reported COMPLETED: revoke applicable
    // trusted devices and invalidate unused recovery codes/sets in one
    // version-guarded identity write. A stale identity write rolls back with
    // RECOVERY_STATE_CONFLICT and nothing is reported as completed.
    const updatedIdentity = new Identity({
      ...snapshot.identity.properties,
      aggregateVersion: new AggregateVersion(
        snapshot.identity.properties.aggregateVersion.value + 1,
      ),
      updatedAt: now,
    });
    const revokedDevices = (snapshot.trustedDevices ?? []).map((device) => {
      const state = device.properties.deviceState;
      if (state !== 'TRUSTED' && state !== 'PENDING') return device;
      return new TrustedDevice({
        ...device.properties,
        deviceState: 'REVOKED',
        revokedAt: now,
        revocationReason: 'RECOVERY_EXECUTION',
        updatedAt: now,
      });
    });
    const codeSets = await this.identityRepository.findRecoveryCodeSets(properties.identityId);
    // No successor set is issued here (recovery-code regeneration is a
    // separate M01-MFA-005 operation), so the active set is INVALIDATED rather
    // than SUPERSEDED; every unused code is invalidated in the same write.
    const invalidatedSets =
      codeSets?.recoveryCodeSets.map((set) =>
        set.properties.setState === 'ACTIVE'
          ? new RecoveryCodeSet({
              ...set.properties,
              setState: 'INVALIDATED',
              invalidatedAt: now,
              invalidationReason: 'RECOVERY_EXECUTION',
            })
          : set,
      ) ?? [];
    const invalidatedCodes =
      codeSets?.recoveryCodes.map((code) =>
        code.properties.codeState === 'ACTIVE'
          ? new RecoveryCodeRecord({
              ...code.properties,
              codeState: 'INVALIDATED',
              invalidatedAt: now,
            })
          : code,
      ) ?? [];
    // M01-MFA-004 completion effect: when the recovery is bound to
    // MFA_FACTOR_REPLACEMENT, the enrolled factor is removed and the enrollment
    // is marked REPLACEMENT_REQUIRED so fresh MFA setup is mandatory (spec
    // policy row: require fresh authentication and MFA setup). A pending first
    // enrollment cannot coexist with a completed replacement and is superseded
    // as DISABLED, mirroring M01-MFA-001. No factor secret is read or exposed.
    const replacingMfaFactor = properties.permittedOperation.value === 'MFA_FACTOR_REPLACEMENT';
    const updatedEnrollments = replacingMfaFactor
      ? snapshot.mfaEnrollments.map((enrollment) => {
          if (enrollment.properties.enrollmentState === 'ACTIVE') {
            return new MfaEnrollment({
              ...enrollment.properties,
              enrollmentState: 'REPLACEMENT_REQUIRED',
              replacementRequiredAt: now,
              updatedAt: now,
            });
          }
          if (enrollment.properties.enrollmentState === 'PENDING_VERIFICATION') {
            return new MfaEnrollment({
              ...enrollment.properties,
              enrollmentState: 'DISABLED',
              disabledAt: now,
              updatedAt: now,
            });
          }
          return enrollment;
        })
      : snapshot.mfaEnrollments;
    const updatedFactors = replacingMfaFactor
      ? snapshot.mfaFactors.map((factor) => {
          if (
            factor.properties.factorState === 'ACTIVE' ||
            factor.properties.factorState === 'PENDING_VERIFICATION' ||
            factor.properties.factorState === 'REPLACEMENT_REQUIRED'
          ) {
            return new MfaFactor({
              ...factor.properties,
              factorState: 'REVOKED',
              revokedAt: now,
              updatedAt: now,
            });
          }
          return factor;
        })
      : snapshot.mfaFactors;
    try {
      await this.identityRepository.save(
        {
          identity: updatedIdentity,
          identifiers: snapshot.identifiers,
          credentials: snapshot.credentials,
          classificationAssignments: snapshot.classificationAssignments,
          mfaEnrollments: updatedEnrollments,
          mfaFactors: updatedFactors,
          recoveryCodeSets: invalidatedSets,
          recoveryCodes: invalidatedCodes,
          trustedDevices: revokedDevices,
          credentialHistoryToAppend: [],
          passwordHistoryToAppend: [],
          stateTransitionsToAppend: [],
        },
        snapshot.identity.properties.aggregateVersion,
      );
    } catch (error) {
      if (error instanceof OptimisticConcurrencyError) {
        throw new RecoveryError('RECOVERY_STATE_CONFLICT');
      }
      throw error;
    }

    // Canonical machine (spec Section 23): APPROVED (or EVIDENCE_VERIFIED when
    // approval is not required) → EXECUTING → COMPLETED. Both transitions are
    // recorded so the immutable audit trail is complete, and the request is
    // reported COMPLETED with executionStartedAt/completedAt.
    const stateVersion = properties.stateVersion + 2;
    const transitions: RecoveryStateTransition[] = [
      transition(
        properties,
        this.identifiers.next(),
        properties.recoveryState,
        'EXECUTING',
        properties.stateVersion + 1,
        now,
      ),
      transition(properties, this.identifiers.next(), 'EXECUTING', 'COMPLETED', stateVersion, now),
    ];
    // The completion notification targets the identity's verified recovery
    // channel (server-stored destination, never client-supplied), mirroring
    // the password-reset flow; the reference is a protected value.
    const verifiedDestination = snapshot.identifiers.find(
      (identifier) => identifier.properties.verificationState === 'VERIFIED',
    );
    const notification = new RecoveryNotificationRecord({
      recoveryNotificationId: this.identifiers.next(),
      recoveryRequestId: command.recoveryRequestId,
      notificationType: 'RECOVERY_COMPLETED',
      deliveryState: 'PENDING',
      protectedDestinationReference:
        verifiedDestination?.properties.protectedNormalizedValue ??
        new ProtectedValue(`recovery:${properties.identityId.value}`),
      createdAt: now,
    });
    const updated = new RecoveryRequest({
      ...properties,
      recoveryState: 'COMPLETED',
      stateVersion,
      aggregateVersion: new AggregateVersion(properties.aggregateVersion.value + 1),
      executionStartedAt: now,
      completedAt: now,
      updatedAt: now,
    });
    try {
      await this.recoveryRequests.executeRecovery({
        recoveryRequestId: command.recoveryRequestId,
        expectedRecoveryVersion: properties.aggregateVersion,
        updatedRecoveryRequest: updated,
        transitionsToAppend: transitions,
        notification,
      });
    } catch (error) {
      // The single-winner guard throws on a stale version or an already
      // completed request and rolls the change set back, so concurrent
      // executions can never apply completion twice.
      if (error instanceof OptimisticConcurrencyError) {
        throw new RecoveryError('RECOVERY_STATE_CONFLICT');
      }
      throw error;
    }

    // Remaining cross-boundary completion effects (idempotent): expire any
    // outstanding account-recovery challenges, then revoke every applicable
    // Session and Refresh Token Family so fresh ordinary authentication is
    // required (spec Recovery-Triggered Invalidation). These effects share no
    // consistency boundary with the recovery aggregate, so they commit after
    // the request is durably COMPLETED; a delivery failure surfaces as an HTTP
    // error (completion is never reported as success) and the idempotent
    // effects are re-applied on retry, mirroring the approved password-reset
    // completion pattern.
    await this.verificationChallenges.expireActiveChallengesForIdentity(
      properties.identityId,
      'ACCOUNT_RECOVERY',
    );
    await this.sessionRepository.revokeAllSessionsForRecovery({
      identityId: properties.identityId,
      revokedAt: now,
      revocationReason: 'RECOVERY_EXECUTION',
    });

    return {
      recoveryRequestId: command.recoveryRequestId.value,
      safeState: 'COMPLETED',
      reauthenticationRequired: true,
      version: updated.properties.aggregateVersion.value,
    };
  }

  /**
   * M01-REC-007. Cancels an in-progress recovery request.
   *
   * The recovery-request locator in the path is the caller's Bound Recovery
   * Session credential; the version precondition (If-Match) guards the
   * aggregate write. Cancellation is only permitted from the approved
   * non-terminal states (REQUESTED, EVIDENCE_PENDING, EVIDENCE_VERIFIED,
   * APPROVAL_PENDING, APPROVED); a completed, rejected, expired,
   * already-cancelled, failed or executing request fails closed with
   * RECOVERY_STATE_CONFLICT and no state is mutated. The immutable
   * CANCELLED transition is recorded with the version guard in one atomic
   * write, so a stale or concurrent caller can never cancel twice or cancel a
   * request another caller has already completed.
   */
  public async cancelRecovery(command: CancelRecoveryCommand): Promise<RecoveryCancellationResult> {
    const request = await this.recoveryRequests.findById(command.recoveryRequestId);
    const now = this.clock.now();
    // Unknown and invalid locators are answered uniformly so recovery state is
    // never enumerable through this endpoint.
    if (request === null) throw new RecoveryError('RECOVERY_STATE_CONFLICT');
    const properties = request.properties;
    if (properties.aggregateVersion.value !== command.expectedRecoveryVersion) {
      throw new RecoveryError('RECOVERY_STATE_CONFLICT');
    }
    if (properties.expiresAt <= now) throw new RecoveryError('RECOVERY_STATE_CONFLICT');
    // Only the policy-approved in-progress states may be cancelled; every
    // terminal state and EXECUTING fail closed (spec Section 23).
    if (!CANCELLABLE_RECOVERY_STATES.includes(properties.recoveryState)) {
      throw new RecoveryError('RECOVERY_STATE_CONFLICT');
    }

    const stateVersion = properties.stateVersion + 1;
    const transitionRecord = transition(
      properties,
      this.identifiers.next(),
      properties.recoveryState,
      'CANCELLED',
      stateVersion,
      now,
    );
    const updated = new RecoveryRequest({
      ...properties,
      recoveryState: 'CANCELLED',
      stateVersion,
      aggregateVersion: new AggregateVersion(properties.aggregateVersion.value + 1),
      terminalReason: 'RECOVERY_CANCELLED',
      updatedAt: now,
    });
    try {
      await this.recoveryRequests.save(
        {
          recoveryRequest: updated,
          evidence: [],
          notifications: [],
          approvalsToAppend: [],
          attemptsToAppend: [],
          transitionsToAppend: [transitionRecord],
        },
        properties.aggregateVersion,
      );
    } catch (error) {
      // The version guard throws on a stale version and rolls the change set
      // back, so a concurrent execution or cancellation can never win twice.
      if (error instanceof OptimisticConcurrencyError) {
        throw new RecoveryError('RECOVERY_STATE_CONFLICT');
      }
      throw error;
    }
    return {
      recoveryRequestId: command.recoveryRequestId.value,
      safeState: 'CANCELLED',
      version: updated.properties.aggregateVersion.value,
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
