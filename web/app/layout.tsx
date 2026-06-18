import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"

import { AmbientBackground } from "@swift-struck/ui/registry/primitives/ambient-background/ambient-background"
import { Toaster } from "@swift-struck/ui/registry/primitives/sonner/sonner"
import { ThemeProvider } from "@swift-struck/ui/registry/tokens/theme-provider"
import { brand } from "@shared/brand"
import { BrandTheme } from "@/components/brand-theme"
import { ErrorReporter } from "@/components/error-reporter"
import { InstallPrompt } from "@/components/install-prompt"
import "./globals.css"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })

// App name + description come from the ONE brand file (shared/brand.ts).
// Icons: a real brand logo (brand.logoUrl) wins when set; otherwise the brand
// monogram (web/public/icons/*). The PWA install icons live in app/manifest.ts.
export const metadata: Metadata = {
  title: brand.name,
  description: brand.description,
  applicationName: brand.name,
  // Installed-app titlebar + iOS "Add to Home Screen" identity.
  appleWebApp: { capable: true, title: brand.name, statusBarStyle: "default" },
  icons: brand.logoUrl
    ? { icon: brand.logoUrl, apple: brand.logoUrl }
    : {
        icon: [
          { url: "/icons/icon.svg", type: "image/svg+xml" },
          { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
        ],
        apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
      },
}

// Lock the viewport: fit the device width and block pinch-zoom so the app feels
// like a native shell on mobile (the design language has no zoomable surfaces).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Tint the browser/status-bar chrome to match the app surface, per mode.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f5" },
    { media: "(prefers-color-scheme: dark)", color: "#141414" },
  ],
}

// Root layout: theme, ambient background, and toasts all come straight from
// the Swift Struck UI library. Every Brimba screen renders inside this shell.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-[100svh] antialiased">
        <BrandTheme />
        {/* defaultTheme="system" = follow the device's day/night setting; a
         * ModeToggle (in the app bar + on the auth screens) lets people
         * override it, and next-themes remembers their choice. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AmbientBackground />
          <ErrorReporter />
          {children}
          <InstallPrompt />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
