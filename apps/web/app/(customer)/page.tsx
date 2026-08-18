import { PortalShell } from '@walrus/ui';
import type { ReactNode } from 'react';
import { CustomerApiProvider } from '@/src/features/customer/customer-api-provider';
import { CustomerSelfServicePanel } from '@/src/features/customer/components/customer-surface';

/**
 * Customer portal (M06-M5, WEMP-M06-SPEC-001 §15). Full customer
 * self-service: own profile, address book, optional business profile, and
 * preferences. Authorization is enforced by the server (AAL2 session +
 * Module 02 customer.* grants + the customer ownership resolver); the UI
 * renders server-authoritative data and generic non-disclosing error states.
 */
export default function CustomerPortalPage(): ReactNode {
  return (
    <PortalShell title="Customer portal">
      <CustomerApiProvider>
        <CustomerSelfServicePanel />
      </CustomerApiProvider>
    </PortalShell>
  );
}
