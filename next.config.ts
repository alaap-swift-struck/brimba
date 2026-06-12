import type { NextConfig } from "next"

// BUILD_STATIC=1 switches on Next's static export (a plain `out/` folder) for
// Cloudflare Pages. Left OFF in dev so we keep the full dev server.
const staticExport = process.env.BUILD_STATIC
  ? { output: "export" as const, images: { unoptimized: true } }
  : {}

const nextConfig: NextConfig = {
  // The Swift Struck UI library ships as TypeScript SOURCE from GitHub, so
  // Next must compile it the same way it compiles our own files.
  transpilePackages: ["@swift-struck/ui"],
  ...staticExport,
}

export default nextConfig
