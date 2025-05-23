/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: [
      'api.companycam.com',
      'app.companycam.com',
      'via.placeholder.com',
      'companycam-production.imgix.net',
      'companycam-staging.imgix.net'
    ],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Add experimental settings for better handling of client components
  experimental: {
    // Ensure proper client and server boundary handling
    serverActions: true
  },
};

export default nextConfig;
