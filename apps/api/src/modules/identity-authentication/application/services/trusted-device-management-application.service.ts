import { OptimisticConcurrencyError } from '../../domain/shared/errors/optimistic-concurrency.error';
import { AggregateVersion } from '../../domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';
import { Identity } from '../../domain/identity/entities/identity';
import { TrustedDevice } from '../../domain/identity/entities/trusted-device';
import type { IdentityRepository } from '../../domain/identity/repositories/identity-repository';
import { TrustedDeviceError } from '../errors/trusted-device.error';
import type { ClockPort } from '../ports/application-runtime.port';

export interface ListTrustedDevicesCommand {
  readonly identityId: UuidV7;
}

export interface RevokeTrustedDeviceCommand {
  readonly identityId: UuidV7;
  readonly trustedDeviceId: UuidV7;
  /** The trusted-device version carried by the If-Match precondition. */
  readonly expectedDeviceVersion: number;
}

/**
 * M01-DEV-001 to M01-DEV-002. Trusted-device visibility and revocation for the
 * authenticated identity.
 *
 * Every command is bound to the authenticated identity id established by the
 * server-validated ordinary session (guard), never to a client-selected
 * subject, so an identity can see and manage only its own devices. Listing
 * returns only safe fields; the protected device fingerprint is never exposed.
 * Revocation is authoritative, terminal and idempotent — a REVOKED or BLOCKED
 * device is never altered and can never regain trust without an approved
 * re-verification workflow — the trusted-device version precondition guards
 * the write (RESOURCE_STATE_CONFLICT on a stale version) and the mutation is
 * committed through the version-guarded Identity aggregate write. Device trust
 * never replaces MFA: revoking a device only removes its trust.
 */
export class TrustedDeviceManagementApplicationService {
  public constructor(
    private readonly identities: IdentityRepository,
    private readonly clock: ClockPort,
  ) {}

  public async listDevices(command: ListTrustedDevicesCommand): Promise<readonly TrustedDevice[]> {
    const snapshot = await this.identities.findAuthenticationById(command.identityId);
    if (snapshot === null) return Object.freeze([]);
    return Object.freeze(
      [...(snapshot.trustedDevices ?? [])].sort(
        (left, right) => right.properties.createdAt.getTime() - left.properties.createdAt.getTime(),
      ),
    );
  }

  public async revokeDevice(command: RevokeTrustedDeviceCommand): Promise<void> {
    const snapshot = await this.identities.findAuthenticationById(command.identityId);
    if (snapshot === null) throw new TrustedDeviceError('RESOURCE_NOT_AVAILABLE');
    const devices = snapshot.trustedDevices ?? [];
    // Ownership is verified here in addition to the session-bound identityId
    // so a foreign device locator can never be revoked through this identity.
    const device = devices.find(
      (candidate) =>
        candidate.properties.trustedDeviceId.value === command.trustedDeviceId.value &&
        candidate.properties.identityId.value === command.identityId.value,
    );
    if (device === undefined) throw new TrustedDeviceError('RESOURCE_NOT_AVAILABLE');
    if (device.properties.aggregateVersion.value !== command.expectedDeviceVersion) {
      throw new TrustedDeviceError('RESOURCE_STATE_CONFLICT');
    }
    // Idempotent revocation: a revoked or blocked device is never altered and
    // can never regain trust without an approved re-verification workflow.
    if (
      device.properties.deviceState === 'REVOKED' ||
      device.properties.deviceState === 'BLOCKED'
    ) {
      return;
    }
    const now = this.clock.now();
    const revokedDevices = devices.map((candidate) =>
      candidate.properties.trustedDeviceId.value === command.trustedDeviceId.value
        ? new TrustedDevice({
            ...candidate.properties,
            deviceState: 'REVOKED',
            revokedAt: now,
            revocationReason: 'USER_REVOKED',
            updatedAt: now,
            aggregateVersion: new AggregateVersion(candidate.properties.aggregateVersion.value + 1),
          })
        : candidate,
    );
    const codeSets = await this.identities.findRecoveryCodeSets(command.identityId);
    const updatedIdentity = new Identity({
      ...snapshot.identity.properties,
      aggregateVersion: new AggregateVersion(
        snapshot.identity.properties.aggregateVersion.value + 1,
      ),
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
          recoveryCodeSets: codeSets?.recoveryCodeSets ?? [],
          recoveryCodes: codeSets?.recoveryCodes ?? [],
          trustedDevices: revokedDevices,
          credentialHistoryToAppend: [],
          passwordHistoryToAppend: [],
          stateTransitionsToAppend: [],
        },
        snapshot.identity.properties.aggregateVersion,
      );
    } catch (error) {
      if (error instanceof OptimisticConcurrencyError) {
        // The Identity aggregate was concurrently modified or the device
        // version precondition is stale: fail closed and force a re-read.
        throw new TrustedDeviceError('RESOURCE_STATE_CONFLICT');
      }
      throw error;
    }
  }
}
