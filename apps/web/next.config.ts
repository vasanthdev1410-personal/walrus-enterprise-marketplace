import type { NextConfig } from 'next';

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value:
      "default-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'",
  },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

/**
 * M03-M6 — same-origin proxy to the M03-M5 Seller & Admin APIs. The browser
 * only ever talks to `/api/v1` on the web origin (CSP `connect-src 'self'`
 * stays intact, no CORS, no secrets in client bundles); Next forwards the
 * request server-side. The server remains authoritative for authz.
 */
function apiRewrites(): { readonly source: string; readonly destination: string }[] {
  const apiBase = (process.env.API_BASE_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');
  return [{ source: '/api/v1/:path*', destination: `${apiBase}/:path*` }];
}

const nextConfig: NextConfig = {
  ...(process.env.NEXT_STANDALONE === 'true' ? { output: 'standalone' as const } : {}),
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ['@walrus/ui', '@walrus/types'],
  headers: () => Promise.resolve([{ source: '/(.*)', headers: securityHeaders }]),
  rewrites: apiRewrites,
};

export default nextConfig;
