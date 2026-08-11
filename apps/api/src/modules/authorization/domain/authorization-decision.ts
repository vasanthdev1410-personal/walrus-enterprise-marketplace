import type { AuthorizationDecisionOutcome } from './value-objects/authorization-decision-outcome';
import type { AuthorizationDenialReason } from './value-objects/authorization-denial-reason';

/**
 * Part 6.1 §5 / Part 6.3 §15 (Module 02 source material). The immutable result
 * of an authorization evaluation. Only `GRANTED` permits execution. The
 * `authorizationReference` is a non-sensitive, deterministic correlation
 * identifier for audit records; denial reasons are internal only and must
 * never be exposed to clients (Part 6.5 §24).
 */
export interface AuthorizationDecisionProperties {
  readonly outcome: AuthorizationDecisionOutcome;
  readonly denialReason?: AuthorizationDenialReason;
  readonly authorizationReference: string;
}

export class AuthorizationDecision {
  public readonly properties: Readonly<AuthorizationDecisionProperties>;

  public constructor(properties: AuthorizationDecisionProperties) {
    if (properties.outcome === 'DENIED' && properties.denialReason === undefined) {
      throw new Error('Denied Authorization Decision requires a denial reason');
    }
    if (properties.outcome === 'GRANTED' && properties.denialReason !== undefined) {
      throw new Error('Granted Authorization Decision must not carry a denial reason');
    }
    if (properties.authorizationReference.trim() === '') {
      throw new Error('Authorization Decision requires a reference');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }

  public get granted(): boolean {
    return this.properties.outcome === 'GRANTED';
  }
}
