import type { NextConfig } from "next"

// BUILD_STATIC=1 switches on Next's static export (a plain `out/` folder) that
// the gateway worker serves as assets. Left OFF in dev for the full dev server.
const staticExport = process.env.BUILD_STATIC
  ? { output: "export" as const, images: { unoptimized: true } }
  : {
      // Dev only: forward /api to the locally running auth worker
      // (`npm run dev:auth` → wrangler dev on :8787) so login works on
      // localhost exactly like it does behind the deployed gateway.
      async rewrites() {
        return [
          { source: "/api/auth/:path*", destination: "http://127.0.0.1:8787/api/auth/:path*" },
          { source: "/api/tenancy/:path*", destination: "http://127.0.0.1:8788/api/tenancy/:path*" },
          // /media/* has no local server (the gateway serves it when deployed)
          // — avatars gracefully fall back to initials in dev.
        ]
      },
    }

const nextConfig: NextConfig = {
  // The Swift Struck UI library ships as TypeScript SOURCE from GitHub, so
  // Next must compile it the same way it compiles our own files.
  transpilePackages: ["@swift-struck/ui"],
  // Lets us import the repo-level shared/ types (one master copy of shapes).
  experimental: { externalDir: true },
  ...staticExport,
}

export default nextConfig
