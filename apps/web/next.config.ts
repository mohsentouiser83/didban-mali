import type { NextConfig } from "next";

const backendApiOrigin =
  process.env.BACKEND_API_ORIGIN ??
  (process.env.NODE_ENV === "production"
    ? "https://didban-mali.fly.dev"
    : "http://127.0.0.1:8000");

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
