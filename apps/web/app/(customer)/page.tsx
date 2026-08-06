import { PortalShell } from '@walrus/ui';
import type { ReactNode } from 'react';

export default function CustomerFoundationPage(): ReactNode {
  return (
    <PortalShell title="Customer storefront">
      <p className="status">Foundation ready</p>
      <p>No customer business functionality is implemented in Module 00.</p>
    </PortalShell>
  );
}
