/** @type {import('next').NextConfig} */

// Validate required env vars at build time in production
if (process.env.NODE_ENV === "production") {
  const required = ["NEXT_PUBLIC_GAME_SERVER_URL", "NEXT_PUBLIC_WS_URL"];
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
}

const nextConfig = {
  output: "standalone",  // enables minimal Docker image
  transpilePackages: ["@model-wars/shared"],

  // Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options",        value: "DENY" },
          { key: "X-Content-Type-Options",  value: "nosniff" },
          { key: "Referrer-Policy",         value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection",        value: "1; mode=block" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },

  // Redirect root → matches page when no active match
  async redirects() {
    return [];
  },
};

module.exports = nextConfig;
