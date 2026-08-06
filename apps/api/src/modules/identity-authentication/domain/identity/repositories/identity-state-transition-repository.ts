import type { IdentityStateTransition } from '../entities/identity-state-transition';

export interface IdentityStateTransitionRepository {
  append(transition: IdentityStateTransition): Promise<void>;
}
