import { Identity } from '../../domain/identity/entities/identity';
import { RecoveryCodeRecord } from '../../domain/identity/entities/recovery-code-record';
import { RecoveryCodeSet } from '../../domain/identity/entities/recovery-code-set';
import type { IdentityRepository } from '../../domain/identity/repositories/identity-repository';
import { OptimisticConcurrencyError } from '../../domain/shared/errors/optimistic-concurrency.error';
import { AggregateVersion } from '../../domain/shared/value-objects/aggregate-version';
import { ProtectedValue } from '../../domain/shared/value-objects/protected-value';
import type { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';
import { MfaError } from '../errors/mfa.error';
import type { ClockPort, UuidV7GenerationPort } from '../ports/application-runtime.port';
import type { OtpRecoveryCodeCryptographicPort } from '../ports/otp-recovery-code-cryptographic.port';

export interface RecoveryCodeSetPolicy {
  readonly environment: string;
}

/**
 * M01-MFA-005. Regenerates the caller's recovery-code set at the approved
 * one-time issuance point.
 *
 * The new set is issued with a fresh setVersion, every prior ACTIVE set is
 * superseded and every prior unused code is invalidated atomically with the
 * identity write (spec constraint: at most one active set per Identity; new
 * set activation invalidates every prior unused code). Only code digests are
 * persisted — raw codes exist solely in the issued values returned by this
 * operation and are never stored, logged or embedded in idempotency records.
 */
export interface RegenerateRecoveryCodeSetCommand {
  readonly identityId: UuidV7;
  readonly expectedIdentityVersion: number;
}

export interface RecoveryCodeSetRegeneratedResult {
  readonly recoveryCodeSetId: string;
  readonly setVersion: number;
  /** Raw codes returned exactly once at this issuance point. */
  readonly recoveryCodes: readonly string[];
}

export class RecoveryCodeSetApplicationService {
  public constructor(
    private readonly identities: IdentityRepository,
    private readonly otpCrypto: OtpRecoveryCodeCryptographicPort,
    private readonly clock: ClockPort,
    private readonly identifiers: UuidV7GenerationPort,
    private readonly policy: RecoveryCodeSetPolicy,
  ) {}

  /**
   * M01-MFA-005. The caller must already hold an ordinary AAL2 session (the
   * Aal2SessionGuard); this service re-verifies the identity is ACTIVE and
   * VERIFIED as defense-in-depth. Regeneration supersedes any current ACTIVE
   * set and invalidates every prior unused code, then persists the new set and
   * its digest-only codes in one version-guarded aggregate write. A stale
   * If-Match yields RESOURCE_STATE_CONFLICT with no partial state.
   */
  public async regenerate(
    command: RegenerateRecoveryCodeSetCommand,
  ): Promise<RecoveryCodeSetRegeneratedResult> {
    const snapshot = await this.identities.findAuthenticationById(command.identityId);
    if (
      snapshot?.identity.properties.identityState !== 'ACTIVE' ||
      snapshot.identity.properties.verificationState !== 'VERIFIED'
    ) {
      // Fail-closed defense-in-depth: the Aal2SessionGuard already requires an
      // authenticatable identity, so this branch is unreachable through the
      // approved path. RESOURCE_STATE_CONFLICT is the only stable error in the
      // M01-MFA-005 contract applicable at the service layer; using any other
      // code would invent an error outside the approved set.
      throw new MfaError('RESOURCE_STATE_CONFLICT');
    }
    const existing = await this.identities.findRecoveryCodeSets(command.identityId);
    const now = this.clock.now();
    const recoveryCodeSetId = this.identifiers.next();
    const setVersion =
      existing === null
        ? 1
        : existing.recoveryCodeSets.reduce(
            (highest, set) => Math.max(highest, set.properties.setVersion),
            0,
          ) + 1;

    const issued = this.otpCrypto.issueRecoveryCodeSet({
      environment: this.policy.environment,
      identityId: command.identityId.value,
      recoveryCodeSetId: recoveryCodeSetId.value,
    });

    const newSet = new RecoveryCodeSet({
      recoveryCodeSetId,
      identityId: command.identityId,
      setVersion,
      setState: 'ACTIVE',
      createdAt: now,
    });
    const newCodes = issued.map(
      (value) =>
        new RecoveryCodeRecord({
          recoveryCodeId: this.identifiers.next(),
          recoveryCodeSetId,
          codeDigest: new ProtectedValue(value.digest),
          codeState: 'ACTIVE',
          createdAt: now,
        }),
    );

    const supersededSets =
      existing?.recoveryCodeSets.map((set) =>
        set.properties.setState === 'ACTIVE'
          ? new RecoveryCodeSet({
              ...set.properties,
              setState: 'SUPERSEDED',
              invalidatedAt: now,
              invalidationReason: 'REGENERATED',
            })
          : set,
      ) ?? [];
    const invalidatedCodes =
      existing?.recoveryCodes.map((code) =>
        code.properties.codeState === 'ACTIVE'
          ? new RecoveryCodeRecord({
              ...code.properties,
              codeState: 'INVALIDATED',
              invalidatedAt: now,
            })
          : code,
      ) ?? [];

    const updatedIdentity = new Identity({
      ...snapshot.identity.properties,
      aggregateVersion: new AggregateVersion(snapshot.identity.properties.aggregateVersion.value + 1),
      updatedAt: now,
    });
    try {
      await this.identities.save(
        {
          identity: updatedIdentity,
          identifiers: snapshot.identifiers,
          credentials: snapshot.credentials,
          classificationAssignments: snapshot.classificationAssignments,
          mfaEnrollments: snapshot.mfaEnrollments,
          mfaFactors: snapshot.mfaFactors,
          recoveryCodeSets: [...supersededSets, newSet],
          recoveryCodes: [...invalidatedCodes, ...newCodes],
          trustedDevices: [],
          credentialHistoryToAppend: [],
          passwordHistoryToAppend: [],
          stateTransitionsToAppend: [],
        },
        new AggregateVersion(command.expectedIdentityVersion),
      );
    } catch (error) {
      if (error instanceof OptimisticConcurrencyError) {
        throw new MfaError('RESOURCE_STATE_CONFLICT');
      }
      throw error;
    }

    return {
      recoveryCodeSetId: recoveryCodeSetId.value,
      setVersion,
      recoveryCodes: issued.map((value) => value.rawValue),
    };
  }
}
