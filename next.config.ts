import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // PGlite ships WASM and data files that must load from node_modules at runtime. (Next externalizes `pg` itself.)
  serverExternalPackages: ["@electric-sql/pglite"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "cdn.nba.com", pathname: "/logos/nba/**" }],
  },
  // Link pages carry a secret token in the URL: never send it to another site in a Referer header.
  async headers() {
    return [{ source: "/i/:token", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
