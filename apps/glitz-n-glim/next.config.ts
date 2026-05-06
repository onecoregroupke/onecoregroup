import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  transpilePackages: ['@ocg/ui', '@ocg/db'],
  images: { remotePatterns: [{ protocol: 'https', hostname: 'images.unsplash.com' }] },
}
export default nextConfig
