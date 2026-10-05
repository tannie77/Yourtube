import type { NextConfig } from "next";

const backendUrl = process.env.BACKEND_URL?.replace(/\/+$/, "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    if (!backendUrl) return [];
    return [
      { source: "/api/:path*", destination: `${backendUrl}/:path*` },
      { source: "/realtime", destination: `${backendUrl}/socket.io/` },
      { source: "/realtime/:path*", destination: `${backendUrl}/socket.io/:path*` },
    ];
  },
};

export default nextConfig;
