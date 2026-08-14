/**
 * WEMP-M04-SPEC-001 §6 (decision D-03). Platform-defined product category
 * lifecycle: ACTIVE categories are referenceable by products; RETIRED
 * categories are no longer referenceable. Changes are audited.
 */
export const CATEGORY_STATES = ['ACTIVE', 'RETIRED'] as const;

export type CategoryState = (typeof CATEGORY_STATES)[number];

export function isActiveCategoryState(state: CategoryState): boolean {
  return state === 'ACTIVE';
}
