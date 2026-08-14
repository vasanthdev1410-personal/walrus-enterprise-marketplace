'use client';

import { PortalShell } from '@walrus/ui';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { SellerApiProvider } from '@/src/features/seller/seller-api-provider';
import { AdminSellerDetail } from '@/src/features/admin/components/admin-seller-surface';
import { AdminSellerList } from '@/src/features/admin/components/admin-seller-surface';
import { AdminProductDetail } from '@/src/features/admin-catalog/components/admin-catalog-surface';
import { AdminProductList } from '@/src/features/admin-catalog/components/admin-catalog-surface';

type AdminSection = 'sellers' | 'products';

const NAV: readonly { readonly id: AdminSection; readonly label: string }[] = [
  { id: 'sellers', label: 'Sellers' },
  { id: 'products', label: 'Products' },
];

/**
 * Admin portal (M03-M6 sellers + M04-M6 product moderation). The list and
 * detail screens consume the M03-M5/M04-M5 admin APIs; authorization is
 * enforced by the server (Module 02 grants). The UI never decides access —
 * denied grants surface as the generic access-denied state.
 */
export default function AdminPortalPage(): ReactNode {
  const [section, setSection] = useState<AdminSection>('sellers');
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  function switchSection(target: AdminSection): void {
    setSection(target);
    setSelectedSellerId(null);
    setSelectedProductId(null);
  }

  return (
    <PortalShell title="Admin portal">
      <SellerApiProvider>
        <nav className="portal-nav" aria-label="Admin sections">
          {NAV.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={entry.id === section ? 'nav-active' : undefined}
              onClick={() => {
                switchSection(entry.id);
              }}
            >
              {entry.label}
            </button>
          ))}
        </nav>
        {section === 'sellers' && (
          <>
            {selectedSellerId === null ? (
              <AdminSellerList
                onSelect={(sellerProfileId: string) => {
                  setSelectedSellerId(sellerProfileId);
                }}
              />
            ) : (
              <AdminSellerDetail sellerProfileId={selectedSellerId} />
            )}
            {selectedSellerId !== null && (
              <div className="actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setSelectedSellerId(null);
                  }}
                >
                  Back to seller list
                </button>
              </div>
            )}
          </>
        )}
        {section === 'products' && (
          <>
            {selectedProductId === null ? (
              <AdminProductList
                onSelect={(productId: string) => {
                  setSelectedProductId(productId);
                }}
              />
            ) : (
              <AdminProductDetail productId={selectedProductId} />
            )}
            {selectedProductId !== null && (
              <div className="actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setSelectedProductId(null);
                  }}
                >
                  Back to product list
                </button>
              </div>
            )}
          </>
        )}
      </SellerApiProvider>
    </PortalShell>
  );
}
