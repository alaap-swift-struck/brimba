"use client"

// /home resolves INSIDE the one deep-link shell (client-resolved from the URL), like
// /t, /learning and /help — so navigating between Home and any team screen is soft
// History-API nav, never a reload. The Home content is HomeScreen (deep-link-screen.tsx
// dispatches to it).

import { DeepLinkScreen } from "@/components/deep-link-screen"

export default function HomePage() {
  return <DeepLinkScreen />
}
