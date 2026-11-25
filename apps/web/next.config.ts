import type { NextConfig } from 'next';
import { networkInterfaces } from 'node:os';

const localIPv4Addresses = Object.values(networkInterfaces()).flatMap((addresses) =>
  (addresses ?? []).filter((address) => address.family === 'IPv4').map((address) => address.address),
);

const config: NextConfig = {
  allowedDevOrigins: localIPv4Addresses,
  poweredByHeader: false,
  devIndicators: false,
  distDir: process.env.DIDBAN_NEXT_DIST_DIR || ".next",
  async rewrites() { return [{ source: '/api/:path*', destination: `${process.env.DIDBAN_API_URL || 'http://127.0.0.1:8000'}/api/:path*` }]; },
  async headers() { return [{source: '/:path*', headers: [
    {key: 'X-Content-Type-Options',value: 'nosniff'},
    {key: 'Referrer-Policy',value:'same-origin'},
    {key:'X-Frame-Options',value:'DENY'},
  ]}]; },
};
export default config;
