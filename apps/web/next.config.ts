import type { NextConfig } from 'next';

// Hosted (Render): the browser only talks to the web origin and Next forwards API + socket traffic to the API service,
// so the API's auth cookies are first-party. Unset locally, where the web app calls localhost:4000 directly.
const API_ORIGIN = process.env.API_ORIGIN;

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Workspace packages ship compiled CommonJS; let Next bundle them for the browser.
  transpilePackages: ['@tavern/shared', '@tavern/api-client'],
  images: { remotePatterns: [{ protocol: 'http', hostname: 'localhost' }, { protocol: 'https', hostname: '**.supabase.co' }] },
  // socket.io connects to `/socket.io/?EIO=…`; the default trailing-slash redirect would break the websocket upgrade.
  skipTrailingSlashRedirect: !!API_ORIGIN,
  ...(API_ORIGIN && {
    rewrites: async () => [
      { source: '/api/v1/:path*', destination: `${API_ORIGIN}/api/v1/:path*` },
      { source: '/socket.io', destination: `${API_ORIGIN}/socket.io/` },
    ],
  }),
};

export default nextConfig;
