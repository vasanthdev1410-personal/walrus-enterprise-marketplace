import { BadRequestException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { currentRequestContext } from '../../../platform/request-context/request-context';

const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

export function currentCorrelationId(): string | undefined {
  return currentRequestContext()?.correlationId;
}

export function success(
  data: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return {
    data,
    meta: { apiVersion: 'v1' },
    correlationId: currentCorrelationId() ?? 'unavailable',
  };
}

export function noStore(response: Response): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Pragma', 'no-cache');
}

export function assertIdempotencyKey(value: string | undefined): asserts value is string {
  if (value === undefined || !IDEMPOTENCY_PATTERN.test(value)) {
    throw new BadRequestException('IDEMPOTENCY_KEY_REQUIRED');
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Validates a strong ETag of the form `"<resource>:v<N>"`. */
export function assertStrongEtag(
  value: string | undefined,
  resource: string,
): asserts value is string {
  if (value === undefined) throw new BadRequestException('PRECONDITION_REQUIRED');
  if (!new RegExp(`^"${escapeRegExp(resource)}:v[1-9]\\d*"$`).test(value)) {
    throw new BadRequestException('RESOURCE_STATE_CONFLICT');
  }
}

/** Validates the strong ETag and extracts the resource version it carries. */
export function etagVersion(value: string | undefined, resource: string): number {
  assertStrongEtag(value, resource);
  const match = new RegExp(`^"${escapeRegExp(resource)}:v([1-9]\\d*)"$`).exec(value);
  if (match === null) throw new BadRequestException('RESOURCE_STATE_CONFLICT');
  return Number(match[1]);
}

export function anonymousScope(request: Request): string {
  const material = `${request.ip ?? 'unknown'}|${request.headers['user-agent'] ?? 'unknown'}`;
  return `anonymous-client:${createHash('sha256').update(material).digest('base64url')}`;
}
