import { Button } from "@swift-struck/ui/registry/primitives/button/button"

// Starter screen: proves the Swift Struck UI library renders inside Brimba.
// The real app (login, onboarding, teams) replaces this soon.
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="glass hover-lift animate-rise max-w-md rounded-xl border p-8 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Brimba</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          The multi-tenant SaaS base by Swift Struck — wired to the component
          library, deployed on Cloudflare. The real app starts here.
        </p>
        <Button className="mt-6">It&apos;s alive</Button>
      </div>
    </main>
  )
}
