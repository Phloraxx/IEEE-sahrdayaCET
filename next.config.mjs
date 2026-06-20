const appUrl = new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000')

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  turbopack: {
    root: process.cwd(),
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    // Required for local dev where PocketBase runs on 127.0.0.1.
    // In production, ensure POCKETBASE_URL points to a non-local host.
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== 'production',
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'i.ibb.co' },
      { protocol: 'https', hostname: 'backend.mulearnscet.in' },
      { protocol: 'https', hostname: 'backend.ieeesahrdaya.com' },
      { protocol: 'https', hostname: 'db.phloraxx.us.to' },
      // Restrict sslip.io to the specific PocketBase host actually used,
      // rather than the broad *.sslip.io wildcard (SSRF defense-in-depth).
      { protocol: 'http', hostname: 'ieee-pocketbase-8wt381-14074c-144-24-114-90.sslip.io' },
      { protocol: appUrl.protocol.replace(':', ''), hostname: appUrl.hostname },
    ],
  },
  reactStrictMode: true,
  poweredByHeader: false,
}

export default nextConfig
