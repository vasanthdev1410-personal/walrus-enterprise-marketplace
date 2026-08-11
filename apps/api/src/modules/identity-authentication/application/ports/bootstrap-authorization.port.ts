/**
 * M01-ADM-002. The controlled-bootstrap authorization boundary for the
 * initial universal Identity associated with Super Admin access. The endpoint
 * is BOOTSTRAP_CONTROLLED and requires an approved deployment/operations
 * bootstrap decision obtained through this narrow port at decision time; the
 * bootstrap command material is never stored or read directly by the
 * provisioning milestone. The port is intentionally narrow so the approved
 * controlled bootstrap contract can be integrated later without touching the
 * provisioning milestone. No roles, permissions or authorization internals are
 * ever copied, and Module 02 remains the authoritative owner of the Super
 * Admin role.
 */
export interface BootstrapAuthorizationCommand {
  /** Non-sensitive reference to the approved controlled bootstrap command. */
  readonly bootstrapEvidence: string;
}

export interface BootstrapAuthorizationDecision {
  /**
   * Whether the controlled bootstrap is currently available. False until an
   * approved controlled bootstrap contract is integrated, so the route is
   * BOOTSTRAP_UNAVAILABLE (fail closed) rather than provisionable.
   */
  readonly available: boolean;
}

export interface BootstrapAuthorizationPort {
  authorizeBootstrap(
    command: BootstrapAuthorizationCommand,
  ): Promise<BootstrapAuthorizationDecision>;
}
