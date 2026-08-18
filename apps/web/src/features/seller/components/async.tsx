'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { SellerApiError } from '@/src/lib/seller-api';
import type { SellerApiErrorKind } from '@/src/lib/seller-api';
import { safeMessage } from '@/src/lib/seller-api';

export type AsyncState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: T }
  | { readonly status: 'error'; readonly kind: SellerApiErrorKind };

/**
 * Runs an async loader and tracks loading/ready/error. The loader is expected
 * to be stable (`useCallback`) so the effect re-runs only when the loader or
 * dependencies change. All API failures are normalized to safe client states.
 *
 * `toKind` maps a rejected value to a safe error kind. It defaults to
 * recognizing `SellerApiError`; feature surfaces whose client throws a
 * different typed error (e.g. the Module 06 `CustomerApiError`, whose kind
 * union is identical) pass their own mapper so error states render the
 * correct safe message instead of collapsing to SERVER.
 */
export function useAsync<T>(
  load: () => Promise<T>,
  deps: readonly unknown[],
  toKind: (error: unknown) => SellerApiErrorKind = sellerErrorKind,
): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    void load().then(
      (data: T) => {
        if (!cancelled) setState({ status: 'ready', data });
      },
      (error: unknown) => {
        if (cancelled) return;
        setState({ status: 'error', kind: toKind(error) });
      },
    );
    return () => {
      cancelled = true;
    };
    // The loader is a stable useCallback reference; call-site deps are passed
    // explicitly as the `deps` argument, so the effect re-runs only when the
    // call-site dependencies change.
  }, deps);

  return state;
}

function sellerErrorKind(error: unknown): SellerApiErrorKind {
  return error instanceof SellerApiError ? error.kind : 'SERVER';
}

export function LoadingNotice(): ReactNode {
  return (
    <p className="notice" aria-live="polite">
      Loading…
    </p>
  );
}

export function ErrorNotice({ kind }: { readonly kind: SellerApiErrorKind }): ReactNode {
  if (kind === 'UNAUTHORIZED') {
    return (
      <div className="notice notice-error" role="alert">
        <p className="notice-title">Session expired</p>
        <p>{safeMessage(kind)}</p>
      </div>
    );
  }
  return (
    <div className="notice notice-error" role="alert">
      <p>{safeMessage(kind)}</p>
    </div>
  );
}

export function EmptyNotice({ children }: { readonly children: ReactNode }): ReactNode {
  return <p className="notice">{children}</p>;
}

export function AsyncBoundary<T>({
  state,
  children,
  empty,
}: {
  readonly state: AsyncState<T>;
  readonly children: (data: T) => ReactNode;
  /** Renders an empty state for the given data, or null when the data is present. */
  readonly empty?: (data: T) => ReactNode | null;
}): ReactNode {
  if (state.status === 'loading') return <LoadingNotice />;
  if (state.status === 'error') return <ErrorNotice kind={state.kind} />;
  if (empty !== undefined) {
    const emptyView = empty(state.data);
    if (emptyView !== null) return emptyView;
  }
  return children(state.data);
}
