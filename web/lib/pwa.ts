// PWA install detection — pure, browser-only helpers used by the install
// prompt (components/install-prompt.tsx). No deps; safe to import anywhere.

export type PwaPlatform = "ios" | "android" | "desktop"

function ua(): string {
  return typeof navigator === "undefined" ? "" : navigator.userAgent
}

/** iPhone/iPad/iPod — including iPadOS, which masquerades as desktop Safari. */
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false
  return (
    /iphone|ipad|ipod/i.test(ua()) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  )
}

/** Already running as an installed app? Then we never show the prompt. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false
  const navStandalone = (navigator as unknown as { standalone?: boolean }).standalone
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    navStandalone === true
  )
}

export function detectPlatform(): PwaPlatform {
  if (isIOS()) return "ios"
  if (/android/i.test(ua())) return "android"
  return "desktop"
}

/** Only Safari proper can "Add to Home Screen" on iOS (Chrome/Firefox iOS
 * can't), so we only show the iOS walkthrough there. */
export function isIOSSafari(): boolean {
  return isIOS() && !/crios|fxios|edgios|opios/i.test(ua())
}
