import type { ReactNode } from 'react';

export interface PortalShellProps {
  readonly children: ReactNode;
  readonly title: string;
}

/** Provides a neutral accessible shell without embedding portal business behavior. */
export function PortalShell({ children, title }: PortalShellProps): ReactNode {
  return (
    <main className="portal-shell">
      <header className="portal-header">
        <span className="brand-mark" aria-hidden="true">
          W
        </span>
        <div>
          <p className="eyebrow">WALRUS Enterprise Marketplace</p>
          <h1>{title}</h1>
        </div>
      </header>
      <section className="portal-content" aria-label={`${title} foundation`}>
        {children}
      </section>
    </main>
  );
}
