import { PortalShell } from '@walrus/ui';
import type { ReactNode } from 'react';
import { SellerDashboard } from '@/src/features/seller/components/seller-dashboard';

export default function SellerPortalPage(): ReactNode {
  return (
    <PortalShell title="Seller portal">
      <SellerDashboard />
    </PortalShell>
  );
}
