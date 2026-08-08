import { createHash } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import type {
  EnvelopeEncryptionContext,
  EnvelopeEncryptionPort,
  ProtectedEnvelope,
} from '../ports/envelope-encryption.port';
import type { ApiIdempotencyPort } from '../ports/api-idempotency.port';
import type { ClockPort, UuidV7GenerationPort } from '../ports/application-runtime.port';

export interface IdempotentExecution<T> {
  readonly scope: string;
  readonly operationType: string;
  readonly idempotencyKey: string;
  readonly request: unknown;
  readonly execute: () => Promise<T>;
}

export class ApiIdempotencyService {
  public constructor(
    private readonly repository: ApiIdempotencyPort,
    private readonly encryption: EnvelopeEncryptionPort,
    private readonly clock: ClockPort,
    private readonly identifiers: UuidV7GenerationPort,
  ) {}

  public async execute<T>(execution: IdempotentExecution<T>): Promise<T> {
    const recordId = this.identifiers.next().value;
    const fingerprint = createHash('sha256')
      .update(canonicalJson(execution.request), 'utf8')
      .digest('base64url');
    const acquisition = await this.repository.acquire({
      recordId,
      scope: execution.scope,
      operationType: execution.operationType,
      idempotencyKey: execution.idempotencyKey,
      requestFingerprint: fingerprint,
      createdAt: this.clock.now(),
    });
    if (acquisition.outcome === 'FINGERPRINT_MISMATCH') {
      throw new ConflictException('IDEMPOTENCY_KEY_REUSED');
    }
    if (acquisition.outcome === 'IN_PROGRESS') {
      throw new ConflictException('IDEMPOTENCY_IN_PROGRESS');
    }
    if (acquisition.outcome === 'COMPLETED') {
      return JSON.parse(
        Buffer.from(
          this.encryption.decrypt(
            parseProtectedEnvelope(acquisition.protectedResultReference),
            context(execution),
          ),
        ).toString('utf8'),
      ) as T;
    }
    let result: T;
    try {
      result = await execution.execute();
    } catch (error) {
      await this.repository.abandon(recordId);
      throw error;
    }
    // After the operation succeeds, any protection or persistence uncertainty deliberately
    // leaves PROCESSING in place. Deleting it could repeat an already committed security mutation.
    const protectedResult = this.encryption.encrypt(
      Buffer.from(JSON.stringify(result), 'utf8'),
      context(execution),
    );
    await this.repository.complete(recordId, JSON.stringify(protectedResult), this.clock.now());
    return result;
  }
}

function context(
  execution: Pick<IdempotentExecution<unknown>, 'scope' | 'operationType'>,
): EnvelopeEncryptionContext {
  return {
    environment: process.env.APP_ENV ?? 'local',
    recordType: 'API_IDEMPOTENCY_RESULT',
    recordId: createHash('sha256')
      .update(`${execution.scope}|${execution.operationType}`)
      .digest('hex'),
    fieldName: 'response_reference',
  } as const;
}

function parseProtectedEnvelope(value: string): ProtectedEnvelope {
  const parsed: unknown = JSON.parse(value);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('envelopeVersion' in parsed) ||
    parsed.envelopeVersion !== 'walrus-envelope-v1'
  ) {
    throw new Error('Invalid protected idempotency result');
  }
  return parsed as ProtectedEnvelope;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
