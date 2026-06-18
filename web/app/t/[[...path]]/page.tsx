// The deep-link catch-all — ONE static route that backs the whole /t/* tree.
// Static export can't prerender unknown record ids, so we emit a single shell
// (path: []) and the client reads window.location to resolve the screen; the
// gateway serves this shell for any /t/* depth (workers/gateway). The actual
// resolver is the client component below.

import { DeepLinkScreen } from "@/components/deep-link-screen"

export const dynamic = "force-static"

// Emit the single shell. Deeper paths (/t/<team>/members/<id>) are served this
// same file by the gateway and resolved client-side.
export function generateStaticParams() {
  return [{ path: [] as string[] }]
}

export default function DeepLinkCatchAll() {
  return <DeepLinkScreen />
}
