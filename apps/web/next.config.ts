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

const nextConfig: NextConfig = {
  ...(process.env.NEXT_STANDALONE === 'true' ? { output: 'standalone' as const } : {}),
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ['@walrus/ui', '@walrus/types'],
  headers: () => Promise.resolve([{ source: '/(.*)', headers: securityHeaders }]),
};

export default nextConfig;
