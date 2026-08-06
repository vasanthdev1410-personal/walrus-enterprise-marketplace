import type { CorrelationIdentifier } from '../../shared/value-objects/correlation-identifier';
import type { ProtectedValue } from '../../shared/value-objects/protected-value';
import type { UuidV7 } from '../../shared/value-objects/uuid-v7';
import type { CredentialType } from '../value-objects/credential-type';
import type { CredentialHistoryEventType } from '../value-objects/credential-history-event-type';

export interface CredentialHistoryRecordProperties {
  credentialHistoryId: UuidV7;
  identityId: UuidV7;
  credentialType: CredentialType;
  credentialVersion: number;
  protectedHistoricalValue?: ProtectedValue;
  eventType: CredentialHistoryEventType;
  createdAt: Date;
  sourceCredentialId?: UuidV7;
  correlationId?: CorrelationIdentifier;
}

export class CredentialHistoryRecord {
  public readonly properties: Readonly<CredentialHistoryRecordProperties>;

  public constructor(properties: CredentialHistoryRecordProperties) {
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
