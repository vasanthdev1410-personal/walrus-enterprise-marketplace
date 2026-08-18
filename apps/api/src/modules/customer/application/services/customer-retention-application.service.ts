import type {
  ClockPort,
  UuidV7GenerationPort,
} from '../../../identity-authentication/application/ports/application-runtime.port';
import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { CustomerAuditRecord } from '../../domain/entities/customer-audit-record';
import type { CustomerRetentionPolicy } from '../../domain/policy/customer-retention.policy';
import type { CustomerRetentionDeletionPort } from '../../domain/ports/customer-retention-deletion.port';
import type { CustomerProfileRepository } from '../../domain/ports/customer-repository.port';
import { CustomerApplicationError } from '../errors/customer-application.error';
import type { CustomerRetentionConfigurationPort } from '../ports/customer-retention-configuration.port';
import type { CustomerAdminAuthorizationPort } from '../ports/customer-admin-authorization.port';

export interface ProcessCustomerRetentionCommand {
  readonly customerProfileId: UuidV7;
  readonly triggeredByIdentityId: UuidV7;
  readonly correlationId?: CorrelationIdentifier;
}

export interface CustomerRetentionProcessingResult {
  readonly customerProfileId: string;
  readonly transitionsChecked: number;
  readonly transitionsExpired: number;
  readonly auditRecordsChecked: number;
  readonly auditRecordsExpired: number;
}

/**
 * WEMP-M06-SPEC-001 §19 / decision D-15 (M06-M3). Customer record retention
 * processor for the two audit/history categories
 * (CustomerStateTransition, CustomerAuditRecord — CUSTOMER_RECORD_
 * RETENTION_DAYS = 2555). Fail closed by design: every category rule is
 * resolved BEFORE any deletion, so missing or invalid retention
 * configuration aborts the whole run with nothing deleted (D-15). The
 * triggered admin must hold `customer.audit.view` (fail closed through the
 * authorization port). Deletion is scoped to the retention deletion port —
 * the aggregate repository remains append-only (D-02/D-08).
 *
 * No retention is invented for any other category: CustomerProfile,
 * CustomerAddress, CustomerBusinessProfile and CustomerPreference are
 * governed by lifecycle/soft-removal semantics, never deleted here, and
 * never retained for unrelated data (D-15).
 */
export class CustomerRetentionApplicationService {
  public constructor(
    private readonly repository: CustomerProfileRepository,
    private readonly deletion: CustomerRetentionDeletionPort,
    private readonly retentionConfiguration: CustomerRetentionConfigurationPort,
    private readonly retentionPolicy: CustomerRetentionPolicy,
    private readonly adminAuthorization: CustomerAdminAuthorizationPort,
    private readonly clock: ClockPort,
    private readonly identifiers: UuidV7GenerationPort,
  ) {}

  public async processRetention(
    command: ProcessCustomerRetentionCommand,
  ): Promise<CustomerRetentionProcessingResult> {
    const granted = await this.adminAuthorization.isGranted(
      command.triggeredByIdentityId,
      'customer.audit.view',
    );
    if (!granted) {
      throw new CustomerApplicationError('CUSTOMER_ADMIN_AUTHORIZATION_DENIED');
    }
    const profile = await this.repository.findById(command.customerProfileId);
    if (profile === null) {
      throw new CustomerApplicationError('CUSTOMER_NOT_FOUND');
    }
    const [transitions, auditRecords] = await Promise.all([
      this.repository.findTransitions(command.customerProfileId),
      this.repository.findAuditRecords(command.customerProfileId),
    ]);
    const now = this.clock.now();

    // Phase 1 — resolve every category rule up front. Any missing or
    // invalid rule throws before a single record is deleted (fail closed,
    // D-15).
    const resolved = new Map<string, { category: string; retentionDays: number }>();
    for (const category of ['CustomerStateTransition', 'CustomerAuditRecord']) {
      const rule = await this.retentionConfiguration.findRule(category);
      resolved.set(category, this.retentionPolicy.evaluateRule(rule));
    }

    // Phase 2 — evaluate and process. No rule resolution happens here, so
    // a configuration problem can no longer interrupt after deletion begins.
    const transitionExpired: UuidV7[] = [];
    const auditExpired: UuidV7[] = [];
    for (const transition of transitions) {
      const evaluation = this.retentionPolicy.evaluate(
        transition.properties.createdAt,
        now,
        resolved.get('CustomerStateTransition'),
        false,
      );
      if (evaluation.outcome === 'RETENTION_EXPIRED') {
        transitionExpired.push(transition.properties.transitionId);
      }
    }
    for (const record of auditRecords) {
      const evaluation = this.retentionPolicy.evaluate(
        record.properties.createdAt,
        now,
        resolved.get('CustomerAuditRecord'),
        false,
      );
      if (evaluation.outcome === 'RETENTION_EXPIRED') {
        auditExpired.push(record.properties.auditEventId);
      }
    }

    if (transitionExpired.length > 0) {
      await this.deletion.deleteTransitions(transitionExpired);
    }
    if (auditExpired.length > 0) {
      await this.deletion.deleteAuditRecords(auditExpired);
    }
    // The deletion itself is audited append-only (D-08).
    await this.appendDeletionAudit(command, now, transitionExpired.length, auditExpired.length);

    return {
      customerProfileId: command.customerProfileId.value,
      transitionsChecked: transitions.length,
      transitionsExpired: transitionExpired.length,
      auditRecordsChecked: auditRecords.length,
      auditRecordsExpired: auditExpired.length,
    };
  }

  private async appendDeletionAudit(
    command: ProcessCustomerRetentionCommand,
    now: Date,
    transitionsExpired: number,
    auditRecordsExpired: number,
  ): Promise<void> {
    if (transitionsExpired === 0 && auditRecordsExpired === 0) {
      return;
    }
    const profile = await this.repository.findById(command.customerProfileId);
    if (profile === null) {
      throw new CustomerApplicationError('CUSTOMER_NOT_FOUND');
    }
    await this.repository.save(
      {
        customerProfile: profile,
        addressesToAppend: [],
        addressesToUpdate: [],
        preferencesToAppend: [],
        preferencesToUpdate: [],
        transitionsToAppend: [],
        auditRecordsToAppend: [
          new CustomerAuditRecord({
            auditEventId: this.identifiers.next(),
            customerProfileId: command.customerProfileId,
            eventType: 'CUSTOMER_RETENTION_EXPIRED_RECORDS_DELETED',
            actorIdentityId: command.triggeredByIdentityId,
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
  }
}
