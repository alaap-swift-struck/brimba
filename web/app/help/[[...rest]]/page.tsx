// Top-level Help page — its own clean URL (/help, /help/<id>), resolving the
// active team from context like /home. Backed by the SAME deep-link host as /t/*
// (one client-resolved shell); the gateway serves this shell for any /help/* depth.

import { DeepLinkScreen } from "@/components/deep-link-screen"

export const dynamic = "force-static"

export function generateStaticParams() {
  return [{ rest: [] as string[] }]
}

export default function HelpPage() {
  return <DeepLinkScreen />
}
