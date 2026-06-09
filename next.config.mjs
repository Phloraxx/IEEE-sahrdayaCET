const appUrl = new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000')

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'i.ibb.co' },
      { protocol: 'https', hostname: 'backend.mulearnscet.in' },
      { protocol: 'https', hostname: 'backend.ieeesahrdaya.com' },
      { protocol: 'https', hostname: 'db.phloraxx.us.to' },
      { protocol: 'http', hostname: '*.sslip.io' },
      { protocol: appUrl.protocol.replace(':', ''), hostname: appUrl.hostname },
    ],
  },
  reactStrictMode: true,
  poweredByHeader: false,
}

export default nextConfig
