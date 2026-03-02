import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@chainward/common'],
  // API proxying handled by app/api/[...path]/route.ts (preserves Set-Cookie for auth)
};

export default nextConfig;
