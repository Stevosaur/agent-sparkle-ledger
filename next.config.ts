import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  agentRules: false,
  trailingSlash: true,
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // The dataset snapshot is read from disk at request time (ISR / route handlers), so ship it with every server function.
  outputFileTracingIncludes: {
    "/**": ["./data/**/*.json"],
  },
  images: {
    remotePatterns: [],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [
      // Spec route names from the original teardown, mapped to this product's names.
      { source: "/haios-list/:path*", destination: "/lists/:path*", permanent: true },
      { source: "/haio-plus/:path*", destination: "/plus/:path*", permanent: true },
      { source: "/haio-research/:path*", destination: "/research/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
