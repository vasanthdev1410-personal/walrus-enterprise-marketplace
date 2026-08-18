'use client';

import { PortalShell } from '@walrus/ui';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { SellerApiProvider } from '@/src/features/seller/seller-api-provider';
import { AdminSellerDetail } from '@/src/features/admin/components/admin-seller-surface';
import { AdminSellerList } from '@/src/features/admin/components/admin-seller-surface';
import { AdminProductDetail } from '@/src/features/admin-catalog/components/admin-catalog-surface';
import { AdminProductList } from '@/src/features/admin-catalog/components/admin-catalog-surface';
import { AdminInventoryDetail } from '@/src/features/admin-inventory/components/admin-inventory-surface';
import { AdminInventoryList } from '@/src/features/admin-inventory/components/admin-inventory-surface';
import { AdminThresholdConfigPanel } from '@/src/features/admin-inventory/components/admin-inventory-surface';
import { AdminCustomerDetail } from '@/src/features/admin-customer/components/admin-customer-surface';
import { AdminCustomerList } from '@/src/features/admin-customer/components/admin-customer-surface';
import { CustomerApiProvider } from '@/src/features/customer/customer-api-provider';

type AdminSection = 'sellers' | 'products' | 'inventory' | 'thresholds' | 'customers';

const NAV: readonly { readonly id: AdminSection; readonly label: string }[] = [
  { id: 'sellers', label: 'Sellers' },
  { id: 'products', label: 'Products' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'thresholds', label: 'Inventory thresholds' },
  { id: 'customers', label: 'Customers' },
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
  const [selectedSkuId, setSelectedSkuId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  function switchSection(target: AdminSection): void {
    setSection(target);
    setSelectedSellerId(null);
    setSelectedProductId(null);
    setSelectedSkuId(null);
    setSelectedCustomerId(null);
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
        {section === 'inventory' && (
          <>
            {selectedSkuId === null ? (
              <AdminInventoryList
                onSelect={(skuId: string) => {
                  setSelectedSkuId(skuId);
                }}
              />
            ) : (
              <AdminInventoryDetail
                skuId={selectedSkuId}
                onBack={() => {
                  setSelectedSkuId(null);
                }}
              />
            )}
          </>
        )}
        {section === 'thresholds' && <AdminThresholdConfigPanel />}
        {section === 'customers' && (
          <CustomerApiProvider>
            {selectedCustomerId === null ? (
              <AdminCustomerList
                onSelect={(customerProfileId: string) => {
                  setSelectedCustomerId(customerProfileId);
                }}
              />
            ) : (
              <AdminCustomerDetail
                customerProfileId={selectedCustomerId}
                onBack={() => {
                  setSelectedCustomerId(null);
                }}
              />
            )}
          </CustomerApiProvider>
        )}
      </SellerApiProvider>
    </PortalShell>
  );
}
