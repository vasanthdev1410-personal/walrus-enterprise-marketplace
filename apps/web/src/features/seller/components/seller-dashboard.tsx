'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { SellerApiProvider } from '../seller-api-provider';
import { OnboardingDashboard } from './onboarding-dashboard';
import { BusinessPanel } from './seller-surface';
import { MembersPanel } from './seller-surface';
import { ProfilePanel } from './seller-surface';
import { VerificationPanel } from './seller-surface';
import { WarehousesPanel } from './seller-surface';
import { AgreementsPanel } from './seller-surface';
import { CatalogPanel, CategoriesPanel } from '../../catalog/components/catalog-surface';
import { InventoryPanel } from '../../inventory/components/inventory-surface';

type SellerSection =
  | 'dashboard'
  | 'profile'
  | 'business'
  | 'verification'
  | 'warehouses'
  | 'agreements'
  | 'members'
  | 'catalog'
  | 'categories'
  | 'inventory';

const NAV: readonly { readonly id: SellerSection; readonly label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'profile', label: 'Profile' },
  { id: 'business', label: 'Business information' },
  { id: 'verification', label: 'Verification status' },
  { id: 'warehouses', label: 'Warehouses' },
  { id: 'agreements', label: 'Agreements' },
  { id: 'members', label: 'Members' },
  { id: 'catalog', label: 'Catalog' },
  { id: 'categories', label: 'Categories' },
  { id: 'inventory', label: 'Inventory' },
];

/**
 * Client-side navigation shell for the seller portal. Section switching is a
 * presentation concern; every section renders server-authoritative data.
 */
export function SellerDashboard(): ReactNode {
  const [section, setSection] = useState<SellerSection>('dashboard');

  function navigate(path: string): void {
    const target = path.replace('/seller/', '') as SellerSection;
    if (NAV.some((entry) => entry.id === target)) setSection(target);
  }

  return (
    <SellerApiProvider>
      <nav className="portal-nav" aria-label="Seller sections">
        {NAV.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={entry.id === section ? 'nav-active' : undefined}
            onClick={() => {
              setSection(entry.id);
            }}
          >
            {entry.label}
          </button>
        ))}
      </nav>
      {section === 'dashboard' && <OnboardingDashboard onNavigate={navigate} />}
      {section === 'profile' && <ProfilePanel />}
      {section === 'business' && <BusinessPanel />}
      {section === 'verification' && <VerificationPanel />}
      {section === 'warehouses' && <WarehousesPanel />}
      {section === 'agreements' && <AgreementsPanel />}
      {section === 'members' && <MembersPanel />}
      {section === 'catalog' && <CatalogPanel />}
      {section === 'categories' && <CategoriesPanel />}
      {section === 'inventory' && <InventoryPanel />}
    </SellerApiProvider>
  );
}
