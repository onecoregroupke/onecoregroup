import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }],
  },
  transpilePackages: ['@ocg/ui', '@ocg/db'],
  /**
   * Kept out of the bundle and required from node_modules at runtime.
   *
   * pdfkit (Operating System PDF export) reaches fontkit, whose prebuilt ESM
   * imports `applyDecoratedDescriptor` from @swc/helpers — a name current
   * versions no longer export, so bundling it fails the build outright. Both are
   * plain Node libraries that only ever run in a Node route handler, so there is
   * nothing to gain from bundling them in the first place.
   */
  serverExternalPackages: ['pdfkit', 'fontkit'],
}

export default nextConfig
