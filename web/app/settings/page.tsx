"use client"

// /settings resolves INSIDE the one deep-link shell (client-resolved from the URL) — so
// moving between Settings and any team screen is soft History-API nav, no reload. The
// content is SettingsScreen (deep-link-screen.tsx dispatches to it).

import { DeepLinkScreen } from "@/components/deep-link-screen"

export default function SettingsPage() {
  return <DeepLinkScreen />
}
