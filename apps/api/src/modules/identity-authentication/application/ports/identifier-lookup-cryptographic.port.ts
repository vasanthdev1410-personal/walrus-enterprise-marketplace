import type { IdentifierType } from '../../domain/identity/value-objects/identifier-type';

export interface IdentifierLookupContext {
  readonly environment: string;
  readonly identifierType: IdentifierType;
  readonly canonicalValue: string;
}

export interface IdentifierLookupCryptographicPort {
  createActiveLookup(context: IdentifierLookupContext): string;
  createLookupsForResolution(context: IdentifierLookupContext): readonly string[];
}
