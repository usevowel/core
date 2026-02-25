/**
 * Next.js config for Vowel Core UI (vinext).
 *
 * Rewrites /api/* and /vowel/api/* to the Elysia backend (API_PORT in Docker).
 */
import type { NextConfig } from "next";

const apiBase =
  process.env.API_BASE_URL ?? "http://127.0.0.1:3001";

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/api/:path*", destination: `${apiBase}/api/:path*` },
        { source: "/vowel/api/:path*", destination: `${apiBase}/vowel/api/:path*` },
        { source: "/health", destination: `${apiBase}/health` },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
