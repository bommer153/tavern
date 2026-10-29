import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Workspace packages ship compiled CommonJS; let Next bundle them for the browser.
  transpilePackages: ['@tavern/shared', '@tavern/api-client'],
  images: { remotePatterns: [{ protocol: 'http', hostname: 'localhost' }, { protocol: 'https', hostname: '**.supabase.co' }] },
};

export default nextConfig;
