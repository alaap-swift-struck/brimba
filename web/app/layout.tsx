import type { Metadata } from "next"
import { Inter } from "next/font/google"

import { AmbientBackground } from "@swift-struck/ui/registry/primitives/ambient-background/ambient-background"
import { Toaster } from "@swift-struck/ui/registry/primitives/sonner/sonner"
import { ThemeProvider } from "@swift-struck/ui/registry/tokens/theme-provider"
import { brand } from "@shared/brand"
import { BrandTheme } from "@/components/brand-theme"
import "./globals.css"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })

// App name + description come from the ONE brand file (shared/brand.ts).
export const metadata: Metadata = {
  title: brand.name,
  description: brand.description,
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
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
