import { PortalShell } from '@walrus/ui';
import type { ReactNode } from 'react';

export default function SellerFoundationPage(): ReactNode {
  return (
    <PortalShell title="Seller portal">
      <p className="status">Foundation ready</p>
      <p>Seller functionality begins only in an approved future module.</p>
    </PortalShell>
  );
}
