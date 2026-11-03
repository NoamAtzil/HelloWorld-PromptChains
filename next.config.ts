import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page is per-user and dynamic, so no Cache Components here.
  // Tailwind runs through its Turbopack loader (same as the admin app): the
  // PostCSS plugin needs a newer Node than some local setups have.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    // Running a chain uploads an input image through a Server Action.
    serverActions: { bodySizeLimit: "5mb" },
  },
};

export default nextConfig;
