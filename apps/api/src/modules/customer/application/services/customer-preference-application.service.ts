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
import { CustomerPreference } from '../../domain/entities/customer-preference';
import { CustomerProfile } from '../../domain/entities/customer-profile';
import type { CustomerLifecycle } from '../../domain/lifecycle/customer-lifecycle';
import type { CustomerProfileRepository } from '../../domain/ports/customer-repository.port';
import type { CustomerPreferenceKey } from '../../domain/value-objects/customer-preference-key';
import { CustomerApplicationError } from '../errors/customer-application.error';

/**
 * WEMP-M06-PLAN-001 M06-M3 (WEMP-M06-SPEC-001 §9, decision D-06). Basic
 * account preference application service. Only the allow-listed keys
 * (language/currency/locale) are accepted — unknown keys are rejected by
 * the domain (deny by default). No notification-domain preferences exist
 * (Module 11, A-13). Preferences are upserted per key (one row per
 * profile+key), version-checked (D-11), idempotent, rate-limited (D-10:
 * self mutations 30/hour, self reads 60/hour) and audited. Ownership is
 * verified against the authenticated identity (fail closed).
 */
export class CustomerPreferenceApplicationService {
  public constructor(
    private readonly repository: CustomerProfileRepository,
    private readonly lifecycle: CustomerLifecycle,
    private readonly clock: ClockPort,
    private readonly identifiers: UuidV7GenerationPort,
    private readonly idempotency: ApiIdempotencyService,
    private readonly rateLimiter: NonProductionRateLimiterPort,
  ) {}

  public async getPreferences(
    customerProfileId: UuidV7,
    callerIdentityId: UuidV7,
  ): Promise<readonly CustomerPreferenceResult[]> {
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
    const preferences = await this.repository.findPreferences(profile.properties.customerProfileId);
    return preferences.map(toPreferenceResult);
  }

  /** D-06: updates an allow-listed preference (create or update per key). */
  public async updatePreference(
    command: UpdateCustomerPreferenceCommand,
  ): Promise<CustomerPreferenceResult> {
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
    this.lifecycle.assertCanMutate(profile.properties.state);

    return this.idempotency.execute<CustomerPreferenceResult>({
      scope: `customer:${command.customerProfileId.value}`,
      operationType: `customer.preference.update-${command.preferenceKey}`,
      idempotencyKey: command.idempotencyKey,
      request: command,
      execute: async () => {
        const now = this.clock.now();
        const existing = await this.repository.findPreferences(
          profile.properties.customerProfileId,
        );
        const current = existing.find(
          (preference) => preference.properties.preferenceKey === command.preferenceKey,
        );
        const updated = this.advancedProfile(profile, now);
        const audit = new CustomerAuditRecord({
          auditEventId: this.identifiers.next(),
          customerProfileId: profile.properties.customerProfileId,
          eventType: 'CUSTOMER_PREFERENCE_UPDATED',
          actorIdentityId: command.actorIdentityId,
          occurredAt: now,
          createdAt: now,
          ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
        });
        if (current === undefined) {
          // First write for this key: append a new preference row.
          // The domain constructor validates the allow-list and per-key
          // format — an unknown key fails closed here.
          const preference = new CustomerPreference({
            preferenceId: this.identifiers.next(),
            customerProfileId: profile.properties.customerProfileId,
            preferenceKey: command.preferenceKey,
            preferenceValue: command.preferenceValue,
            aggregateVersion: new AggregateVersion(1),
            createdAt: now,
            updatedAt: now,
          });
          await this.repository.save(
            {
              customerProfile: updated,
              addressesToAppend: [],
              addressesToUpdate: [],
              preferencesToAppend: [preference],
              preferencesToUpdate: [],
              transitionsToAppend: [],
              auditRecordsToAppend: [audit],
            },
            profile.properties.aggregateVersion,
          );
          return toPreferenceResult(preference);
        }
        const preference = new CustomerPreference({
          ...current.properties,
          preferenceValue: command.preferenceValue,
          updatedAt: now,
          aggregateVersion: new AggregateVersion(current.properties.aggregateVersion.value + 1),
        });
        await this.repository.save(
          {
            customerProfile: updated,
            addressesToAppend: [],
            addressesToUpdate: [],
            preferencesToAppend: [],
            preferencesToUpdate: [preference],
            transitionsToAppend: [],
            auditRecordsToAppend: [audit],
          },
          profile.properties.aggregateVersion,
        );
        return toPreferenceResult(preference);
      },
    });
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

  private advancedProfile(profile: CustomerProfile, now: Date): CustomerProfile {
    return new CustomerProfile({
      ...profile.properties,
      updatedAt: now,
      aggregateVersion: new AggregateVersion(profile.properties.aggregateVersion.value + 1),
    });
  }
}

export interface UpdateCustomerPreferenceCommand {
  readonly customerProfileId: UuidV7;
  readonly actorIdentityId: UuidV7;
  readonly expectedVersion: number;
  readonly preferenceKey: CustomerPreferenceKey;
  readonly preferenceValue: string;
  readonly idempotencyKey: string;
  readonly correlationId?: CorrelationIdentifier;
}

export interface CustomerPreferenceResult {
  readonly preferenceId: string;
  readonly preferenceKey: CustomerPreferenceKey;
  readonly preferenceValue: string;
}

function toPreferenceResult(preference: CustomerPreference): CustomerPreferenceResult {
  return {
    preferenceId: preference.properties.preferenceId.value,
    preferenceKey: preference.properties.preferenceKey,
    preferenceValue: preference.properties.preferenceValue,
  };
}
