import type { NextConfig } from "next";

// The browser only ever calls /pss/* on this Next.js app; Next forwards the request (headers, body and query string
// included) to the Pss gateway. That keeps the gateway URL out of the browser bundle and avoids CORS entirely.
// PSS_GATEWAY_URL is read when the server starts in dev, and baked in at `next build` for production.
const gateway = (process.env.PSS_GATEWAY_URL ?? "http://localhost:5000").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async rewrites() {
    return [{ source: "/pss/:path*", destination: `${gateway}/:path*` }];
  },
};

export default nextConfig;
