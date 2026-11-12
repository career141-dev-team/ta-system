import type { NextConfig } from "next";

// `npm run build:static` builds plain HTML/CSS/JS in out/ for the Cloudflare Pages
// dev link (owner, 12 Nov 2026); npm names the running script in
// npm_lifecycle_event, so no extra package is needed. The screens hold sample data
// only, so no server is needed yet. When they read the backend this becomes a
// server deployment instead.
const staticExport =
  process.env.npm_lifecycle_event === "build:static" || process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  ...(staticExport
    ? {
        output: "export",
        // There is no image server in a static site.
        images: { unoptimized: true },
      }
    : {
        // Placeholder: there is no home screen in the design yet, so the root
        // opens the one screen that exists. Done here, not with redirect() in a
        // page: under Cache Components that raised a dev "Issue" on every visit
        // to "/". The static site does the same with public/_redirects.
        async redirects() {
          return [{ source: "/", destination: "/openings/demo", permanent: false }];
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
