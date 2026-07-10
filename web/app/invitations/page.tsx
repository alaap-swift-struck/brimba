"use client"

// /invitations resolves INSIDE the one deep-link shell (client-resolved from the URL) —
// soft History-API nav, no reload. The content is InvitationsScreen (deep-link-screen.tsx
// dispatches to it). This is where the invite email's "Join" button lands.

import { DeepLinkScreen } from "@/components/deep-link-screen"

export default function InvitationsPage() {
  return <DeepLinkScreen />
}
