'use client';

import { PortalShell } from '@walrus/ui';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { SellerApiProvider } from '@/src/features/seller/seller-api-provider';
import { AdminSellerDetail } from '@/src/features/admin/components/admin-seller-surface';
import { AdminSellerList } from '@/src/features/admin/components/admin-seller-surface';

/**
 * Admin seller management (M03-M6). The list and detail screens consume the
 * M03-M5 admin API; authorization is enforced by the server (Module 02
 * grants). The UI never decides access — denied grants surface as the generic
 * access-denied state.
 */
export default function AdminPortalPage(): ReactNode {
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null);
  return (
    <PortalShell title="Admin portal">
      <SellerApiProvider>
        {selectedSellerId === null ? (
          <AdminSellerList onSelect={(sellerProfileId: string) => { setSelectedSellerId(sellerProfileId); }} />
        ) : (
          <AdminSellerDetail sellerProfileId={selectedSellerId} />
        )}
        {selectedSellerId !== null && (
          <div className="actions">
            <button type="button" className="btn" onClick={() => { setSelectedSellerId(null); }}>
              Back to seller list
            </button>
          </div>
        )}
      </SellerApiProvider>
    </PortalShell>
  );
}
