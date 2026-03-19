import type { NextConfig } from "next";

// NOTE: Turbopack is enabled for development (see project.json: "next dev --turbopack")
// Turbopack in Next.js 16 is stable for dev but some CSS edge cases may differ from webpack.
// If CSS/styling issues occur in dev, try: next dev (without --turbopack)

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  poweredByHeader: false,
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-XSS-Protection", value: "1; mode=block" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    },
  ],
};

export default nextConfig;
