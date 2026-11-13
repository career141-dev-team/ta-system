import type { NextConfig } from "next";

// `npm run build:static` (or `npm run build` on Cloudflare Pages) builds plain
// HTML/CSS/JS in out/ for the Cloudflare Pages dev link (owner, 12 Nov 2026).
// The screens hold sample data only, so no server is needed yet. When they read
// the backend this becomes a server deployment instead.
const staticExport =
  process.env.npm_lifecycle_event === "build:static" ||
  process.env.npm_lifecycle_event === "build" ||
  process.env.STATIC_EXPORT === "1" ||
  process.env.CF_PAGES === "1";

const nextConfig: NextConfig = {
  ...(staticExport
    ? {
        output: "export",
        // There is no image server in a static site.
        images: { unoptimized: true },
      }
    : {
        // The root opens Today, the first screen after sign-in (owner's T1 design,
        // 12 Nov 2026). Openings opens the one opening built so far, until the
        // Openings list (O1) exists. Done here, not with redirect() in a page:
        // under Cache Components that raised a dev "Issue" on every visit. The
        // static site does the same with public/_redirects.
        async redirects() {
          return [
            { source: "/", destination: "/today", permanent: false },
            { source: "/openings", destination: "/openings/demo", permanent: false },
          ];
        },
      }),
  // Static export cannot pre-render in parts, so the static build leaves these off.
  cacheComponents: !staticExport,
  partialPrefetching: !staticExport,
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
