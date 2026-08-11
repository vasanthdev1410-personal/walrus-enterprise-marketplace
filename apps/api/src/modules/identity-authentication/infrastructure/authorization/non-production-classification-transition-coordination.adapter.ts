import { Injectable } from '@nestjs/common';
import type {
  ClassificationTransitionCoordinationCommand,
  ClassificationTransitionCoordinationDecision,
  ClassificationTransitionCoordinationPort,
} from '../../application/ports/classification-transition-coordination.port';

/**
 * Fail-closed approved coordination-contract boundary for classification
 * transitions (M01-CLS-001). No approved internal coordination contract is
 * integrated yet, so every request fails with CONTRACT_INVALID. The full
 * transition flow is exercised against a mocked valid contract in unit and
 * integration tests; once the approved contract lands, this adapter is
 * replaced without touching the classification milestone. An always-valid
 * adapter is never acceptable: the caller's ordinary Session alone must not
 * change an authentication-security classification.
 */
@Injectable()
export class NonProductionClassificationTransitionCoordinationAdapter implements ClassificationTransitionCoordinationPort {
  public validateContract(
    command: ClassificationTransitionCoordinationCommand,
  ): Promise<ClassificationTransitionCoordinationDecision> {
    // No approved coordination contract is integrated yet; the command carries
    // the transition context that the future approved contract will evaluate.
    // Every transition is rejected until then.
    void command;
    return Promise.resolve({ contractValid: false });
  }
}
