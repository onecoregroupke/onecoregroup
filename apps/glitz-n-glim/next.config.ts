import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  transpilePackages: ['@ocg/ui', '@ocg/db'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      // Supabase Storage — covers any project subdomain (*.supabase.co)
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' },
    ],
  },
}
export default nextConfig
