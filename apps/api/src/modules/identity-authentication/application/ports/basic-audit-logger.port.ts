export interface BasicAuditEvent {
  readonly operationType: string;
  readonly subjectIdentityId?: string | undefined;
  readonly actorIdentityId?: string | undefined;
  readonly actionOutcome: 'SUCCESS' | 'FAILURE' | 'ERROR';
  readonly sourceIpReference?: string | undefined;
  readonly userAgentReference?: string | undefined;
  readonly correlationId?: string | undefined;
  readonly metadataJson?: string | undefined;
  readonly occurredAt: Date;
}

export interface BasicAuditLoggerPort {
  logEvent(event: BasicAuditEvent): Promise<void>;
}
