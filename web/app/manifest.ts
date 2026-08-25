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
    // From the ONE brand file too — these were hardcoded copies of
    // `accentHex.primary` and the dark screen tone, so re-skinning brand.ts left
    // the installed app's title bar and splash screen wearing the old colours.
    background_color: brand.splashHex,
    theme_color: brand.accentHex.primary,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
