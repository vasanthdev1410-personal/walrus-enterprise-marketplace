import { PortalShell } from '@walrus/ui';
import type { ReactNode } from 'react';

export default function AdminFoundationPage(): ReactNode {
  return (
    <PortalShell title="Admin portal">
      <p className="status">Foundation ready</p>
      <p>Administrative business functionality is intentionally absent.</p>
    </PortalShell>
  );
}
