import { PortalShell } from '@walrus/ui';
import type { ReactNode } from 'react';

export default function SuperAdminFoundationPage(): ReactNode {
  return (
    <PortalShell title="Super Admin portal">
      <p className="status">Foundation ready</p>
      <p>Privileged workflows require future authorization requirements.</p>
    </PortalShell>
  );
}
