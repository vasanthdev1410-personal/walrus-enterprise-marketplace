import type {
  ClockPort,
  UuidV7GenerationPort,
} from '../../../identity-authentication/application/ports/application-runtime.port';
import type { NonProductionRateLimiterPort } from '../../../identity-authentication/application/ports/non-production-rate-limiter.port';
import type { ApiIdempotencyService } from '../../../identity-authentication/application/services/api-idempotency.service';
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { CustomerAuditRecord } from '../../domain/entities/customer-audit-record';
import { CustomerProfile } from '../../domain/entities/customer-profile';
import type { CustomerLifecycle } from '../../domain/lifecycle/customer-lifecycle';
import type { CustomerProfileRepository } from '../../domain/ports/customer-repository.port';
import type { CustomerState } from '../../domain/value-objects/customer-state';
import { CustomerApplicationError } from '../errors/customer-application.error';

/**
 * WEMP-M06-PLAN-001 M06-M3 (WEMP-M06-SPEC-001 §4/§6, decisions D-01, D-03,
 * D-11, D-15). Customer profile application service.
 *
 * - `createCustomerProfile`: creates the ACTIVE customer profile for a
 *   Module 01 identity (one profile per identity — D-01). No role
 *   assignment happens here (D-03: role assignment only through the Module
 *   02 contract at M06-M4); no identity/authentication data is duplicated
 *   (A-04). Duplicate creation for an already-profiled identity fails
 *   closed (non-enumerating CUSTOMER_DUPLICATE_DETECTED).
 * - `getOwnProfile`: self-service read resolved from the authenticated
 *   identity (never from a client-supplied customerProfileId claim);
 *   suspended profiles remain self-readable per the explicit grant model,
 *   closed profiles deny (D-02).
 * - `getOwnProfileByReference`: resolves the caller's own profile through
 *   an internal customerProfileId after verifying the identity ownership
 *   (identityId match — fail closed on mismatch).
 * - `updateProfile`: allow-listed self-service field update, version-
 *   guarded (D-11), idempotent, rate-limited (D-10: self mutations
 *   30/hour) and audited. ACTIVE-only mutation (D-02).
 *
 * Every mutation appends a mandatory CustomerAuditRecord atomically
 * through the repository save; a stale version raises
 * CustomerApplicationError and rolls back without partial mutation or
 * orphan audit records.
 */
export class CustomerProfileApplicationService {
  public constructor(
    private readonly repository: CustomerProfileRepository,
    private readonly lifecycle: CustomerLifecycle,
    private readonly clock: ClockPort,
    private readonly identifiers: UuidV7GenerationPort,
    private readonly idempotency: ApiIdempotencyService,
    private readonly rateLimiter: NonProductionRateLimiterPort,
  ) {}

  /** WEMP-M06-SPEC-001 §6 (D-03). Creates the ACTIVE profile for an identity. */
  public async createCustomerProfile(
    command: CreateCustomerProfileCommand,
  ): Promise<CustomerProfileResult> {
    const rateLimit = await this.rateLimiter.consume({
      key: `customer-create:${command.identityId.value}`,
      limit: 30,
      windowSeconds: 3600,
    });
    if (!rateLimit.allowed) {
      throw new CustomerApplicationError('CUSTOMER_RATE_LIMITED');
    }
    const existing = await this.repository.findByIdentityId(command.identityId);
    if (existing !== null) {
      // One profile per identity (D-01); non-enumerating.
      throw new CustomerApplicationError('CUSTOMER_DUPLICATE_DETECTED');
    }

    return this.idempotency.execute<CustomerProfileResult>({
      scope: `customer:${command.identityId.value}`,
      operationType: 'customer.profile.create',
      idempotencyKey: command.idempotencyKey,
      request: command,
      execute: async () => {
        const now = this.clock.now();
        const profile = new CustomerProfile({
          customerProfileId: this.identifiers.next(),
          identityId: command.identityId,
          state: 'ACTIVE',
          aggregateVersion: new AggregateVersion(1),
          createdAt: now,
          updatedAt: now,
          ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
        });
        await this.repository.insert({
          customerProfile: profile,
          addressesToAppend: [],
          addressesToUpdate: [],
          preferencesToAppend: [],
          preferencesToUpdate: [],
          transitionsToAppend: [],
          auditRecordsToAppend: [
            new CustomerAuditRecord({
              auditEventId: this.identifiers.next(),
              customerProfileId: profile.properties.customerProfileId,
              eventType: 'CUSTOMER_CREATED',
              actorIdentityId: command.identityId,
              occurredAt: now,
              createdAt: now,
              ...(command.correlationId !== undefined
                ? { correlationId: command.correlationId }
                : {}),
            }),
          ],
        });
        return toProfileResult(profile);
      },
    });
  }

  /** WEMP-M06-SPEC-001 §5. Self-service profile read by authenticated identity. */
  public async getOwnProfile(identityId: UuidV7): Promise<CustomerProfileResult> {
    const rateLimit = await this.rateLimiter.consume({
      key: `customer-read:${identityId.value}`,
      limit: 60,
      windowSeconds: 3600,
    });
    if (!rateLimit.allowed) {
      throw new CustomerApplicationError('CUSTOMER_RATE_LIMITED');
    }
    const profile = await this.repository.findByIdentityId(identityId);
    if (profile === null) {
      // Non-enumerating: an identity without a profile sees the same error
      // as an unknown profile.
      throw new CustomerApplicationError('CUSTOMER_NOT_FOUND');
    }
    // D-02: CLOSED denies self-service reads.
    this.lifecycle.assertCanSelfRead(profile.properties.state);
    return toProfileResult(profile);
  }

  /**
   * WEMP-M06-SPEC-001 §5. Resolves the caller's own profile through an
   * internal reference; ownership is verified against the authenticated
   * identity (identityId match) — fail closed on mismatch (no cross-customer
   * access; A-02).
   */
  public async getOwnProfileByReference(
    customerProfileId: UuidV7,
    callerIdentityId: UuidV7,
  ): Promise<CustomerProfileResult> {
    const rateLimit = await this.rateLimiter.consume({
      key: `customer-read:${callerIdentityId.value}`,
      limit: 60,
      windowSeconds: 3600,
    });
    if (!rateLimit.allowed) {
      throw new CustomerApplicationError('CUSTOMER_RATE_LIMITED');
    }
    const profile = await this.repository.findById(customerProfileId);
    if (profile === null) {
      throw new CustomerApplicationError('CUSTOMER_NOT_FOUND');
    }
    if (profile.properties.identityId.value !== callerIdentityId.value) {
      // Non-enumerating cross-customer denial: same error as unknown.
      throw new CustomerApplicationError('CUSTOMER_NOT_FOUND');
    }
    this.lifecycle.assertCanSelfRead(profile.properties.state);
    return toProfileResult(profile);
  }

  /**
   * WEMP-M06-SPEC-001 §4/§5. Allow-listed self-service profile update
   * (D-01/D-11). The profile is resolved through the authenticated
   * identity's ownership; mass assignment is impossible because only the
   * explicit allowed fields are read from the command. Version-guarded,
   * idempotent, rate-limited (D-10: self mutations 30/hour), audited.
   */
  public async updateProfile(
    command: UpdateCustomerProfileCommand,
  ): Promise<CustomerProfileResult> {
    const rateLimit = await this.rateLimiter.consume({
      key: `customer-mutate:${command.actorIdentityId.value}`,
      limit: 30,
      windowSeconds: 3600,
    });
    if (!rateLimit.allowed) {
      throw new CustomerApplicationError('CUSTOMER_RATE_LIMITED');
    }
    const profile = await this.requireOwnProfile(
      command.customerProfileId,
      command.actorIdentityId,
    );
    if (profile.properties.aggregateVersion.value !== command.expectedVersion) {
      throw new CustomerApplicationError('CUSTOMER_STATE_CONFLICT');
    }
    // D-02: self-service mutations are ACTIVE-only.
    this.lifecycle.assertCanMutate(profile.properties.state);

    return this.idempotency.execute<CustomerProfileResult>({
      scope: `customer:${command.customerProfileId.value}`,
      operationType: 'customer.profile.update',
      idempotencyKey: command.idempotencyKey,
      request: command,
      execute: async () => {
        const now = this.clock.now();
        const updated = new CustomerProfile({
          ...profile.properties,
          // Allow-listed update fields only — nothing else is ever read
          // from the command (mass assignment impossible).
          ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
          updatedAt: now,
          aggregateVersion: new AggregateVersion(profile.properties.aggregateVersion.value + 1),
        });
        await this.repository.save(
          {
            customerProfile: updated,
            addressesToAppend: [],
            addressesToUpdate: [],
            preferencesToAppend: [],
            preferencesToUpdate: [],
            transitionsToAppend: [],
            auditRecordsToAppend: [
              new CustomerAuditRecord({
                auditEventId: this.identifiers.next(),
                customerProfileId: updated.properties.customerProfileId,
                eventType: 'CUSTOMER_PROFILE_UPDATED',
                actorIdentityId: command.actorIdentityId,
                occurredAt: now,
                createdAt: now,
                ...(command.correlationId !== undefined
                  ? { correlationId: command.correlationId }
                  : {}),
              }),
            ],
          },
          profile.properties.aggregateVersion,
        );
        return toProfileResult(updated);
      },
    });
  }

  /**
   * Resolves the customer profile of the authenticated identity, failing
   * closed (CUSTOMER_NOT_FOUND — non-enumerating) when the identity does not
   * own the referenced profile.
   */
  private async requireOwnProfile(
    customerProfileId: UuidV7,
    callerIdentityId: UuidV7,
  ): Promise<CustomerProfile> {
    const profile = await this.repository.findById(customerProfileId);
    if (profile === null) {
      throw new CustomerApplicationError('CUSTOMER_NOT_FOUND');
    }
    if (profile.properties.identityId.value !== callerIdentityId.value) {
      throw new CustomerApplicationError('CUSTOMER_NOT_FOUND');
    }
    return profile;
  }
}

export interface CreateCustomerProfileCommand {
  /** The Module 01 identity this profile is associated with (logical ref). */
  readonly identityId: UuidV7;
  /** Caller-supplied idempotency key — mandatory (A-09). */
  readonly idempotencyKey: string;
  readonly correlationId?: CorrelationIdentifier;
}

export interface UpdateCustomerProfileCommand {
  readonly customerProfileId: UuidV7;
  readonly actorIdentityId: UuidV7;
  /** Optimistic concurrency guard (D-11). */
  readonly expectedVersion: number;
  /** Caller-supplied idempotency key — mandatory (A-09). */
  readonly idempotencyKey: string;
  readonly correlationId?: CorrelationIdentifier;
}

export interface CustomerProfileResult {
  readonly customerProfileId: string;
  readonly state: CustomerState;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly suspendedAt?: string;
  readonly closedAt?: string;
}

function toProfileResult(profile: CustomerProfile): CustomerProfileResult {
  const properties = profile.properties;
  return {
    customerProfileId: properties.customerProfileId.value,
    state: properties.state,
    version: properties.aggregateVersion.value,
    createdAt: properties.createdAt.toISOString(),
    updatedAt: properties.updatedAt.toISOString(),
    ...(properties.suspendedAt === undefined
      ? {}
      : { suspendedAt: properties.suspendedAt.toISOString() }),
    ...(properties.closedAt === undefined ? {} : { closedAt: properties.closedAt.toISOString() }),
  };
}
