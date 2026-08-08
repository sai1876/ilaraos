const SUPABASE_ORIGIN = (() => {
  try {
    const raw =
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.SUPABASE_URL;

    return raw ? new URL(raw).origin : '';
  } catch {
    return '';
  }
})();

/** @type {import('next').NextConfig} */
const nextConfig = {
  optimizeFonts: false,

  // ─── Dev-speed optimisations ───────────────────────────────────────────────
  experimental: {
    // Tree-shake large packages so the bundler only compiles what is actually
    // imported on each page — biggest single win for Fast Refresh latency.
    optimizePackageImports: [
      'lucide-react',
      'framer-motion',
      '@turf/turf',
      'firebase',
      'firebase-admin',
      'leaflet',
      'react-leaflet',
      'leaflet-geosearch',
      'zod',
      'zustand',
      'xlsx',
    ],
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'image.pollinations.ai',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
    ],
  },
  poweredByHeader: false,
  async headers() {
    const headers = [
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Content-Security-Policy', value: `default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://www.googletagmanager.com https://apis.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' blob: data: https://images.unsplash.com https://res.cloudinary.com https://image.pollinations.ai https://pollinations.ai *.tile.openstreetmap.org https://unpkg.com https://www.google-analytics.com https://cdnjs.cloudflare.com https://raw.githubusercontent.com *.basemaps.cartocdn.com https://lh3.googleusercontent.com https://*.googleusercontent.com ${SUPABASE_ORIGIN}; connect-src * ws: wss:; font-src 'self' data: https://fonts.gstatic.com https://frontend-cdn.perplexity.ai; frame-src 'self' https://*.firebaseapp.com https://mock-domain.firebaseapp.com ${SUPABASE_ORIGIN};` }
    ];

    if (process.env.NODE_ENV === 'production') {
      headers.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=31536000; includeSubDomains'
      });
    }

    return [
      {
        source: '/:path*',
        headers,
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/admin',
        destination: '/operations',
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/_next/static/:path*.map',
        destination: '/empty.map',
      },
    ];
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  }
};

export default nextConfig;

