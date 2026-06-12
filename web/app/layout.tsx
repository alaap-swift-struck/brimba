import type { Metadata } from "next"
import { Inter } from "next/font/google"

import { AmbientBackground } from "@swift-struck/ui/registry/primitives/ambient-background/ambient-background"
import { Toaster } from "@swift-struck/ui/registry/primitives/sonner/sonner"
import { ThemeProvider } from "@swift-struck/ui/registry/tokens/theme-provider"
import "./globals.css"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })

export const metadata: Metadata = {
  title: "Brimba",
  description: "Brimba — the multi-tenant SaaS base by Swift Struck.",
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
      <body className="min-h-screen antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
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
