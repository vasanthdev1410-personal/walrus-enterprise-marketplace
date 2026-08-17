import { CorrelationIdentifier } from '../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import { currentCorrelationId } from '../../identity-authentication/presentation/http-contract';

/**
 * Builds the optional `correlationId` command field from the request context.
 * Returns an empty frozen object when no correlation identifier is present or
 * the value is not a valid UUIDv7 (never throws into a handler). Mirrors the
 * Module 04 presentation helper so inventory commands carry the same
 * request-correlation provenance (WEMP-M05-SPEC-001 §10, D-09).
 */
export function correlationField():
  Readonly<{ correlationId: CorrelationIdentifier }> | Readonly<Record<string, never>> {
  const value = currentCorrelationId();
  if (value === undefined) return Object.freeze({});
  try {
    return Object.freeze({ correlationId: new CorrelationIdentifier(value) });
  } catch {
    return Object.freeze({});
  }
}
