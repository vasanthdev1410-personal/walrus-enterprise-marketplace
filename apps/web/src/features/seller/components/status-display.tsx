'use client';

import type { ReactNode } from 'react';
import type { ComplianceState, SellerState, VerificationType } from '@/src/lib/seller-api';

/** Presentational state vocabulary — never authorization logic. */
export const SELLER_STATE_LABELS: Readonly<Record<SellerState, string>> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  CORRECTIONS_REQUESTED: 'Corrections requested',
  APPROVED: 'Approved',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  REJECTED: 'Rejected',
  CLOSED: 'Closed',
};

export const COMPLIANCE_STATE_LABELS: Readonly<Record<ComplianceState, string>> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  VERIFICATION_REQUIRED: 'Verification required',
  COMPLIANT: 'Compliant',
  NON_COMPLIANT: 'Non-compliant',
};

export const VERIFICATION_TYPE_LABELS: Readonly<Record<VerificationType, string>> = {
  GST: 'GST',
  PAN: 'PAN',
  BANK: 'Bank',
  ADDRESS: 'Address',
};

export function SellerStateBadge({ state }: { readonly state: SellerState }): ReactNode {
  return <span className={`badge badge-${state.toLowerCase()}`}>{SELLER_STATE_LABELS[state]}</span>;
}

export function ComplianceBadge({
  complianceState,
}: {
  readonly complianceState: ComplianceState;
}): ReactNode {
  return <span className="badge">{COMPLIANCE_STATE_LABELS[complianceState]}</span>;
}

export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString();
}

/**
 * Approved D-05 agreement display: record fields only (agreement id, type,
 * status, effective windows, signed-at, reference). No rates, slabs, fees, or
 * financial calculations are ever rendered.
 */
export function AgreementRow({
  agreement,
}: {
  readonly agreement: {
    readonly agreementId: string;
    readonly agreementType: string;
    readonly reference: string;
    readonly state: string;
    readonly effectiveFrom: string;
    readonly effectiveTo?: string;
    readonly signedAt?: string;
  };
}): ReactNode {
  return (
    <li className="agreement-row">
      <p className="agreement-type">{agreement.agreementType}</p>
      <p className="muted">Reference: {agreement.reference}</p>
      <p className="muted">Status: {agreement.state}</p>
      <p className="muted">Effective from: {formatDate(agreement.effectiveFrom)}</p>
      {agreement.effectiveTo !== undefined && (
        <p className="muted">Effective to: {formatDate(agreement.effectiveTo)}</p>
      )}
      {agreement.signedAt !== undefined && (
        <p className="muted">Signed: {formatDate(agreement.signedAt)}</p>
      )}
      <p className="muted id">Agreement ID: {agreement.agreementId}</p>
    </li>
  );
}
