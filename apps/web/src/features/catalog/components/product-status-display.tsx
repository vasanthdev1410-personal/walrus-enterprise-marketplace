'use client';

import type { ReactNode } from 'react';
import type { ProductState } from '@/src/lib/seller-api';

/** Presentational product-state vocabulary — never authorization logic. */
export const PRODUCT_STATE_LABELS: Readonly<Record<ProductState, string>> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  APPROVED: 'Approved',
  PUBLISHED: 'Published',
  CORRECTIONS_REQUESTED: 'Corrections requested',
  UNPUBLISHED: 'Unpublished',
  REJECTED: 'Rejected',
  CLOSED: 'Closed',
};

/** States where the seller may edit the product definition (lifecycle §5). */
export const SELLER_EDITABLE_STATES: readonly ProductState[] = [
  'DRAFT',
  'CORRECTIONS_REQUESTED',
  'UNPUBLISHED',
];

/** States where the seller may submit for review (lifecycle §5). */
export const SELLER_SUBMITTABLE_STATES: readonly ProductState[] = [
  'DRAFT',
  'CORRECTIONS_REQUESTED',
  'UNPUBLISHED',
];

/** States where the seller may close/withdraw (lifecycle §5). */
export const SELLER_CLOSEABLE_STATES: readonly ProductState[] = [
  'APPROVED',
  'PUBLISHED',
  'UNPUBLISHED',
];

export function ProductStateBadge({ state }: { readonly state: ProductState }): ReactNode {
  return (
    <span className={`badge badge-${state.toLowerCase()}`}>{PRODUCT_STATE_LABELS[state]}</span>
  );
}

/** Formats a price as a plain 2-decimal currency string (no calculations). */
export function formatPrice(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
