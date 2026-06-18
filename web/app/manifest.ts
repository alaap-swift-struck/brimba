import type { MetadataRoute } from "next"

import { brand } from "@shared/brand"

// The PWA manifest — what makes the app installable to a home screen / dock.
// Name + description come from the ONE brand file (shared/brand.ts), so a new
// app re-skins here automatically. Icons are the brand monogram (web/public/
// icons/*), swappable when a real logo lands. `force-static` so it emits a
// plain /manifest.webmanifest in the static export the gateway serves.
export const dynamic = "force-static"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.name,
    short_name: brand.name,
    description: brand.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0f1112",
    theme_color: "#0e9e86",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
