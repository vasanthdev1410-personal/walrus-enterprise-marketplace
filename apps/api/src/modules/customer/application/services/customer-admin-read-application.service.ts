import type { NonProductionRateLimiterPort } from '../../../identity-authentication/application/ports/non-production-rate-limiter.port';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { CustomerAdminReadRepository } from '../../domain/ports/customer-admin-read.port';
import { CustomerApplicationError } from '../errors/customer-application.error';
import type { CustomerAdminAuthorizationPort } from '../ports/customer-admin-authorization.port';

/**
 * WEMP-M06-SPEC-001 §14 (M06-M5, decision D-07/D-10). Admin customer read
 * surface: non-enumerating customer list, customer detail with append-only
 * audit episodes, and the standalone audit trail. Every read requires the
 * exact approved Module 02 administrative grant (`customer.read` for the
 * list/detail, `customer.audit.view` for the audit trail) through the Module
 * 02 engine — no role-only bypass, no hidden SUPER_ADMIN override; the
 * controller's permission guard is re-checked here (defense in depth). Rate
 * limits follow the recorded D-10 admin class (50/hour). Unknown customer
 * references resolve to CUSTOMER_NOT_FOUND and are indistinguishable from
 * any other missing profile (anti-enumeration). No PII beyond logical
 * identity references and opaque audit facts is ever exposed (D-08).
 */
export class CustomerAdminReadApplicationService {
  public constructor(
    private readonly repository: CustomerAdminReadRepository,
    private readonly adminAuthorization: CustomerAdminAuthorizationPort,
    private readonly rateLimiter: NonProductionRateLimiterPort,
  ) {}

  /** WEMP-M06-SPEC-001 §14. Non-enumerating admin customer list. */
  public async listCustomers(adminIdentityId: UuidV7): Promise<readonly AdminCustomerListEntry[]> {
    await this.requireAdminRead(adminIdentityId, 'customer.read');
    const profiles = await this.repository.findAllProfiles();
    return profiles.map(toListEntry);
  }

  /** WEMP-M06-SPEC-001 §14. Customer detail + append-only audit episodes. */
  public async getCustomerDetail(
    adminIdentityId: UuidV7,
    customerProfileId: UuidV7,
  ): Promise<AdminCustomerDetailResult> {
    await this.requireAdminRead(adminIdentityId, 'customer.read');
    const profile = await this.repository.findProfile(customerProfileId);
    if (profile === null) {
      throw new CustomerApplicationError('CUSTOMER_NOT_FOUND');
    }
    const [audit, transitions] = await Promise.all([
      this.repository.findAuditRecords(profile.properties.customerProfileId),
      this.repository.findTransitions(profile.properties.customerProfileId),
    ]);
    const properties = profile.properties;
    return {
      customerProfileId: properties.customerProfileId.value,
      identityId: properties.identityId.value,
      state: properties.state,
      version: properties.aggregateVersion.value,
      createdAt: properties.createdAt.toISOString(),
      updatedAt: properties.updatedAt.toISOString(),
      ...(properties.suspendedAt === undefined
        ? {}
        : { suspendedAt: properties.suspendedAt.toISOString() }),
      ...(properties.closedAt === undefined ? {} : { closedAt: properties.closedAt.toISOString() }),
      audit: audit.map(toAuditEntry),
      transitions: transitions.map(toTransitionEntry),
    };
  }

  /** WEMP-M06-SPEC-001 §14. Standalone customer audit trail (D-08). */
  public async getAuditTrail(
    adminIdentityId: UuidV7,
    customerProfileId: UuidV7,
  ): Promise<readonly CustomerAuditEntry[]> {
    await this.requireAdminRead(adminIdentityId, 'customer.audit.view');
    const profile = await this.repository.findProfile(customerProfileId);
    if (profile === null) {
      throw new CustomerApplicationError('CUSTOMER_NOT_FOUND');
    }
    const audit = await this.repository.findAuditRecords(profile.properties.customerProfileId);
    return audit.map(toAuditEntry);
  }

  /**
   * D-10 (RECORDED 2026-08-18): admin reads/audit 50/hour, keyed per admin
   * identity. The Module 02 grant is re-checked after the rate limit so a
   * denied caller never consumes quota and a grant is never assumed from the
   * controller alone (fail closed on engine error).
   */
  private async requireAdminRead(
    adminIdentityId: UuidV7,
    action: 'customer.read' | 'customer.audit.view',
  ): Promise<void> {
    const rateLimit = await this.rateLimiter.consume({
      key: `customer-admin:${adminIdentityId.value}`,
      limit: 50,
      windowSeconds: 3600,
    });
    if (!rateLimit.allowed) {
      throw new CustomerApplicationError('CUSTOMER_RATE_LIMITED');
    }
    const granted = await this.adminAuthorization.isGranted(adminIdentityId, action);
    if (!granted) {
      throw new CustomerApplicationError('CUSTOMER_ADMIN_AUTHORIZATION_DENIED');
    }
  }
}

export interface AdminCustomerListEntry {
  readonly customerProfileId: string;
  readonly state: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AdminCustomerDetailResult extends AdminCustomerListEntry {
  readonly identityId: string;
  readonly suspendedAt?: string;
  readonly closedAt?: string;
  readonly audit: readonly CustomerAuditEntry[];
  readonly transitions: readonly CustomerTransitionEntry[];
}

export interface CustomerAuditEntry {
  readonly auditEventId: string;
  readonly eventType: string;
  readonly actorIdentityId: string;
  readonly occurredAt: string;
}

export interface CustomerTransitionEntry {
  readonly transitionId: string;
  readonly fromState: string;
  readonly toState: string;
  readonly stateVersion: number;
  readonly actorIdentityId: string;
  readonly actorKind: string;
  readonly reasonReference: string;
  readonly transitionedAt: string;
}

function toListEntry(profile: {
  properties: {
    customerProfileId: UuidV7;
    state: string;
    aggregateVersion: { value: number };
    createdAt: Date;
    updatedAt: Date;
  };
}): AdminCustomerListEntry {
  const properties = profile.properties;
  return {
    customerProfileId: properties.customerProfileId.value,
    state: properties.state,
    version: properties.aggregateVersion.value,
    createdAt: properties.createdAt.toISOString(),
    updatedAt: properties.updatedAt.toISOString(),
  };
}

function toAuditEntry(record: {
  properties: {
    auditEventId: UuidV7;
    eventType: string;
    actorIdentityId: UuidV7;
    occurredAt: Date;
  };
}): CustomerAuditEntry {
  return {
    auditEventId: record.properties.auditEventId.value,
    eventType: record.properties.eventType,
    actorIdentityId: record.properties.actorIdentityId.value,
    occurredAt: record.properties.occurredAt.toISOString(),
  };
}

function toTransitionEntry(transition: {
  properties: {
    transitionId: UuidV7;
    fromState: string;
    toState: string;
    stateVersion: number;
    actorIdentityId: UuidV7;
    actorKind: string;
    reasonReference: string;
    transitionedAt: Date;
  };
}): CustomerTransitionEntry {
  return {
    transitionId: transition.properties.transitionId.value,
    fromState: transition.properties.fromState,
    toState: transition.properties.toState,
    stateVersion: transition.properties.stateVersion,
    actorIdentityId: transition.properties.actorIdentityId.value,
    actorKind: transition.properties.actorKind,
    reasonReference: transition.properties.reasonReference,
    transitionedAt: transition.properties.transitionedAt.toISOString(),
  };
}
