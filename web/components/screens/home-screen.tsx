"use client"

// Home — the active team's landing. A content component rendered INSIDE the one
// deep-link shell (so navigating in/out is soft, no reload); the shell provides the
// AppShell chrome. Links go through softNavigate (History-API), never router.push.

import * as React from "react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@swift-struck/ui/registry/primitives/avatar/avatar"
import { Badge } from "@swift-struck/ui/registry/primitives/badge/badge"
import { List } from "@swift-struck/ui/registry/collections/list/list"
import { Users, Settings, ChevronRight, GraduationCap, Upload, Mail } from "lucide-react"

import { letterMark } from "@/lib/identity"
import { listFetch, totalKey } from "@/lib/live-resources"
import { softNavigate } from "@/lib/nav"
import { primeCacheIfCold, useCachedValue } from "@/lib/store"
import type { ActiveTeam } from "@/lib/use-active-team"

/** A lucide glyph, as a row carries it (icons come from lucide, never inline SVG). */
type Icon = React.ComponentType<{ className?: string }>

export function HomeScreen({ active }: { active: ActiveTeam }) {
  const ctx = active.ctx
  const teamId = ctx?.team?.id ?? null

  /* ------------------------------- first run ------------------------------- */
  // A brand-new owner lands here with nothing: two links and two-thirds of an
  // empty screen, and no mention of what the app is FOR. This block welcomes
  // them and it is a STATE, not furniture — it goes the moment anyone else is on
  // the team OR the team's first article exists, whichever happens first.
  //
  // The test costs no request on an established team. `memberCount` is already
  // in the session context, and only a team of ONE asks the second question —
  // and the only person who can be alone in a team is the person who created
  // it, so the three moves below are always ones an admin may make (no rights
  // read, and nobody is offered an action they'd be refused).
  const alone = ctx?.memberCount === 1
  React.useEffect(() => {
    // Cold-guarded, error-swallowed seeding of the EXACT key the learning screen
    // reads (use-team-prewarm's pattern) — so this pays for itself: tapping
    // Learning from here then paints from cache instead of a skeleton.
    if (teamId && alone) primeCacheIfCold(`learning:${teamId}`, () => listFetch.learning(teamId))
  }, [teamId, alone])
  // R16: the exact server COUNT the fetcher above primed. A pure cache read that
  // never fetches, and one that a create ping bumps — so the block disappears the
  // moment the first article exists, without a refresh.
  const learningTotal = useCachedValue<number>(alone && teamId ? totalKey("learning", teamId) : null)
  // `undefined` means two different things, and treating them as one is how this
  // broke: still in flight, or never coming. Waiting forever on the second reads
  // `undefined === 0` → false, so a brand-new owner whose count fell over (a
  // swallowed cache failure, an offline first load) got NO guidance at all, and
  // nothing said so. Answering instantly on the first would flash the welcome at
  // every solo owner who already has articles, which is the flicker the original
  // deliberately avoided.
  //
  // So: wait a beat for an answer, then stop waiting. The healthy path never
  // reaches the timer (a new team's count comes back 0 and the block appears at
  // once); the broken path FAILS OPEN a second later. Still keyed on `alone`, so
  // an established team never asks the question at all.
  const [countLate, setCountLate] = React.useState(false)
  React.useEffect(() => {
    if (!alone || learningTotal !== undefined) return
    const t = setTimeout(() => setCountLate(true), 1500)
    return () => clearTimeout(t)
  }, [alone, learningTotal])
  const firstRun = alone && (learningTotal !== undefined ? learningTotal === 0 : countLate)

  // Unreachable at runtime (the shell renders Home only once `active.ctx` is
  // loaded) but NOT dead: it is what narrows `ctx` from `ActiveContext | null`,
  // so every read below would otherwise need optional chaining. Removing it
  // costs more code than it saves.
  if (!ctx) return null

  const FIRST_RUN = [
    {
      title: "Add your first article",
      desc: "Write a how-to your team can read in Learning",
      icon: GraduationCap,
      href: "/learning",
    },
    {
      title: "Import a spreadsheet",
      desc: "Bring in rows you already have, instead of typing them one by one",
      icon: Upload,
      href: teamId ? `/t/${teamId}/import/learning` : "/learning",
    },
    {
      title: "Invite your team",
      desc: "Ask someone to join, in a role you choose",
      icon: Mail,
      href: teamId ? `/t/${teamId}/invites` : "/settings",
    },
  ]

  const LINKS = [
    { title: "Team", desc: "Members, roles and invites", icon: Users, href: ctx.team ? `/t/${ctx.team.id}` : "/settings" },
    { title: "Settings", desc: "Your account and teams", icon: Settings, href: "/settings" },
  ]

  // Both lists on this screen are the same row — one mapper, used twice.
  const rows = (links: { title: string; desc: string; icon: Icon; href: string }[]) =>
    links.map((l) => {
      const Glyph = l.icon
      return {
        id: l.href,
        leading: (
          <span className="bg-secondary text-secondary-foreground flex size-10 items-center justify-center rounded-lg">
            <Glyph className="size-5" />
          </span>
        ),
        title: l.title,
        subtitle: l.desc,
        trailing: <ChevronRight className="text-muted-foreground size-4" />,
      }
    })

  return (
    <div className="mx-auto flex w-full flex-col gap-6">
      <div className="animate-rise flex items-center gap-4">
        <Avatar className="size-14">
          {ctx.team?.logoUrl && <AvatarImage src={ctx.team.logoUrl} alt={ctx.team.name} />}
          <AvatarFallback className="text-xl">{letterMark(ctx.team?.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{ctx.team?.name}</h1>
          <div className="text-muted-foreground mt-1 flex items-center gap-2 text-sm">
            {ctx.role && <Badge variant="secondary">{ctx.role.title}</Badge>}
            <span>
              {ctx.memberCount} member{ctx.memberCount === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      </div>

      {firstRun && (
        <section className="animate-rise flex flex-col gap-3 rounded-xl border p-4">
          <div>
            <h2 className="text-base font-medium">Start here</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              This is where your team keeps its how-to articles and the questions people
              raise, so the answer lives in one place instead of someone&apos;s inbox.
            </p>
          </div>
          <List surface="none" onItemClick={(item) => softNavigate(item.id)} items={rows(FIRST_RUN)} />
        </section>
      )}

      <List
        surface="none"
        className="animate-rise rounded-xl border"
        onItemClick={(item) => softNavigate(item.id)}
        items={rows(LINKS)}
      />
    </div>
  )
}
