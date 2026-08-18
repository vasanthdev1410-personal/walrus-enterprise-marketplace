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
import { CustomerBusinessProfile } from '../../domain/entities/customer-business-profile';
import { CustomerProfile } from '../../domain/entities/customer-profile';
import type { CustomerLifecycle } from '../../domain/lifecycle/customer-lifecycle';
import type { CustomerBusinessProfilePolicy } from '../../domain/policy/customer-business.policy';
import type { CustomerProfileRepository } from '../../domain/ports/customer-repository.port';
import { CustomerApplicationError } from '../errors/customer-application.error';

/**
 * WEMP-M06-PLAN-001 M06-M3 (WEMP-M06-SPEC-001 §8, decision D-05).
 * Optional B2B/company information application service. A customer profile
 * has at most one CustomerBusinessProfile (0..1 — enforced by the M06-M1
 * CustomerBusinessProfilePolicy and the unique customerProfileId
 * constraint). The registration reference is stored only as a SHA-256
 * lookup digest — never the raw value (D-05, A-04).
 *
 * Every mutation is ACTIVE-only (D-02, self-service), version-guarded
 * (D-11), idempotent, rate-limited (D-10: self mutations 30/hour, self
 * reads 60/hour) and audited. Ownership is verified against the
 * authenticated identity (fail closed).
 */
export class CustomerBusinessProfileApplicationService {
  public constructor(
    private readonly repository: CustomerProfileRepository,
    private readonly lifecycle: CustomerLifecycle,
    private readonly businessProfilePolicy: CustomerBusinessProfilePolicy,
    private readonly clock: ClockPort,
    private readonly identifiers: UuidV7GenerationPort,
    private readonly idempotency: ApiIdempotencyService,
    private readonly rateLimiter: NonProductionRateLimiterPort,
  ) {}

  public async getBusinessProfile(
    customerProfileId: UuidV7,
    callerIdentityId: UuidV7,
  ): Promise<CustomerBusinessProfileResult | null> {
    const rateLimit = await this.rateLimiter.consume({
      key: `customer-read:${callerIdentityId.value}`,
      limit: 60,
      windowSeconds: 3600,
    });
    if (!rateLimit.allowed) {
      throw new CustomerApplicationError('CUSTOMER_RATE_LIMITED');
    }
    const profile = await this.requireOwnProfile(customerProfileId, callerIdentityId);
    this.lifecycle.assertCanSelfRead(profile.properties.state);
    const business = await this.repository.findBusinessProfile(
      profile.properties.customerProfileId,
    );
    return business === null ? null : toBusinessProfileResult(business);
  }

  /** D-05: attaches the optional business profile (0..1 cardinality). */
  public async createBusinessProfile(
    command: CreateCustomerBusinessProfileCommand,
  ): Promise<CustomerBusinessProfileResult> {
    await this.rateLimitMutate(command.actorIdentityId);
    const profile = await this.requireOwnProfile(
      command.customerProfileId,
      command.actorIdentityId,
    );
    this.assertMutable(profile, command.expectedVersion);

    return this.idempotency.execute<CustomerBusinessProfileResult>({
      scope: `customer:${command.customerProfileId.value}`,
      operationType: 'customer.business.create',
      idempotencyKey: command.idempotencyKey,
      request: command,
      execute: async () => {
        const existing = await this.repository.findBusinessProfile(
          profile.properties.customerProfileId,
        );
        // 0..1 cardinality (D-05): a customer that already has a business
        // profile cannot attach a second one (fail closed).
        this.businessProfilePolicy.assertCanAttachBusinessProfile(existing);
        const now = this.clock.now();
        const business = new CustomerBusinessProfile({
          customerBusinessProfileId: this.identifiers.next(),
          customerProfileId: profile.properties.customerProfileId,
          companyName: command.companyName,
          ...(command.registrationLookupDigest !== undefined
            ? { registrationLookupDigest: command.registrationLookupDigest }
            : {}),
          ...(command.businessType !== undefined ? { businessType: command.businessType } : {}),
          aggregateVersion: new AggregateVersion(1),
          createdAt: now,
          updatedAt: now,
        });
        const updated = this.advancedProfile(profile, now);
        await this.repository.save(
          {
            customerProfile: updated,
            addressesToAppend: [],
            addressesToUpdate: [],
            businessProfile: business,
            preferencesToAppend: [],
            preferencesToUpdate: [],
            transitionsToAppend: [],
            auditRecordsToAppend: [
              new CustomerAuditRecord({
                auditEventId: this.identifiers.next(),
                customerProfileId: profile.properties.customerProfileId,
                eventType: 'CUSTOMER_BUSINESS_PROFILE_CREATED',
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
        return toBusinessProfileResult(business);
      },
    });
  }

  public async updateBusinessProfile(
    command: UpdateCustomerBusinessProfileCommand,
  ): Promise<CustomerBusinessProfileResult> {
    await this.rateLimitMutate(command.actorIdentityId);
    const profile = await this.requireOwnProfile(
      command.customerProfileId,
      command.actorIdentityId,
    );
    this.assertMutable(profile, command.expectedVersion);

    return this.idempotency.execute<CustomerBusinessProfileResult>({
      scope: `customer:${command.customerProfileId.value}`,
      operationType: 'customer.business.update',
      idempotencyKey: command.idempotencyKey,
      request: command,
      execute: async () => {
        const existing = await this.repository.findBusinessProfile(
          profile.properties.customerProfileId,
        );
        if (existing === null) {
          // No business profile to update — fail closed.
          throw new CustomerApplicationError('CUSTOMER_NOT_FOUND');
        }
        const registrationLookupDigest =
          command.registrationLookupDigest ?? existing.properties.registrationLookupDigest;
        const businessType = command.businessType ?? existing.properties.businessType;
        const now = this.clock.now();
        const updatedBusiness = new CustomerBusinessProfile({
          ...existing.properties,
          companyName: command.companyName,
          ...(registrationLookupDigest === undefined ? {} : { registrationLookupDigest }),
          ...(businessType === undefined ? {} : { businessType }),
          updatedAt: now,
          aggregateVersion: new AggregateVersion(existing.properties.aggregateVersion.value + 1),
        });
        const updated = this.advancedProfile(profile, now);
        await this.repository.save(
          {
            customerProfile: updated,
            addressesToAppend: [],
            addressesToUpdate: [],
            businessProfile: updatedBusiness,
            preferencesToAppend: [],
            preferencesToUpdate: [],
            transitionsToAppend: [],
            auditRecordsToAppend: [
              new CustomerAuditRecord({
                auditEventId: this.identifiers.next(),
                customerProfileId: profile.properties.customerProfileId,
                eventType: 'CUSTOMER_BUSINESS_PROFILE_UPDATED',
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
        return toBusinessProfileResult(updatedBusiness);
      },
    });
  }

  private async rateLimitMutate(identityId: UuidV7): Promise<void> {
    const rateLimit = await this.rateLimiter.consume({
      key: `customer-mutate:${identityId.value}`,
      limit: 30,
      windowSeconds: 3600,
    });
    if (!rateLimit.allowed) {
      throw new CustomerApplicationError('CUSTOMER_RATE_LIMITED');
    }
  }

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

  private assertMutable(profile: CustomerProfile, expectedVersion: number): void {
    if (profile.properties.aggregateVersion.value !== expectedVersion) {
      throw new CustomerApplicationError('CUSTOMER_STATE_CONFLICT');
    }
    this.lifecycle.assertCanMutate(profile.properties.state);
  }

  private advancedProfile(profile: CustomerProfile, now: Date): CustomerProfile {
    return new CustomerProfile({
      ...profile.properties,
      updatedAt: now,
      aggregateVersion: new AggregateVersion(profile.properties.aggregateVersion.value + 1),
    });
  }
}

export interface CreateCustomerBusinessProfileCommand {
  readonly customerProfileId: UuidV7;
  readonly actorIdentityId: UuidV7;
  readonly expectedVersion: number;
  readonly companyName: string;
  /** SHA-256 lookup digest of the registration reference — never the raw value (D-05). */
  readonly registrationLookupDigest?: string;
  readonly businessType?: string;
  readonly idempotencyKey: string;
  readonly correlationId?: CorrelationIdentifier;
}

export interface UpdateCustomerBusinessProfileCommand {
  readonly customerProfileId: UuidV7;
  readonly actorIdentityId: UuidV7;
  readonly expectedVersion: number;
  readonly companyName: string;
  readonly registrationLookupDigest?: string;
  readonly businessType?: string;
  readonly idempotencyKey: string;
  readonly correlationId?: CorrelationIdentifier;
}

export interface CustomerBusinessProfileResult {
  readonly customerBusinessProfileId: string;
  readonly companyName: string;
  readonly registrationLookupDigest?: string;
  readonly businessType?: string;
}

function toBusinessProfileResult(business: CustomerBusinessProfile): CustomerBusinessProfileResult {
  const properties = business.properties;
  return {
    customerBusinessProfileId: properties.customerBusinessProfileId.value,
    companyName: properties.companyName,
    ...(properties.registrationLookupDigest === undefined
      ? {}
      : { registrationLookupDigest: properties.registrationLookupDigest }),
    ...(properties.businessType === undefined ? {} : { businessType: properties.businessType }),
  };
}
