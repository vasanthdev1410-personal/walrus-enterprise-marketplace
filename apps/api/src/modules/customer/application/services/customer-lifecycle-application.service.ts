import type {
  ClockPort,
  UuidV7GenerationPort,
} from '../../../identity-authentication/application/ports/application-runtime.port';
import type { NonProductionRateLimiterPort } from '../../../identity-authentication/application/ports/non-production-rate-limiter.port';
import type { ApiIdempotencyService } from '../../../identity-authentication/application/services/api-idempotency.service';
import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { CustomerAuditRecord } from '../../domain/entities/customer-audit-record';
import type { CustomerProfile } from '../../domain/entities/customer-profile';
import type { CustomerStateTransition } from '../../domain/entities/customer-state-transition';
import type { CustomerLifecycle } from '../../domain/lifecycle/customer-lifecycle';
import type { CustomerProfileRepository } from '../../domain/ports/customer-repository.port';
import type { CustomerState } from '../../domain/value-objects/customer-state';
import { CustomerApplicationError } from '../errors/customer-application.error';
import type { CustomerAdminAuthorizationPort } from '../ports/customer-admin-authorization.port';

/**
 * WEMP-M06-PLAN-001 M06-M3 (WEMP-M06-SPEC-001 §5, decision D-02).
 * Administrative customer lifecycle application service. All four approved
 * transitions (ACTIVE ↔ SUSPENDED, ACTIVE/SUSPENDED → CLOSED) run through
 * the M06-M1 CustomerLifecycle state machine — no transition logic is
 * duplicated here. Every transition requires an explicitly granted admin
 * (`customer.lifecycle.manage`, fail closed through the authorization port),
 * a mandatory non-disclosing reason reference, version-guarded persistence
 * (D-11) and an append-only transition + audit record (D-02/D-08).
 *
 * CLOSED is terminal: no transition out is ever accepted. A stale version
 * raises CUSTOMER_STATE_CONFLICT and the whole change set rolls back with
 * no partial mutation and no orphan audit record. Rate-limited per D-10
 * (admin class 50/hour — values pending Security/Platform confirmation,
 * fail-closed default A-11).
 */
export class CustomerLifecycleApplicationService {
  public constructor(
    private readonly repository: CustomerProfileRepository,
    private readonly lifecycle: CustomerLifecycle,
    private readonly adminAuthorization: CustomerAdminAuthorizationPort,
    private readonly clock: ClockPort,
    private readonly identifiers: UuidV7GenerationPort,
    private readonly idempotency: ApiIdempotencyService,
    private readonly rateLimiter: NonProductionRateLimiterPort,
  ) {}

  /** WEMP-M06-SPEC-001 §5. ACTIVE → SUSPENDED (admin, mandatory reason). */
  public async suspendCustomer(
    command: CustomerLifecycleCommand,
  ): Promise<CustomerLifecycleResult> {
    return this.transition(command, 'SUSPENDED', 'CUSTOMER_SUSPENDED');
  }

  /** WEMP-M06-SPEC-001 §5. SUSPENDED → ACTIVE (admin, mandatory reason). */
  public async reactivateCustomer(
    command: CustomerLifecycleCommand,
  ): Promise<CustomerLifecycleResult> {
    return this.transition(command, 'ACTIVE', 'CUSTOMER_REACTIVATED');
  }

  /** WEMP-M06-SPEC-001 §5. ACTIVE/SUSPENDED → CLOSED (admin, mandatory reason). */
  public async closeCustomer(command: CustomerLifecycleCommand): Promise<CustomerLifecycleResult> {
    return this.transition(command, 'CLOSED', 'CUSTOMER_CLOSED');
  }

  private async transition(
    command: CustomerLifecycleCommand,
    toState: Extract<CustomerState, 'SUSPENDED' | 'ACTIVE' | 'CLOSED'>,
    eventType: string,
  ): Promise<CustomerLifecycleResult> {
    const rateLimit = await this.rateLimiter.consume({
      key: `customer-admin:${command.actorIdentityId.value}`,
      limit: 50,
      windowSeconds: 3600,
    });
    if (!rateLimit.allowed) {
      throw new CustomerApplicationError('CUSTOMER_RATE_LIMITED');
    }
    // D-02: admin-only lifecycle transitions, explicit grant, fail closed.
    const granted = await this.adminAuthorization.isGranted(
      command.actorIdentityId,
      'customer.lifecycle.manage',
    );
    if (!granted) {
      throw new CustomerApplicationError('CUSTOMER_ADMIN_AUTHORIZATION_DENIED');
    }
    if (command.reasonReference.trim().length === 0) {
      throw new CustomerApplicationError('CUSTOMER_REASON_REQUIRED');
    }
    const profile = await this.repository.findById(command.customerProfileId);
    if (profile === null) {
      throw new CustomerApplicationError('CUSTOMER_NOT_FOUND');
    }
    if (profile.properties.aggregateVersion.value !== command.expectedVersion) {
      throw new CustomerApplicationError('CUSTOMER_STATE_CONFLICT');
    }

    return this.idempotency.execute<CustomerLifecycleResult>({
      scope: `customer:${command.customerProfileId.value}`,
      operationType: `customer.lifecycle.${toState.toLowerCase()}`,
      idempotencyKey: command.idempotencyKey,
      request: command,
      execute: async () => {
        const now = this.clock.now();
        // The M06-M1 state machine validates the transition (fail closed on
        // any invalid/terminal/same-state transition) and yields the
        // append-only episode; no transition logic is duplicated here.
        const transition = this.lifecycle.transition({
          customerProfile: profile,
          toState,
          actor: { identityId: command.actorIdentityId, kind: 'ADMIN' },
          now,
          transitionId: this.identifiers.next(),
          reasonReference: command.reasonReference,
          ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
        });
        const updated = this.lifecycle.updatedProfile(profile, toState, now);
        await this.repository.save(
          this.changeSet(updated, transition, command, now, eventType),
          profile.properties.aggregateVersion,
        );
        return {
          customerProfileId: updated.properties.customerProfileId.value,
          state: updated.properties.state,
          version: updated.properties.aggregateVersion.value,
        };
      },
    });
  }

  private changeSet(
    updated: CustomerProfile,
    transition: CustomerStateTransition,
    command: CustomerLifecycleCommand,
    now: Date,
    eventType: string,
  ): {
    customerProfile: CustomerProfile;
    addressesToAppend: readonly never[];
    addressesToUpdate: readonly never[];
    preferencesToAppend: readonly never[];
    preferencesToUpdate: readonly never[];
    transitionsToAppend: readonly CustomerStateTransition[];
    auditRecordsToAppend: readonly CustomerAuditRecord[];
  } {
    return {
      customerProfile: updated,
      addressesToAppend: [],
      addressesToUpdate: [],
      preferencesToAppend: [],
      preferencesToUpdate: [],
      transitionsToAppend: [transition],
      auditRecordsToAppend: [
        new CustomerAuditRecord({
          auditEventId: this.identifiers.next(),
          customerProfileId: updated.properties.customerProfileId,
          eventType,
          actorIdentityId: command.actorIdentityId,
          occurredAt: now,
          createdAt: now,
          ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
        }),
      ],
    };
  }
}

export interface CustomerLifecycleCommand {
  readonly customerProfileId: UuidV7;
  readonly actorIdentityId: UuidV7;
  /** Optimistic concurrency guard (D-11). */
  readonly expectedVersion: number;
  /** Mandatory non-disclosing reason reference (D-02). */
  readonly reasonReference: string;
  /** Caller-supplied idempotency key — mandatory (A-09). */
  readonly idempotencyKey: string;
  readonly correlationId?: CorrelationIdentifier;
}

export interface CustomerLifecycleResult {
  readonly customerProfileId: string;
  readonly state: CustomerState;
  readonly version: number;
}
