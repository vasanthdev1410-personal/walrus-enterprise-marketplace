import { describe, expect, it } from 'vitest';
import { PortalShell } from './portal-shell.js';

describe('PortalShell', () => {
  it('returns a React element', () => {
    expect(PortalShell({ children: 'Ready', title: 'Customer storefront' })).toBeTruthy();
  });
});
