import type {
  ClockPort,
  UuidV7GenerationPort,
} from '../../../identity-authentication/application/ports/application-runtime.port';
import type { NonProductionRateLimiterPort } from '../../../identity-authentication/application/ports/non-production-rate-limiter.port';
import type { ApiIdempotencyService } from '../../../identity-authentication/application/services/api-idempotency.service';
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { CustomerAddress } from '../../domain/entities/customer-address';
import { CustomerAuditRecord } from '../../domain/entities/customer-audit-record';
import { CustomerProfile } from '../../domain/entities/customer-profile';
import type { CustomerLifecycle } from '../../domain/lifecycle/customer-lifecycle';
import type { CustomerAddressPolicy } from '../../domain/policy/customer-address.policy';
import type { CustomerProfileRepository } from '../../domain/ports/customer-repository.port';
import type { CustomerAddressRole } from '../../domain/value-objects/customer-address-role';
import { CustomerApplicationError } from '../errors/customer-application.error';

/**
 * WEMP-M06-PLAN-001 M06-M3 (WEMP-M06-SPEC-001 §7, decision D-04).
 * Customer address book application service. Self-service address CRUD with
 * role tags (SHIPPING/BILLING), ACTIVE/REMOVED soft lifecycle, and the
 * one-default-per-role invariant preserved through the M06-M1
 * CustomerAddressPolicy — `setDefault*` clears the previous default for the
 * role atomically at the domain level (D-04). A REMOVED address can never
 * be a default and can never be mutated (fail closed).
 *
 * Every mutation is ACTIVE-only (D-02, self-service), version-guarded
 * (D-11), idempotent, rate-limited (D-10: self mutations 30/hour, self
 * reads 60/hour) and audited. Ownership is verified against the
 * authenticated identity (identityId match, fail closed); cross-customer
 * access is impossible.
 */
export class CustomerAddressApplicationService {
  public constructor(
    private readonly repository: CustomerProfileRepository,
    private readonly lifecycle: CustomerLifecycle,
    private readonly addressPolicy: CustomerAddressPolicy,
    private readonly clock: ClockPort,
    private readonly identifiers: UuidV7GenerationPort,
    private readonly idempotency: ApiIdempotencyService,
    private readonly rateLimiter: NonProductionRateLimiterPort,
  ) {}

  public async listAddresses(
    customerProfileId: UuidV7,
    callerIdentityId: UuidV7,
  ): Promise<readonly CustomerAddressResult[]> {
    await this.rateLimitRead(callerIdentityId);
    const profile = await this.requireOwnProfile(customerProfileId, callerIdentityId);
    this.lifecycle.assertCanSelfRead(profile.properties.state);
    const addresses = await this.repository.findAddresses(profile.properties.customerProfileId);
    return addresses.map(toAddressResult);
  }

  public async getAddress(
    customerProfileId: UuidV7,
    addressId: UuidV7,
    callerIdentityId: UuidV7,
  ): Promise<CustomerAddressResult> {
    await this.rateLimitRead(callerIdentityId);
    const profile = await this.requireOwnProfile(customerProfileId, callerIdentityId);
    this.lifecycle.assertCanSelfRead(profile.properties.state);
    const addresses = await this.repository.findAddresses(profile.properties.customerProfileId);
    const match = addresses.find(
      (address) =>
        address.properties.addressId.value === addressId.value &&
        address.properties.state === 'ACTIVE',
    );
    if (match === undefined) {
      // Non-enumerating: unknown or REMOVED addresses resolve the same way.
      throw new CustomerApplicationError('CUSTOMER_NOT_FOUND');
    }
    return toAddressResult(match);
  }

  public async addAddress(command: AddCustomerAddressCommand): Promise<CustomerAddressResult> {
    await this.rateLimitMutate(command.actorIdentityId);
    const profile = await this.requireOwnProfile(
      command.customerProfileId,
      command.actorIdentityId,
    );
    this.assertMutable(profile, command.expectedVersion);

    return this.idempotency.execute<CustomerAddressResult>({
      scope: `customer:${command.customerProfileId.value}`,
      operationType: 'customer.address.add',
      idempotencyKey: command.idempotencyKey,
      request: command,
      execute: async () => {
        const now = this.clock.now();
        const address = new CustomerAddress({
          addressId: this.identifiers.next(),
          customerProfileId: profile.properties.customerProfileId,
          recipientName: command.recipientName,
          line1: command.line1,
          ...(command.line2 !== undefined ? { line2: command.line2 } : {}),
          city: command.city,
          ...(command.region !== undefined ? { region: command.region } : {}),
          postalCode: command.postalCode,
          countryCode: command.countryCode,
          ...(command.phone !== undefined ? { phone: command.phone } : {}),
          roles: command.roles,
          isDefaultShipping: false,
          isDefaultBilling: false,
          state: 'ACTIVE',
          aggregateVersion: new AggregateVersion(1),
          createdAt: now,
          updatedAt: now,
        });
        const updated = this.advancedProfile(profile, now);
        await this.repository.save(
          {
            customerProfile: updated,
            addressesToAppend: [address],
            addressesToUpdate: [],
            preferencesToAppend: [],
            preferencesToUpdate: [],
            transitionsToAppend: [],
            auditRecordsToAppend: [
              new CustomerAuditRecord({
                auditEventId: this.identifiers.next(),
                customerProfileId: profile.properties.customerProfileId,
                eventType: 'CUSTOMER_ADDRESS_ADDED',
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
        return toAddressResult(address);
      },
    });
  }

  public async updateAddress(
    command: UpdateCustomerAddressCommand,
  ): Promise<CustomerAddressResult> {
    await this.rateLimitMutate(command.actorIdentityId);
    const profile = await this.requireOwnProfile(
      command.customerProfileId,
      command.actorIdentityId,
    );
    this.assertMutable(profile, command.expectedVersion);

    return this.idempotency.execute<CustomerAddressResult>({
      scope: `customer:${command.customerProfileId.value}`,
      operationType: 'customer.address.update',
      idempotencyKey: command.idempotencyKey,
      request: command,
      execute: async () => {
        const addresses = await this.repository.findAddresses(profile.properties.customerProfileId);
        const existing = addresses.find(
          (address) => address.properties.addressId.value === command.addressId.value,
        );
        if (existing === undefined || existing.properties.state === 'REMOVED') {
          // Removed/unknown addresses cannot be mutated (fail closed).
          throw new CustomerApplicationError('CUSTOMER_ADDRESS_CONFLICT');
        }
        const now = this.clock.now();
        const line2 = command.line2 ?? existing.properties.line2;
        const region = command.region ?? existing.properties.region;
        const phone = command.phone ?? existing.properties.phone;
        const updatedAddress = new CustomerAddress({
          ...existing.properties,
          recipientName: command.recipientName,
          line1: command.line1,
          ...(line2 === undefined ? {} : { line2 }),
          city: command.city,
          ...(region === undefined ? {} : { region }),
          postalCode: command.postalCode,
          countryCode: command.countryCode,
          ...(phone === undefined ? {} : { phone }),
          updatedAt: now,
          aggregateVersion: new AggregateVersion(existing.properties.aggregateVersion.value + 1),
        });
        const updated = this.advancedProfile(profile, now);
        await this.repository.save(
          {
            customerProfile: updated,
            addressesToAppend: [],
            addressesToUpdate: [updatedAddress],
            preferencesToAppend: [],
            preferencesToUpdate: [],
            transitionsToAppend: [],
            auditRecordsToAppend: [
              new CustomerAuditRecord({
                auditEventId: this.identifiers.next(),
                customerProfileId: profile.properties.customerProfileId,
                eventType: 'CUSTOMER_ADDRESS_UPDATED',
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
        return toAddressResult(updatedAddress);
      },
    });
  }

  public async removeAddress(command: RemoveCustomerAddressCommand): Promise<{ removed: boolean }> {
    await this.rateLimitMutate(command.actorIdentityId);
    const profile = await this.requireOwnProfile(
      command.customerProfileId,
      command.actorIdentityId,
    );
    this.assertMutable(profile, command.expectedVersion);

    return this.idempotency.execute<{ removed: boolean }>({
      scope: `customer:${command.customerProfileId.value}`,
      operationType: 'customer.address.remove',
      idempotencyKey: command.idempotencyKey,
      request: command,
      execute: async () => {
        const addresses = await this.repository.findAddresses(profile.properties.customerProfileId);
        const existing = addresses.find(
          (address) => address.properties.addressId.value === command.addressId.value,
        );
        if (existing === undefined || existing.properties.state === 'REMOVED') {
          // Removing an unknown or already-removed address fails closed.
          throw new CustomerApplicationError('CUSTOMER_ADDRESS_CONFLICT');
        }
        const now = this.clock.now();
        // Soft removal (D-04): REMOVED, never a default, auditable, never
        // hard-deleted. The removed address cannot be a default.
        const removed = new CustomerAddress({
          ...existing.properties,
          isDefaultShipping: false,
          isDefaultBilling: false,
          state: 'REMOVED',
          removedAt: now,
          updatedAt: now,
          aggregateVersion: new AggregateVersion(existing.properties.aggregateVersion.value + 1),
        });
        const updated = this.advancedProfile(profile, now);
        await this.repository.save(
          {
            customerProfile: updated,
            addressesToAppend: [],
            addressesToUpdate: [removed],
            preferencesToAppend: [],
            preferencesToUpdate: [],
            transitionsToAppend: [],
            auditRecordsToAppend: [
              new CustomerAuditRecord({
                auditEventId: this.identifiers.next(),
                customerProfileId: profile.properties.customerProfileId,
                eventType: 'CUSTOMER_ADDRESS_REMOVED',
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
        return { removed: true };
      },
    });
  }

  /** D-04: sets the default for a role, atomically clearing the previous default. */
  public async setDefaultAddress(
    command: SetDefaultAddressCommand,
  ): Promise<CustomerAddressResult> {
    await this.rateLimitMutate(command.actorIdentityId);
    const profile = await this.requireOwnProfile(
      command.customerProfileId,
      command.actorIdentityId,
    );
    this.assertMutable(profile, command.expectedVersion);

    return this.idempotency.execute<CustomerAddressResult>({
      scope: `customer:${command.customerProfileId.value}`,
      operationType: `customer.address.set-default-${command.role.toLowerCase()}`,
      idempotencyKey: command.idempotencyKey,
      request: command,
      execute: async () => {
        const addresses = await this.repository.findAddresses(profile.properties.customerProfileId);
        // Domain-level atomic replacement (D-04): the previous default for
        // the role is cleared and the new one set in one operation.
        const updatedAddresses = this.addressPolicy.setDefault(
          addresses,
          command.addressId.value,
          command.role,
        );
        const changed = updatedAddresses.filter(
          (address) =>
            address.properties.isDefaultShipping !==
              addresses.find(
                (current) =>
                  current.properties.addressId.value === address.properties.addressId.value,
              )?.properties.isDefaultShipping ||
            address.properties.isDefaultBilling !==
              addresses.find(
                (current) =>
                  current.properties.addressId.value === address.properties.addressId.value,
              )?.properties.isDefaultBilling,
        );
        const now = this.clock.now();
        const updated = this.advancedProfile(profile, now);
        const target = updatedAddresses.find(
          (address) => address.properties.addressId.value === command.addressId.value,
        );
        if (target === undefined) {
          throw new CustomerApplicationError('CUSTOMER_ADDRESS_CONFLICT');
        }
        await this.repository.save(
          {
            customerProfile: updated,
            addressesToAppend: [],
            addressesToUpdate: changed,
            preferencesToAppend: [],
            preferencesToUpdate: [],
            transitionsToAppend: [],
            auditRecordsToAppend: [
              new CustomerAuditRecord({
                auditEventId: this.identifiers.next(),
                customerProfileId: profile.properties.customerProfileId,
                eventType:
                  command.role === 'SHIPPING'
                    ? 'CUSTOMER_DEFAULT_SHIPPING_SET'
                    : 'CUSTOMER_DEFAULT_BILLING_SET',
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
        return toAddressResult(target);
      },
    });
  }

  private async rateLimitRead(identityId: UuidV7): Promise<void> {
    const rateLimit = await this.rateLimiter.consume({
      key: `customer-read:${identityId.value}`,
      limit: 60,
      windowSeconds: 3600,
    });
    if (!rateLimit.allowed) {
      throw new CustomerApplicationError('CUSTOMER_RATE_LIMITED');
    }
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

export interface AddCustomerAddressCommand {
  readonly customerProfileId: UuidV7;
  readonly actorIdentityId: UuidV7;
  readonly expectedVersion: number;
  readonly recipientName: string;
  readonly line1: string;
  readonly line2?: string;
  readonly city: string;
  readonly region?: string;
  readonly postalCode: string;
  readonly countryCode: string;
  readonly phone?: string;
  readonly roles: readonly CustomerAddressRole[];
  readonly idempotencyKey: string;
  readonly correlationId?: CorrelationIdentifier;
}

export interface UpdateCustomerAddressCommand {
  readonly customerProfileId: UuidV7;
  readonly addressId: UuidV7;
  readonly actorIdentityId: UuidV7;
  readonly expectedVersion: number;
  readonly recipientName: string;
  readonly line1: string;
  readonly line2?: string;
  readonly city: string;
  readonly region?: string;
  readonly postalCode: string;
  readonly countryCode: string;
  readonly phone?: string;
  readonly idempotencyKey: string;
  readonly correlationId?: CorrelationIdentifier;
}

export interface RemoveCustomerAddressCommand {
  readonly customerProfileId: UuidV7;
  readonly addressId: UuidV7;
  readonly actorIdentityId: UuidV7;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly correlationId?: CorrelationIdentifier;
}

export interface SetDefaultAddressCommand {
  readonly customerProfileId: UuidV7;
  readonly addressId: UuidV7;
  readonly actorIdentityId: UuidV7;
  readonly expectedVersion: number;
  readonly role: CustomerAddressRole;
  readonly idempotencyKey: string;
  readonly correlationId?: CorrelationIdentifier;
}

export interface CustomerAddressResult {
  readonly addressId: string;
  readonly recipientName: string;
  readonly line1: string;
  readonly line2?: string;
  readonly city: string;
  readonly region?: string;
  readonly postalCode: string;
  readonly countryCode: string;
  readonly phone?: string;
  readonly roles: readonly CustomerAddressRole[];
  readonly isDefaultShipping: boolean;
  readonly isDefaultBilling: boolean;
  readonly state: 'ACTIVE' | 'REMOVED';
}

function toAddressResult(address: CustomerAddress): CustomerAddressResult {
  const properties = address.properties;
  return {
    addressId: properties.addressId.value,
    recipientName: properties.recipientName,
    line1: properties.line1,
    ...(properties.line2 === undefined ? {} : { line2: properties.line2 }),
    city: properties.city,
    ...(properties.region === undefined ? {} : { region: properties.region }),
    postalCode: properties.postalCode,
    countryCode: properties.countryCode,
    ...(properties.phone === undefined ? {} : { phone: properties.phone }),
    roles: properties.roles,
    isDefaultShipping: properties.isDefaultShipping,
    isDefaultBilling: properties.isDefaultBilling,
    state: properties.state,
  };
}
