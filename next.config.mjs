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
};

export default nextConfig;
