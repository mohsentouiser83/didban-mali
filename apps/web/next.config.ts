import type { NextConfig } from "next";

const backendApiOrigin = process.env.BACKEND_API_ORIGIN ?? "https://didban-mali.fly.dev";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendApiOrigin}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
